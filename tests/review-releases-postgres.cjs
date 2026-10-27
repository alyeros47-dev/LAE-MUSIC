"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  crypto = require("node:crypto");
if (process.env.LAE_REVIEW_RELEASE_TESTS !== "1")
  throw Error("Disposable-container opt-in required");
const { Pool } = require("pg");
const pool = new Pool({
  connectionString:
    "postgres://postgres:" +
    fs.readFileSync("/tmp/lae-review-password", "utf8").trim() +
    "@127.0.0.1:55432/lae_music_review",
});
process.env.DATABASE_URL = pool.options.connectionString;
const origin = "http://127.0.0.1:10000";
let cookie;
async function api(p, b) {
  const r = await fetch(origin + p, {
    method: b ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(b ? { "Content-Type": "application/json" } : {}),
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = {};
  }
  return { r, data };
}
(async () => {
  const identity = (
    await pool.query(
      "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port",
    )
  ).rows[0];
  assert.deepEqual(identity, {
    name: "lae_music_review",
    host: "127.0.0.1",
    port: 55432,
  });
  const email = crypto.randomUUID() + "@ci.invalid",
    password = crypto.randomBytes(24).toString("hex");
  const reg = await api("/api/register", {
    name: "Private release QA",
    email,
    country: "Nigeria",
    plan: "starter",
    password,
    confirmPassword: password,
  });
  assert.equal(reg.r.status, 201);
  cookie = reg.r.headers.get("set-cookie").split(";")[0];
  const artist = (await api("/api/platform/session")).data.artist.id;
  const task = "release_" + crypto.randomBytes(10).toString("hex"),
    clip = "clip_" + crypto.randomBytes(10).toString("hex");
  await pool.query(
    "INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'succeeded')",
    [task, artist],
  );
  const audio = Buffer.from(
      fs.readFileSync("/app/tests/fixtures/review-tone.mp3.base64", "utf8"),
      "base64",
    ),
    art = Buffer.from(
      fs.readFileSync("/app/tests/fixtures/review-art.png.base64", "utf8"),
      "base64",
    );
  const service = require("../lib/studio-releases").createStudioReleases({
    pool,
    env: {
      ...process.env,
      STUDIO_RELEASE_WORKER_ENABLED: "true",
      GENERATED_MEDIA_ALLOWED_HOSTS: "cdn1.suno.ai,cdn2.suno.ai",
    },
    store: require("../lib/review-release-storage").create({ pool }),
    provider: {
      configured: () => true,
      clips: async () => [
        {
          clip_id: clip,
          audio_url: "https://cdn1.suno.ai/fixture.mp3",
          image_url: "https://cdn2.suno.ai/fixture.png",
        },
      ],
    },
    download: async (url, kind) => ({
      bytes: kind === "audio" ? audio : art,
      mime: kind === "audio" ? "audio/mpeg" : "image/png",
      extension: kind === "audio" ? "mp3" : "png",
    }),
  });
  const input = {
      task_id: task,
      clip_id: clip,
      title: "Saved complete song",
      genre: "Highlife",
      description: "Owned fixture",
      rightsConfirmed: true,
    },
    key = crypto.randomUUID();
  const release = await service.create(artist, key, input);
  assert.equal((await service.create(artist, key, input)).id, release.id);
  await service.processNext();
  const row = (
    await pool.query(
      "SELECT status,cover_key FROM studio_releases WHERE id=$1",
      [release.id],
    )
  ).rows[0];
  assert.equal(row.status, "ready");
  assert(row.cover_key);
  await api("/api/logout", {});
  cookie = null;
  assert.equal(
    (await api("/api/platform/studio/media/" + release.id + "/audio")).r.status,
    404,
  );
  const login = await api("/api/platform/account/login", {
    email,
    password,
    role: "artist",
  });
  assert.equal(login.r.status, 200);
  cookie = login.r.headers.get("set-cookie").split(";")[0];
  assert(
    (await api("/api/platform/studio/releases")).data.releases.some(
      (x) => String(x.id) === String(release.id),
    ),
  );
  const savedDownload = await fetch(
    origin + "/api/platform/studio/releases/" + release.id + "/download",
    { headers: { Cookie: cookie } },
  );
  assert.equal(savedDownload.status, 200);
  assert.match(savedDownload.headers.get("content-disposition"), /attachment/);
  assert(Buffer.from(await savedDownload.arrayBuffer()).equals(audio));
  const privateArt = await fetch(
    origin + "/api/platform/studio/releases/" + release.id + "/artwork",
    { headers: { Cookie: cookie } },
  );
  assert.equal(privateArt.status, 200);
  assert(Buffer.from(await privateArt.arrayBuffer()).equals(art));
  const preview = await api(
    "/api/platform/studio/releases/" + release.id + "/audio",
  );
  assert.equal(preview.r.status, 200);
  const bytes = await fetch(origin + preview.data.url, {
    headers: { Cookie: cookie, Range: "bytes=0-63" },
  });
  if (bytes.status !== 206)
    console.log(
      "Preview failure",
      preview.data.url,
      bytes.status,
      await bytes.text(),
    );
  assert.equal(bytes.status, 206);
  assert(Buffer.from(await bytes.arrayBuffer()).equals(audio.subarray(0, 64)));
  const published = await service.publish(
    artist,
    release.id,
    crypto.randomUUID(),
    true,
  );
  const stream = await (
    await fetch(origin + "/api/music/tracks/" + published.track_id + "/stream")
  ).json();
  assert(stream.url);
  const publicAudio = await fetch(new URL(stream.url, origin));
  assert.equal(publicAudio.status, 200);
  assert(Buffer.from(await publicAudio.arrayBuffer()).equals(audio));
  const cover = await fetch(
    origin + "/api/music/tracks/" + published.track_id + "/cover-image",
  );
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get("content-type"), "image/png");
  const code = crypto.randomBytes(18).toString("hex").toUpperCase();
  await pool.query(
    "INSERT INTO generation_records(creator_id,code_hash,model,title,lyrics,style) VALUES($1,$2,$3,$4,$5,$6)",
    [
      artist,
      crypto.createHash("sha256").update(code).digest("hex"),
      "isolated-fixture",
      "Code verified song",
      "Owned original fixture lyrics",
      "Highlife",
    ],
  );
  const upload = {
    title: "Code verified song",
    genre: "Highlife",
    description: "",
    audioMime: "audio/mpeg",
    audioBytes: audio.length,
    coverMime: null,
    coverBytes: 0,
    rightsConfirmed: true,
    uploadCode: code,
  };
  const first = await api("/api/music/upload/start", upload);
  assert.equal(first.r.status, 200);
  assert.equal((await api("/api/music/upload/start", upload)).r.status, 409);
  assert.equal(
    (await api("/api/platform/review-upload/cancel", { id: first.data.id })).r
      .status,
    200,
  );
  assert.equal(
    (await api("/api/generation/code/check", { code })).data.valid,
    true,
  );
  const retry = await api("/api/music/upload/start", upload);
  assert.equal(retry.r.status, 200);
  first.data = retry.data;
  const put = await fetch(
    origin + "/api/music/upload/file?id=" + first.data.id + "&kind=audio",
    {
      method: "PUT",
      headers: { Origin: origin, Cookie: cookie, "Content-Type": "audio/mpeg" },
      body: audio,
    },
  );
  assert.equal(put.status, 200);
  assert.equal(
    (await api("/api/music/upload/finish", { id: first.data.id })).r.status,
    200,
  );
  console.log(
    "PASS real PostgreSQL/files/HTTP: private audio/artwork import, duplicate save protection, logout/login recovery, private ranges, free review publication, anonymous audio/artwork streaming and one-use generated upload code. Provider media mocked. R2/production writes: 0.",
  );
})()
  .catch((e) => {
    console.error("Release integration failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
