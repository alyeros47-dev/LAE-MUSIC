"use strict";
// Owned local container only. Real PostgreSQL/files/HTTP, mocked voice provider.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs");
if (process.env.LAE_REVIEW_VOICE_TESTS !== "1")
  throw Error("Disposable-container opt-in required");
const { Pool } = require("pg"),
  context = require("../lib/request-context"),
  handler = require("../artist-voice"),
  { createBudget } = require("../deploy/review-provider-budget.cjs");
const pool = new Pool({
    connectionString:
      "postgres://postgres:" +
      fs.readFileSync("/tmp/lae-review-password", "utf8").trim() +
      "@127.0.0.1:55432/lae_music_review",
  }),
  origin = "http://127.0.0.1:10000";
process.env.DATABASE_URL = pool.options.connectionString;
let cookie, id;
async function api(path, body, options = {}) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...options,
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
  assert.equal(identity.name, "lae_music_review");
  assert.equal(identity.host, "127.0.0.1");
  assert.equal(identity.port, 55432);
  const password = crypto.randomBytes(24).toString("hex");
  const reg = await api("/api/register", {
    name: "Voice QA",
    email: crypto.randomUUID() + "@ci.invalid",
    country: "Nigeria",
    plan: "starter",
    password,
    confirmPassword: password,
  });
  assert.equal(reg.r.status, 201);
  cookie = reg.r.headers.get("set-cookie").split(";")[0];
  id = (await api("/api/platform/session")).data.artist.id;
  const b = Buffer.alloc(44 + 16000 * 15);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  assert.equal(
    (
      await api("/api/voice/upload", {
        type: "audio/wav",
        bytes: b.length,
        consent: false,
      })
    ).r.status,
    400,
  );
  const prepared = await api("/api/voice/upload", {
    type: "audio/wav",
    bytes: b.length,
    consent: true,
  });
  assert.equal(prepared.r.status, 200);
  const signed = new URL(prepared.data.url),
    upload = origin + signed.pathname + signed.search;
  const put = () =>
    fetch(upload, {
      method: "PUT",
      headers: { Origin: origin, "Content-Type": "audio/wav" },
      body: b,
    });
  assert.equal((await put()).status, 204);
  assert.equal((await put()).status, 409);
  assert.equal(
    (await fetch(origin + signed.pathname + "?access=" + "a".repeat(64)))
      .status,
    404,
  );
  process.env.MUSICAPI_API_KEY = "mock-only-not-a-real-key";
  let providerCalls = 0,
    phase = "training",
    journal = null;
  const original = global.fetch;
  global.fetch = createBudget({
    mode: "account",
    fileSystem: {
      readFileSync() {
        if (!journal) throw Object.assign(Error(), { code: "ENOENT" });
        return journal;
      },
      writeFileSync(p, s) {
        journal = s;
      },
    },
    fetchImpl: async (url, opt) => {
      if (opt?.method === "POST") {
        providerCalls++;
        const payload = JSON.parse(opt.body);
        assert(new URL(payload.audio_url).pathname.endsWith(".wav"));
        return new Response(
          JSON.stringify({ code: 200, task_id: "mock_voice_task_12345" }),
        );
      }
      return new Response(
        JSON.stringify({
          code: 200,
          data:
            phase === "ready" ? { persona_id: "mock-owned-voice-persona" } : {},
        }),
      );
    },
  });
  async function run(path, method = "POST", owner = id) {
    const res = {
      writeHead(n) {
        this.status = n;
      },
      end(s) {
        this.data = JSON.parse(s);
      },
    };
    await context.run({}, () =>
      handler({ method, url: path, headers: {} }, res, path, {
        pool,
        me: async () => ({ id: owner }),
        validOrigin: () => true,
        storage: () => {
          throw Error("R2 must never be accessed");
        },
      }),
    );
    return res;
  }
  try {
    const requests = await Promise.all([
      run("/api/voice/train"),
      run("/api/voice/train"),
    ]);
    assert(requests.some((x) => x.status === 200));
    assert.equal(providerCalls, 1);
    assert.equal((await run("/api/voice/train")).status, 200);
    assert.equal(providerCalls, 1);
    phase = "ready";
    assert.equal((await run("/api/voice/status", "GET")).data.status, "ready");
    assert.equal((await run("/api/voice/profile", "GET")).data.hasVoice, true);
    assert.equal(
      (await run("/api/voice/profile", "GET", Number(id) + 10000)).data
        .hasVoice,
      false,
    );
  } finally {
    global.fetch = original;
  }
  const key = (
    await pool.query(
      "SELECT object_key FROM artist_voice_profiles WHERE creator_id=$1",
      [id],
    )
  ).rows[0].object_key;
  const url = new URL(
    await require("../lib/review-voice").create(pool).readURL(key),
  );
  const ranged = await fetch(origin + url.pathname + url.search, {
    headers: { Range: "bytes=0-63" },
  });
  assert.equal(ranged.status, 206);
  assert(Buffer.from(await ranged.arrayBuffer()).equals(b.subarray(0, 64)));
  await pool.query(
    "UPDATE review_voice_samples SET get_expires=NOW()-INTERVAL '1 second' WHERE object_key=$1",
    [key],
  );
  assert.equal((await fetch(origin + url.pathname + url.search)).status, 404);
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int AS n FROM review_voice_attempts WHERE artist_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  for (const status of [400, 503]) {
    const password = crypto.randomBytes(24).toString("hex");
    const account = await api("/api/register", {
      name: "Voice failure QA",
      email: crypto.randomUUID() + "@ci.invalid",
      country: "Nigeria",
      plan: "starter",
      password,
      confirmPassword: password,
    });
    cookie = account.r.headers.get("set-cookie").split(";")[0];
    id = (await api("/api/platform/session")).data.artist.id;
    const prepared = await api("/api/voice/upload", {
      type: "audio/wav",
      bytes: b.length,
      consent: true,
    });
    const u = new URL(prepared.data.url);
    assert.equal(
      (
        await fetch(origin + u.pathname + u.search, {
          method: "PUT",
          headers: { Origin: origin, "Content-Type": "audio/wav" },
          body: b,
        })
      ).status,
      204,
    );
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: "Mock provider failure" }), {
        status,
      });
    };
    try {
      const r = await run("/api/voice/train");
      assert.equal(r.status, status === 400 ? 502 : 503);
      const own = (
        await pool.query(
          "SELECT status FROM artist_voice_profiles WHERE creator_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(
        own.status,
        status === 400 ? "uploading" : "verification_required",
      );
      if (status === 503) {
        assert.equal((await run("/api/voice/train")).status, 409);
        assert.equal(calls, 1);
      }
      const used = (
        await pool.query(
          "SELECT COUNT(*)::int AS n FROM review_voice_attempts WHERE artist_id=$1 AND status<>'failed'",
          [id],
        )
      ).rows[0].n;
      assert.equal(used, status === 400 ? 0 : 1);
    } finally {
      global.fetch = original;
    }
  }
  console.log(
    "PASS real PostgreSQL/HTTP temporary voice upload, consent, signed-link expiry, replay protection, ranges, concurrent once-only training and artist ownership. Voice provider mocked; R2 calls: 0.",
  );
})()
  .catch((e) => {
    console.error("Voice integration test failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
