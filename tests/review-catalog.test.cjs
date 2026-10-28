"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  seed,
  validateSnapshot,
  createReviewCatalog,
  MODE,
} = require("../lib/review-catalog");
const { snapshot } = require("../scripts/snapshot-review-catalog.cjs");
const fixture = () => ({
  version: 1,
  source: "https://lae-music.onrender.com",
  captured_at: "2026-10-27T00:00:00Z",
  scope: "published_songs_and_public_artist_profiles_only",
  artists: [{ id: "21", display_name: "Original artist" }],
  tracks: [
    {
      id: "31",
      artist_id: "21",
      title: "Original song",
      genre: "Highlife",
      description: "Original published song",
      plays: "7",
      status: "published",
      created_at: "2026-10-01T00:00:00Z",
      published_at: "2026-10-02T00:00:00Z",
    },
  ],
});
const env = {
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: MODE,
  DATABASE_URL: "postgres://local@127.0.0.1:55432/lae_music_review",
};
function pool() {
  let next = 100;
  const artists = new Map(),
    tracks = new Map(),
    calls = [];
  return {
    artists,
    tracks,
    calls,
    connect: async function () {
      return { query: this.query.bind(this), release() {} };
    },
    async query(sql, args = []) {
      calls.push({ sql, args });
      const row = (x) => ({ rows: [x], rowCount: 1 }),
        none = { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT current_database()"))
        return row({
          name: "lae_music_review",
          host: "127.0.0.1",
          port: 55432,
        });
      if (sql.startsWith("SELECT artist_id FROM review_public_artists"))
        return artists.has(args[0])
          ? row({ artist_id: artists.get(args[0]) })
          : none;
      if (sql.startsWith("SELECT track_id FROM review_public_tracks"))
        return tracks.has(args[0])
          ? row({ track_id: tracks.get(args[0]) })
          : none;
      if (sql.startsWith("INSERT INTO creators")) return row({ id: ++next });
      if (sql.startsWith("INSERT INTO music_tracks"))
        return row({ id: ++next });
      if (sql.startsWith("INSERT INTO review_public_artists"))
        artists.set(args[0], args[1]);
      if (sql.startsWith("INSERT INTO review_public_tracks"))
        tracks.set(args[0], args[1]);
      return none;
    },
  };
}
test("public catalog import refuses production/external databases before any query", async () => {
  for (const e of [
    {},
    { ...env, NODE_ENV: "production" },
    { ...env, DATABASE_URL: "postgres://production.example/live" },
    { ...env, DATABASE_URL: "postgres://local@127.0.0.1:55432/production" },
  ]) {
    let writes = 0;
    await assert.rejects(
      seed(
        {
          connect: () => {
            writes++;
            throw Error("Forbidden");
          },
        },
        { env: e, snapshot: fixture() },
      ),
    );
    assert.equal(writes, 0);
  }
});
test("sandbox import maps identities, uses unusable credentials and never grants payments, sessions or entitlements", async () => {
  const p = pool();
  assert.equal((await seed(p, { env, snapshot: fixture() })).added_tracks, 1);
  assert.equal((await seed(p, { env, snapshot: fixture() })).added_tracks, 0);
  const creators = p.calls.filter((x) =>
    x.sql.startsWith("INSERT INTO creators"),
  );
  assert.equal(creators.length, 1);
  assert.equal(creators[0].args[1], "public-artist-21@review-catalog.invalid");
  assert.equal(creators[0].args[2].length, 64);
  assert.equal(creators[0].args[3].length, 128);
  const song = p.calls.find((x) =>
    x.sql.startsWith("INSERT INTO music_tracks"),
  );
  assert.equal(song.args[0], 101);
  assert.equal(song.args[4], "review-public-catalog/31");
  assert.equal(song.args[5], "7");
  assert(
    !p.calls.some((x) =>
      /INSERT INTO (artist_subscriptions|sessions|generation_wallets|artist_earnings|affiliate_commissions)/.test(
        x.sql,
      ),
    ),
  );
  assert(!p.calls.some((x) => /DELETE|TRUNCATE|DROP|UPDATE/.test(x.sql)));
});
test("snapshot excludes private fields, orphan/duplicate/unpublished records and arbitrary source hosts", () => {
  const s = fixture();
  for (const change of [
    (x) => (x.source = "https://attacker.invalid"),
    (x) => (x.artists[0].email = "private@example.com"),
    (x) => (x.artists[0].password_hash = "private"),
    (x) => (x.tracks[0].status = "private"),
    (x) => (x.tracks[0].artist_id = "99"),
    (x) => x.tracks.push({ ...x.tracks[0] }),
  ]) {
    const bad = structuredClone(s);
    change(bad);
    assert.throws(() => validateSnapshot(bad));
  }
});
async function media(
  path,
  {
    method = "GET",
    source = "31",
    url = "https://account.r2.cloudflarestorage.com/bucket/audio.mp3?signature=test",
    mode = env,
    response,
  } = {},
) {
  const fetched = [],
    queries = [];
  const service = createReviewCatalog({
    env: mode,
    pool: {
      query: async (sql, args) => {
        queries.push({ sql, args });
        return { rows: [{ source_id: source }], rowCount: 1 };
      },
    },
    fetchImpl: async (u, o) => {
      fetched.push({ url: u, options: o });
      return response || new Response(JSON.stringify({ url }), { status: 200 });
    },
  });
  const res = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = String(body);
    },
  };
  const handled = await service.handle(
    { method },
    res,
    new URL(path, "https://review.invalid"),
  );
  return { handled, res, fetched, queries };
}
test("review media maps local to original IDs using GET only, never forwards browser credentials or production writes", async () => {
  const r = await media("/api/music/tracks/102/stream");
  assert.equal(r.res.status, 200);
  assert.equal(r.fetched.length, 1);
  assert.equal(
    r.fetched[0].url,
    "https://lae-music.onrender.com/api/music/tracks/31/stream",
  );
  assert.equal(r.fetched[0].options.method, "GET");
  assert.equal(r.fetched[0].options.redirect, "error");
  assert(!r.fetched[0].options.headers.Cookie);
  assert.equal(r.queries[0].args[0], "102");
  assert(r.queries[0].sql.includes("t.status='published'"));
  for (const method of ["POST", "PUT", "DELETE"]) {
    const x = await media("/api/music/tracks/102/stream", { method });
    assert.equal(x.handled, false);
    assert.equal(x.fetched.length, 0);
  }
  for (const mode of [{}, { ...env, NODE_ENV: "production" }]) {
    const x = await media("/api/music/tracks/102/stream", { mode });
    assert.equal(x.handled, false);
    assert.equal(x.queries.length, 0);
  }
});
test("media read rejects untrusted redirects, non-R2 URLs and private source errors without leaking signatures", async () => {
  for (const url of [
    "http://127.0.0.1/private",
    "https://attacker.invalid/a",
    "https://user:secret@account.r2.cloudflarestorage.com/a",
  ]) {
    const r = await media("/api/music/tracks/102/stream", { url });
    assert.equal(r.res.status, 502);
    assert(!r.res.body.includes("secret"));
  }
  const r = await media("/api/music/tracks/102/stream", {
    response: new Response("private error secret", { status: 403 }),
  });
  assert.equal(r.res.status, 502);
  assert(!r.res.body.includes("secret"));
});
test("public snapshot fetches only catalog GET endpoints and strips unexpected account data", async () => {
  const f = fixture(),
    calls = [];
  const r = await snapshot({
    fetchImpl: async (u, o) => {
      calls.push({ u, o });
      return new Response(
        JSON.stringify(
          u.endsWith("/artists")
            ? { artists: [{ ...f.artists[0], email: "private" }] }
            : { tracks: f.tracks },
        ),
      );
    },
    now: () => new Date(f.captured_at),
  });
  assert.equal(r.artists[0].email, undefined);
  assert.equal(calls.length, 2);
  assert(calls.every((x) => x.o.method === "GET" && x.o.redirect === "error"));
  assert.equal(r.tracks.length, 1);
});

