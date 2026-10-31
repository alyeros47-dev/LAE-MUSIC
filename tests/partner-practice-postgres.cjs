"use strict";
const assert = require("node:assert/strict");
module.exports = async (t, { pool, api }) => {
  await t.test(
    "commission practice persists separately and cannot alter real sales, earnings or entitlements",
    async () => {
      async function register(name) {
        const x = await api("/api/register", {
          method: "POST",
          body: {
            name,
            country: "Nigeria",
            email: name + "@practice-ci.invalid",
            password: "PracticeFixturePassword123",
            confirmPassword: "PracticeFixturePassword123",
            plan: "starter",
          },
        });
        assert.equal(x.status, 201);
        return x;
      }
      const who = await register("practice_owner"),
        other = await register("practice_other");
      const before = (
        await pool.query(
          "SELECT (SELECT COUNT(*) FROM affiliate_subscription_commissions) AS commissions,(SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COUNT(*) FROM artist_subscriptions) AS packages",
        )
      ).rows[0];
      const input = {
        plan: "starter",
        reference: "practice_postgres_123",
        confirm_demo: true,
      };
      assert.equal((await api("/api/platform/partners/practice")).status, 401);
      const results = await Promise.all(
        [1, 2].map(() =>
          api("/api/platform/partners/practice", {
            method: "POST",
            cookie: who.cookie,
            body: input,
          }),
        ),
      );
      for (const x of results) {
        assert.equal(x.status, 200);
        assert.equal(x.data.demo, true);
        assert.equal(Number(x.data.sale.commission_minor), 90);
      }
      assert.equal(results.filter((x) => x.data.replayed).length, 1);
      const list = await api("/api/platform/partners/practice", {
        cookie: who.cookie,
      });
      assert.equal(list.data.sales.length, 1);
      assert.match(list.data.disclosure, /No payment was received/);
      assert.equal(
        (await api("/api/platform/partners/practice", { cookie: other.cookie }))
          .data.sales.length,
        0,
      );
      assert.equal(
        (
          await api("/api/platform/partners/practice", {
            method: "POST",
            cookie: who.cookie,
            body: { ...input, plan: "growth" },
          })
        ).status,
        409,
      );
      const caps=(await api('/api/platform/capabilities')).data;assert.equal(caps.affiliate_demo,true);assert.equal(caps.payments,false);
      const example={product:'premium:monthly',depth:'2',payment_state:'verified',sale_date:'2026-12-21'};
      assert.equal((await api('/api/platform/partners/practice/preview',{method:'POST',body:example})).status,401);
      assert.equal((await api('/api/platform/partners/practice/preview',{cookie:who.cookie})).status,405);
      const simulated=await api('/api/platform/partners/practice/preview',{method:'POST',cookie:who.cookie,body:example});
      assert.equal(simulated.status,200);assert.equal(simulated.data.team.period,'2027-Q1');assert.equal(simulated.data.your_team_projection_minor,3);assert.equal(simulated.data.actual_withdrawable_minor,0);
      assert.equal((await api('/api/platform/partners/practice/preview',{method:'POST',cookie:who.cookie,body:{...example,commission_minor:9999}})).status,400);
      const after = (
        await pool.query(
          "SELECT (SELECT COUNT(*) FROM affiliate_subscription_commissions) AS commissions,(SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COUNT(*) FROM artist_subscriptions) AS packages",
        )
      ).rows[0];
      assert.deepEqual(after, before);
    },
  );
};
