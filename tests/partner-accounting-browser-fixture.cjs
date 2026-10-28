"use strict";
const policy = require("../lib/partner-policy");
function fixture(quarter = policy.periodForSale(new Date()), mode = "live") {
  const sample = mode === "test",
    blank = () => ({
      sales: 0,
      eligible_sales: 0,
      unverified_sales: 0,
      gross_minor: 0,
      refund_minor: 0,
      held_minor: 0,
      eligible_minor: 0,
      recorded_commission_minor: 0,
    });
  const direct = blank(),
    team = blank();
  if (sample)
    Object.assign(team, {
      sales: 3,
      eligible_sales: 1,
      gross_minor: 140000,
      refund_minor: 20000,
      held_minor: 20000,
      eligible_minor: 100000,
    });
  return {
    period: policy.period(quarter),
    mode,
    currency: "USD",
    policy: policy.disclosure,
    statements: [],
    rollup: { direct, team },
    team_projection_minor: sample ? 10000 : 0,
    team_by_referrer: sample
      ? [
          {
            referrer_name: "Lydia",
            eligible_sales: 1,
            eligible_minor: 100000,
            refund_minor: 20000,
            held_minor: 20000,
          },
        ]
      : [],
    activity: sample
      ? [
          {
            relation: "team",
            buyer_name: "Test customer",
            plan: "growth",
            gross_minor: 100000,
            refund_minor: 0,
            eligible_minor: 100000,
            charge_minor: 160000000,
            charge_currency: "NGN",
            evidence_valid: true,
            held: false,
            verified_at: policy.period(quarter).start,
          },
        ]
      : [],
    activity_truncated: false,
    team_referrers_truncated: false,
    notice:
      "Projection only. Test records do not represent real money. Refunds and disputed volume are excluded from eligible team totals.",
    statement_snapshot_hash: "a".repeat(64),
    statement_issues: [],
    can_finalize: mode === "test" && policy.period(quarter).ended,
    cash_release_enabled: false,
  };
}
module.exports = { fixture };
