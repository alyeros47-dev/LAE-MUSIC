"use strict";
const { fail } = require("./transactions");
const REVISION = "owner-direct-quarterly-2026-10-28";
function periodForSale(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw fail(400, "Invalid verified sale timestamp.");
  const year = date.getUTCFullYear(),
    month = date.getUTCMonth();
  return month === 11 && date.getUTCDate() >= 21
    ? year + 1 + "-Q1"
    : year + "-Q" + (Math.floor(month / 3) + 1);
}
function period(code, now = new Date()) {
  if (typeof code !== "string" || !/^20\d\d-Q[1-4]$/.test(code))
    throw fail(400, "Choose a bonus period in YYYY-Q1 through YYYY-Q4 format.");
  const [year, q] = code.split("-Q").map(Number),
    start =
      q === 1
        ? new Date(Date.UTC(year - 1, 11, 21))
        : new Date(Date.UTC(year, (q - 1) * 3, 1)),
    end =
      q === 4
        ? new Date(Date.UTC(year, 11, 21))
        : new Date(Date.UTC(year, q * 3, 1));
  return {
    code,
    start: start.toISOString(),
    end: end.toISOString(),
    ended: new Date(now) >= end,
  };
}
const disclosure = {
  revision: REVISION,
  direct_rates: {
    artist_subscription: { starter: 15, growth: 25, professional: 25 },
    premium_listener: 10,
    studio_generation: 0,
  },
  team_percent: 10,
  team_depth: 2,
  immediate_indirect_percent: 0,
  registration_reward: 0,
  christmas_cutoff_day: 20,
  late_december_carryover: true,
  payouts_enabled: false,
  notice:
    "Direct commissions retain product-specific rates. The quarterly team bonus applies only to verified eligible purchases exactly two referral steps below a leader; first-step purchases do not also earn that leader a team bonus. December 21–31 purchases roll into the next January–March period. A projection or closed period is not a completed payout; refunds, disputes and settled funds must be reconciled.",
};
module.exports = { REVISION, period, periodForSale, disclosure };
