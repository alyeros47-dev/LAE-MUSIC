"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  voice = require("../lib/review-voice");
const env = {
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: "pr6-ephemeral-review-v1",
  LAE_REVIEW_TEST_ACCESS: "1",
  LAE_REVIEW_TEST_OPEN: "1",
};
test("temporary voice transport stays isolated from production and rejects unsafe file keys", () => {
  assert(voice.enabled(env));
  for (const e of [
    {},
    { ...env, NODE_ENV: "production" },
    { ...env, LAE_REVIEW_TEST_OPEN: "0" },
  ])
    assert(!voice.enabled(e));
  for (const key of [
    "../secret",
    "voice-profiles/7/../../secrets.wav",
    "voice-profiles/0/" + require("crypto").randomUUID() + ".wav",
  ])
    assert.throws(() => voice.keyPath(key));
  assert(
    voice
      .keyPath("voice-profiles/7/" + require("crypto").randomUUID() + ".wav")
      .startsWith("/tmp/lae-review-media/voice/"),
  );
});
test("review voice upload rejects disguised files and WAV samples shorter than ten seconds", () => {
  function wav(seconds) {
    const rate = 8000,
      b = Buffer.alloc(44 + rate * 2 * seconds);
    b.write("RIFF");
    b.writeUInt32LE(b.length - 8, 4);
    b.write("WAVE", 8);
    b.write("fmt ", 12);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24);
    b.writeUInt32LE(rate * 2, 28);
    b.writeUInt16LE(16, 34);
    return b;
  }
  assert(voice.validAudio(wav(15), "audio/wav"));
  assert(!voice.validAudio(wav(2), "audio/wav"));
  assert(
    !voice.validAudio(Buffer.from("<html>not audio</html>"), "audio/mpeg"),
  );
  assert(!voice.validAudio(Buffer.alloc(1000), "audio/wav"));
});
test("provider voice reservation is once-only and cannot be used for a different paid operation", async () => {
  const { createBudget } = require("../deploy/review-provider-budget.cjs");
  let stored = null,
    network = 0;
  const context = {
    reviewProvider: {
      artistId: "7",
      reference: "voice-" + require("crypto").randomUUID(),
      kind: "musicapi",
    },
  };
  const fetcher = createBudget({
    mode: "account",
    getContext: () => context,
    fileSystem: {
      readFileSync() {
        if (stored === null) throw Object.assign(Error(), { code: "ENOENT" });
        return stored;
      },
      writeFileSync(p, x) {
        stored = x;
      },
    },
    fetchImpl: async () => {
      network++;
      return new Response("{}");
    },
  });
  assert.equal(
    (
      await fetcher("https://api.musicapi.ai/api/v1/sonic/create", {
        method: "POST",
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await fetcher("https://api.musicapi.ai/api/v1/sonic/create-voice", {
        method: "POST",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetcher("https://api.musicapi.ai/api/v1/sonic/create-voice", {
        method: "POST",
      })
    ).status,
    409,
  );
  assert.equal(network, 1);
});
