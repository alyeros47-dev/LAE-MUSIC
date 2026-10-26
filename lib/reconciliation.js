"use strict";
const crypto = require("node:crypto");
const { uuid } = require("./premium-utils");
const { fail, transaction, idempotent, audit } = require("./transactions");
const KINDS = [
  "artist_checkout",
  "listener_checkout",
  "artist_refund",
  "listener_hold",
  "commission",
  "royalty_recovery",
  "withdrawal",
];
const MODES = ["all", "test", "live", "legacy", "ledger"];
// Every amount keeps its own book and original charge currency. Legacy evidence is never labeled live cash.
const SOURCES = `
SELECT 'artist_checkout'::text AS kind,a.id::text AS source_id,a.status,a.provider,a.mode,q.base_currency AS currency,q.base_minor::text AS amount_minor,q.charge_currency,q.charge_minor::text AS charge_minor,a.reference,a.created_at AS issue_at,
 a.status='review' OR a.status='initializing' AND a.created_at<NOW()-INTERVAL '15 minutes' AS attention,
 COALESCE(a.failure_code,'Provider acceptance needs independent verification')::text AS reason,'/admin/console?section=checkouts'::text AS destination
 FROM payment_checkout_attempts a JOIN payment_checkout_quotes q ON q.id=a.quote_id
UNION ALL
SELECT 'listener_checkout',a.id::text,a.status,a.provider,a.mode,o.currency,o.amount_minor::text,COALESCE(q.charge_currency,o.currency),COALESCE(q.charge_minor,o.amount_minor)::text,a.reference,a.created_at,
 a.status='review' OR a.benefit_hold OR a.status='initializing' AND a.created_at<NOW()-INTERVAL '15 minutes',
 'Premium checkout or benefit hold needs independent verification','/admin/console?section=royalties'
 FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id LEFT JOIN payment_checkout_quotes q ON q.id=a.quote_id
UNION ALL
SELECT 'artist_refund',c.order_id::text,c.status,p.provider,p.mode,p.base_currency,p.base_minor::text,p.charge_currency,p.charge_minor::text,p.reference,c.created_at,
 c.status NOT IN ('declined','refunded'),'Refund review; a hold is not proof of a completed refund','/admin/console?section=refunds'
 FROM payment_refund_cases c JOIN payment_presentments p ON p.order_id=c.order_id
UNION ALL
SELECT 'listener_hold',v.order_id::text,'review',r.provider,r.mode,r.currency,r.amount_minor::text,p.charge_currency,p.charge_minor::text,v.order_id::text,v.created_at,
 NOT EXISTS(SELECT 1 FROM premium_reversals x WHERE x.order_id=v.order_id),'Premium payment review; benefits remain held','/admin/console?section=royalties'
 FROM premium_payment_reviews v JOIN premium_receipts r ON r.order_id=v.order_id LEFT JOIN premium_presentments p ON p.order_id=v.order_id
UNION ALL
SELECT 'commission',c.id::text,c.status,COALESCE(p.provider,'historical'),COALESCE(p.mode,'legacy'),'USD',c.amount_cents::text,p.charge_currency,p.charge_minor::text,c.subscription_id::text,c.created_at,
 c.status='reconciliation_required','A reversed product commission needs source-of-funds reconciliation','/admin/console?section=affiliates'
 FROM affiliate_subscription_commissions c LEFT JOIN commerce_orders o ON o.subscription_id=c.subscription_id LEFT JOIN payment_presentments p ON p.order_id=o.id
UNION ALL
SELECT 'royalty_recovery',h.id::text,h.resolution,'royalty_book',s.mode,s.currency,h.amount_minor::text,NULL,NULL,h.statement_id::text,h.created_at,
 h.resolution='recovery_required','Finalized royalty recovery remains unresolved','/admin/console?section=royalties'
 FROM royalty_recovery_holds h JOIN royalty_statements s ON s.id=h.statement_id
UNION ALL
SELECT 'withdrawal',w.id::text,w.status,'unconfigured','ledger',w.currency,w.gross_minor::text,NULL,NULL,w.request_key,w.created_at,
 w.status IN ('pending','approved'),'A review approval is not a bank payout','/admin/console?section=withdrawals'
 FROM finance_withdrawals w`;
