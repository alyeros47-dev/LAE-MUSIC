"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  filters,
  actorId,
  ledgerCSV,
  createReconciliation,
} = require("../lib/reconciliation");
const { routePermission } = require("../lib/admin-auth");
test("reconciliation filters keep USD/legacy books and provider modes separate and reject malformed cursors", () => {
  assert.equal(filters({}).currency, "USD");
  assert.equal(filters({ currency: "NGN", mode: "test" }).mode, "test");
  for (const input of [
    { currency: "GHS" },
    { mode: "cash" },
    { kind: "mark_paid" },
    { search: {} },
    { cursor: "invalid" },
    {
      cursor: Buffer.from(
        JSON.stringify(["invalid", "withdrawal", "1"]),
      ).toString("base64url"),
    },
  ])
    assert.throws(
      () => filters(input),
      (e) => e.status === 400,
    );
});
test("financial review permissions exclude listeners, support/content operators and stale financial writes", () => {
  const base = "/api/platform/admin/reconciliation";
  for (const role of ["support", "content", "listener"])
    for (const path of [base, base + "/ledger.csv", base + "/review"])
      assert.equal(
        routePermission(
          role,
          new URL("https://lae.test" + path),
          path.endsWith("review") ? "POST" : "GET",
        ).allowed,
        false,
      );
  assert.deepEqual(
    routePermission(
      "finance",
      new URL("https://lae.test" + base + "/review"),
      "POST",
    ),
    { allowed: true, fresh: true },
  );
  assert.equal(
    routePermission(
      "owner",
      new URL("https://lae.test" + base + "/review"),
      "POST",
    ).fresh,
    true,
  );
  assert.equal(
    routePermission(
      "finance",
      new URL("https://lae.test" + base + "/unknown"),
      "POST",
    ).allowed,
    false,
  );
  assert.throws(
    () => actorId({ role: "support", source: "named", id: "a".repeat(36) }),
    (e) => e.status === 403,
  );
  assert.equal(
    actorId({ role: "owner", source: "shared_key" }),
    "legacy-shared-key",
  );
});
test("ledger CSV preserves exact minor-unit integers and neutralizes spreadsheet formulas in quoted fields", () => {
  const text = ledgerCSV([
    {
      id: "1",
      reference: ' \t=HYPERLINK("https://invalid")',
      kind: "+SUM(1,2)",
      currency: "USD",
      amount_minor: "9007199254740993",
      debit_account: "account\nwith,comma",
      credit_account: "@remote",
      created_at: new Date("2026-10-01T00:00:00Z"),
    },
  ]);
  assert(text.includes("9007199254740993"));
  assert(text.includes('"\' \t=HYPERLINK(""https://invalid"")"'));
  assert(text.includes('"\'+SUM(1,2)"'));
  assert(text.includes('"\'@remote"'));
  assert(text.endsWith("\r\n"));
  assert(text.includes('"account\nwith,comma"'));
});
test("the financial UI formats integers beyond Number precision without converting or combining currencies", async () => {
  const m = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/reconciliation.js").toString("base64")
  );
  assert.equal(
    m.financialAmount("9007199254740993", "USD"),
    "USD 90,071,992,547,409.93",
  );
  assert.equal(m.financialAmount("-100", "NGN"), "NGN -1.00");
  assert.equal(m.financialAmount("1", "GHS"), "Unavailable");
  assert.equal(m.financialAmount("1.2", "USD"), "Unavailable");
});
test("reconciliation snapshots roll back and release on query failure without attempting financial mutations", async () => {
  const calls = [];
  let released = false;
  const service = createReconciliation({
    pool: {
      connect: async () => ({
        release() {
          released = true;
        },
        query: async (sql) => {
          calls.push(sql);
          if (sql.includes("WITH receipts")) throw Error("fixture unavailable");
          return { rows: [] };
        },
      }),
    },
  });
  await assert.rejects(service.overview({}), /fixture unavailable/);
  assert.match(calls[0], /READ ONLY$/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert(released);
  assert(
    !calls.some((sql) => /^\s*(INSERT|UPDATE|DELETE|CREATE)\b/i.test(sql)),
  );
});
test("operator reviews reject invented financial actions and invalid annotations before opening a database transaction", async () => {
  const service = createReconciliation({
    pool: {
      connect() {
        throw Error("must not connect");
      },
    },
  });
  for (const payload of [
    {
      kind: "withdrawal",
      source_id: "1",
      revision: 0,
      action: "mark_paid",
      note: "Never invent a bank payout.",
    },
    {
      kind: "withdrawal",
      source_id: "1",
      revision: "0",
      action: "claim",
      note: "Reviewed isolated source.",
    },
    {
      kind: "withdrawal",
      source_id: "1",
      revision: 0,
      action: "claim",
      note: "short",
    },
  ])
    await assert.rejects(
      service.review(
        { role: "owner", source: "shared_key" },
        "review-test-request-123",
        payload,
      ),
      (e) => e.status === 400,
    );
});

test("independent operator lookups reject non-checkout sources and malformed identifiers before any provider or database call", async () => {
  const service = createReconciliation({
    pool: {
      connect() {
        throw Error("must not connect");
      },
    },
    verifyArtist() {
      throw Error("must not call");
    },
  });
  for (const input of [
    { kind: "withdrawal", source_id: "1" },
    { kind: "artist_checkout", source_id: "invalid" },
  ])
    await assert.rejects(
      service.verifySource({ role: "owner", source: "shared_key" }, input),
      (e) => e.status === 400,
    );
});
