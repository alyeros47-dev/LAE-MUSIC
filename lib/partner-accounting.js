"use strict";
// Read-only reconciliation of existing attributed artist-package receipts.
// Never changes rates, posts earnings, settles a bonus or touches a payment gateway.
const { fail } = require("./transactions");
const { minor, percentage } = require("./premium-policy");
const partnerPolicy = require("./partner-policy");
const period = (value, now = new Date()) =>
  partnerPolicy.period(value || partnerPolicy.periodForSale(now), now);
function filters(input = {}, now = new Date()) {
  const mode = input.mode || "live";
  if (!["live", "test", "legacy"].includes(mode))
    throw fail(
      400,
      "Choose live, test or historical records; currencies and modes are never combined.",
    );
  return { period: period(input.quarter, now), mode };
}
const SOURCES = `WITH attributed AS (
 SELECT o.id AS order_id,'artist'::text AS source,o.plan,r.verified_at,COALESCE(r.verified_at,c.created_at) AS occurred_at,
 CASE WHEN c.referrer_id=$1 THEN 'direct' ELSE 'team' END AS relation,
 c.referrer_id,sponsor.display_name AS referrer_name,c.referred_artist_id AS buyer_id,buyer.display_name AS buyer_name,
 COALESCE(p.mode,'legacy') AS mode,r.currency,COALESCE(r.amount_minor,0)::bigint AS gross_minor,
 c.amount_cents::bigint AS commission_minor,c.status AS commission_status,
 p.charge_currency,p.charge_minor,q.id AS quote_id,
 CASE WHEN q.charge_currency='USD' THEN '1' ELSE fx.rates->>q.charge_currency END AS exchange_rate,
 COALESCE(fx.as_of,q.created_at) AS conversion_at,
 COALESCE(r.order_id IS NOT NULL AND o.status='paid' AND r.currency='USD' AND p.base_currency='USD'
 AND p.base_minor=r.amount_minor AND p.mode IN ('live','test') AND p.payment_id=r.payment_id AND p.merchant_id=r.merchant_id AND p.provider=r.provider
 AND q.base_minor=r.amount_minor AND q.charge_currency=p.charge_currency AND q.charge_minor=p.charge_minor
 AND c.referred_artist_id=o.artist_id AND c.referrer_id<>o.artist_id
 AND (c.referrer_id=$1 OR (ts.team_leader_id=$1 AND ts.affiliate_id=c.referrer_id AND ts.team_leader_id<>ts.affiliate_id AND ts.team_leader_id<>o.artist_id)),FALSE) AS evidence_valid,
 rev.order_id IS NOT NULL AS reversed,
 (rev.order_id IS NULL AND (COALESCE(s.payment_hold,FALSE) OR c.status IN ('held','reconciliation_required','reversed')
 OR EXISTS(SELECT 1 FROM payment_refund_cases rc WHERE rc.order_id=o.id AND rc.status NOT IN ('declined','refunded'))
 OR EXISTS(SELECT 1 FROM refund_complaints rc LEFT JOIN refund_complaint_reviews rr ON rr.complaint_id=rc.id WHERE rc.artist_order_id=o.id AND COALESCE(rr.status,'under_review')<>'resolved_no_refund'))) AS held
 FROM affiliate_subscription_commissions c
 JOIN creators sponsor ON sponsor.id=c.referrer_id JOIN creators buyer ON buyer.id=c.referred_artist_id
 LEFT JOIN artist_subscriptions s ON s.id=c.subscription_id
 LEFT JOIN commerce_orders o ON o.subscription_id=s.id AND o.kind='artist_subscription'
 LEFT JOIN commerce_receipts r ON r.order_id=o.id
 LEFT JOIN payment_presentments p ON p.order_id=r.order_id
 LEFT JOIN payment_checkout_quotes q ON q.id=p.quote_id
 LEFT JOIN currency_rate_snapshots fx ON fx.id=q.rate_snapshot_id
 LEFT JOIN affiliate_team_sales ts ON ts.subscription_id=s.id
 LEFT JOIN payment_product_reversals rev ON rev.order_id=o.id
 WHERE c.tier=1 AND (c.referrer_id=$1 OR (ts.team_leader_id=$1 AND r.verified_at>=(SELECT cutover_at FROM partner_policy_settings WHERE id=1)))

 UNION ALL
 SELECT o.id,'premium','premium_'||o.plan,r.verified_at,r.verified_at,
 CASE WHEN pc.beneficiary_id=$1 THEN 'direct' ELSE 'team' END,
 pc.beneficiary_id,sponsor.display_name,NULL::bigint,'Premium Listener',r.mode,r.currency,r.amount_minor,pc.amount_minor,
 CASE WHEN rev.order_id IS NOT NULL THEN 'reversed' ELSE 'pending' END,
 p.charge_currency,p.charge_minor,p.quote_id,p.exchange_rate,p.conversion_at,
 COALESCE(r.currency='USD' AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND a.merchant_id=r.merchant_id AND a.provider=r.provider AND a.mode=r.mode
 AND (pc.beneficiary_id=$1 OR (qt.team_leader_id=$1 AND qt.direct_referrer_id=pc.beneficiary_id AND qt.team_leader_id<>pc.beneficiary_id)),FALSE),
 COALESCE(rev.amount_minor=r.amount_minor,FALSE),
 (COALESCE(rev.amount_minor<>r.amount_minor,TRUE) AND (rev.order_id IS NOT NULL OR EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=o.id)
 OR EXISTS(SELECT 1 FROM refund_complaints rc LEFT JOIN refund_complaint_reviews rr ON rr.complaint_id=rc.id WHERE rc.premium_order_id=o.id AND COALESCE(rr.status,'under_review')<>'resolved_no_refund')))
 FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id JOIN premium_commissions pc ON pc.order_id=o.id AND pc.level=1
 JOIN creators sponsor ON sponsor.id=pc.beneficiary_id LEFT JOIN premium_quarterly_team_sales qt ON qt.order_id=o.id
 LEFT JOIN premium_presentments p ON p.order_id=o.id LEFT JOIN premium_attempts a ON a.id=p.attempt_id LEFT JOIN premium_reversals rev ON rev.order_id=o.id
 WHERE pc.beneficiary_id=$1 OR qt.team_leader_id=$1
 UNION ALL
 SELECT o.id,'studio','studio_'||o.plan,r.verified_at,r.verified_at,
 CASE WHEN qt.direct_referrer_id=$1 THEN 'direct' ELSE 'team' END,
 qt.direct_referrer_id,sponsor.display_name,qt.buyer_id,buyer.display_name,p.mode,r.currency,r.amount_minor,0::bigint,'no_direct_commission',
 p.charge_currency,p.charge_minor,q.id,
 CASE WHEN q.charge_currency='USD' THEN '1' ELSE fx.rates->>q.charge_currency END,COALESCE(fx.as_of,q.created_at),
 COALESCE(o.status='paid' AND r.currency='USD' AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND p.payment_id=r.payment_id AND p.merchant_id=r.merchant_id AND p.provider=r.provider
 AND qt.buyer_id=o.artist_id AND qt.direct_referrer_id<>qt.buyer_id AND (qt.direct_referrer_id=$1 OR (qt.team_leader_id=$1 AND qt.team_leader_id<>qt.direct_referrer_id AND qt.team_leader_id<>qt.buyer_id)),FALSE),
 rev.order_id IS NOT NULL,
 (rev.order_id IS NULL AND (EXISTS(SELECT 1 FROM payment_refund_cases rc WHERE rc.order_id=o.id AND rc.status NOT IN ('declined','refunded'))
 OR EXISTS(SELECT 1 FROM refund_complaints rc LEFT JOIN refund_complaint_reviews rr ON rr.complaint_id=rc.id WHERE rc.artist_order_id=o.id AND COALESCE(rr.status,'under_review')<>'resolved_no_refund')))
 FROM studio_quarterly_team_sales qt JOIN commerce_orders o ON o.id=qt.order_id JOIN commerce_receipts r ON r.order_id=o.id
 JOIN creators sponsor ON sponsor.id=qt.direct_referrer_id JOIN creators buyer ON buyer.id=qt.buyer_id
 JOIN payment_presentments p ON p.order_id=o.id JOIN payment_checkout_quotes q ON q.id=p.quote_id LEFT JOIN currency_rate_snapshots fx ON fx.id=q.rate_snapshot_id
 LEFT JOIN payment_product_reversals rev ON rev.order_id=o.id WHERE qt.direct_referrer_id=$1 OR qt.team_leader_id=$1
), scoped AS (
 SELECT *,CASE WHEN evidence_valid AND reversed THEN gross_minor ELSE 0 END AS refund_minor,
 CASE WHEN evidence_valid AND NOT reversed AND NOT held THEN gross_minor ELSE 0 END AS eligible_minor,
 CASE WHEN evidence_valid AND NOT reversed AND held THEN gross_minor ELSE 0 END AS held_minor
 FROM attributed WHERE occurred_at>=$2::timestamptz AND occurred_at<$3::timestamptz AND mode=$4
)`;
function normal(row) {
  const output = { ...row };
  for (const key of [
    "gross_minor",
    "refund_minor",
    "eligible_minor",
    "held_minor",
    "commission_minor",
    "recorded_commission_minor",
    "eligible_sales",
    "sales",
    "unverified_sales",
  ])
    if (Object.hasOwn(output, key)) output[key] = minor(output[key]);
  return output;
}
const blank = () => ({
  sales: 0,
  eligible_sales: 0,
  unverified_sales: 0,
  gross_minor: 0,
  refund_minor: 0,
  held_minor: 0,
  eligible_minor: 0,
  recorded_commission_minor: 0,
});
function create({ pool, now = () => new Date() } = {}) {
  async function overview(owner, input = {}, tx = null) {
    if (!/^[1-9][0-9]{0,15}$/.test(String(owner)))
      throw fail(400, "Choose a valid partner account.");
    const f = filters(input, now()),
      args = [String(owner), f.period.start, f.period.end, f.mode];
    const db = tx || (await pool.connect());
    try {
      if (!tx)
        await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='10s'");
      const totals = await db.query(
        SOURCES +
          `SELECT relation,COUNT(*) AS sales,COUNT(*) FILTER(WHERE eligible_minor>0) AS eligible_sales,COUNT(*) FILTER(WHERE NOT evidence_valid) AS unverified_sales,
 COALESCE(SUM(gross_minor) FILTER(WHERE evidence_valid),0) AS gross_minor,COALESCE(SUM(refund_minor),0) AS refund_minor,COALESCE(SUM(held_minor),0) AS held_minor,COALESCE(SUM(eligible_minor),0) AS eligible_minor,
 COALESCE(SUM(commission_minor) FILTER(WHERE relation='direct' AND eligible_minor>0),0) AS recorded_commission_minor FROM scoped GROUP BY relation`,
        args,
      );
      const byReferrer = await db.query(
        SOURCES +
          `SELECT referrer_id,referrer_name,COUNT(*) AS sales,COUNT(*) FILTER(WHERE eligible_minor>0) AS eligible_sales,COALESCE(SUM(eligible_minor),0) AS eligible_minor,COALESCE(SUM(refund_minor),0) AS refund_minor,COALESCE(SUM(held_minor),0) AS held_minor FROM scoped WHERE relation='team' GROUP BY referrer_id,referrer_name ORDER BY eligible_minor DESC,referrer_id LIMIT 101`,
        args,
      );
      const activity = await db.query(
        SOURCES +
          `SELECT order_id,source,plan,verified_at,relation,referrer_name,buyer_name,currency,gross_minor,refund_minor,held_minor,eligible_minor,commission_minor,commission_status,charge_currency,charge_minor,quote_id,exchange_rate,conversion_at,evidence_valid,reversed,held FROM scoped ORDER BY occurred_at DESC,order_id DESC NULLS LAST LIMIT 101`,
        args,
      );
      const rollup = { direct: blank(), team: blank() };
      for (const r of totals.rows) {
        if (["direct", "team"].includes(r.relation))
          rollup[r.relation] = normal(r);
      }
      const statements = await db.query(
        "SELECT s.id,s.period,s.mode,s.basis_minor,s.bonus_minor,s.created_at,EXISTS(SELECT 1 FROM partner_bonus_review_holds h WHERE h.statement_id=s.id) AS review_hold FROM partner_bonus_statements s WHERE s.leader_id=$1 AND s.period=$2 AND s.mode=$3 ORDER BY s.created_at DESC",
        [owner, f.period.code, f.mode],
      );
      const result = {
        ...f,
        currency: "USD",
        statements: statements.rows,
        product_scope: "artist_packages_premium_and_studio",
        rollup,
        team_projection_minor: percentage(rollup.team.eligible_minor, 10),
        team_projection_percent: 10,
        projection_only: true,
        payouts_enabled: false,
        new_commission_policy_status:
          "approved_direct_rates_and_holiday_rollover",
        policy: partnerPolicy.disclosure,
        team_by_referrer: byReferrer.rows.slice(0, 100).map(normal),
        team_referrers_truncated: byReferrer.rows.length > 100,
        activity: activity.rows.slice(0, 100).map(normal),
        activity_truncated: activity.rows.length > 100,
        notice:
          "Verified artist-package, Premium Listener and studio-sale reconciliation. Test and historical records are separate from live sales. Refunded sales are excluded; disputed or unresolved sales are held. A 10% team projection is not an approved award, settled funds or withdrawable cash. Product-specific direct rates are preserved. New Premium contracts use a quarterly team obligation instead of the old immediate indirect commission; historical contracts are not paid again.",
      };
      if (!tx) await db.query("COMMIT");
      return result;
    } catch (error) {
      if (!tx) await db.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (!tx) db.release();
    }
  }
  async function history(owner, input = {}) {
    if (!/^[1-9][0-9]{0,15}$/.test(String(owner)))
      throw fail(400, "Choose a valid partner account.");
    const f = filters(input, now()),
      [year, q] = f.period.code.split("-Q").map(Number),
      index = year * 4 + q - 1 - 11;
    const first = partnerPolicy.period(
      Math.floor(index / 4) + "-Q" + ((index % 4) + 1),
    );
    const quarterSQL =
      "CASE WHEN EXTRACT(MONTH FROM occurred_at AT TIME ZONE 'UTC')=12 AND EXTRACT(DAY FROM occurred_at AT TIME ZONE 'UTC')>=21 THEN (EXTRACT(YEAR FROM occurred_at AT TIME ZONE 'UTC')::int+1)::text||'-Q1' ELSE EXTRACT(YEAR FROM occurred_at AT TIME ZONE 'UTC')::int::text||'-Q'||((EXTRACT(MONTH FROM occurred_at AT TIME ZONE 'UTC')::int-1)/3+1)::text END";
    const result = await pool.query(
      SOURCES +
        `SELECT ${quarterSQL} AS period,COUNT(*) FILTER(WHERE eligible_minor>0) AS qualifying_sales,COALESCE(SUM(eligible_minor),0) AS sales_cents,COALESCE(SUM(refund_minor),0) AS refunded_cents,COALESCE(SUM(held_minor),0) AS held_cents FROM scoped WHERE relation='team' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
      [String(owner), first.start, f.period.end, f.mode],
    );
    return {
      quarters: result.rows.map((r) => ({
        ...r,
        quarter_start: partnerPolicy.period(r.period).start.slice(0, 10),
        qualifying_sales: minor(r.qualifying_sales),
        sales_cents: minor(r.sales_cents),
        refunded_cents: minor(r.refunded_cents),
        held_cents: minor(r.held_cents),
        potential_reward_cents: percentage(minor(r.sales_cents), 10),
      })),
      mode: f.mode,
      team_reward_percent: 10,
      projection_only: true,
      notice: partnerPolicy.disclosure.notice,
    };
  }
  return { overview, history };
}
module.exports = { create, filters, period, SOURCES };
