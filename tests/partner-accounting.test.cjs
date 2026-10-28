"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { create, filters, period } = require("../lib/partner-accounting");
const { routePermission } = require("../lib/admin-auth");
const { createPlatform } = require("../lib/platform");
const publicRuntime = require("./runtime.cjs").runtime;
test("quarter boundaries are explicit UTC and record modes cannot be silently merged", () => {
  assert.deepEqual(period("2026-Q4", "2027-01-01T00:00:00Z"), {
    code: "2026-Q4",
    start: "2026-10-01T00:00:00.000Z",
    end: "2026-12-21T00:00:00.000Z",
    ended: true,
  });
  assert.equal(period(null, "2027-01-01T00:30:00+01:00").code, "2027-Q1");
  for (const q of ["2026-Q5", "2026-Q0", "2026-10", "2026-Q1';DROP", [], {}])
    assert.throws(() => period(q));
  for (const mode of ["all", "sandbox", "USD", {}])
    assert.throws(() => filters({ mode }));
  assert.equal(filters().mode, "live");
});
test("quarter reconciliation reads a consistent snapshot, keeps sums beyond the activity page and cannot mint a bonus", async () => {
  const calls = [];
  let released = false;
  const db = {
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes("GROUP BY relation"))
        return {
          rows: [
            {
              relation: "team",
              sales: "125",
              eligible_sales: "123",
              unverified_sales: "2",
              gross_minor: "130000",
              refund_minor: "20000",
              held_minor: "10000",
              eligible_minor: "100000",
              premium_eligible_minor: "20000",
              recorded_commission_minor: "0",
            },
          ],
        };
      if (sql.includes("GROUP BY referrer_id")) return { rows: [] };
      if (sql.includes("SELECT order_id,source,plan"))
        return {
          rows: Array.from({ length: 101 }, () => ({
            gross_minor: "1000",
            refund_minor: "0",
            held_minor: "0",
            eligible_minor: "1000",
            commission_minor: "250",
          })),
        };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const x = await create({
    pool: { connect: async () => db },
    now: () => new Date("2026-10-28"),
  }).overview(7, { mode: "test" });
  assert.equal(x.team_projection_minor, 9000);
  assert.equal(x.team_projection_percent, null);
  assert.deepEqual(
    x.team_rate_breakdown.map((x) => [x.percent, x.basis_minor, x.bonus_minor]),
    [
      [10, 80000, 8000],
      [5, 20000, 1000],
    ],
  );
  assert.equal(x.rollup.team.eligible_minor, 100000);
  assert.equal(x.activity.length, 100);
  assert.equal(x.activity_truncated, true);
  assert.equal(x.payouts_enabled, false);
  assert.equal(x.projection_only, true);
  assert.equal(
    x.new_commission_policy_status,
    "approved_direct_rates_and_holiday_rollover",
  );
  assert(released);
  assert(
    calls.every((x) => /^(BEGIN|SET LOCAL|WITH|SELECT|COMMIT)/.test(x.sql)),
  );
  assert(calls[0].sql.includes("READ ONLY"));
  for (const c of calls.filter((x) => x.args && x.sql.startsWith("WITH"))) {
    assert.equal(c.args[0], "7");
    assert.equal(c.args[3], "test");
    assert(c.sql.includes("payment_product_reversals"));
    assert(c.sql.includes("refund_complaints"));
    assert(c.sql.includes("p.payment_id=r.payment_id"));
    assert(c.sql.includes("q.id=p.quote_id"));
  }
});
test("invalid money and failed SQL roll back and release the snapshot connection", async () => {
  for (const invalid of [null, "9007199254740993", "-1"]) {
    let rollback = 0,
      released = 0;
    const db = {
      async query(sql) {
        if (sql === "ROLLBACK") {
          rollback++;
          return {};
        }
        if (sql.includes("GROUP BY relation"))
          return { rows: [{ relation: "team", eligible_minor: invalid }] };
        return { rows: [] };
      },
      release() {
        released++;
      },
    };
    await assert.rejects(
      create({ pool: { connect: async () => db } }).overview(7),
    );
    assert.equal(rollback, 1);
    assert.equal(released, 1);
  }
  const pool = {
    connect() {
      throw Error("Must validate before a database connection");
    },
  };
  for (const id of ["0", "-2", "1';DROP", undefined])
    await assert.rejects(
      create({ pool }).overview(id),
      (e) => e.status === 400,
    );
});
test("financial report authorization stays role-scoped and never accepts a mutation", async () => {
  const path = new URL(
    "https://lae.test/api/platform/admin/partners/accounting?artist_id=7",
  );
  assert(routePermission("finance", path, "GET").allowed);
  assert(!routePermission("finance", path, "POST").allowed);
  for (const role of ["support", "content"])
    assert(!routePermission(role, path, "GET").allowed);
  const app = await publicRuntime();
  for (const p of [
    "/api/platform/partners/accounting",
    "/api/platform/admin/partners/accounting?artist_id=7",
  ])
    assert.equal((await app.request(p)).status, 401);
  const module = await app.request("/web/partner-accounting.js");
  assert.equal(module.status, 200);
  assert(module.text.includes("projection"));
});
test("ordinary artists cannot select another owner through a query parameter, and POST does not load financial data", async () => {
  const calls = [],
    db = {
      query: async (sql) => {
        calls.push(sql);
        return { rows: [] };
      },
      release() {},
    };
  const platform = createPlatform({
    pool: { connect: async () => db },
    me: async () => ({ id: 7 }),
    listenerMe: async () => null,
    authAdmin: () => false,
    validOrigin: () => true,
    body: async () => ({}),
    json: (res, status, data) => {
      res.status = status;
      res.data = data;
    },
  });
  let res = {};
  await platform.handler(
    { method: "GET", headers: {} },
    res,
    new URL("https://lae.test/api/platform/partners/accounting?artist_id=8"),
  );
  assert.equal(res.status, 200);
  assert.equal(res.data.rollup.direct.eligible_minor, 0);
  calls.length = 0;
  res = {};
  await platform.handler(
    { method: "POST", headers: {} },
    res,
    new URL("https://lae.test/api/platform/partners/accounting"),
  );
  assert.equal(res.status, 405);
  assert.equal(calls.length, 0);
});

test("quarter history keeps Premium volume at 5 percent when combined with artist volume", async () => {
  const pool = {
    async query(sql, args) {
      assert(sql.includes("AS premium_sales_cents"));
      assert.equal(args[0], "7");
      assert.equal(args[3], "test");
      return {
        rows: [
          {
            period: "2027-Q1",
            qualifying_sales: "2",
            sales_cents: "200000",
            premium_sales_cents: "100000",
            refunded_cents: "0",
            held_cents: "0",
          },
        ],
      };
    },
  };
  const x = await create({ pool }).history(7, {
    quarter: "2027-Q1",
    mode: "test",
  });
  assert.equal(x.quarters[0].potential_reward_cents, 15000);
  assert.equal(x.quarters[0].quarter_start, "2026-12-21");
  assert.equal(x.team_reward_percent, null);
  assert.equal(x.team_rates.premium_listener, 5);
});
