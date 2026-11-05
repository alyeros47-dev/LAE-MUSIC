"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  p = require("../lib/partner-policy");
test("approved holiday cutoff rolls every December 21–31 sale into next January–March without changing its original date", () => {
  for (const year of [2024, 2025, 2026, 2027]) {
    assert.equal(p.periodForSale(year + "-12-20T23:59:59.999Z"), year + "-Q4");
    for (let day = 21; day <= 31; day++)
      assert.equal(
        p.periodForSale(year + "-12-" + day + "T00:00:00Z"),
        year + 1 + "-Q1",
      );
    const q = p.period(year + 1 + "-Q1");
    assert.equal(q.start, year + "-12-21T00:00:00.000Z");
    assert.equal(q.end, year + 1 + "-04-01T00:00:00.000Z");
    assert.equal(p.period(year + "-Q4").end, year + "-12-21T00:00:00.000Z");
  }
});
test("bonus windows cover the accounting year with no gap or duplicate eligibility, including leap years", () => {
  for (const year of [2024, 2025, 2026]) {
    const periods = [1, 2, 3, 4].map((q) => p.period(year + "-Q" + q));
    for (let i = 0; i < 3; i++)
      assert.equal(periods[i].end, periods[i + 1].start);
    assert.equal(periods[3].end, p.period(year + 1 + "-Q1").start);
    for (
      let stamp = Date.parse(periods[0].start);
      stamp < Date.parse(periods[3].end);
      stamp += 86400000
    ) {
      const matching = periods.filter(
        (q) => stamp >= Date.parse(q.start) && stamp < Date.parse(q.end),
      );
      assert.equal(matching.length, 1);
      assert.equal(p.periodForSale(stamp), matching[0].code);
    }
  }
});
test("historical product-specific rates and two-step quarterly rules remain preserved", () => {
  assert.deepEqual(p.historicalDisclosure.direct_rates, {
    artist_subscription: { starter: 15, growth: 25, professional: 25 },
    premium_listener: 20,
    studio_generation: 0,
  });
  assert.equal(p.historicalDisclosure.team_percent, null);
  assert.deepEqual(p.historicalDisclosure.team_rates, {
    artist_subscription: 10,
    studio_generation: 10,
    premium_listener: 10,
  });
  assert.equal(p.historicalDisclosure.team_depth, 2);
  assert.equal(p.historicalDisclosure.immediate_indirect_percent, 0);
  assert.equal(p.historicalDisclosure.registration_reward, 0);
  assert.equal(p.historicalDisclosure.payouts_enabled, false);
});

test("mixed products calculate independent approved rates and never allocate artist-rate money to Premium", () => {
  const lines = [
    { order_id: "artist", source: "artist", eligible_minor: 100000 },
    { order_id: "studio", source: "studio", eligible_minor: 100000 },
    { order_id: "premium", source: "premium", policy_revision:p.LEGACY_REVISION, eligible_minor: 100000 },
  ];
  const result = p.calculate(lines);
  assert.equal(result.bonus_minor, 25000);
  assert.equal(p.project(300000, 100000,100000), 25000);
  assert.deepEqual(
    Object.fromEntries(result.shares.map((x) => [x.id, x.amount_minor])),
    { artist: 10000, studio: 10000, premium: 5000 },
  );
  assert.throws(() => p.project(10, 11));
  assert.throws(() =>
    p.calculate([{ order_id: "gift", source: "gift", eligible_minor: 10000 }]),
  );
});
test("Premium cents are rounded within their 5 percent group without borrowing the 10 percent artist allocation", () => {
  const lines = [
    { order_id: "artist", source: "artist", eligible_minor: 11 },
    ...Array.from({ length: 5 }, (_, i) => ({
      order_id: "premium" + i,
      source: "premium",
      policy_revision:p.LEGACY_REVISION,
      eligible_minor: 8,
    })),
  ];
  const result = p.calculate(lines);
  assert.equal(result.bonus_minor, 3);
  assert.equal(result.shares.find((x) => x.id === "artist").amount_minor, 1);
  assert.equal(
    result.shares
      .filter((x) => x.id.startsWith("premium"))
      .reduce((n, x) => n + x.amount_minor, 0),
    2,
  );
  assert.equal(
    p.calculate(lines.map((x) => ({ ...x, eligible_minor: 0 }))).bonus_minor,
    0,
  );
});

test('earlier purchase-year Premium contracts retain their original 20/10 rates',()=>{
 assert.deepEqual(p.premiumRates(p.PURCHASE_YEAR_REVISION),{direct:20,quarterly_team:10,immediate_indirect:0});
 assert.deepEqual(p.premiumRates(p.LEGACY_REVISION),{direct:10,quarterly_team:5,immediate_indirect:0});
 assert.deepEqual(p.premiumRates('legacy-premium-10-5'),{direct:10,quarterly_team:0,immediate_indirect:5});
 assert.throws(()=>p.premiumRates('unknown'),e=>e.status===409);
 const current=p.calculate([{order_id:'a',source:'artist',eligible_minor:5},{order_id:'b',source:'premium',policy_revision:p.PURCHASE_YEAR_REVISION,eligible_minor:5}]);
 assert.equal(current.bonus_minor,1,'same-rate eligible volume rounds once across current products');
 assert.equal(p.project(10,5),1);
 const mixed=p.calculate([{order_id:'a',source:'premium',policy_revision:p.PURCHASE_YEAR_REVISION,eligible_minor:180},{order_id:'b',source:'premium',policy_revision:p.LEGACY_REVISION,eligible_minor:180}]);
 assert.equal(mixed.bonus_minor,27);assert.equal(p.project(360,360,180),27);
 assert.equal(current.shares.reduce((n,x)=>n+x.amount_minor,0),1);
});
