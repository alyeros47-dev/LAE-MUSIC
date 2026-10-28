"use strict";
const { fail } = require("./transactions");
const { month, DAY } = require("./premium-policy");
const DAYS = 7;
function instant(value) {
  const at =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value)
          ? Date.parse(value)
          : NaN;
  if (!Number.isSafeInteger(at))
    throw fail(
      400,
      "A verified timestamp with an explicit timezone is required.",
    );
  return at;
}
function complaintWindow(eventAt, receivedAt) {
  const event = instant(eventAt),
    received = instant(receivedAt);
  if (event > received)
    throw fail(
      409,
      "A future incident cannot establish complaint eligibility.",
    );
  const deadline = event + DAYS * DAY;
  return {
    within_window: received <= deadline,
    relevant_at: new Date(event).toISOString(),
    deadline_at: new Date(deadline).toISOString(),
    calendar_days: DAYS,
    timezone: "UTC",
  };
}
function reconciliation(monthCode, now = Date.now()) {
  const p = month(monthCode),
    ready = p.end.getTime() + DAYS * DAY;
  return {
    month: monthCode,
    period_end: p.end.toISOString(),
    release_not_before: new Date(ready).toISOString(),
    reconciliation_days: DAYS,
    timezone: "UTC",
    matured: instant(now) >= ready,
  };
}
function requireMature(monthCode, now = Date.now()) {
  const result = reconciliation(monthCode, now);
  if (!result.matured)
    throw fail(
      409,
      "Complete seven full UTC calendar days of settlement and reconciliation after month-end before finalizing or releasing royalties.",
    );
  return result;
}
module.exports = {
  DAYS,
  instant,
  complaintWindow,
  reconciliation,
  requireMature,
};
