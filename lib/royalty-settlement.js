"use strict";
const {
    fail,
    transaction,
    idempotent,
    audit,
    digest,
  } = require("./transactions"),
  { transfer, balance, earnedAccount } = require("./finance");
const books = require("./premium-books");
const { uuid } = require("./premium-utils"),
  { minor } = require("./premium-policy"),
  { fence } = require("./streaming-royalties");
// A server-owned verifier must independently retrieve cash settlement, not a charge success.
// No runtime verifier is configured. There is no environment switch or client-provided success flag.
function createRoyaltySettlement({ pool, verifier = null } = {}) {
  async function release(key, input) {
    if (
      !verifier ||
      verifier.verified !== true ||
      typeof verifier.verifyStatementFunding !== "function"
    )
      throw fail(
        503,
        "Independent live cash-settlement verification is not configured.",
      );
    if (!uuid(input?.statement_id))
      throw fail(400, "Choose a finalized statement.");
    const s = (
      await pool.query(
        "SELECT * FROM royalty_statements WHERE id=$1 AND mode='live'",
        [input.statement_id],
      )
    ).rows[0];
    if (!s)
      throw fail(
        409,
        "Only live finalized statements can receive verified cash funding.",
      );
    require("./settlement-policy").requireMature(s.month);
    const proofs = await verifier.verifyStatementFunding({
      statementId: s.id,
      orders: s.snapshot.lines
        .filter((l) => l.artist_pool_share_minor > 0)
        .map((l) => ({
          orderId: l.order_id,
          requiredMinor: l.artist_pool_share_minor,
        })),
    });
    if (!Array.isArray(proofs))
      throw fail(502, "Settlement verifier returned invalid evidence.");
    return transaction(pool, (db) =>
      idempotent(db, "royalty-cash-release", key, { id: s.id }, async () => {
        await fence(db, s.month, "live");
        await db.query(
          "SELECT id FROM royalty_statements WHERE id=$1 FOR UPDATE",
          [s.id],
        );
        const clock = (await db.query("SELECT clock_timestamp() AS now"))
          .rows[0].now;
        require("./settlement-policy").requireMature(s.month, clock);
        const old = (
          await db.query(
            "SELECT * FROM royalty_cash_releases WHERE statement_id=$1",
            [s.id],
          )
        ).rows[0];
        if (old) return { ...old, duplicate: true };
        if (
          (
            await db.query(
              "SELECT 1 FROM royalty_adjustments WHERE statement_id=$1",
              [s.id],
            )
          ).rowCount
        )
          throw fail(
            409,
            "Adjusted statements require reconciliation before cash release.",
          );
        if (
          (
            await db.query(
              "SELECT 1 FROM royalty_late_disputes WHERE statement_id=$1",
              [s.id],
            )
          ).rowCount
        )
          throw fail(
            409,
            "A late dispute requires documented reconciliation before release.",
          );
        const received = new Set();
        for (const line of [...s.snapshot.lines].sort((a, b) =>
          a.order_id.localeCompare(b.order_id),
        )) {
          if (!line.artist_pool_share_minor) continue;
          const r = (
            await db.query(
              "SELECT r.* FROM premium_receipts r WHERE r.order_id=$1 AND mode='live' AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=r.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=r.order_id) AND NOT EXISTS(SELECT 1 FROM refund_complaints c LEFT JOIN refund_complaint_reviews cr ON cr.complaint_id=c.id WHERE c.premium_order_id=r.order_id AND COALESCE(cr.status,'under_review')<>'resolved_no_refund')",
              [line.order_id],
            )
          ).rows[0];
          if (!r) throw fail(409, "A payment is reversed, held or missing.");
          const original = (
            await db.query(
              "SELECT charge_currency FROM premium_presentments WHERE order_id=$1",
              [r.order_id],
            )
          ).rows[0];
          if (original && original.charge_currency !== s.currency)
            throw fail(
              503,
              "Cross-currency cash settlement requires independently verified treasury conversion evidence; release remains unavailable for this source.",
            );
          const proof = proofs.find((p) => p.orderId === line.order_id);
          if (
            !proof ||
            received.has(proof.orderId) ||
            proof.provider !== r.provider ||
            proof.merchantId !== r.merchant_id ||
            proof.paymentId !== r.payment_id ||
            proof.currency !== s.currency ||
            typeof proof.settlementReference !== "string" ||
            !/^[A-Za-z0-9_.:-]{1,160}$/.test(proof.settlementReference) ||
            minor(proof.receivedMinor) < 1 ||
            proof.receivedMinor > Number(r.amount_minor)
          )
            throw fail(
              409,
              "Cash settlement must match the original payment and currency.",
            );
          received.add(proof.orderId);
          await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "royalty-funding:" + r.order_id,
          ]);
          const existing = (
              await db.query(
                "SELECT * FROM royalty_funding_sources WHERE order_id=$1",
                [r.order_id],
              )
            ).rows[0],
            hash = digest({
              orderId: r.order_id,
              provider: r.provider,
              merchantId: r.merchant_id,
              paymentId: r.payment_id,
              currency: s.currency,
              receivedMinor: proof.receivedMinor,
              settlementReference: proof.settlementReference,
            });
          if (existing) {
            if (existing.evidence_hash !== hash)
              throw fail(
                409,
                "Settlement evidence changed; reconcile the original source.",
              );
          } else {
            await db.query(
              "INSERT INTO royalty_funding_sources(order_id,provider,merchant_id,payment_id,settlement_reference,currency,received_minor,evidence_hash) VALUES($1,$2,$3,$4,$5,$8,$6,$7)",
              [
                r.order_id,
                r.provider,
                r.merchant_id,
                r.payment_id,
                proof.settlementReference,
                proof.receivedMinor,
                hash,
                s.currency,
              ],
            );
            await transfer(
              db,
              "royalty-cash-source:" + r.order_id,
              "independently_verified_premium_settlement",
              s.currency,
              proof.receivedMinor,
              "platform:verified_cash:live:" + s.currency,
              books.platform("receivable", "live", s.currency),
            );
          }
          const used = Number(
            (
              await db.query(
                "SELECT COALESCE(SUM(amount_minor),0) AS n FROM royalty_funding_consumptions WHERE order_id=$1",
                [r.order_id],
              )
            ).rows[0].n,
          );
          if (used + line.artist_pool_share_minor > proof.receivedMinor)
            throw fail(
              409,
              "Insufficient unallocated verified settlement for this royalty pool.",
            );
          await db.query(
            "INSERT INTO royalty_funding_consumptions(statement_id,order_id,amount_minor) VALUES($1,$2,$3)",
            [s.id, r.order_id, line.artist_pool_share_minor],
          );
        }
        const allocations = (
          await db.query(
            "SELECT artist_id,SUM(amount_minor)::bigint AS amount FROM royalty_allocations WHERE statement_id=$1 GROUP BY artist_id ORDER BY artist_id",
            [s.id],
          )
        ).rows;
        let total = 0;
        for (const a of allocations) {
          const amount = Number(a.amount),
            account =
              "artist:" + a.artist_id + ":royalty_unsettled:live:" + s.currency;
          await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [
            a.artist_id,
          ]);
          if (
            (
              await db.query(
                "SELECT 1 FROM royalty_recovery_holds h JOIN royalty_statements st ON st.id=h.statement_id WHERE h.artist_id=$1 AND h.resolution='recovery_required' AND st.mode='live' AND st.currency=$2 LIMIT 1",
                [a.artist_id, s.currency],
              )
            ).rowCount
          )
            throw fail(
              409,
              "Artist royalty recovery must be reconciled before releasing new earnings.",
            );
          if ((await balance(db, account)) < amount)
            throw fail(
              409,
              "Unsettled royalty balance requires reconciliation.",
            );
          if (amount)
            await transfer(
              db,
              "royalty-cash-release:" + s.id + ":" + a.artist_id,
              "funded_finalized_streaming_royalty",
              s.currency,
              amount,
              account,
              earnedAccount(a.artist_id, s.currency),
              a.artist_id,
            );
          total += amount;
        }
        if (
          total !==
          Number(s.artist_pool_minor) - Number(s.undistributed_minor)
        )
          throw fail(409, "Royalty allocation does not reconcile.");
        await db.query(
          "INSERT INTO royalty_cash_releases(statement_id,amount_minor) VALUES($1,$2)",
          [s.id, total],
        );
        await audit(
          db,
          { type: "admin", id: "session" },
          "royalty.cash_release",
          s.id,
          {
            currency: s.currency,
            amount_minor: total,
            bank_payout_sent: false,
          },
        );
        return { statement_id: s.id, amount_minor: total, duplicate: false };
      }),
    );
  }
  return { release, enabled: () => !!verifier && verifier.verified === true };
}
module.exports = { createRoyaltySettlement };
