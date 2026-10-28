"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { create, operator } = require("../lib/partner-statements");
test("quarterly financial calculations require a verified finance principal and cannot manufacture a payout", async () => {
  for (const principal of [
    null,
    { role: "content", source: "shared_key" },
    { role: "support", source: "shared_key" },
    { role: "owner", source: "client" },
  ])
    assert.throws(
      () => operator(principal),
      (e) => e.status === 403,
    );
  assert.equal(
    operator({ role: "finance", source: "shared_key" }),
    "legacy-shared-key",
  );
  const program = create({
    pool: {
      connect() {
        throw Error("No payout may reach the database");
      },
    },
  });
  await assert.rejects(
    program.releaseCash({ paid: true, amount: 1000000, verified: true }),
    (e) => e.status === 503,
  );
});
test("an open bonus period and historical record mode cannot finalize earnings", async () => {
  const pool = {
      connect() {
        throw Error("Invalid finalization must be stopped first");
      },
    },
    principal = { role: "owner", source: "shared_key" };
  await assert.rejects(
    create({ pool, now: () => new Date("2026-12-20T23:59:59Z") }).finalize(
      principal,
      {
        artist_id: 7,
        quarter: "2026-Q4",
        mode: "test",
        note: "Do not count a full cutoff day before it closes.",
      },
    ),
    (e) => e.status === 409,
  );
  await assert.rejects(
    create({ pool, now: () => new Date("2026-12-21T00:00:00Z") }).finalize(
      principal,
      {
        artist_id: 7,
        quarter: "2026-Q4",
        mode: "legacy",
        note: "Unverified history cannot create a bonus.",
      },
    ),
    (e) => e.status === 409,
  );
});
test("a large quarterly source set cannot silently finalize a partial 100-row dashboard page", async () => {
  let rollback = false,
    released = false;
  const db = {
    async query(sql) {
      if (sql === "ROLLBACK") {
        rollback = true;
        return {};
      }
      if (sql.includes("LIMIT 5001"))
        return { rows: Array.from({ length: 5001 }, () => ({})) };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  await assert.rejects(
    create({
      pool: { connect: async () => db },
      now: () => new Date("2027-01-01"),
    }).preview(7, { quarter: "2026-Q4", mode: "test" }),
    (e) => e.status === 409,
  );
  assert(rollback);
  assert(released);
});
