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

test("model capability diagnostic never signs into accounts, generates lyrics, changes keys or deploys", async () => {
  const calls = [];
  const r = await diagnose({
    key: "render-test-only",
    modelCheck: true,
    fetchImpl: async (url, o) => {
      calls.push({ url, method: o.method });
      assert.equal(o.method, "GET");
      const json = (j, status = 200) =>
        new Response(JSON.stringify(j), { status });
      if (url.startsWith("https://api.openai.com/"))
        return url.endsWith("gpt-6.1-sol")
          ? json({ id: "gpt-6.1-sol" })
          : json({ error: "Never log provider payload" }, 404);
      if (url.includes("/env-vars"))
        return json(
          [
            "ADMIN_KEY",
            "OPENAI_API_KEY",
            "OPENAI_LYRICS_MODEL",
            "NODE_ENV",
            "LAE_REVIEW_ENVIRONMENT",
          ].map((key, i) => ({
            envVar: {
              key,
              value: [
                "admin-mock",
                "model-diagnostic-mock-secret",
                "gpt-4.1-mini",
                "staging",
                "pr6-ephemeral-review-v1",
              ][i],
            },
          })),
        );
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
    },
  });
  assert.equal(r.models[0].available, true);
  assert.equal(r.models[1].available, false);
  assert.equal(r.models[1].provider_status, 404);
  assert.equal(r.accounts_read, false);
  assert.equal(r.billed_provider_requests, 0);
  assert(!JSON.stringify(r).includes("mock-secret"));
  assert(
    !calls.some((x) =>
      /admin\/login|responses|chat\/completions|deploys/.test(x.url),
    ),
  );
});
