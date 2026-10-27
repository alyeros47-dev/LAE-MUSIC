"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { createVerifier } = require("../lib/lyrics-models");
test("approved model verification is read-only, deduplicated and cached per credential/model", async () => {
  let calls = 0,
    clock = 0;
  const verify = createVerifier({ now: () => clock });
  const options = {
    key: "test-key-only",
    fetchImpl: async (url, o) => {
      calls++;
      assert.equal(o.method, "GET");
      assert(url.startsWith("https://api.openai.com/v1/models/"));
      return {
        ok: true,
        json: async () => ({ id: decodeURIComponent(url.split("/").at(-1)) }),
      };
    },
  };
  assert.deepEqual(
    await Promise.all([
      verify("gpt-6.1-sol", options),
      verify("gpt-6.1-sol", options),
    ]),
    ["gpt-6.1-sol", "gpt-6.1-sol"],
  );
  assert.equal(calls, 1);
  await verify("gpt-6.1-sol", options);
  assert.equal(calls, 1);
  await verify("gpt-6-astra", options);
  assert.equal(calls, 2);
  clock = 16 * 60000;
  await verify("gpt-6.1-sol", options);
  assert.equal(calls, 3);
});
test("unknown, missing, unavailable and mismatched models fail before any charge or model substitution", async () => {
  const verify = createVerifier();
  let calls = 0;
  await assert.rejects(
    verify("gpt-4.1-mini", {
      key: "test-only",
      fetchImpl: () => {
        calls++;
      },
    }),
    (e) => e.status === 400,
  );
  await assert.rejects(verify("gpt-6-astra", {}), (e) => e.status === 503);
  assert.equal(calls, 0);
  await assert.rejects(
    verify("gpt-6-astra", {
      key: "not-available",
      fetchImpl: async () => ({ ok: false, status: 404 }),
    }),
    (e) => e.status === 503 && e.providerStatus === 404,
  );
  await assert.rejects(
    verify("gpt-6.1-sol", {
      key: "wrong-result",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ id: "gpt-4.1-mini" }),
      }),
    }),
    (e) => e.status === 503,
  );
});
