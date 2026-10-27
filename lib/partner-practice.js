"use strict";
const crypto = require("node:crypto"),
  PLANS = require("./plans"),
  { fail, transaction } = require("./transactions");
const disclosure =
  "DEMONSTRATION ONLY. No payment was received. These examples never create real commissions, subscriptions, studio credits or withdrawable money.";
function quote(plan) {
  if (!Object.hasOwn(PLANS, plan))
    throw fail(400, "Choose a supported artist product");
  const product = PLANS[plan],
    base_minor = Math.round(product.usd * 100);
  return {
    plan,
    base_minor,
    percent: product.directReferralPercent,
    commission_minor: Math.round(
      (base_minor * product.directReferralPercent) / 100,
    ),
    currency: "USD",
    demo: true,
  };
}
function create(pool) {
  async function list(owner) {
    const rows = await pool.query(
      "SELECT id,reference,plan,base_minor,commission_minor,currency,created_at FROM partner_practice_sales WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
      [owner],
    );
    return {
      demo: true,
      disclosure,
      sales: rows.rows,
      products: Object.keys(PLANS).map(quote),
    };
  }
  async function record(owner, data) {
    const value = quote(String(data?.plan || "")),
      reference = String(data?.reference || "").trim();
    if (!/^[A-Za-z0-9_-]{10,80}$/.test(reference))
      throw fail(
        400,
        "Use a demo reference of 10–80 letters, digits, underscores or hyphens",
      );
    if (data.confirm_demo !== true)
      throw fail(400, "Confirm this is a demonstration with no real payment");
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [owner]);
      const old = await db.query(
        "SELECT * FROM partner_practice_sales WHERE owner_id=$1 AND reference=$2",
        [owner, reference],
      );
      if (old.rowCount) {
        if (old.rows[0].plan !== value.plan)
          throw fail(
            409,
            "This demo reference already belongs to a different product",
          );
        return { demo: true, replayed: true, disclosure, sale: old.rows[0] };
      }
      const count = await db.query(
        "SELECT COUNT(*)::int AS n FROM partner_practice_sales WHERE owner_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",
        [owner],
      );
      if (count.rows[0].n >= 20)
        throw fail(
          429,
          "Twenty practice transactions per day are available for this account",
        );
      const row = await db.query(
        "INSERT INTO partner_practice_sales(id,owner_id,reference,plan,base_minor,commission_minor) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          crypto.randomUUID(),
          owner,
          reference,
          value.plan,
          value.base_minor,
          value.commission_minor,
        ],
      );
      return { demo: true, replayed: false, disclosure, sale: row.rows[0] };
    });
  }
  return { list, record };
}
module.exports = { create, quote, disclosure };
