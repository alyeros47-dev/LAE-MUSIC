"use strict";
const policy = require("../config/financial-policy.json");
const { digest, fail } = require("./transactions");
function requireApproved() {
  if (
    policy.status !== "approved" ||
    !/^owner-financial-[a-zA-Z0-9-]{8,80}$/.test(policy.revision || "") ||
    typeof policy.approval_evidence !== "string" ||
    policy.approval_evidence.length < 20 ||
    policy.live_operations_enabled !== false
  )
    throw fail(
      503,
      "The financial policy requires approval and review before checkout.",
    );
}
function disclosure() {
  return { ...policy, document_hash: digest(policy) };
}
function confirmation(input) {
  requireApproved();
  if (
    input?.policy_accepted !== true ||
    input.policy_revision !== policy.revision
  )
    throw fail(
      409,
      "Review and accept the current refund conditions before creating a payment reference.",
    );
  return { policy_revision: policy.revision, policy_accepted: true };
}
async function catalog(db) {
  requireApproved();
  const hash = digest(policy);
  await db.query(
    "INSERT INTO financial_policy_catalogs(revision,document,document_hash) VALUES($1,$2,$3) ON CONFLICT(revision) DO NOTHING",
    [policy.revision, JSON.stringify(policy), hash],
  );
  const row = (
    await db.query(
      "SELECT document_hash FROM financial_policy_catalogs WHERE revision=$1",
      [policy.revision],
    )
  ).rows[0];
  if (row?.document_hash !== hash)
    throw fail(503, "The approved financial policy revision requires review.");
}
async function accept(db, kind, orderId, accountId) {
  await catalog(db);
  await db.query(
    "INSERT INTO payment_policy_acceptances(artist_order_id,premium_order_id,account_id,policy_revision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [
      kind === "artist" ? orderId : null,
      kind === "listener" ? orderId : null,
      accountId,
      policy.revision,
    ],
  );
}
const grounds = [
  "before_activation_unused",
  "unused_generation_purchase",
  "duplicate_charge",
  "failed_activation",
  "verified_service_error",
  "legal_requirement",
  "provider_rule",
  "verified_fraud",
  "unused_refundable_benefits",
];
function refundDecision(input, facts) {
  const ground = input?.ground;
  if (!grounds.includes(ground))
    throw fail(400, "Choose the verified basis for this refund review.");
  const evidence = String(input.evidence_reference || "").trim();
  if (evidence.length < 10 || evidence.length > 500)
    throw fail(
      400,
      "Record the reviewed evidence reference (10–500 characters), without secrets.",
    );
  if (ground === "unused_refundable_benefits")
    throw fail(
      409,
      "A partial benefit refund requires a verified benefit valuation. Keep this case under review; do not submit a full refund.",
    );
  if (
    ground === "before_activation_unused" &&
    (facts.kind !== "artist_subscription" ||
      !facts.before_activation ||
      facts.service_used)
  )
    throw fail(
      409,
      "A voluntary full package refund requires a future, not-yet-activated term with no used paid benefits.",
    );
  if (
    ground === "unused_generation_purchase" &&
    (facts.kind !== "studio_generation" || facts.service_used)
  )
    throw fail(
      409,
      "A generation purchase that has been reserved or consumed requires verified failure or legal review.",
    );
  if (
    !["before_activation_unused", "unused_generation_purchase"].includes(
      ground,
    ) &&
    input.evidence_verified !== true
  )
    throw fail(
      409,
      "Confirm the reviewed duplicate, failure or legal evidence before approving an exception. A customer claim alone is not verification.",
    );
  return {
    ground,
    evidence_reference: evidence,
    facts,
    policy_revision: policy.revision,
  };
}
async function recordReview(db, orderId, decision, note) {
  await catalog(db);
  const actor =
    require("./request-context").get()?.adminId || "legacy-shared-key";
  await db.query(
    "INSERT INTO refund_policy_decisions(order_id,policy_revision,actor_id,ground,evidence_reference,review_note,source_facts) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      orderId,
      policy.revision,
      actor,
      decision.ground,
      decision.evidence_reference,
      note,
      JSON.stringify(decision.facts),
    ],
  );
}
module.exports = {
  disclosure,
  confirmation,
  catalog,
  accept,
  grounds,
  refundDecision,
  recordReview,
};
