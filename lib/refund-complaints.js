"use strict";
const crypto = require("node:crypto");
const { fail, transaction, idempotent, audit } = require("./transactions");
const policy = require("./financial-policy"),
  timing = require("./settlement-policy");
const { uuid, evidence } = require("./premium-utils");
const grounds = [
  "voluntary",
  "duplicate_charge",
  "failed_activation",
  "service_error",
  "legal_requirement",
  "provider_rule",
  "verified_fraud",
];
const actor = () =>
  require("./request-context").get()?.adminId || "legacy-shared-key";
async function source(db, kind, id, owner) {
  if (!uuid(id) || !["artist", "listener"].includes(kind))
    throw fail(400, "Choose a valid paid purchase.");
  const q =
    kind === "artist"
      ? await db.query(
          "SELECT o.artist_id AS owner,p.verified_at,p.verified_at::text AS exact_at FROM commerce_orders o JOIN payment_presentments p ON p.order_id=o.id WHERE o.id=$1",
          [id],
        )
      : await db.query(
          "SELECT o.listener_id AS owner,p.verified_at,p.verified_at::text AS exact_at FROM premium_orders o JOIN premium_receipts p ON p.order_id=o.id WHERE o.id=$1",
          [id],
        );
  if (
    !q.rowCount ||
    (owner !== undefined && String(q.rows[0].owner) !== String(owner))
  )
    throw fail(404, "Your verified purchase was not found.");
  await db.query(
    kind === "artist"
      ? "SELECT id FROM creators WHERE id=$1 FOR UPDATE"
      : "SELECT id FROM listeners WHERE id=$1 FOR UPDATE",
    [q.rows[0].owner],
  );
  if (kind === "listener")
    await require("./streaming-royalties").lockReceiptPeriods(db, id);
  return q.rows[0];
}
async function intake(db, kind, owner, id, input = {}) {
  const paid = await source(db, kind, id, owner),
    reason = String(input.reason || "").trim(),
    ground = input.ground || "voluntary";
  if (reason.length < 10 || reason.length > 1000 || !grounds.includes(ground))
    throw fail(
      400,
      "Choose a complaint reason and explain it in 10–1,000 characters.",
    );
  const incidentId = input.incident_id || null;
  if (incidentId && !uuid(incidentId))
    throw fail(400, "Choose a verified incident reference.");
  const existing = (
    await db.query(
      "SELECT id FROM refund_complaints WHERE artist_order_id IS NOT DISTINCT FROM $1 AND premium_order_id IS NOT DISTINCT FROM $2 AND ground=$3 AND incident_id IS NOT DISTINCT FROM $4",
      [
        kind === "artist" ? id : null,
        kind === "listener" ? id : null,
        ground,
        incidentId,
      ],
    )
  ).rows[0];
  if (existing)
    throw fail(
      409,
      "This claim already has a complaint. Use its existing review reference.",
    );
  let relevant = paid.exact_at;
  if (incidentId) {
    if (!uuid(incidentId))
      throw fail(400, "Choose a verified incident reference.");
    const incident = (
      await db.query(
        "SELECT occurred_at,occurred_at::text AS exact_at FROM refund_service_incidents WHERE id=$1 AND artist_order_id IS NOT DISTINCT FROM $2 AND premium_order_id IS NOT DISTINCT FROM $3",
        [
          incidentId,
          kind === "artist" ? id : null,
          kind === "listener" ? id : null,
        ],
      )
    ).rows[0];
    if (!incident)
      throw fail(404, "A matching verified incident was not found.");
    relevant = incident.exact_at;
  }
  const window = (
    await db.query(
      "SELECT transaction_timestamp()<=$1::timestamptz+INTERVAL '168 hours' AS within_window,transaction_timestamp()>=$1::timestamptz AS not_future,($1::timestamptz+INTERVAL '168 hours')::text AS deadline_at",
      [relevant],
    )
  ).rows[0];
  if (!window.not_future)
    throw fail(409, "A future incident cannot establish eligibility.");
  if (!window.within_window && ground === "voluntary")
    throw fail(
      409,
      "The seven-calendar-day ordinary complaint window has closed. Legal, provider-rule and verified-fraud exceptions remain subject to review.",
    );
  const status = window.within_window
    ? "timely"
    : ["legal_requirement", "provider_rule", "verified_fraud"].includes(ground)
      ? "exception_review"
      : "timing_review";
  await policy.catalog(db);
  const row = (
    await db.query(
      "INSERT INTO refund_complaints(id,artist_order_id,premium_order_id,account_id,policy_revision,ground,reason,incident_id,relevant_at,deadline_at,intake) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
      [
        crypto.randomUUID(),
        kind === "artist" ? id : null,
        kind === "listener" ? id : null,
        owner,
        policy.disclosure().revision,
        ground,
        reason,
        incidentId,
        relevant,
        window.deadline_at,
        status,
      ],
    )
  ).rows[0];
  await audit(db, { type: kind, id: owner }, "refund.complaint", row.id, {
    order_id: id,
    intake: status,
    refund_sent: false,
  });
  return row;
}
async function assertArtistReview(db, id, c, input) {
  const paid = (
    await db.query(
      "SELECT verified_at FROM payment_presentments WHERE order_id=$1",
      [id],
    )
  ).rows[0];
  const complaint = (
    await db.query("SELECT * FROM refund_complaints WHERE artist_order_id=$1", [
      id,
    ])
  ).rows[0];
  if (complaint?.intake === "timely")
    return {
      deadline_at: complaint.deadline_at,
      incident_id: complaint.incident_id,
      intake: complaint.intake,
    };
  const received = complaint?.received_at || c.created_at;
  let relevant = complaint?.relevant_at || paid.verified_at;
  if (input.incident_id) {
    if (!uuid(input.incident_id))
      throw fail(400, "Choose a verified incident reference.");
    const incident = (
      await db.query(
        "SELECT occurred_at FROM refund_service_incidents WHERE id=$1 AND artist_order_id=$2",
        [input.incident_id, id],
      )
    ).rows[0];
    if (!incident) throw fail(404, "Matching verified incident not found.");
    relevant = incident.occurred_at;
  }
  const window = timing.complaintWindow(relevant, received);
  if (window.within_window)
    return {
      ...window,
      incident_id: input.incident_id || complaint?.incident_id || null,
    };
  if (
    !["legal_requirement", "provider_rule", "verified_fraud"].includes(
      input.ground,
    ) ||
    input.evidence_verified !== true
  )
    throw fail(
      409,
      "This complaint needs verified legal/provider/fraud grounds or a verified incident establishing a timely complaint; an ordinary refund cannot be submitted.",
    );
}
function createComplaints(pool) {
  async function request(kind, owner, id, key, input) {
    return transaction(pool, (db) =>
      idempotent(
        db,
        "refund-complaint:" + kind + ":" + owner,
        key,
        { id, input },
        async () => intake(db, kind, owner, id, input),
      ),
    );
  }
  async function list(kind, owner) {
    return (
      await pool.query(
        kind === "listener"
          ? "SELECT c.*,r.status AS review_status,r.revision FROM refund_complaints c LEFT JOIN refund_complaint_reviews r ON r.complaint_id=c.id WHERE c.premium_order_id IS NOT NULL AND c.account_id=$1 ORDER BY c.received_at DESC LIMIT 100"
          : "SELECT c.*,r.status AS review_status,r.revision FROM refund_complaints c LEFT JOIN refund_complaint_reviews r ON r.complaint_id=c.id WHERE c.artist_order_id IS NOT NULL AND c.account_id=$1 ORDER BY c.received_at DESC LIMIT 100",
        [owner],
      )
    ).rows;
  }
  async function report() {
    return (
      await pool.query(
        "SELECT c.*,r.status AS review_status,COALESCE(r.revision,0) AS revision,r.note AS review_note FROM refund_complaints c LEFT JOIN refund_complaint_reviews r ON r.complaint_id=c.id ORDER BY c.received_at DESC LIMIT 200",
      )
    ).rows;
  }
  async function review(key, input) {
    if (
      !uuid(input?.complaint_id) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0 ||
      !["under_review", "resolved_no_refund", "provider_review"].includes(
        input.status,
      )
    )
      throw fail(
        400,
        "Choose a complaint, current revision and review outcome.",
      );
    const note = evidence(input.note),
      reference = evidence(input.evidence_reference);
    return transaction(pool, (db) =>
      idempotent(
        db,
        "refund-complaint-review",
        key,
        { ...input, note, evidence_reference: reference },
        async () => {
          const c = (
            await db.query("SELECT * FROM refund_complaints WHERE id=$1", [
              input.complaint_id,
            ])
          ).rows[0];
          if (!c) throw fail(404, "Complaint not found.");
          await source(
            db,
            c.artist_order_id ? "artist" : "listener",
            c.artist_order_id || c.premium_order_id,
            c.account_id,
          );
          await db.query(
            "SELECT id FROM refund_complaints WHERE id=$1 FOR UPDATE",
            [c.id],
          );
          const old = (
            await db.query(
              "SELECT revision FROM refund_complaint_reviews WHERE complaint_id=$1",
              [c.id],
            )
          ).rows[0];
          if ((old?.revision || 0) !== input.revision)
            throw fail(
              409,
              "This complaint changed. Refresh before reviewing it.",
            );
          const revision = input.revision + 1,
            who = actor();
          await db.query(
            "INSERT INTO refund_complaint_reviews(complaint_id,status,revision,actor_id,note,evidence_reference) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(complaint_id) DO UPDATE SET status=EXCLUDED.status,revision=EXCLUDED.revision,actor_id=EXCLUDED.actor_id,note=EXCLUDED.note,evidence_reference=EXCLUDED.evidence_reference,updated_at=NOW()",
            [c.id, input.status, revision, who, note, reference],
          );
          await db.query(
            "INSERT INTO refund_complaint_events(complaint_id,revision,actor_id,status,note,evidence_reference) VALUES($1,$2,$3,$4,$5,$6)",
            [c.id, revision, who, input.status, note, reference],
          );
          await audit(
            db,
            { type: "admin", id: who },
            "refund.complaint_review",
            c.id,
            { revision, status: input.status, money_sent: false },
          );
          return {
            id: c.id,
            revision,
            status: input.status,
            money_sent: false,
          };
        },
      ),
    );
  }
  async function incident(key, input) {
    const kind = input?.kind,
      id = input?.order_id,
      reference = evidence(input?.evidence_reference),
      occurred = timing.instant(input?.occurred_at);
    if (reference.length > 500)
      throw fail(400, "Use an evidence reference of at most 500 characters.");
    return transaction(pool, (db) =>
      idempotent(db, "refund-incident", key, input, async () => {
        const paid = await source(db, kind, id);
        const now = (await db.query("SELECT transaction_timestamp() AS now"))
          .rows[0].now;
        if (
          occurred < timing.instant(paid.verified_at) ||
          occurred > timing.instant(now)
        )
          throw fail(
            400,
            "Verify an incident between payment and the current server time.",
          );
        const event = (
          await db.query(
            "INSERT INTO refund_service_incidents(id,artist_order_id,premium_order_id,occurred_at,actor_id,evidence_reference) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              crypto.randomUUID(),
              kind === "artist" ? id : null,
              kind === "listener" ? id : null,
              new Date(occurred),
              actor(),
              reference,
            ],
          )
        ).rows[0];
        await audit(
          db,
          { type: "admin", id: actor() },
          "refund.incident_verified",
          event.id,
          { kind, order_id: id },
        );
        return event;
      }),
    );
  }
  return { request, list, report, review, incident };
}
module.exports = { createComplaints, intake, assertArtistReview };
