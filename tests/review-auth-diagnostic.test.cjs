"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { diagnose } = require("../scripts/review-auth-diagnostic.cjs");
test("sandbox diagnostic exposes only account existence and creation time, never credentials or other people", async () => {
  const email = "isolated@test.invalid",
    hash = crypto.createHash("sha256").update(email).digest("hex"),
    calls = [];
  const r = await diagnose({
    key: "render-mock-secret",
    emailHash: hash,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      const json = (j, headers = {}) =>
        new Response(JSON.stringify(j), {
          headers: { "Content-Type": "application/json", ...headers },
        });
      if (url.endsWith("/env-vars?limit=100"))
        return json([
          { envVar: { key: "ADMIN_KEY", value: "admin-mock-secret" } },
          { envVar: { key: "NODE_ENV", value: "staging" } },
          {
            envVar: {
              key: "LAE_REVIEW_ENVIRONMENT",
              value: "pr6-ephemeral-review-v1",
            },
          },
        ]);
      if (url.startsWith("https://api.render.com/")) {
        assert.equal(options.method, "GET");
        return json({
          id: "srv-dbfmk5ss728c73ded300",
          name: "lae-music-review-sandbox",
          type: "web_service",
          ownerId: "usr-test",
          repo: "https://github.com/alyeros47-dev/LAE-MUSIC",
          branch: "codex/premium-platform-release",
          autoDeployTrigger: "off",
          serviceDetails: {
            plan: "free",
            url: "https://lae-music-review-sandbox.onrender.com",
          },
        });
      }
      if (url.endsWith("/api/admin/login"))
        return json(
          { ok: true },
          { "Set-Cookie": "lae_admin=private-test-cookie; Secure; HttpOnly" },
        );
      if (url.endsWith("/api/admin/logout")) return json({ ok: true });
      return json({
        limit: 200,
        rows: url.endsWith("artists")
          ? [
              {
                email,
                display_name: "private-name",
                created_at: "2026-10-27T12:00:00Z",
              },
              { email: "other@test.invalid", created_at: "private-other-date" },
            ]
          : [],
      });
    },
  });
  assert.equal(r.roles.artists.found, 1);
  assert.equal(r.roles.listeners.found, 0);
  assert(r.roles.artists.complete);
  assert.equal(r.accounts_changed, false);
  const text = JSON.stringify(r);
  for (const privateValue of [
    email,
    "private-name",
    "private-other-date",
    "mock-secret",
    "private-test-cookie",
  ])
    assert(!text.includes(privateValue));
  assert(
    !calls.some((x) => /deploys|production|lae-music\.onrender/.test(x.url)),
  );
  assert.equal(calls.filter((x) => x.method === "POST").length, 2);
});
test("diagnostic rejects missing access/digest before any request", async () => {
  await assert.rejects(
    diagnose({
      key: "mock",
      emailHash: "invalid",
      fetchImpl: () => {
        throw Error("Do not call");
      },
    }),
  );
});
