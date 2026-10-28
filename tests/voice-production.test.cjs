"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { Readable } = require("node:stream");
const handler = require("../artist-voice"),
  { capabilities } = require("../lib/voice-capabilities");
const env = {
  MUSICAPI_API_KEY: "fixture",
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "fixture",
  R2_SECRET_ACCESS_KEY: "fixture",
  R2_BUCKET: "existing-bucket",
};
test("production voice availability follows configured existing integrations without claiming a live upload was verified", () => {
  assert.deepEqual(capabilities(env), {
    voice_upload_available: true,
    voice_upload_verified: false,
    voice_capability: "configured",
  });
  for (const key of Object.keys(env))
    assert.equal(
      capabilities({ ...env, [key]: "" }).voice_upload_available,
      false,
    );
  assert.equal(
    capabilities({ ...env, LAE_REVIEW_R2_MODE: "scoped-temporary-v1" })
      .voice_upload_available,
    false,
  );
});
function fixture() {
  const profiles = new Map(),
    queries = [];
  let id = 7,
    authorized = true,
    origin = true,
    puts = 0,
    training = 0,
    stored = 0,
    rejectStorage = false;
  const pool = {
    async query(sql, args = []) {
      queries.push(sql);
      let rows = [];
      if (
        sql.startsWith("SELECT") &&
        sql.includes("FROM artist_voice_profiles")
      )
        rows = profiles.has(args[0]) ? [{ ...profiles.get(args[0]) }] : [];
      if (sql.startsWith("INSERT INTO artist_voice_profiles"))
        profiles.set(args[0], { object_key: args[1], status: "uploading" });
      if (sql.includes("status='submitting'"))
        Object.assign(profiles.get(args[1]), {
          task_id: args[0],
          status: "submitting",
        });
      if (sql.includes("status='training'"))
        Object.assign(profiles.get(args[1]), {
          task_id: args[0],
          status: "training",
        });
      if (sql.includes("persona_id=$1,status='ready'"))
        Object.assign(profiles.get(args[1]), {
          persona_id: args[0],
          status: "ready",
        });
      return { rows };
    },
    async connect() {
      return { ...this, release() {} };
    },
  };
  const ctx = {
    pool,
    me: async () => (authorized ? { id } : null),
    validOrigin: () => origin,
    storage: () => ({ bucket: "existing-bucket" }),
    presign: async (_s, key, action) =>
      "https://storage.fixture/" + action + "/" + key,
    headObject: async () => ({
      ContentLength: stored,
      ContentType: "audio/wav",
    }),
  };
  async function request(path, method = "GET", data, headers = {}) {
    const req = Readable.from(
      data === undefined
        ? []
        : [Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data))],
    );
    req.url = path;
    req.method = method;
    req.headers = headers;
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(bytes) {
        this.data = JSON.parse(bytes);
      },
    };
    assert(
      await handler(req, res, new URL(path, "https://lae.test").pathname, ctx),
    );
    return res;
  }
  const fetcher = async (url, opt) => {
    if (url.startsWith("https://storage.fixture/put/")) {
      puts++;
      stored = opt.body.length;
      assert.match(url, /voice-profiles\/7\/[a-f0-9-]+\.wav$/);
      return new Response("", { status: rejectStorage ? 503 : 200 });
    }
    if (url.endsWith("/create-voice")) {
      training++;
      return Response.json({ task_id: "voice_task_fixture_123" });
    }
    if (url.endsWith("/task/voice_task_fixture_123"))
      return Response.json({ persona_id: "owned_persona_fixture" });
    throw Error("Unexpected upstream");
  };
  return {
    profiles,
    queries,
    request,
    fetcher,
    get puts() {
      return puts;
    },
    get training() {
      return training;
    },
    set id(x) {
      id = x;
    },
    set authorized(x) {
      authorized = x;
    },
    set origin(x) {
      origin = x;
    },
    set rejectStorage(x) {
      rejectStorage = x;
    },
  };
}
async function withUpstream(f, fn) {
  const old = global.fetch,
    key = process.env.MUSICAPI_API_KEY;
  global.fetch = f.fetcher;
  process.env.MUSICAPI_API_KEY = "fixture-only";
  try {
    await fn();
  } finally {
    global.fetch = old;
    if (key === undefined) delete process.env.MUSICAPI_API_KEY;
    else process.env.MUSICAPI_API_KEY = key;
  }
}
async function audio() {
  const fs = require("node:fs");
  const { pcmWav } = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/studio-workflow.js").toString("base64")
  );
  return Buffer.from(
    await pcmWav(new Float32Array(8000 * 15), 8000).arrayBuffer(),
  );
}
test("owned recorded WAV saves through existing R2 adapter, trains once, becomes selectable and survives a repeated request", async () => {
  const f = fixture(),
    bytes = await audio();
  await withUpstream(f, async () => {
    const prepared = await f.request("/api/voice/upload", "POST", {
      type: "audio/wav",
      bytes: bytes.length,
      consent: true,
    });
    assert.equal(prepared.status, 200);
    assert.match(prepared.data.url, /^\/api\/voice\/sample\?reference=/);
    f.id = 8;
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      409,
    );
    assert.equal(f.puts, 0);
    f.id = 7;
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      200,
    );
    assert.equal(f.puts, 1);
    assert.equal(
      (await f.request("/api/voice/train", "POST", {})).data.status,
      "training",
    );
    assert.equal(
      (await f.request("/api/voice/train", "POST", {})).data.status,
      "training",
    );
    assert.equal(f.training, 1);
    assert.equal(
      (
        await f.request("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: true,
        })
      ).status,
      409,
    );
    assert.deepEqual((await f.request("/api/voice/status")).data, {
      status: "ready",
      hasVoice: true,
    });
    const profile = { ...f.profiles.get(7) };
    assert.equal(
      (
        await f.request("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: true,
        })
      ).status,
      409,
    );
    assert.deepEqual(f.profiles.get(7), profile);
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      409,
    );
    assert.equal(f.puts, 1);
    assert.deepEqual((await f.request("/api/voice/profile")).data, {
      status: "ready",
      hasVoice: true,
    });
  });
});
test("voice saving rejects missing consent, foreign origins, inactive sessions, oversized or disguised files before storage or provider calls", async () => {
  const f = fixture();
  await withUpstream(f, async () => {
    const bytes = await audio();
    assert.equal(
      (
        await f.request("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: false,
        })
      ).status,
      400,
    );
    f.authorized = false;
    assert.equal(
      (await f.request("/api/voice/upload", "POST", {})).status,
      401,
    );
    f.authorized = true;
    f.origin = false;
    assert.equal(
      (
        await f.request(
          "/api/voice/sample?reference=" + "a".repeat(36),
          "PUT",
          bytes,
          { "content-type": "audio/wav" },
        )
      ).status,
      403,
    );
    f.origin = true;
    for (const bytes of [
      Buffer.from("<html>not audio</html>"),
      Buffer.alloc(12000001),
    ])
      assert(
        [400, 413].includes(
          (
            await f.request(
              "/api/voice/sample?reference=" + "a".repeat(36),
              "PUT",
              bytes,
              { "content-type": "audio/wav" },
            )
          ).status,
        ),
      );
    assert.equal(f.puts, 0);
    assert.equal(f.training, 0);
  });
});
test("failed R2 save preserves the upload and never starts provider training", async () => {
  const f = fixture(),
    bytes = await audio();
  await withUpstream(f, async () => {
    const prepared = await f.request("/api/voice/upload", "POST", {
      type: "audio/wav",
      bytes: bytes.length,
      consent: true,
    });
    f.rejectStorage = true;
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      502,
    );
    assert.equal(f.training, 0);
    assert.equal(f.profiles.get(7).status, "uploading");
  });
});
