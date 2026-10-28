"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const limits = require("../lib/studio-limits"),
  output = require("../lib/studio-output");
test("song budgets fit selected durations without cutting accepted lyrics", () => {
  assert.equal(limits.durationSeconds("6 minutes"), 360);
  assert.equal(limits.durationSeconds(), 180);
  assert.throws(() => limits.durationSeconds(361));
  assert.throws(
    () => limits.validateLyrics("a".repeat(5001), 360),
    (e) => e.status === 400,
  );
  assert.throws(
    () => limits.validateLyrics("word ".repeat(100), 60),
    (e) => e.status === 400,
  );
  const words = "a".repeat(4950);
  assert(limits.validateLyrics(words, 360));
  assert.equal(words.length, 4950);
  assert.match(limits.guidance("1 minute"), /\[Outro\]/);
  assert(limits.budget(60).words < limits.budget(360).words);
});
test("artist artifact delivery is authenticated, owned, complete and has a real attachment filename", async () => {
  let calls = 0;
  const service = output.create({
    pool: { query: async () => ({ rowCount: 1, rows: [{}] }) },
    provider: {
      clips: async () => [
        {
          clip_id: "owned_clip_123",
          title: "My song é",
          audio_url: "https://cdn1.suno.ai/owned.mp3",
        },
      ],
    },
    download: async (url, kind) => {
      calls++;
      assert.equal(kind, "audio");
      return {
        bytes: Buffer.from("ID3-owned-test-audio"),
        mime: "audio/mpeg",
        extension: "mp3",
      };
    },
  });
  const url = new URL(
    "https://lae.test/api/music/sonic/output?task=owned_task_123&clip=owned_clip_123",
  );
  const req = { method: "GET" },
    res = {
      writeHead(n, h) {
        this.status = n;
        this.headers = h;
      },
      end(b) {
        this.bytes = b;
      },
    };
  await assert.rejects(
    service.handle(req, res, url, async () => null),
    (e) => e.status === 401,
  );
  assert.equal(calls, 0);
  await service.handle(req, res, url, async () => ({ id: 7 }));
  assert.equal(res.status, 200);
  assert.match(res.headers["Content-Disposition"], /attachment/);
  assert.match(res.headers["Content-Disposition"], /filename\*=UTF-8/);
  assert.equal(res.headers["Content-Length"], res.bytes.length);
  const other = output.create({
    pool: { query: async () => ({ rowCount: 0 }) },
    provider: {
      clips() {
        throw Error("Must not contact provider");
      },
    },
  });
  await assert.rejects(
    other.handle(req, res, url, async () => ({ id: 8 })),
    (e) => e.status === 404,
  );
});
test("review release storage refuses production flags and unsafe object keys", () => {
  const store = require("../lib/review-release-storage");
  assert.equal(
    store.enabled({ NODE_ENV: "production", LAE_REVIEW_TEST_OPEN: "1" }),
    false,
  );
  for (const key of [
    "../secret",
    "studio-releases/7/1/../../secret.mp3",
    "voice-profiles/7/file.wav",
  ])
    assert.throws(() => store.filePath(key));
  assert(
    store
      .filePath(
        "studio-releases/7/1/" + require("crypto").randomUUID() + ".mp3",
      )
      .startsWith("/tmp/lae-review-media/releases/"),
  );
});
