"use strict";
const { REVISION } = require("./partner-policy");
// Called inside the same transaction as an independently verified receipt.
// These records are pending obligations/performance, never available cash.
async function snapshotOrderReferral(db, order) {
  const buyer = (
    await db.query("SELECT id,email,referred_by FROM creators WHERE id=$1", [
      order.artist_id,
    ])
  ).rows[0];
  if (!buyer) return;
  let ref = buyer.referred_by;
  if (order.referral_intent_id)
    ref = (
      await db.query(
        "SELECT referrer_id FROM affiliate_product_intents WHERE id=$1",
        [order.referral_intent_id],
      )
    ).rows[0]?.referrer_id;
  const direct = ref
    ? (
        await db.query(
          "SELECT id,email,referred_by FROM creators WHERE id=$1",
          [ref],
        )
      ).rows[0]
    : null;
  const valid =
    direct &&
    String(direct.id) !== String(buyer.id) &&
    direct.email.toLowerCase() !== buyer.email.toLowerCase();
  const leader =
    valid && direct.referred_by
      ? (
          await db.query("SELECT id,email FROM creators WHERE id=$1", [
            direct.referred_by,
          ])
        ).rows[0]
      : null;
  const team =
    leader &&
    String(leader.id) !== String(direct.id) &&
    String(leader.id) !== String(buyer.id) &&
    leader.email.toLowerCase() !== buyer.email.toLowerCase()
      ? leader.id
      : null;
  await db.query(
    "INSERT INTO commerce_order_referral_snapshots(order_id,direct_referrer_id,team_leader_id,policy_revision) VALUES($1,$2,$3,$4)",
    [order.id, valid ? direct.id : null, valid ? team : null, REVISION],
  );
}
async function recordPremiumTeam(db, order) {
  if (
    order.affiliate_policy_revision !== REVISION ||
    !order.referrer_id ||
    !order.indirect_id
  )
    return;
  const posted = await db.query(
    `INSERT INTO premium_quarterly_team_sales(order_id,direct_referrer_id,team_leader_id,usd_minor,reserved_minor,policy_revision,verified_at)
 SELECT r.order_id,$2,$3,r.amount_minor,(r.amount_minor+19)/20,$4,r.verified_at FROM premium_receipts r JOIN premium_presentments p ON p.order_id=r.order_id JOIN premium_attempts a ON a.id=p.attempt_id
 WHERE r.order_id=$1 AND r.currency='USD' AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND a.merchant_id=r.merchant_id AND a.provider=r.provider AND a.mode=r.mode
 ON CONFLICT(order_id) DO NOTHING RETURNING order_id,reserved_minor`,
    [order.id, order.referrer_id, order.indirect_id, REVISION],
  );
  if (posted.rowCount) {
    const r = (
      await db.query("SELECT mode FROM premium_receipts WHERE order_id=$1", [
        order.id,
      ])
    ).rows[0];
    await require("./finance").transfer(
      db,
      "premium:" + order.id + ":quarter-team-reserve",
      "quarterly_team_commission_reserve",
      "USD",
      Number(posted.rows[0].reserved_minor),
      require("./premium-books").platform(
        "commission_deferred_cost",
        r.mode,
        "USD",
      ),
      "artist:" + order.indirect_id + ":quarter_pending:" + r.mode + ":USD",
      order.indirect_id,
    );
  }
}
async function recordStudioTeam(db, order) {
  if (order.kind !== "studio_generation") return;
  await db.query(
    `INSERT INTO studio_quarterly_team_sales(order_id,buyer_id,direct_referrer_id,team_leader_id,usd_minor,policy_revision,verified_at)
 SELECT r.order_id,o.artist_id,s.direct_referrer_id,s.team_leader_id,r.amount_minor,$2,r.verified_at
 FROM commerce_receipts r JOIN commerce_orders o ON o.id=r.order_id JOIN payment_presentments p ON p.order_id=r.order_id
 JOIN commerce_order_referral_snapshots s ON s.order_id=o.id
 WHERE o.id=$1 AND o.kind='studio_generation' AND s.direct_referrer_id IS NOT NULL
 AND s.direct_referrer_id<>o.artist_id AND (s.team_leader_id IS NULL OR (s.team_leader_id<>s.direct_referrer_id AND s.team_leader_id<>o.artist_id))
 AND r.currency='USD' AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND p.payment_id=r.payment_id AND p.merchant_id=r.merchant_id AND p.provider=r.provider
 ON CONFLICT(order_id) DO NOTHING`,
    [order.id, REVISION],
  );
}
async function reversePremiumTeam(db, receipt) {
  const sale = (
    await db.query(
      "SELECT team_leader_id,reserved_minor FROM premium_quarterly_team_sales WHERE order_id=$1",
      [receipt.order_id],
    )
  ).rows[0];
  if (!sale) return;
  const allocation = (
    await db.query(
      "SELECT statement_id FROM partner_bonus_allocations WHERE order_id=$1",
      [receipt.order_id],
    )
  ).rows[0];
  if (allocation) {
    await markRefundHold(db, receipt.order_id);
    return;
  }
  await require("./finance").transfer(
    db,
    "premium-refund:" + receipt.order_id + ":quarter-team-reserve",
    "quarterly_team_reserve_reversal",
    "USD",
    Number(sale.reserved_minor),
    "artist:" +
      sale.team_leader_id +
      ":quarter_pending:" +
      receipt.mode +
      ":USD",
    require("./premium-books").platform(
      "commission_deferred_cost",
      receipt.mode,
      "USD",
    ),
    sale.team_leader_id,
  );
}
async function markRefundHold(db, orderId) {
  await db.query(
    "INSERT INTO partner_bonus_review_holds(statement_id,order_id,reason) SELECT statement_id,order_id,'Verified refund after quarterly finalization; review reserve, source and lawful adjustment before any release.' FROM partner_bonus_allocations WHERE order_id=$1 ON CONFLICT DO NOTHING",
    [orderId],
  );
}
module.exports = {
  snapshotOrderReferral,
  recordPremiumTeam,
  recordStudioTeam,
  reversePremiumTeam,
  markRefundHold,
};
