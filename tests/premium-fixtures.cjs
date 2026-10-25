"use strict";
// Explicit isolated test price approval, never used by the server or committed merchant runtime.
function approvedPricing({ referenceValues = false } = {}) {
  const value = structuredClone(
    require("../config/premium-listener-pricing.json"),
  );
  value.revision = referenceValues
    ? "isolated-large-usd-ledger-fixture"
    : "isolated-usd-reference-fixture";
  value.status = "approved";
  value.approval = {
    approved_at: "2026-10-25T00:00:00Z",
    evidence:
      "Automated isolated fixture only; no owner or live-price approval.",
  };
  if (referenceValues)
    for (const p of Object.values(value.plans))
      p.usd_minor = p.reference_ngn_minor;
  return value;
}
module.exports = { approvedPricing };
