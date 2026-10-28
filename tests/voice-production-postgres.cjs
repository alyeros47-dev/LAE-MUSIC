"use strict";
// Real isolated PostgreSQL and original voice handler; upstream R2/MusicAPI mocked.
module.exports = async (t, { pool, artist, other }) => {
  const assert = require("node:assert/strict"),
    { Readable } = require("node:stream"),
    fs = require("node:fs"),
    handler = require("../artist-voice");
  await t.test(
    "production voice: actual row locks protect upload ownership, once-only training and existing ready profiles",
    async () => {
      let owner = artist,
        stored = 0,
        puts = 0,
        trains = 0;
      const { pcmWav } = await import(
        "data:text/javascript;base64," +
          fs.readFileSync("web/studio-workflow.js").toString("base64")
      );
      const bytes = Buffer.from(
        await pcmWav(new Float32Array(8000 * 15), 8000).arrayBuffer(),
      );
      const ctx = {
        pool,
        me: async () => ({ id: owner }),
        validOrigin: () => true,
        storage: () => ({ bucket: "isolated-fixture" }),
        presign: async (_s, key, action) =>
          "https://voice-storage.fixture/" + action + "/" + key,
        headObject: async () => ({
          ContentLength: stored,
          ContentType: "audio/wav",
        }),
      };
      async function api(path, method = "GET", data) {
        const req = Readable.from(
          data === undefined
            ? []
            : [
                Buffer.isBuffer(data)
                  ? data
                  : Buffer.from(JSON.stringify(data)),
              ],
        );
        req.url = path;
        req.method = method;
        req.headers = {
          "content-type": Buffer.isBuffer(data)
            ? "audio/wav"
            : "application/json",
        };
        const res = {
          writeHead(status) {
            this.status = status;
          },
          end(data) {
            this.data = JSON.parse(data);
          },
        };
        await handler(
          req,
          res,
          new URL(path, "https://lae.test").pathname,
          ctx,
        );
        return res;
      }
      const oldFetch = global.fetch,
        oldKey = process.env.MUSICAPI_API_KEY;
      global.fetch = async (url, opt) => {
        if (url.startsWith("https://voice-storage.fixture/put/")) {
          puts++;
          stored = opt.body.length;
          return new Response("");
        }
        if (url.endsWith("/create-voice")) {
          trains++;
          return Response.json({ task_id: "postgres_voice_task_123" });
        }
        if (url.endsWith("/task/postgres_voice_task_123"))
          return Response.json({ persona_id: "postgres_persona" });
        throw Error("Unexpected test upstream");
      };
      process.env.MUSICAPI_API_KEY = "mock-only";
      try {
        const prepared = await api("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: true,
        });
        assert.equal(prepared.status, 200);
        owner = other;
        assert.equal((await api(prepared.data.url, "PUT", bytes)).status, 409);
        assert.equal(puts, 0);
        owner = artist;
        assert.equal((await api(prepared.data.url, "PUT", bytes)).status, 200);
        const concurrent = await Promise.all([
          api("/api/voice/train", "POST", {}),
          api("/api/voice/train", "POST", {}),
        ]);
        assert(concurrent.some((x) => x.status === 200));
        assert(concurrent.every((x) => [200, 409].includes(x.status)));
        assert.equal(trains, 1);
        assert.deepEqual((await api("/api/voice/status")).data, {
          status: "ready",
          hasVoice: true,
        });
        const before = await pool.query(
          "SELECT * FROM artist_voice_profiles WHERE creator_id=$1",
          [artist],
        );
        assert.equal(
          (
            await api("/api/voice/upload", "POST", {
              type: "audio/wav",
              bytes: bytes.length,
              consent: true,
            })
          ).status,
          409,
        );
        assert.equal((await api(prepared.data.url, "PUT", bytes)).status, 409);
        assert.deepEqual(
          (
            await pool.query(
              "SELECT * FROM artist_voice_profiles WHERE creator_id=$1",
              [artist],
            )
          ).rows,
          before.rows,
        );
        assert.equal(puts, 1);
        assert.equal(trains, 1);
      } finally {
        global.fetch = oldFetch;
        if (oldKey === undefined) delete process.env.MUSICAPI_API_KEY;
        else process.env.MUSICAPI_API_KEY = oldKey;
      }
    },
  );
};
