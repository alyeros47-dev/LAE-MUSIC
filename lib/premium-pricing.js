"use strict";
const config = require("../config/premium-listener-pricing.json");
const { fail, digest } = require("./transactions");
const { minor } = require("./premium-policy");
const { decimal } = require("./currency");
const durations = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  two_month: 60,
  annual: 365,
};
function catalog(value = config) {
  if (
    !value ||
    value.base_currency !== "USD" ||
    !["approved", "pending_approval"].includes(value.status) ||
    typeof value.revision !== "string" ||
    !/^[a-z0-9_.-]{1,100}$/.test(value.revision)
  )
    throw fail(503, "Premium USD pricing configuration requires review.");
  const plans = Object.entries(durations).map(([code, days]) => {
    const p = value.plans?.[code];
    if (
      !p ||
      p.days !== days ||
      minor(p.usd_minor) < 1 ||
      minor(p.usd_minor) > 100000000
    )
      throw fail(503, "Premium USD prices require review.");
    return {
      code,
      name: p.name,
      days,
      currency: "USD",
      amount_minor: p.usd_minor,
      usd_minor: p.usd_minor,
      price_status: value.status,
    };
  });
  const approved =
    value.status === "approved" &&
    typeof value.approval?.evidence === "string" &&
    value.approval.evidence.length >= 10 &&
    Number.isFinite(Date.parse(value.approval?.approved_at));
  if (value.status === "approved" && !approved)
    throw fail(503, "Premium price approval evidence is missing.");
  return {
    revision: value.revision,
    status: value.status,
    approved,
    base_currency: "USD",
    plans,
    document: value,
    hash: digest(value),
  };
}
// Proposal construction only: never runs in checkout or re-prices an approved catalog.
function referenceToUsd(ngnMinor, ngnPerUsd) {
  const r = decimal(ngnPerUsd);
  if (r.numerator <= 0n) throw fail(400, "Invalid reference exchange rate.");
  const n = BigInt(minor(ngnMinor)) * r.denominator;
  return Number((n + r.numerator / 2n) / r.numerator);
}
async function recordApproval(db, book) {
  if (!book.approved)
    throw fail(503, "Premium Listener USD base prices await owner approval.");
  await db.query(
    "INSERT INTO premium_price_catalogs(revision,document,document_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [book.revision, JSON.stringify(book.document), book.hash],
  );
  const saved = (
    await db.query(
      "SELECT document_hash FROM premium_price_catalogs WHERE revision=$1",
      [book.revision],
    )
  ).rows[0];
  if (saved?.document_hash !== book.hash)
    throw fail(
      409,
      "The approved price revision changed. Create a new reviewed revision.",
    );
}
module.exports = { catalog, recordApproval, referenceToUsd };
