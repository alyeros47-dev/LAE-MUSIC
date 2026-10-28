"use strict";
// Actual disposable PostgreSQL, real checkout/refund services, mocked gateway HTTP.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { create } = require("../lib/partner-accounting");
module.exports = async (
  t,
  { pool, service, api, register, commerce, paid, webhook, payments, refunds },
) => {
  let leader, sponsor, otherSponsor, buyer, secondBuyer, first, second;
  const report = create({ pool });
  async function purchase(who, ref, plan = "growth") {
    const intent = await api("/api/affiliate/prepare-purchase", {
      cookie: who.cookie,
      body: { plan, ref: String(ref.id) },
    });
    assert.equal(intent.status, 200);
    const order = await commerce.create(
      who.id,
      "partner_order_" + crypto.randomUUID(),
      {
        kind: "artist_subscription",
        plan,
        referral_token: intent.data.referral_token,
      },
    );
    const quote = await service.prepare(who.id, {
      order_id: order.id,
      provider: "paystack",
      currency: "NGN",
    });
    const attempt = await service.start(
      who.id,
      "partner_checkout_" + crypto.randomUUID(),
      {
        quote_id: quote.id,
        policy_accepted: true,
        policy_revision: require("../lib/financial-policy").disclosure()
          .revision,
      },
    );
    paid(attempt);
    assert.equal((await webhook(attempt)).data.outcome, "accepted");
    return { order, quote, attempt };
  }
  function refundEvidence(sale, id, amount = Number(sale.quote.charge_minor)) {
    const p = payments.get(sale.attempt.reference).data;
    refunds.set(id, {
      id: Number(id),
      transaction: p.id,
      domain: "test",
      currency: sale.quote.charge_currency,
      amount,
      status: "processed",
    });
  }
  async function invariant(fn) {
    const before = await pool.query(
      "SELECT COUNT(*)::int AS n FROM finance_transfers",
    );
    const value = await fn();
    assert.deepEqual(
      (await pool.query("SELECT COUNT(*)::int AS n FROM finance_transfers"))
        .rows,
      before.rows,
    );
    return value;
  }
  await t.test(
    "partner reconciliation records only verified two-step product volume, keeps original USD/NGN evidence and cannot create earnings",
    async () => {
      [leader, sponsor, otherSponsor, buyer, secondBuyer] = await Promise.all(
        [
          "ledger_leader",
          "ledger_sponsor",
          "ledger_other_sponsor",
          "ledger_buyer",
          "ledger_second_buyer",
        ].map(register),
      );
      await pool.query(
        "UPDATE creators SET referred_by=$1 WHERE id=ANY($2::bigint[])",
        [leader.id, [sponsor.id, otherSponsor.id]],
      );
      first = await purchase(buyer, sponsor);
      second = await purchase(secondBuyer, otherSponsor, "professional");
      const x = await invariant(() =>
        report.overview(leader.id, { mode: "test" }),
      );
      assert.equal(x.rollup.team.eligible_minor, 3000);
      assert.equal(x.team_projection_minor, 300);
      assert.equal(x.team_by_referrer.length, 2);
      assert.equal(x.rollup.direct.eligible_minor, 0);
      assert.equal(x.payouts_enabled, false);
      const row = x.activity.find((x) => x.order_id === first.order.id);
      assert.equal(Number(row.charge_minor), 1600000);
      assert.equal(row.charge_currency, "NGN");
      assert.equal(row.gross_minor, 1000);
      assert.equal(row.exchange_rate, "1600");
      assert(row.conversion_at);
      assert.equal(row.quote_id, first.quote.id);
      const live = await report.overview(leader.id, { mode: "live" });
      assert.equal(live.rollup.team.eligible_minor, 0);
      assert.equal(live.activity.length, 0);
      const direct = await report.overview(sponsor.id, { mode: "test" });
      assert.equal(direct.rollup.direct.recorded_commission_minor, 250);
      assert.equal(direct.rollup.team.eligible_minor, 0);
      await webhook(first.attempt, { repeat_partner_delivery: true });
      assert.equal(
        (await report.overview(leader.id, { mode: "test" })).rollup.team
          .eligible_minor,
        3000,
      );
      // Current recruiting links cannot reassign a historical purchase snapshot.
      await pool.query("UPDATE creators SET referred_by=$1 WHERE id=$2", [
        otherSponsor.id,
        sponsor.id,
      ]);
      assert.equal(
        (await report.overview(leader.id, { mode: "test" })).rollup.team
          .eligible_minor,
        3000,
      );
    },
  );
  await t.test(
    "a purchase directly referred by the leader is not also counted as their team bonus volume",
    async () => {
      const sale = await purchase(sponsor, leader, "starter");
      const x = await report.overview(leader.id, { mode: "test" });
      assert.equal(x.rollup.direct.eligible_minor, 600);
      assert.equal(
        x.rollup.direct.recorded_commission_minor,
        90,
        "Existing 15% Starter contract must not be overwritten before scope approval",
      );
      assert.equal(x.rollup.team.eligible_minor, 3000);
      assert.equal(
        x.activity.filter((x) => x.order_id === sale.order.id).length,
        1,
      );
    },
  );
  await t.test(
    "ordinary users see only their own accounting, while reports reject attempts to post or manufacture a balance",
    async () => {
      const self = await api(
        "/api/platform/partners/accounting?mode=test&artist_id=" + leader.id,
        { cookie: buyer.cookie },
      );
      assert.equal(self.status, 200);
      assert.equal(self.data.rollup.team.eligible_minor, 0);
      assert(!self.data.activity.some((x) => x.order_id === second.order.id));
      assert.equal(
        (await api("/api/platform/partners/accounting?mode=test")).status,
        401,
      );
      assert.equal(
        (
          await api(
            "/api/platform/admin/partners/accounting?artist_id=" + leader.id,
            { cookie: buyer.cookie },
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await api("/api/platform/partners/accounting", {
            cookie: leader.cookie,
            body: { team_projection_minor: 1000000, paid: true },
          })
        ).status,
        405,
      );
    },
  );
  await t.test(
    "an unresolved refund complaint holds related volume without treating a claim as returned money",
    async () => {
      const requested = await api(
        "/api/platform/purchases/" + first.order.id + "/refund",
        {
          cookie: buyer.cookie,
          key: "partner_refund_" + crypto.randomUUID(),
          body: {
            reason: "Review this isolated test purchase refund request.",
          },
        },
      );
      assert.equal(requested.status, 201);
      const x = await invariant(() =>
        report.overview(leader.id, { mode: "test" }),
      );
      assert.equal(x.rollup.team.gross_minor, 3000);
      assert.equal(x.rollup.team.refund_minor, 0);
      assert.equal(x.rollup.team.held_minor, 1000);
      assert.equal(x.rollup.team.eligible_minor, 2000);
      assert.equal(x.team_projection_minor, 200);
    },
  );
  await t.test(
    "independently verified full refund excludes the original USD volume once and preserves the immutable local charge",
    async () => {
      refundEvidence(first, "31001");
      await service.refunds.verify(
        first.order.id,
        "partner_refund_verify_" + crypto.randomUUID(),
        { refund_id: "31001" },
      );
      const x = await invariant(() =>
        report.overview(leader.id, { mode: "test" }),
      );
      assert.equal(x.rollup.team.gross_minor, 3000);
      assert.equal(x.rollup.team.refund_minor, 1000);
      assert.equal(x.rollup.team.held_minor, 0);
      assert.equal(x.rollup.team.eligible_minor, 2000);
      assert.equal(x.team_projection_minor, 200);
      const row = x.activity.find((x) => x.order_id === first.order.id);
      assert.equal(Number(row.charge_minor), 1600000);
      assert.equal(row.reversed, true);
      assert.equal(row.eligible_minor, 0);
      const repeated = await report.overview(leader.id, { mode: "test" });
      assert.equal(repeated.rollup.team.refund_minor, 1000);
      assert.equal(
        (await report.overview(sponsor.id, { mode: "test" })).rollup.direct
          .recorded_commission_minor,
        0,
      );
    },
  );
  await t.test(
    "verified partial refunds remain held for reconciliation without inventing a pro-rated commission or royalty correction",
    async () => {
      refundEvidence(second, "31002", Number(second.quote.charge_minor) / 2);
      await service.refunds.verify(
        second.order.id,
        "partner_partial_verify_" + crypto.randomUUID(),
        { refund_id: "31002" },
      );
      const x = await invariant(() =>
        report.overview(leader.id, { mode: "test" }),
      );
      assert.equal(x.rollup.team.refund_minor, 1000);
      assert.equal(x.rollup.team.held_minor, 2000);
      assert.equal(x.rollup.team.eligible_minor, 0);
      assert.equal(x.team_projection_minor, 0);
      assert.equal(x.payouts_enabled, false);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM payment_product_reversals WHERE order_id=$1",
            [second.order.id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "quarter scopes exclude other periods, account signup and practice sales cannot manufacture verified team volume",
    async () => {
      const x = await report.overview(leader.id, {
        quarter: "2020-Q1",
        mode: "test",
      });
      assert.equal(x.rollup.team.eligible_minor, 0);
      assert.equal(x.activity.length, 0);
      const newcomer = await register("ledger_signup_only");
      await pool.query("UPDATE creators SET referred_by=$1 WHERE id=$2", [
        sponsor.id,
        newcomer.id,
      ]);
      await require("../lib/partner-practice")
        .create(pool)
        .record(leader.id, {
          plan: "professional",
          reference: "partner_demo_" + crypto.randomUUID(),
          confirm_demo: true,
        });
      assert.equal(
        (await report.overview(leader.id, { mode: "test" })).rollup.team.sales,
        2,
      );
    },
  );
  await t.test(
    "studio purchases retain zero direct commission and only the exact second-step leader receives team performance",
    async () => {
      const third = await register("ledger_studio_buyer");
      await pool.query("UPDATE creators SET referred_by=$1 WHERE id=$2", [
        otherSponsor.id,
        third.id,
      ]);
      await purchase(third, otherSponsor);
      const order = await commerce.create(
        third.id,
        "quarter_studio_" + crypto.randomUUID(),
        { kind: "studio_generation", plan: "growth" },
      );
      const quote = await service.prepare(third.id, {
        order_id: order.id,
        provider: "paystack",
        currency: "NGN",
      });
      const attempt = await service.start(
        third.id,
        "quarter_studio_checkout_" + crypto.randomUUID(),
        {
          quote_id: quote.id,
          policy_accepted: true,
          policy_revision: require("../lib/financial-policy").disclosure()
            .revision,
        },
      );
      paid(attempt);
      await webhook(attempt);
      const x = await report.overview(leader.id, { mode: "test" });
      assert.equal(x.rollup.team.eligible_minor, 1250);
      assert.equal(x.team_projection_minor, 125);
      const studio = x.activity.find((x) => x.order_id === order.id);
      assert.equal(studio.source, "studio");
      assert.equal(studio.commission_minor, 0);
      assert.equal(studio.eligible_minor, 250);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM affiliate_subscription_commissions c JOIN commerce_orders o ON o.subscription_id=c.subscription_id WHERE o.artist_id=$1",
            [third.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "only the second-step ancestor can finalize a closed period once; unresolved or later reversals cannot become cash",
    async () => {
      const grandchild = await register("ledger_three_steps");
      const sale = await purchase(grandchild, sponsor);
      assert.equal(
        (await report.overview(leader.id, { mode: "test" })).rollup.team
          .eligible_minor,
        1250,
        "A third-step ancestor must not earn this sale",
      );
      const { create: statements } = require("../lib/partner-statements"),
        quarter = require("../lib/partner-policy").periodForSale(new Date()),
        future = new Date(new Date().getUTCFullYear() + 1, 3, 2);
      const serviceStatements = statements({ pool, now: () => future }),
        principal = { role: "finance", source: "shared_key" };
      await assert.rejects(
        statements({ pool }).finalize(principal, {
          artist_id: otherSponsor.id,
          quarter,
          mode: "test",
          note: "No early calendar closure for this statement.",
        }),
        (e) => e.status === 409,
      );
      const preview = await serviceStatements.preview(otherSponsor.id, {
        quarter,
        mode: "test",
      });
      assert.equal(preview.rollup.team.eligible_minor, 1000);
      assert.equal(preview.can_finalize, true);
      const input = {
        artist_id: otherSponsor.id,
        quarter,
        mode: "test",
        snapshot_hash: preview.statement_snapshot_hash,
        note: "Reviewed exact two-step verified receipts and original currencies.",
      };
      await assert.rejects(
        serviceStatements.finalize(
          { role: "support", source: "shared_key" },
          input,
        ),
        (e) => e.status === 403,
      );
      const results = await Promise.all([
        serviceStatements.finalize(principal, input),
        serviceStatements.finalize(principal, input),
      ]);
      assert.equal(results.filter((x) => x.replayed).length, 1);
      assert.equal(results[0].statement.id, results[1].statement.id);
      assert.equal(Number(results[0].statement.bonus_minor), 100);
      assert.equal(results[0].funds_sent, false);
      const account =
        "artist:" + otherSponsor.id + ":quarter_unsettled:test:USD";
      assert.equal(await require("../lib/finance").balance(pool, account), 100);
      assert.equal(
        await require("../lib/finance").balance(
          pool,
          "artist:" + otherSponsor.id + ":earned:USD",
        ),
        0,
      );
      await assert.rejects(
        pool.query(
          "UPDATE partner_bonus_statements SET bonus_minor=999 WHERE id=$1",
          [results[0].statement.id],
        ),
        /append-only/,
      );
      refundEvidence(sale, "31003");
      await service.refunds.verify(
        sale.order.id,
        "quarter_late_refund_" + crypto.randomUUID(),
        { refund_id: "31003" },
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM partner_bonus_review_holds WHERE statement_id=$1",
            [results[0].statement.id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        serviceStatements.finalize(principal, input),
        (e) => e.status === 409,
      );
      await assert.rejects(
        serviceStatements.releaseCash(),
        (e) => e.status === 503,
      );
      assert.equal(
        await require("../lib/finance").balance(pool, account),
        100,
        "A later dispute is held for review, not silently clawed back",
      );
    },
  );
  await t.test(
    "a registered direct referral is retained without another product-link click and cannot be reassigned while payment is pending",
    async () => {
      const customer = await register("ledger_automatic_direct");
      await pool.query("UPDATE creators SET referred_by=$1 WHERE id=$2", [
        leader.id,
        customer.id,
      ]);
      const order = await commerce.create(
        customer.id,
        "automatic_order_" + crypto.randomUUID(),
        { kind: "artist_subscription", plan: "starter" },
      );
      const snapshot = (
        await pool.query(
          "SELECT * FROM commerce_order_referral_snapshots WHERE order_id=$1",
          [order.id],
        )
      ).rows[0];
      assert.equal(String(snapshot.direct_referrer_id), String(leader.id));
      assert.equal(snapshot.team_leader_id, null);
      await pool.query("UPDATE creators SET referred_by=$1 WHERE id=$2", [
        otherSponsor.id,
        customer.id,
      ]);
      const quote = await service.prepare(customer.id, {
          order_id: order.id,
          provider: "paystack",
          currency: "NGN",
        }),
        attempt = await service.start(
          customer.id,
          "automatic_checkout_" + crypto.randomUUID(),
          {
            quote_id: quote.id,
            policy_accepted: true,
            policy_revision: require("../lib/financial-policy").disclosure()
              .revision,
          },
        );
      paid(attempt);
      await webhook(attempt);
      const c = (
        await pool.query(
          "SELECT referrer_id,amount_cents FROM affiliate_subscription_commissions WHERE subscription_id=(SELECT subscription_id FROM commerce_orders WHERE id=$1)",
          [order.id],
        )
      ).rows;
      assert.equal(c.length, 1);
      assert.equal(String(c[0].referrer_id), String(leader.id));
      assert.equal(Number(c[0].amount_cents), 90);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM affiliate_team_sales WHERE subscription_id=(SELECT subscription_id FROM commerce_orders WHERE id=$1)",
            [order.id],
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(
        pool.query(
          "UPDATE commerce_order_referral_snapshots SET direct_referrer_id=$2 WHERE order_id=$1",
          [order.id, otherSponsor.id],
        ),
        /append-only/,
      );
    },
  );
};
