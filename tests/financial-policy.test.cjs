"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const policy = require("../lib/financial-policy");
test("approved financial conditions protect Premium expiration, failed-credit rules and legitimate royalties without repricing", () => {
  const p = policy.disclosure();
  assert.equal(p.status, "approved");
  assert.equal(p.live_operations_enabled, false);
  assert.match(p.premium, /does not automatically refund/);
  assert.match(p.premium, /continues until expiration/);
  assert.match(p.studio, /no usable result/);
  assert.equal(p.settlement_days,7);assert.equal(p.complaint_days,7);assert.match(p.royalties,/not automatically assigned/);
  assert.equal(p.document_hash.length, 64);
  assert.deepEqual(
    require("../lib/premium-pricing")
      .catalog()
      .plans.map((x) => x.usd_minor),
    [8, 23, 60, 121, 588],
  );
});
test("checkout requires explicit current-policy confirmation and rejects stale or truthy client claims", () => {
  for (const input of [
    undefined,
    {},
    { policy_accepted: "true", policy_revision: policy.disclosure().revision },
    { policy_accepted: true, policy_revision: "old" },
  ])
    assert.throws(
      () => policy.confirmation(input),
      (e) => e.status === 409,
    );
  assert.equal(
    policy.confirmation({
      policy_accepted: true,
      policy_revision: policy.disclosure().revision,
    }).policy_accepted,
    true,
  );
  const config = require("../config/financial-policy.json"),
    original = config.status;
  try {
    config.status = "draft";
    assert.throws(
      () =>
        policy.confirmation({
          policy_accepted: true,
          policy_revision: config.revision,
        }),
      (e) => e.status === 503,
    );
  } finally {
    config.status = original;
  }
});
test("voluntary full artist refunds require an unused future term, with no invented partial benefit valuation", () => {
  const request = {
      ground: "before_activation_unused",
      evidence_reference: "Reviewed future-term fixture",
    },
    facts = {
      kind: "artist_subscription",
      before_activation: true,
      service_used: false,
    };
  assert.equal(policy.refundDecision(request, facts).ground, request.ground);
  for (const change of [
    { before_activation: false },
    { service_used: true },
    { kind: "studio_generation" },
  ])
    assert.throws(
      () => policy.refundDecision(request, { ...facts, ...change }),
      (e) => e.status === 409,
    );
  assert.throws(
    () =>
      policy.refundDecision(
        { ...request, ground: "unused_refundable_benefits" },
        facts,
      ),
    (e) => e.status === 409,
  );
});
test("consumed generation purchases do not become refundable from preference or an unverified failure claim", () => {
  const input = {
      ground: "unused_generation_purchase",
      evidence_reference: "Unused entitlement review fixture",
    },
    facts = { kind: "studio_generation", service_used: false };
  assert(policy.refundDecision(input, facts));
  assert.throws(
    () => policy.refundDecision(input, { ...facts, service_used: true }),
    (e) => e.status === 409,
  );
  assert.throws(
    () => policy.refundDecision({ ...input, ground: "disliked_result" }, facts),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      policy.refundDecision(
        { ...input, ground: "verified_service_error" },
        facts,
      ),
    (e) => e.status === 409,
  );
});
test("documented exception review records the selected duplicate, failure or legal basis without proving a payment outcome", () => {
  for (const ground of [
    "duplicate_charge",
    "failed_activation",
    "verified_service_error",
    "legal_requirement",
  ]) {
    const decision = policy.refundDecision(
      {
        ground,
        evidence_verified: true,
        evidence_reference: "Authorized reviewed fixture reference",
      },
      {
        kind: "artist_subscription",
        before_activation: false,
        service_used: true,
      },
    );
    assert.equal(decision.ground, ground);
    assert.equal(decision.policy_revision, policy.disclosure().revision);
    assert.equal(decision.payment_completed, undefined);
  }
});
