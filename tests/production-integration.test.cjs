"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
    audit,
    serviceValid,
    inventory,
  } = require("../scripts/audit-existing-service.cjs"),
  practice = require("../lib/partner-practice");
const service = {
  id: "srv-existingonly123",
  name: "LAE-MUSIC",
  type: "web_service",
  repo: "https://github.com/alyeros47-dev/LAE-MUSIC",
  branch: "main",
  serviceDetails: { url: "https://lae-music.onrender.com", runtime: "node" },
};
test("existing-service audit accepts only the identified production target and rejects ambiguous environment inventories", () => {
  assert(serviceValid(service));
  for (const s of [
    { ...service, name: "lae-music-review-sandbox" },
    { ...service, repo: "https://github.com/other/repo" },
    { ...service, serviceDetails: { url: "https://other.onrender.com" } },
  ])
    assert(!serviceValid(s));
  assert.throws(() =>
    inventory([
      { key: "X", value: "a" },
      { key: "X", value: "b" },
    ]),
  );
});
test("production audit performs GET and read-only SQL without publishing secret values", async () => {
  const calls = [],
    queries = [],
    env = {
      DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:55432/fixture",
      R2_SECRET_ACCESS_KEY: "private-fixture-never-output",
      OPENAI_API_KEY: "secret-fixture-not-output",
    };
  const client = {
    async query(sql, args) {
      queries.push(sql);
      assert(/^(SELECT|BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(sql));
      if (sql.includes("FROM unnest"))
        return { rows: [{ name: "platform_migrations", present: false }] };
      if (sql.includes("to_regclass")) return { rows: [{ present: true }] };
      if (sql.includes("COUNT(*)")) return { rows: [{ n: "2" }] };
      return { rows: [] };
    },
    release() {},
  };
  const report = await audit({
    key: "read-fixture",
    fetcher: async (url, opt) => {
      calls.push({ url, method: opt.method });
      assert.equal(opt.method, "GET");
      let body;
      if (url.endsWith("/env-vars"))
        body = Object.entries(env).map(([key, value]) => ({ key, value }));
      else if (url.includes("/deploys?"))
        body = [{ deploy: { status: "live", commit: { id: "fixture" } } }];
      else body = [{ service }];
      return new Response(JSON.stringify(body));
    },
    dbFactory: () => ({ connect: async () => client, end: async () => {} }),
  });
  assert.equal(report.production_writes, 0);
  assert.equal(report.environment_unchanged, true);
  assert.equal(report.configuration_values_exposed, false);
  assert.equal(report.database.status, "blocked");
  assert(!JSON.stringify(report).includes("private-fixture-never-output"));
  assert(!JSON.stringify(report).includes("secret-fixture-not-output"));
  assert(calls.every((c) => c.method === "GET"));
  assert(queries.some((q) => q.includes("READ ONLY")));
});
test("practice examples use approved product rates and cannot mint real commissions", async () => {
  for (const [plan, cents] of [
    ["starter", 90],
    ["growth", 250],
    ["professional", 500],
  ])
    assert.equal(practice.quote(plan).commission_minor, cents);
  assert.throws(() => practice.quote("constructor"));
  let inserts = 0;
  const rows = new Map(),
    pool = {
      connect: async () => ({
        query: async (sql, args = []) => {
          assert(
            !/finance_|artist_subscriptions|affiliate_subscription_commissions|generation_wallets|commerce_receipts/.test(
              sql,
            ),
          );
          if (sql.startsWith("SELECT id")) return { rowCount: 1, rows: [{}] };
          if (sql.startsWith("SELECT * FROM partner"))
            return {
              rowCount: rows.has(args[1]) ? 1 : 0,
              rows: rows.has(args[1]) ? [rows.get(args[1])] : [],
            };
          if (sql.startsWith("SELECT COUNT")) return { rows: [{ n: inserts }] };
          if (sql.startsWith("INSERT")) {
            inserts++;
            const x = {
              id: args[0],
              reference: args[2],
              plan: args[3],
              base_minor: args[4],
              commission_minor: args[5],
            };
            rows.set(args[2], x);
            return { rows: [x] };
          }
          return { rows: [] };
        },
        release() {},
      }),
    };
  const api = practice.create(pool),
    input = {
      plan: "starter",
      reference: "practice_fixture_123",
      confirm_demo: true,
    };
  await assert.rejects(
    api.record(7, { ...input, confirm_demo: false }),
    (e) => e.status === 400,
  );
  const one = await api.record(7, input),
    two = await api.record(7, input);
  assert.equal(one.demo, true);
  assert.equal(two.replayed, true);
  assert.equal(inserts, 1);
  await assert.rejects(
    api.record(7, { ...input, plan: "growth" }),
    (e) => e.status === 409,
  );
});
