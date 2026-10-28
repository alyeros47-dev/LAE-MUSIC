"use strict";
const crypto = require("node:crypto"),
  { fail, transaction, audit, digest } = require("./transactions"),
  { minor, percentage, allocate } = require("./premium-policy");
const policy = require("./partner-policy"),
  accounting = require("./partner-accounting"),
  { transfer } = require("./finance"),
  books = require("./premium-books");
function operator(principal) {
  if (!principal || !["owner", "finance"].includes(principal.role))
    throw fail(403, "A financial operator is required.");
  if (principal.source === "shared_key") return "legacy-shared-key";
  if (principal.source === "named" && /^[a-f0-9-]{36}$/.test(principal.id))
    return "operator:" + principal.id;
  throw fail(403, "A verified financial operator session is required.");
}
function create({ pool, now = () => new Date() } = {}) {
  const reports = accounting.create({ pool, now });
  async function snapshot(db, owner, input) {
    const filter = accounting.filters(input, now());
    if (!/^[1-9][0-9]{0,15}$/.test(String(owner)))
      throw fail(400, "Choose a partner.");
    const rows = (
      await db.query(
        accounting.SOURCES +
          `SELECT order_id,source,buyer_id,referrer_id,mode,evidence_valid,reversed,held,gross_minor,refund_minor,eligible_minor,held_minor FROM scoped WHERE relation='team' ORDER BY order_id LIMIT 5001`,
        [String(owner), filter.period.start, filter.period.end, filter.mode],
      )
    ).rows;
    if (rows.length > 5000)
      throw fail(
        409,
        "This period requires a larger reviewed statement export; no partial statement can be finalized.",
      );
    const lines = rows.map((r) => ({
      order_id: r.order_id,
      source: r.source,
      buyer_id: r.buyer_id,
      referrer_id: r.referrer_id,
      mode: r.mode,
      evidence_valid: r.evidence_valid,
      reversed: r.reversed,
      held: r.held,
      gross_minor: minor(r.gross_minor),
      refund_minor: minor(r.refund_minor),
      eligible_minor: minor(r.eligible_minor),
      held_minor: minor(r.held_minor),
    }));
    const basis = {
      leader_id: String(owner),
      period: filter.period.code,
      mode: filter.mode,
      policy_revision: policy.REVISION,
      lines,
    };
    const amount = lines.reduce((n, x) => n + x.eligible_minor, 0);
    minor(amount);
    return {
      ...filter,
      basis,
      snapshot_hash: digest(basis),
      basis_minor: amount,
      bonus_minor: percentage(amount, 10),
      issues: lines
        .filter((l) => l.held || !l.evidence_valid)
        .map((l) => l.order_id),
    };
  }
  async function preview(owner, input) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const value = await snapshot(db, owner, input),
        report = await reports.overview(owner, input, db);
      await db.query("COMMIT");
      return {
        ...report,
        statement_snapshot_hash: value.snapshot_hash,
        statement_issues: value.issues,
        can_finalize:
          value.period.ended &&
          !value.issues.length &&
          value.bonus_minor > 0 &&
          value.mode !== "legacy" &&
          report.statements.length === 0,
        cash_release_enabled: false,
      };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async function finalize(principal, input) {
    const actor = operator(principal),
      owner = input?.artist_id,
      note = String(input?.note || "").trim();
    if (note.length < 10 || note.length > 1000)
      throw fail(400, "Record a financial review note of 10–1,000 characters.");
    const f = accounting.filters(input, now());
    if (!f.period.ended)
      throw fail(
        409,
        "The complete bonus period has not closed. December 21–31 belongs to the following January–March period.",
      );
    if (f.mode === "legacy")
      throw fail(
        409,
        "Unverified historical records cannot create a new bonus.",
      );
    return transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "partner-statement:" + owner + ":" + f.period.code + ":" + f.mode,
      ]);
      let x = await snapshot(db, owner, input);
      // Refund/chargeback handlers lock the original buyer. Hold those same actors
      // while rechecking the complete source snapshot and recording the statement.
      const ids = x.basis.lines.map((l) => l.order_id).filter(Boolean);
      const actors = (
        await db.query(
          "SELECT artist_id AS id FROM commerce_orders WHERE id=ANY($1::uuid[]) UNION SELECT $2::bigint",
          [ids, String(owner)],
        )
      ).rows.map((r) => r.id);
      await db.query(
        "SELECT id FROM creators WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE",
        [actors],
      );
      await db.query(
        "SELECT id FROM listeners WHERE id IN (SELECT listener_id FROM premium_orders WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE",
        [ids],
      );
      x = await snapshot(db, owner, input);
      if (x.snapshot_hash !== input.snapshot_hash)
        throw fail(
          409,
          "The sales/refund snapshot changed. Review a fresh preview before finalizing.",
        );
      if (x.issues.length)
        throw fail(409, "Refund, dispute or receipt issues remain unresolved.");
      if (x.bonus_minor < 1)
        throw fail(409, "There is no payable minor-unit bonus in this period.");
      const old = (
        await db.query(
          "SELECT * FROM partner_bonus_statements WHERE leader_id=$1 AND period=$2 AND mode=$3",
          [owner, f.period.code, f.mode],
        )
      ).rows[0];
      if (old) {
        if (old.snapshot_hash !== x.snapshot_hash)
          throw fail(
            409,
            "This immutable statement needs a documented correction; it cannot be overwritten.",
          );
        return {
          statement: old,
          replayed: true,
          available_for_withdrawal: false,
          funds_sent: false,
        };
      }
      const id = crypto.randomUUID(),
        statement = (
          await db.query(
            "INSERT INTO partner_bonus_statements(id,leader_id,period,mode,currency,basis_minor,bonus_minor,snapshot_hash,snapshot,review_note,actor_id,policy_revision) VALUES($1,$2,$3,$4,'USD',$5,$6,$7,$8,$9,$10,$11) RETURNING *",
            [
              id,
              owner,
              f.period.code,
              f.mode,
              x.basis_minor,
              x.bonus_minor,
              x.snapshot_hash,
              JSON.stringify(x.basis),
              note,
              actor,
              policy.REVISION,
            ],
          )
        ).rows[0];
      const shares = allocate(
        x.bonus_minor,
        x.basis.lines
          .filter((l) => l.eligible_minor > 0)
          .map((l) => ({ id: l.order_id, weight: l.eligible_minor })),
      );
      for (const share of shares) {
        const line = x.basis.lines.find((l) => l.order_id === share.id);
        let reserved = 0;
        if (line.source === "premium")
          reserved = Number(
            (
              await db.query(
                "SELECT reserved_minor FROM premium_quarterly_team_sales WHERE order_id=$1",
                [share.id],
              )
            ).rows[0]?.reserved_minor || 0,
          );
        if (line.source === "premium" && reserved < share.amount_minor)
          throw fail(
            409,
            "The quarterly Premium reserve needs reconciliation.",
          );
        await db.query(
          "INSERT INTO partner_bonus_allocations(statement_id,order_id,source,basis_minor,bonus_minor,reserved_minor) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            share.id,
            line.source,
            line.eligible_minor,
            share.amount_minor,
            reserved,
          ],
        );
        const pending =
            "artist:" + owner + ":quarter_pending:" + f.mode + ":USD",
          unsettled =
            "artist:" + owner + ":quarter_unsettled:" + f.mode + ":USD";
        if (reserved > share.amount_minor)
          await transfer(
            db,
            "quarter:" + id + ":rounding:" + share.id,
            "quarterly_rounding_reserve_return",
            "USD",
            reserved - share.amount_minor,
            pending,
            books.platform("commission_deferred_cost", f.mode, "USD"),
            owner,
          );
        if (share.amount_minor)
          await transfer(
            db,
            "quarter:" + id + ":award:" + share.id,
            "quarterly_bonus_finalized_unsettled",
            "USD",
            share.amount_minor,
            line.source === "premium"
              ? pending
              : "platform:quarter_bonus_expense:" + f.mode + ":USD",
            unsettled,
            owner,
          );
      }
      await audit(
        db,
        { type: "admin", id: actor },
        "partner.quarter_finalize",
        id,
        {
          leader_id: String(owner),
          period: f.period.code,
          mode: f.mode,
          bonus_minor: x.bonus_minor,
          funds_sent: false,
        },
      );
      return {
        statement,
        replayed: false,
        available_for_withdrawal: false,
        funds_sent: false,
      };
    });
  }
  async function releaseCash() {
    throw fail(
      503,
      "Independent settled-funds verification and a payout integration are not configured. Finalized quarterly calculations are not withdrawable cash.",
    );
  }
  return { preview, finalize, releaseCash };
}
module.exports = { create, operator };
