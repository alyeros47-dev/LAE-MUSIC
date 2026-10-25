"use strict";
const { fail } = require("./transactions");
const PLANS = Object.freeze({
  daily: { name: "Daily Pass", days: 1, minor: 10000 },
  weekly: { name: "Weekly Premium", days: 7, minor: 30000 },
  monthly: { name: "Monthly Premium", days: 30, minor: 80000 },
  two_month: { name: "Two-Month Premium", days: 60, minor: 160000 },
  annual: { name: "Annual Premium", days: 365, minor: 780000 },
});
const DAY = 86400000;
function minor(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !/^(0|[1-9][0-9]*)$/.test(value))
  )
    throw fail(400, "Invalid monetary amount.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1e13)
    throw fail(400, "Invalid monetary amount.");
  return n;
}
function plan(code) {
  if (!Object.hasOwn(PLANS, code))
    throw fail(400, "Choose a Premium Listener package.");
  return { ...PLANS[code], code, currency: "NGN" };
}
function month(value) {
  if (typeof value !== "string" || !/^20\d\d-(0[1-9]|1[0-2])$/.test(value))
    throw fail(400, "Choose an accounting month in YYYY-MM format.");
  const start = new Date(value + "-01T00:00:00.000Z"),
    end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { code: value, start, end };
}
function percentage(amount, rate) {
  return Number((BigInt(minor(amount)) * BigInt(rate) + 50n) / 100n);
}
// Cumulative floors telescope across UTC month boundaries; no repeated monthly rounding loss.
function recognize(amount, start, end, period) {
  amount = minor(amount);
  const s = new Date(start).getTime(),
    e = new Date(end).getTime();
  if (!Number.isSafeInteger(s) || !Number.isSafeInteger(e) || e <= s)
    throw fail(400, "Invalid entitlement period.");
  const at = (t) => BigInt(Math.max(0, Math.min(e, t) - s));
  return Number(
    (BigInt(amount) * at(period.end.getTime())) / BigInt(e - s) -
      (BigInt(amount) * at(period.start.getTime())) / BigInt(e - s),
  );
}
function allocate(amount, weights) {
  amount = minor(amount);
  const sorted = weights
    .map((w) => ({ id: String(w.id), weight: minor(w.weight) }))
    .filter((w) => w.weight > 0)
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  if (new Set(sorted.map((w) => w.id)).size !== sorted.length)
    throw fail(400, "Duplicate royalty allocation identity.");
  const total = sorted.reduce((n, w) => n + BigInt(w.weight), 0n);
  if (!total) return [];
  const rows = sorted.map((w) => {
    const n = BigInt(amount) * BigInt(w.weight);
    return { id: w.id, amount_minor: Number(n / total), remainder: n % total };
  });
  let left = amount - rows.reduce((n, w) => n + w.amount_minor, 0);
  for (const row of [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id, "en", { numeric: true })
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (!left--) break;
    row.amount_minor++;
  }
  return rows.map(({ id, amount_minor }) => ({ id, amount_minor }));
}
function netBasis({ gross, refund = 0, tax, fees, commissions = 0 }) {
  for (const v of [gross, refund, tax, fees, commissions]) minor(v);
  if (refund > gross || tax + fees + commissions > gross - refund)
    throw fail(409, "Payment deductions require reconciliation.");
  return gross - refund - tax - fees - commissions;
}
module.exports = {
  PLANS,
  DAY,
  plan,
  minor,
  month,
  percentage,
  recognize,
  allocate,
  netBasis,
  STREAM_ROYALTY_PERCENT: 50,
};