function filters(input = {}) {
  const currency = input.currency || "USD",
    mode = input.mode || "all",
    kind = input.kind || "all",
    search = input.search || "";
  if (
    !["USD", "NGN"].includes(currency) ||
    !MODES.includes(mode) ||
    (kind !== "all" && !KINDS.includes(kind)) ||
    typeof search !== "string" ||
    search.length > 100
  )
    throw fail(
      400,
      "Choose a supported accounting currency, record type and source.",
    );
  let cursor = null;
  if (input.cursor) {
    try {
      const value = Buffer.from(input.cursor, "base64url").toString();
      cursor = JSON.parse(value);
      if (
        !Array.isArray(cursor) ||
        cursor.length !== 3 ||
        typeof cursor[0] !== "string" ||
        !Number.isFinite(Date.parse(cursor[0])) ||
        !KINDS.includes(cursor[1]) ||
        !validId(cursor[2])
      )
        throw Error();
    } catch {
      throw fail(400, "This review page reference is invalid.");
    }
  }
  return { currency, mode, kind, search: search.trim(), cursor };
}
function validId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}
function resource(kind, id) {
  if (!KINDS.includes(kind) || !validId(id))
    throw fail(400, "Choose a valid reconciliation source.");
}
function actorId(principal) {
  if (!principal || !["owner", "finance"].includes(principal.role))
    throw fail(403, "Financial operator access is required.");
  if (principal.source === "named" && /^[a-f0-9-]{36}$/.test(principal.id))
    return "operator:" + principal.id;
  if (principal.source === "shared_key") return "legacy-shared-key";
  throw fail(403, "Sign in with a verified administrator session.");
}
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
function ledgerCSV(rows) {
  const columns = [
    "id",
    "reference",
    "kind",
    "currency",
    "amount_minor",
    "debit_account",
    "credit_account",
    "created_at",
  ];
  return (
    [
      columns.map(csvCell).join(","),
      ...rows.map((r) =>
        columns
          .map((k) => csvCell(r[k] instanceof Date ? r[k].toISOString() : r[k]))
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
function createReconciliation({ pool, verifyArtist, verifyListener } = {}) {
  async function snapshot(fn) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='10s'");
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async function source(db, kind, id) {
    return (
      (
        await db.query(
          `SELECT * FROM (${SOURCES}) s WHERE kind=$1 AND source_id=$2`,
          [kind, id],
        )
      ).rows[0] || null
    );
  }
  async function overview(input) {
    const f = filters(input);
    return snapshot(async (db) => {
      const totals = await db.query(
        `WITH receipts AS (
   SELECT 'artist'::text AS product,COALESCE(p.mode,'legacy') AS mode,r.currency,r.amount_minor,r.verified_at FROM commerce_receipts r LEFT JOIN payment_presentments p ON p.order_id=r.order_id
   UNION ALL SELECT 'listener',mode,currency,amount_minor,verified_at FROM premium_receipts
  ) SELECT product,mode,currency,COUNT(*)::text AS count,SUM(amount_minor)::text AS gross_minor FROM receipts WHERE currency=$1 AND ($2='all' OR mode=$2) GROUP BY product,mode,currency ORDER BY product,mode`,
        [f.currency, f.mode],
      );
      const trend = await db.query(
        `WITH receipts AS (SELECT COALESCE(p.mode,'legacy') AS mode,r.currency,r.amount_minor,r.verified_at FROM commerce_receipts r LEFT JOIN payment_presentments p ON p.order_id=r.order_id UNION ALL SELECT mode,currency,amount_minor,verified_at FROM premium_receipts) SELECT (verified_at AT TIME ZONE 'UTC')::date::text AS day,mode,SUM(amount_minor)::text AS gross_minor FROM receipts WHERE currency=$1 AND ($2='all' OR mode=$2) AND verified_at>=NOW()-INTERVAL '30 days' GROUP BY 1,2 ORDER BY 1,2`,
        [f.currency, f.mode],
      );
      const groups = await db.query(
        `SELECT kind,mode,currency,COUNT(*)::text AS count,SUM(amount_minor::numeric)::text AS amount_minor FROM (${SOURCES}) s WHERE attention AND currency=$1 AND ($2='all' OR mode=$2) GROUP BY kind,mode,currency ORDER BY kind,mode`,
        [f.currency, f.mode],
      );
      const balances = await db.query(
        `WITH m AS (SELECT credit_account AS account,currency,amount_minor AS delta FROM finance_transfers UNION ALL SELECT debit_account,currency,-amount_minor FROM finance_transfers) SELECT account,currency,SUM(delta)::text AS balance_minor FROM m WHERE currency=$1 GROUP BY account,currency HAVING SUM(delta)<>0 ORDER BY account LIMIT 101`,
        [f.currency],
      );
      const reviews = await db.query(
        "SELECT id,source_kind,source_id,status,assigned_actor,revision,updated_at FROM reconciliation_cases WHERE source_snapshot->>'currency'=$1 AND ($2='all' OR source_snapshot->>'mode'=$2) ORDER BY updated_at DESC LIMIT 25",
        [f.currency, f.mode],
      );
      const royalties = await db.query(
        "SELECT s.mode,s.currency,COUNT(*)::text AS statements,SUM(s.artist_pool_minor-s.undistributed_minor)::text AS allocated_minor,SUM(COALESCE(c.amount_minor,0))::text AS released_ledger_minor FROM royalty_statements s LEFT JOIN royalty_cash_releases c ON c.statement_id=s.id WHERE s.currency=$1 AND ($2='all' OR s.mode=$2) GROUP BY s.mode,s.currency ORDER BY s.mode",
        [f.currency, f.mode],
      );
      return {
        royalties: royalties.rows,
        recent_reviews: reviews.rows,
        currency: f.currency,
        mode: f.mode,
        as_of: new Date().toISOString(),
        totals: totals.rows,
        trend: trend.rows,
        attention: groups.rows,
        ledger_accounts: balances.rows.slice(0, 100),
        ledger_accounts_truncated: balances.rows.length > 100,
        live_payments_enabled: false,
        payouts_enabled: false,
        notice:
          "Recorded gross receipts are not settled cash or net revenue. Test, legacy and ledger records remain distinct. Ledger balances cannot be classified by provider mode; they are shown separately and must not be added to receipt totals.",
      };
    });
  }
  async function queue(input) {
    const f = filters(input);
    return snapshot(async (db) => {
      const result = await db.query(
        `SELECT s.*,c.id AS case_id,c.revision,c.status AS review_status,c.assigned_actor,c.updated_at AS reviewed_at FROM (${SOURCES}) s LEFT JOIN reconciliation_cases c ON c.source_kind=s.kind AND c.source_id=s.source_id WHERE s.attention AND s.currency=$1 AND ($2='all' OR s.mode=$2) AND ($3='all' OR s.kind=$3) AND ($4='' OR s.reference ILIKE $4 ESCAPE '!' OR s.source_id ILIKE $4 ESCAPE '!') AND ($5::timestamptz IS NULL OR (s.issue_at,s.kind,s.source_id)<($5::timestamptz,$6::text,$7::text)) ORDER BY s.issue_at DESC,s.kind DESC,s.source_id DESC LIMIT 26`,
        [
          f.currency,
          f.mode,
          f.kind,
          f.search
            ? "%" +
              f.search
                .replaceAll("!", "!!")
                .replaceAll("%", "!%")
                .replaceAll("_", "!_") +
              "%"
            : "",
          ...(f.cursor || [null, null, null]),
        ],
      );
      const rows = result.rows.slice(0, 25),
        last = rows.at(-1);
      return {
        currency: f.currency,
        mode: f.mode,
        rows,
        next_cursor:
          result.rows.length > 25
            ? Buffer.from(
                JSON.stringify([
                  new Date(last.issue_at).toISOString(),
                  last.kind,
                  last.source_id,
                ]),
              ).toString("base64url")
            : null,
      };
    });
  }
  async function detail(kind, id) {
    resource(kind, id);
    return snapshot(async (db) => {
      const current = await source(db, kind, id),
        review =
          (
            await db.query(
              "SELECT * FROM reconciliation_cases WHERE source_kind=$1 AND source_id=$2",
              [kind, id],
            )
          ).rows[0] || null;
      if (!current && !review)
        throw fail(404, "Reconciliation source not found.");
      const history = review
        ? (
            await db.query(
              "SELECT revision,action,status,assigned_actor,actor,note,created_at FROM reconciliation_events WHERE case_id=$1 ORDER BY revision DESC LIMIT 100",
              [review.id],
            )
          ).rows
        : [];
      return {
        source: current,
        review,
        history,
        attention: current?.attention === true,
        history_truncated: review?.revision > 100,
      };
    });
  }
  async function review(principal, key, input) {
    const actor = actorId(principal),
      kind = input?.kind,
      id = input?.source_id,
      action = input?.action,
      note = typeof input?.note === "string" ? input.note.trim() : "";
    resource(kind, id);
    if (
      !["claim", "note", "wait", "resolve"].includes(action) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0 ||
      note.length < 10 ||
      note.length > 1000
    )
      throw fail(
        400,
        "Provide a valid review revision, action and a note of 10–1,000 characters.",
      );
    return transaction(pool, (db) =>
      idempotent(
        db,
        "reconciliation:" + actor,
        key,
        { kind, id, action, note, revision: input.revision },
        async () => {
          await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "reconciliation:" + kind + ":" + id,
          ]);
          let c = (
              await db.query(
                "SELECT * FROM reconciliation_cases WHERE source_kind=$1 AND source_id=$2 FOR UPDATE",
                [kind, id],
              )
            ).rows[0],
            current = await source(db, kind, id);
          if (!current && !c)
            throw fail(404, "Reconciliation source not found.");
          if (Number(c?.revision || 0) !== input.revision)
            throw fail(
              409,
              "This review changed. Refresh before recording your decision.",
            );
          if (action === "resolve" && current?.attention)
            throw fail(
              409,
              "The underlying source still needs attention. Verify it through its existing workflow before resolving this review.",
            );
          if (!c && (!current?.attention || action !== "claim"))
            throw fail(
              409,
              "Claim an active source before adding review notes.",
            );
          if (
            c?.status === "resolved" &&
            !current?.attention &&
            action !== "note"
          )
            throw fail(
              409,
              "This review is already resolved. Its history is preserved.",
            );
          if (
            c?.status === "resolved" &&
            current?.attention &&
            action !== "claim"
          )
            throw fail(
              409,
              "This source needs attention again. Claim it for a new review.",
            );
          const status =
              action === "resolve"
                ? "resolved"
                : action === "wait"
                  ? "waiting_external"
                  : action === "claim"
                    ? "in_review"
                    : c.status,
            assigned = action === "claim" ? actor : c.assigned_actor,
            revision = input.revision + 1;
          if (!c) {
            c = (
              await db.query(
                "INSERT INTO reconciliation_cases(id,source_kind,source_id,source_snapshot,status,assigned_actor,revision) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
                [
                  crypto.randomUUID(),
                  kind,
                  id,
                  JSON.stringify(current),
                  status,
                  assigned,
                  revision,
                ],
              )
            ).rows[0];
          } else
            c = (
              await db.query(
                "UPDATE reconciliation_cases SET status=$2,assigned_actor=$3,revision=$4,updated_at=NOW() WHERE id=$1 RETURNING *",
                [c.id, status, assigned, revision],
              )
            ).rows[0];
          await db.query(
            "INSERT INTO reconciliation_events(case_id,revision,action,status,assigned_actor,actor,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [c.id, revision, action, status, assigned, actor, note],
          );
          await audit(
            db,
            { type: "admin", id: actor },
            "reconciliation." + action,
            c.id,
            {
              source_kind: kind,
              source_id: id,
              revision,
              financial_records_changed: false,
            },
          );
          return { review: c, financial_records_changed: false };
        },
      ),
    );
  }
  async function verifySource(principal, input) {
    const actor = actorId(principal),
      kind = input?.kind,
      id = input?.source_id;
    resource(kind, id);
    if (!uuid(id)) throw fail(400, "Choose the original checkout reference.");
    if (!["artist_checkout", "listener_checkout"].includes(kind))
      throw fail(
        400,
        "Independent lookup is available only for an existing checkout.",
      );
    const owner = await transaction(pool, async (db) => {
      const query =
        kind === "artist_checkout"
          ? "SELECT o.artist_id AS owner_id FROM payment_checkout_attempts a JOIN commerce_orders o ON o.id=a.order_id WHERE a.id=$1"
          : "SELECT o.listener_id AS owner_id FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id WHERE a.id=$1";
      const row = (await db.query(query, [id])).rows[0];
      if (!row) throw fail(404, "Original checkout not found.");
      await audit(
        db,
        { type: "admin", id: actor },
        "reconciliation.lookup_requested",
        id,
        { source_kind: kind, another_charge_requested: false },
      );
      return row.owner_id;
    });
    const lookup = kind === "artist_checkout" ? verifyArtist : verifyListener;
    if (typeof lookup !== "function")
      throw fail(
        503,
        "Independent provider verification is unavailable. Keep the original reference.",
      );
    // Reuse the existing coordinator's mode, account, receipt, hold, duplicate and cross-process cooldown checks.
    // Owner identity is read from the source, never accepted from the operator's request.
    try {
      await lookup(owner, id);
    } catch (error) {
      await transaction(pool, (db) =>
        audit(
          db,
          { type: "admin", id: actor },
          "reconciliation.lookup_pending",
          id,
          { source_kind: kind, another_charge_requested: false },
        ),
      );
      throw error;
    }
    await transaction(pool, (db) =>
      audit(
        db,
        { type: "admin", id: actor },
        "reconciliation.lookup_completed",
        id,
        { source_kind: kind, bank_settlement_certified: false },
      ),
    );
    return { detail: await detail(kind, id), another_charge_requested: false };
  }
  async function ledger(input = {}) {
    const f = filters(input),
      days = Number(input.days || 30);
    if (!Number.isSafeInteger(days) || days < 1 || days > 90)
      throw fail(400, "Choose a ledger period between 1 and 90 days.");
    return snapshot(async (db) => {
      const rows = (
        await db.query(
          "SELECT t.id::text,j.reference,j.kind,t.currency,t.amount_minor::text,t.debit_account,t.credit_account,j.created_at FROM finance_transfers t JOIN finance_journals j ON j.id=t.journal_id WHERE t.currency=$1 AND j.created_at>=NOW()-($2*INTERVAL '1 day') ORDER BY t.id DESC LIMIT 1001",
          [f.currency, days],
        )
      ).rows;
      return {
        currency: f.currency,
        days,
        rows: rows.slice(0, 1000),
        truncated: rows.length > 1000,
        notice:
          "Ledger records only; provider mode and bank settlement are not inferred.",
      };
    });
  }
  return { overview, queue, detail, review, ledger, verifySource };
}
module.exports = {
  createReconciliation,
  filters,
  actorId,
  ledgerCSV,
  csvCell,
  KINDS,
  MODES,
};
