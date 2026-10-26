"use strict";
// Writes only to the explicitly opted-in local disposable review container.
const assert = require("node:assert/strict");
const { checkPreview } = require("../scripts/check-preview.cjs");
(async () => {
  if (process.env.LAE_REVIEW_CONTAINER_TESTS !== "1")
    throw Error(
      "Set LAE_REVIEW_CONTAINER_TESTS=1 only for the owned local review container.",
    );
  const origin = "http://127.0.0.1:3116";
  let healthy = false;
  for (let i = 0; i < 120; i++) {
    try {
      if (
        (await fetch(origin + "/health", { signal: AbortSignal.timeout(1000) }))
          .ok
      ) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(healthy, "review container must start within 60 seconds");
  const report = await checkPreview(origin);
  assert.equal(report.status, "available_for_review", JSON.stringify(report));
  const html = await (await fetch(origin + "/")).text();
  assert(html.includes('id="review-notice"'));
  assert(html.includes("Test accounts and data can reset"));
  const account = {
    name: "Disposable review fixture",
    country: "Nigeria",
    email: "review-" + crypto.randomUUID() + "@ci.invalid",
    password: "ReviewFixturePassword123",
    confirmPassword: "ReviewFixturePassword123",
    plan: "starter",
  };
  let r = await fetch(origin + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(account),
  });
  assert.equal(r.status, 201);
  let result = await r.json();
  assert.equal(result.user.membership_status, "pending_payment");
  r = await fetch(origin + "/api/listener/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      ...account,
      email: "listener-" + crypto.randomUUID() + "@ci.invalid",
    }),
  });
  assert.equal(r.status, 201);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  result = await r.json();
  assert(result.user.id);
  r = await fetch(origin + "/api/platform/session", {
    headers: { Cookie: cookie },
  });
  assert.equal(r.status, 200);
  assert((await r.json()).listener);
  console.log(
    "PASS: 12 HTTP probes, temporary-data notice, actual artist/listener registration, listener session and unpaid artist status; Node 22 + PostgreSQL 16 inside a 512 MB review container. No real provider or production data.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
