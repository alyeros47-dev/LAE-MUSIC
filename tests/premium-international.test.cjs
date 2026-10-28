"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs");
const money = require("../lib/currency"),
  { catalog, referenceToUsd } = require("../lib/premium-pricing"),
  { createExchangeRates } = require("../lib/exchange-rates"),
  { createPremium } = require("../lib/premium-listeners");
test("approved USD catalog retains explicit owner approval and reproducible dated exchange evidence", () => {
  const c = catalog(),
    raw = fs.readFileSync(
      require.resolve("../data/premium-price-reference-2026-10-25.json"),
    ),
    source = JSON.parse(raw);
  assert.equal(c.base_currency, "USD");
  assert.equal(c.approved, true);
  assert.equal(c.status, "approved");
  assert.equal(
    crypto.createHash("sha256").update(raw).digest("hex"),
    c.document.reference.response_sha256,
  );
  assert.equal(String(source.rates.NGN), c.document.reference.ngn_per_usd);
  assert.deepEqual(
    c.plans.map((p) => p.amount_minor),
    [8, 23, 60, 121, 588],
  );
  for (const p of c.plans)
    assert.equal(
      p.amount_minor,
      referenceToUsd(
        c.document.plans[p.code].reference_ngn_minor,
        c.document.reference.ngn_per_usd,
      ),
    );
});
test("pending USD approval cannot create an order or touch the database", async () => {
  const pending = structuredClone(catalog().document);
  pending.status = "pending_approval";
  pending.approval = null;
  const service = createPremium({
    pricing: pending,
    pool: {
      connect() {
        throw Error("Must not create unpaid records before price approval");
      },
    },
  });
  assert.equal(service.capabilities().base_currency, "USD");
  await assert.rejects(
    service.prepare(7, "isolated-price-request", { plan: "monthly" }),
    (e) => e.status === 503 && e.message.includes("approval"),
  );
  const bad = structuredClone(catalog().document);
  bad.status = "approved";
  bad.approval = null;
  assert.throws(
    () => catalog(bad),
    (e) => e.status === 503,
  );
});
test("the existing rate cache and country selector price Premium together with artist products", async () => {
  const now = Date.now();
  let calls = 0;
  const rates = createExchangeRates({
    env: {},
    now: () => now,
    fetchImpl: async () => {
      calls++;
      return Response.json({
        result: "success",
        base_code: "USD",
        time_last_update_unix: Math.floor(now / 1000),
        time_next_update_unix: Math.floor(now / 1000) + 86400,
        rates: { USD: 1, NGN: 1600, GHS: 12, KES: 130, LRD: 180 },
      });
    },
  });
  for (const [country, currency, amount] of [
    ["NG", "NGN", 96000],
    ["GH", "GHS", 720],
    ["KE", "KES", 7800],
    ["LR", "LRD", 10800],
  ]) {
    const p = await rates.pricing({ country });
    assert.equal(p.display_currency, currency);
    assert.equal(p.products["premium_listener:monthly"].local_minor, amount);
    assert.equal(p.products["premium_listener:monthly"].usd_minor, 60);
    assert.equal(
      p.products["premium_listener:monthly"].price_status,
      "approved",
    );
    assert.equal(p.products["artist_subscription:starter"].usd_minor, 600);
  }
  assert.equal(calls, 1);
});
test("original-currency normalization uses the immutable rate once with currency precision and safe integer rounding", () => {
  assert.equal(money.convertToUsd(96000, "1600", "NGN"), 60);
  assert.equal(money.convertToUsd(720, "12", "GHS"), 60);
  assert.equal(money.convertToUsd(78, "130", "JPY"), 60);
  assert.equal(money.convertToUsd(184, "0.3065", "KWD"), 60);
  for (const value of [[], {}, true, -1, 1.5, Infinity])
    assert.throws(() => money.convertToUsd(value, 1, "USD"));
  assert.throws(() => money.convertToUsd(100, 0, "USD"));
  assert.equal(
    money.convertToUsd(
      money.convertUsd(60, "1325.718117", "NGN"),
      "1325.718117",
      "NGN",
    ),
    60,
  );
});
