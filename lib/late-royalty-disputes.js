"use strict";
const { transaction, idempotent, fail, audit } = require("./transactions");
const { uuid, evidence } = require("./premium-utils");
function createLateDisputes(pool) {
  async function report() {
    return (
      await pool.query(
        "SELECT c.*,s.month,COALESCE(r.revision,0) AS revision,COALESCE(r.route,'reconciliation') AS route,r.note,r.evidence_reference FROM royalty_late_disputes c JOIN royalty_statements s ON s.id=c.statement_id LEFT JOIN royalty_late_reviews r ON r.order_id=c.order_id AND r.statement_id=c.statement_id ORDER BY c.created_at DESC LIMIT 200",
      )
    ).rows;
  }
  async function review(key, input) {
    if (
      !uuid(input?.order_id) ||
      !uuid(input.statement_id) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0 ||
      ![
        "reconciliation",
        "reserve_review",
        "legal_review",
        "fraud_review",
      ].includes(input.route)
    )
      throw fail(
        400,
        "Choose the late dispute, current revision and review route.",
      );
    const note = evidence(input.note),
      reference = evidence(input.evidence_reference),
      actor =
        require("./request-context").get()?.adminId || "legacy-shared-key";
    return transaction(pool, (db) =>
      idempotent(db, "late-royalty-review", key, input, async () => {
        const row = (
          await db.query(
            "SELECT * FROM royalty_late_disputes WHERE order_id=$1 AND statement_id=$2 FOR UPDATE",
            [input.order_id, input.statement_id],
          )
        ).rows[0];
        if (!row) throw fail(404, "Late dispute not found.");
        const old = (
          await db.query(
            "SELECT revision FROM royalty_late_reviews WHERE order_id=$1 AND statement_id=$2",
            [input.order_id, input.statement_id],
          )
        ).rows[0];
        if ((old?.revision || 0) !== input.revision)
          throw fail(
            409,
            "Another operator reviewed this dispute. Refresh before editing.",
          );
        const revision = input.revision + 1;
        await db.query(
          "INSERT INTO royalty_late_reviews(order_id,statement_id,revision,route,actor_id,note,evidence_reference) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(order_id,statement_id) DO UPDATE SET revision=EXCLUDED.revision,route=EXCLUDED.route,actor_id=EXCLUDED.actor_id,note=EXCLUDED.note,evidence_reference=EXCLUDED.evidence_reference,updated_at=NOW()",
          [
            row.order_id,
            row.statement_id,
            revision,
            input.route,
            actor,
            note,
            reference,
          ],
        );
        await db.query(
          "INSERT INTO royalty_late_events(order_id,statement_id,revision,route,actor_id,note,evidence_reference) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            row.order_id,
            row.statement_id,
            revision,
            input.route,
            actor,
            note,
            reference,
          ],
        );
        await audit(
          db,
          { type: "admin", id: actor },
          "royalty.late_review",
          row.statement_id,
          {
            order_id: row.order_id,
            revision,
            route: input.route,
            financial_resolution: false,
          },
        );
        return { revision, route: input.route, financial_resolution: false };
      }),
    );
  }
  return { report, review };
}
module.exports = { createLateDisputes };
