"use strict";
// Opt-in, read-only check against the real public FX endpoint. Never run in offline CI.
const assert = require("node:assert/strict");
const { createExchangeRates } = require("../lib/exchange-rates");
async function main() {
  if (process.env.LAE_PUBLIC_FX_TESTS !== "true")
    throw Error(
      "Set LAE_PUBLIC_FX_TESTS=true to contact the public exchange-rate service.",
    );
  let calls = 0;
  const rates = createExchangeRates({
    env: { FX_RATE_SOURCE: "exchangerate-api" },
    fetchImpl: (...args) => {
      calls++;
      return fetch(...args);
    },
  });
  const snapshot = await rates.snapshot();
  const cases = [
    ["NG", "NGN"],
    ["GH", "GHS"],
    ["KE", "KES"],
    ["LR", "LRD"],
    ["US", "USD"],
  ];
  const checked = [];
  for (const [country, currency] of cases) {
    const report = await rates.pricing({ country });
    assert.equal(report.base_currency, "USD");
    assert.equal(report.display_currency, currency);
    assert.equal(report.conversion_available, true);
    assert.equal(report.display_only, true);
    const expected = {
      daily: 8,
      weekly: 23,
      monthly: 60,
      two_month: 121,
      annual: 588,
    };
    for (const [code, minor] of Object.entries(expected)) {
      const product = report.products["premium_listener:" + code];
      assert.equal(product.usd_minor, minor);
      assert(
        Number.isSafeInteger(product.local_minor) && product.local_minor > 0,
      );
    }
    checked.push({ country, currency, premium_plans: 5 });
  }
  assert.equal(
    calls,
    1,
    "all products/countries must reuse the shared cached snapshot",
  );
  console.log(
    JSON.stringify(
      {
        status: "pass",
        checked_at: new Date().toISOString(),
        source: snapshot.source,
        as_of: snapshot.as_of,
        next_update: snapshot.next_update,
        checked,
        upstream_requests: calls,
        scope:
          "Real public FX display and shared cache only. No database writes, payment, settlement, treasury FX or permanent repricing.",
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error("Public FX verification failed: " + error.message);
  process.exitCode = 1;
});
