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
test("product-specific direct commissions are preserved and only two-step quarterly sales are allowed", () => {
  assert.deepEqual(p.disclosure.direct_rates, {
    artist_subscription: { starter: 15, growth: 25, professional: 25 },
    premium_listener: 10,
    studio_generation: 0,
  });
  assert.equal(p.disclosure.team_percent, 10);
  assert.equal(p.disclosure.team_depth, 2);
  assert.equal(p.disclosure.immediate_indirect_percent, 0);
  assert.equal(p.disclosure.registration_reward, 0);
  assert.equal(p.disclosure.payouts_enabled, false);
});
