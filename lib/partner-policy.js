"use strict";
const { fail } = require("./transactions");
const LEGACY_REVISION = "owner-quarterly-premium5-2026-10-28";
const PURCHASE_YEAR_REVISION = "purchase-year-premium20-team10-2026-11-02";
const {REVISION,PREMIUM_REVISION}=require("./affiliate-framework");
function premiumRates(revision) {
 if(revision===REVISION)return {direct:null,quarterly_team:null,immediate_indirect:0,allocation_status:'pending_decisions',aggregate_percent:30};
 if(revision===PREMIUM_REVISION)return {direct:20,quarterly_team:10,immediate_indirect:0};
 if(revision===PURCHASE_YEAR_REVISION)return {direct:20,quarterly_team:10,immediate_indirect:0};
 if(revision===LEGACY_REVISION)return {direct:10,quarterly_team:5,immediate_indirect:0};
 if(revision==='legacy-premium-10-5')return {direct:10,quarterly_team:0,immediate_indirect:5};
 throw fail(409,'Unrecognized immutable referral policy revision.');
}
const teamRate=(source,revision=LEGACY_REVISION)=>revision===REVISION?null:source==='premium'?premiumRates(revision).quarterly_team:10;
const { minor, percentage, allocate } = require("./premium-policy");
function project(total, premium = 0, legacyPremium = 0) {
  total = minor(total);
  premium = minor(premium);
  legacyPremium = minor(legacyPremium);
  if (premium > total || legacyPremium > premium)
    throw fail(409, "Premium volume exceeds total eligible team volume.");
  return percentage(total - legacyPremium, 10) + percentage(legacyPremium, 5);
}
function calculate(lines) {
  if(lines.some(l=>l.policy_revision===REVISION))throw fail(409,'New team allocations await approved individual rates and qualification rules.');
  const groups = [
    { rate: 10, lines: lines.filter(l => ['artist','studio'].includes(l.source) || (l.source === 'premium' && teamRate(l.source,l.policy_revision||LEGACY_REVISION)===10)) },
    { rate: 5, lines: lines.filter(l => l.source === 'premium' && teamRate(l.source,l.policy_revision||LEGACY_REVISION)===5) },
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
const historicalDisclosure = {
  revision: PURCHASE_YEAR_REVISION,
  direct_rates: {
    artist_subscription: { starter: 15, growth: 25, professional: 25 },
    premium_listener: 20,
    studio_generation: 0,
  },
  team_percent: null,
  team_rates: {
    artist_subscription: 10,
    studio_generation: 10,
    premium_listener: 10,
  },
  affiliate_access: {qualifying_artist_minimum_usd_minor:600,qualifying_premium_minimum_days:90,premium_quarterly_usd_minor:180,commission_window:"one calendar year from verified qualifying purchase",renewals:"All eligible Premium durations, including monthly, during that window"},
  team_depth: 2,
  immediate_indirect_percent: 0,
  registration_reward: 0,
  christmas_cutoff_day: 20,
  late_december_carryover: true,
  payouts_enabled: false,
  notice:
    "Affiliate access requires a verified artist package from $6 or qualifying Premium listening purchase of at least three months ($1.80 for the quarterly plan). The affiliate's own qualifying purchase starts a one-year commission window. New Premium purchases and renewals of any duration earn 20% direct and 10% quarterly team benefit at exactly two referral steps, only while the recipient's window is valid. No purchase earns no commission. Earlier contracts retain their recorded rates. December 21–31 rolls into the next January–March period. Earned obligations survive later window expiry; refunds, disputes and settled funds must be reconciled before payout.",
};
const disclosure={...require('./affiliate-framework').disclosure(),direct_rates:{premium_listener:20},team_rates:{premium_listener:10},team_depth:2,registration_reward:0,immediate_indirect_percent:0,notice:require('./affiliate-framework').disclosure().notice};
module.exports = {
  REVISION,
  PREMIUM_REVISION,
  LEGACY_REVISION,
  PURCHASE_YEAR_REVISION,
  historicalDisclosure,
  premiumRates,
  teamRate,
  period,
  periodForSale,
  disclosure,
  project,
  calculate,
};
