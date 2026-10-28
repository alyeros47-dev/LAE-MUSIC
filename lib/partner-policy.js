"use strict";
const { fail } = require("./transactions");
const REVISION = "owner-quarterly-premium5-2026-10-28";
const { minor, percentage, allocate } = require("./premium-policy");
function project(total, premium = 0) {
  total = minor(total);
  premium = minor(premium);
  if (premium > total)
    throw fail(409, "Premium volume exceeds total eligible team volume.");
  return percentage(total - premium, 10) + percentage(premium, 5);
}
function calculate(lines) {
  const groups = [
    {
      rate: 10,
      lines: lines.filter(
        (l) => l.source === "artist" || l.source === "studio",
      ),
    },
    { rate: 5, lines: lines.filter((l) => l.source === "premium") },
  ];
  if (groups.reduce((n, g) => n + g.lines.length, 0) !== lines.length)
    throw fail(409, "Unapproved team product source.");
  const breakdown = groups.map((g) => {
    const basis_minor = g.lines.reduce(
      (n, l) => n + minor(l.eligible_minor),
      0,
    );
    return {
      percent: g.rate,
      basis_minor: minor(basis_minor),
      bonus_minor: percentage(basis_minor, g.rate),
      lines: g.lines,
    };
  });
  return {
    bonus_minor: minor(breakdown.reduce((n, g) => n + g.bonus_minor, 0)),
    breakdown: breakdown.map(({ lines, ...g }) => g),
    shares: breakdown.flatMap((g) =>
      allocate(
        g.bonus_minor,
        g.lines.map((l) => ({ id: l.order_id, weight: l.eligible_minor })),
      ),
    ),
  };
}
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
  team_percent: null,
  team_rates: {
    artist_subscription: 10,
    studio_generation: 10,
    premium_listener: 5,
  },
  team_depth: 2,
  immediate_indirect_percent: 0,
  registration_reward: 0,
  christmas_cutoff_day: 20,
  late_december_carryover: true,
  payouts_enabled: false,
  notice:
    "Direct commissions retain product-specific rates. Quarterly team rates are 10% for eligible artist packages and studio services, and 5% for Premium Listener subscriptions. The bonus applies only to verified eligible purchases exactly two referral steps below a leader; first-step purchases do not also earn that leader a team bonus. December 21–31 purchases roll into the next January–March period. A projection or closed period is not a completed payout; refunds, disputes and settled funds must be reconciled.",
};
module.exports = {
  REVISION,
  period,
  periodForSale,
  disclosure,
  project,
  calculate,
};
