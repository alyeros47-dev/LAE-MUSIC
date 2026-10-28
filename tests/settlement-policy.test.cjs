"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  complaintWindow,
  reconciliation,
  requireMature,
} = require("../lib/settlement-policy");
test("complaint deadline is exactly seven UTC calendar days from the verified event, inclusive at the boundary", () => {
  const at = "2026-10-26T12:34:56.123Z",
    end = Date.parse(at) + 7 * 86400000;
  assert.equal(complaintWindow(at, end).within_window, true);
  assert.equal(complaintWindow(at, end + 1).within_window, false);
  assert.equal(
    complaintWindow(at, end).deadline_at,
    "2026-11-02T12:34:56.123Z",
  );
  assert.throws(
    () => complaintWindow(at, "2026-10-26T12:34:56.122Z"),
    (e) => e.status === 409,
  );
  assert.throws(
    () => complaintWindow("2026-10-26T12:00:00", end),
    (e) => e.status === 400,
  );
});
test("seven complete month-end days cover leap years and year boundaries without shortening the offline sync window", () => {
  for (const [month, ready] of [
    ["2026-09", "2026-10-08T00:00:00.000Z"],
    ["2026-12", "2027-01-08T00:00:00.000Z"],
    ["2028-02", "2028-03-08T00:00:00.000Z"],
  ]) {
    const at = Date.parse(ready);
    assert.equal(reconciliation(month, at).release_not_before, ready);
    assert.throws(
      () => requireMature(month, at - 1),
      (e) => e.status === 409,
    );
    assert.equal(requireMature(month, at).matured, true);
  }
});

test("complaint and late-dispute writes require a finance/owner role and recent verification", () => {
  const { routePermission } = require("../lib/admin-auth");
  for (const action of ["incident", "complaint-review", "late-review"]) {
    const url = new URL(
      "https://lae.test/api/platform/admin/royalties/" + action,
    );
    assert.deepEqual(routePermission("finance", url, "POST"), {
      allowed: true,
      fresh: true,
    });
    for (const role of ["support", "content"])
      assert.equal(routePermission(role, url, "POST").allowed, false);
  }
});