test("import verifies the actual connected database even when environment names claim isolation", async () => {
  const calls = [];
  await assert.rejects(
    seed(
      {
        connect: async () => ({
          query: async (sql) => {
            calls.push(sql);
            return {
              rows: [{ name: "production", host: "127.0.0.1", port: 55432 }],
            };
          },
          release() {},
        }),
      },
      { env, snapshot: fixture() },
    ),
    /connected database identity/,
  );
  assert.equal(calls.length, 1);
  assert(calls[0].startsWith("SELECT"));
});
test("failed catalog insert rolls back the entire review import", async () => {
  const p = pool(),
    query = p.query.bind(p);
  p.query = async (sql, args) => {
    if (sql.startsWith("INSERT INTO music_tracks"))
      throw Error("Isolated write failure");
    return query(sql, args);
  };
  await assert.rejects(
    seed(p, { env, snapshot: fixture() }),
    /Isolated write failure/,
  );
  assert(p.calls.some((x) => x.sql === "ROLLBACK"));
  assert(!p.calls.some((x) => x.sql === "COMMIT"));
});
test("review artwork is bounded and restricted to images; no private error body is exposed", async () => {
  let r = await media("/api/music/tracks/102/cover-image", {
    response: new Response(Buffer.from("fixture image"), {
      headers: { "content-type": "image/jpeg" },
    }),
  });
  assert.equal(r.res.status, 200);
  assert.equal(r.res.headers["X-Content-Type-Options"], "nosniff");
  r = await media("/api/music/tracks/102/cover-image", {
    response: new Response("<script>private</script>", {
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(r.res.status, 502);
  assert(!r.res.body.includes("private"));
  r = await media("/api/music/tracks/102/cover-image", {
    response: new Response(Buffer.alloc(3 * 1024 * 1024 + 1), {
      headers: { "content-type": "image/jpeg" },
    }),
  });
  assert.equal(r.res.status, 502);
});
