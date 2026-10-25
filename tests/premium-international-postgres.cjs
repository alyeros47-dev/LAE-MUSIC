"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { runtime } = require("./runtime.cjs"),
  { createPremium } = require("../lib/premium-listeners"),
  { createPaystack } = require("../lib/payments/paystack"),
  { createExchangeRates } = require("../lib/exchange-rates"),
  { transaction } = require("../lib/transactions"),
  { approvedPricing } = require("./premium-fixtures.cjs");
module.exports = async (t, { pool }) => {
  const payments = new Map(),
    refunds = new Map();
  let initialized = 0,
    fetches = 0,
    user,
    other,
    artist,
    order,
    quote,
    attempt;
  const key = () => crypto.randomUUID(),
    secret = "sk_test_international_listener_fixture";
  const adapter = createPaystack({
    secretKey: secret,
    merchantId: "international-fixture",
    mode: "test",
    approvedCurrencies: ["USD", "NGN", "GHS", "KES"],
    reviewed: true,
    fetchImpl: async (url, options) => {
      if (url.endsWith("/transaction/initialize")) {
        initialized++;
        const x = JSON.parse(options.body);
        payments.set(x.reference, {
          reference: x.reference,
          domain: "test",
          status: "success",
          id: 1000 + initialized,
          amount: Number(x.amount),
          currency: x.currency,
          metadata: JSON.parse(x.metadata),
        });
        return Response.json({
          status: true,
          data: {
            reference: x.reference,
            authorization_url:
              "https://checkout.paystack.com/international-fixture",
          },
        });
      }
      if (url.includes("/refund/"))
        return Response.json({
          status: true,
          data: refunds.get(url.split("/").at(-1)),
        });
      if (url.includes("/transaction/verify/"))
        return Response.json({
          status: true,
          data: payments.get(url.split("/").at(-1)),
        });
      throw Error("Unexpected fixture request");
    },
  });
  const clock = Math.floor(Date.now() / 1000) * 1000 + 120000,
    fx = createExchangeRates({
      env: {},
      now: () => clock,
      fetchImpl: async () => {
        fetches++;
        return Response.json({
          result: "success",
          base_code: "USD",
          time_last_update_unix: clock / 1000,
          time_next_update_unix: clock / 1000 + 86400,
          rates: { USD: 1, NGN: 1600, GHS: 12, KES: 130, LRD: 180 },
        });
      },
    }),
    rates = {
      snapshot: async () => {
        const s = await fx.snapshot();
        await pool.query(
          "INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [s.id, s.source, s.as_of, s.next_update, JSON.stringify(s.rates)],
        );
        return s;
      },
    };
  const service = createPremium({
      pool,
      rates,
      pricing: approvedPricing(),
      adapters: { paystack: adapter },
      callbackOrigin: "https://lae.test",
    }),
    app = await runtime({ pool, premiumService: service });
  const api = async (path, body, cookie) => {
    const r = await app.request(path, {
      method: body === undefined ? "GET" : "POST",
      body,
      headers: { ...(cookie ? { cookie } : {}), "idempotency-key": key() },
    });
    return {
      status: r.status,
      data: r.json(),
      cookie: (Array.isArray(r.headers["set-cookie"])
        ? r.headers["set-cookie"][0]
        : r.headers["set-cookie"]
      )?.split(";")[0],
    };
  };
  async function register(role, name) {
    const r = await api(
      role === "artist" ? "/api/register" : "/api/listener/register",
      {
        name: "International " + name,
        email: name + "@international-fixture.invalid",
        country: "Ghana",
        password: "InternationalStrongPassword123",
        confirmPassword: "InternationalStrongPassword123",
        plan: "starter",
      },
    );
    assert.equal(r.status, 201);
    return { id: r.data.user.id, cookie: r.cookie };
  }
  await t.test(
    "new USD listener orders snapshot only approved prices and share quote/rate tables with artist purchases",
    async () => {
      artist = await register("artist", "referrer");
      user = await register("listener", "buyer");
      other = await register("listener", "other");
      order = await service.prepare(user.id, key(), {
        plan: "monthly",
        referrer_id: artist.id,
        currency: "NGN",
        amount_minor: 1,
      });
      assert.equal(order.currency, "USD");
      assert.equal(Number(order.amount_minor), 60);
      assert.equal(order.pricing_revision, "isolated-usd-reference-fixture");
      assert.equal(
        (await api("/api/platform/premium/plans")).data.base_currency,
        "USD",
      );
      await assert.rejects(
        pool.query(
          "UPDATE premium_price_catalogs SET document_hash='changed' WHERE revision=$1",
          [order.pricing_revision],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "local quotes use exact shared conversion, ownership and approved alternatives before any provider call",
    async () => {
      await assert.rejects(
        service.prepareQuote(user.id, {
          order_id: order.id,
          provider: "paystack",
          currency: "LRD",
        }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        service.prepareQuote(user.id, {
          order_id: order.id,
          provider: "paystack",
          currency: "USD",
        }),
        (e) => e.status === 409 && e.message.includes("minimum"),
      );
      await assert.rejects(
        service.prepareQuote(other.id, {
          order_id: order.id,
          provider: "paystack",
          currency: "NGN",
        }),
        (e) => e.status === 409,
      );
      quote = await service.prepareQuote(user.id, {
        order_id: order.id,
        provider: "paystack",
        currency: "NGN",
        amount_minor: 1,
        rate: 1,
      });
      assert.equal(quote.base_currency, "USD");
      assert.equal(Number(quote.base_minor), 60);
      assert.equal(Number(quote.charge_minor), 96000);
      assert.equal(quote.rate, "1600");
      assert(quote.rate_snapshot_id);
      assert.equal(initialized, 0);
      assert.equal(
        (
          await pool.query(
            "SELECT premium_order_id,order_id FROM payment_checkout_quotes WHERE id=$1",
            [quote.id],
          )
        ).rows[0].order_id,
        null,
      );
      await assert.rejects(
        pool.query(
          "UPDATE payment_checkout_quotes SET charge_minor=1 WHERE id=$1",
          [quote.id],
        ),
        /append-only/,
      );
      const stolen = await api(
        "/api/platform/premium/checkout",
        { quote_id: quote.id },
        other.cookie,
      );
      assert.equal(stolen.status, 404);
      assert.equal(initialized, 0);
    },
  );
  await t.test(
    "confirmed local charges preserve original evidence and credit USD benefits/commissions exactly once",
    async () => {
      await Promise.all([
        service.checkout(user.id, key(), { quote_id: quote.id }),
        service.checkout(user.id, key(), { quote_id: quote.id }),
      ]);
      assert.equal(initialized, 1);
      attempt = (
        await pool.query("SELECT * FROM premium_attempts WHERE order_id=$1", [
          order.id,
        ])
      ).rows[0];
      assert.equal(attempt.status, "ready");
      const event = Buffer.from(
          JSON.stringify({
            event: "charge.success",
            data: { reference: attempt.reference },
          }),
        ),
        headers = {
          "x-paystack-signature": crypto
            .createHmac("sha512", secret)
            .update(event)
            .digest("hex"),
        };
      const payment = payments.get(attempt.reference);
      payment.amount = 60;
      await assert.rejects(
        service.webhook("paystack", event, headers),
        (e) => e.status === 409,
      );
      payment.amount = 96000;
      await Promise.all([
        service.webhook("paystack", event, headers),
        service.webhook("paystack", event, headers),
      ]);
      const receipt = (
          await pool.query("SELECT * FROM premium_receipts WHERE order_id=$1", [
            order.id,
          ])
        ).rows[0],
        presentment = (
          await pool.query(
            "SELECT * FROM premium_presentments WHERE order_id=$1",
            [order.id],
          )
        ).rows[0];
      assert.equal(receipt.currency, "USD");
      assert.equal(Number(receipt.amount_minor), 60);
      assert.equal(presentment.charge_currency, "NGN");
      assert.equal(Number(presentment.charge_minor), 96000);
      assert.equal(Number(presentment.usd_equivalent_minor), 60);
      assert.equal(presentment.exchange_rate, "1600");
      assert.equal(new Date(presentment.conversion_at).getTime(), clock);
      assert.equal((await service.status(user.id)).active, true);
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT amount_minor FROM premium_commissions WHERE order_id=$1",
              [order.id],
            )
          ).rows[0].amount_minor,
        ),
        6,
      );
      assert.equal(
        await require("../lib/finance").balance(
          pool,
          "artist:" + artist.id + ":premium_pending:test:USD",
        ),
        6,
      );
      assert.equal(
        await require("../lib/finance").balance(
          pool,
          "artist:" + artist.id + ":premium_pending:test:NGN",
        ),
        0,
      );
      await assert.rejects(
        pool.query(
          "UPDATE premium_presentments SET exchange_rate='1' WHERE order_id=$1",
          [order.id],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "actual local fees normalize once at the original quote rate and keep immutable conversion evidence",
    async () => {
      const royalties = require("../lib/streaming-royalties").createRoyalties(
          pool,
        ),
        payload = {
          order_id: order.id,
          fees_minor: 3200,
          tax_minor: 1600,
          cost_currency: "NGN",
          evidence:
            "Isolated original-currency processing statement and tax invoice.",
        },
        requestKey = key();
      await royalties.costs(requestKey, payload);
      await royalties.costs(requestKey, payload);
      const cost = (
          await pool.query(
            "SELECT * FROM premium_payment_costs WHERE order_id=$1",
            [order.id],
          )
        ).rows[0],
        conversion = (
          await pool.query(
            "SELECT * FROM premium_cost_conversions WHERE order_id=$1",
            [order.id],
          )
        ).rows[0];
      assert.equal(Number(cost.fees_minor), 2);
      assert.equal(Number(cost.tax_minor), 1);
      assert.equal(conversion.cost_currency, "NGN");
      assert.equal(Number(conversion.fees_minor), 3200);
      assert.equal(conversion.exchange_rate, "1600");
      assert.equal(fetches, 1);
      await assert.rejects(
        royalties.costs(requestKey, { ...payload, cost_currency: "USD" }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        pool.query(
          "UPDATE premium_cost_conversions SET base_fees_minor=1 WHERE order_id=$1",
          [order.id],
        ),
        /append-only/,
      );
      const rows = await service.affiliate(artist.id);
      assert.equal(rows.commissions[0].currency, "USD");
    },
  );
  await t.test(
    "GHS and KES payment quotes coexist with a clear LRD display-only alternative and expired quotes cannot initialize",
    async () => {
      for (const [currency, expected] of [
        ["GHS", 720],
        ["KES", 7800],
      ]) {
        const o = await service.prepare(other.id, key(), { plan: "monthly" }),
          q = await service.prepareQuote(other.id, {
            order_id: o.id,
            provider: "paystack",
            currency,
          });
        assert.equal(Number(q.charge_minor), expected);
        assert.equal(q.base_currency, "USD");
        const late = createPremium({
          pool,
          pricing: approvedPricing(),
          adapters: { paystack: adapter },
          callbackOrigin: "https://lae.test",
          now: () => Date.now() + 360000,
        });
        await assert.rejects(
          late.checkout(other.id, key(), { quote_id: q.id }),
          (e) => e.status === 409,
        );
      }
      assert.equal(initialized, 1);
      assert.equal(
        service.capabilities().providers[0].currencies.includes("LRD"),
        false,
      );
    },
  );
  await t.test(
    "historical NGN remains a separate immutable royalty book and cannot dilute or change USD statements",
    async () => {
      const royalties = require("../lib/streaming-royalties").createRoyalties(
          pool,
        ),
        before = await royalties.preview("2026-09", "test", "USD"),
        id = crypto.randomUUID(),
        reference = "legacy-" + crypto.randomUUID();
      await transaction(pool, async (db) => {
        await db.query(
          "INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,expires_at) VALUES($1,$2,'monthly','NGN',80000,30,NOW()+INTERVAL '1 hour')",
          [id, other.id],
        );
        await db.query(
          "INSERT INTO premium_attempts(id,order_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,'paystack','historical-fixture','test',$3,'paid')",
          [crypto.randomUUID(), id, reference],
        );
        await db.query(
          "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'paystack','historical-fixture',$2,'test','NGN',80000)",
          [id, reference],
        );
        await db.query(
          "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,'2026-09-01','2026-10-01')",
          [id, other.id],
        );
        await require("../lib/finance").transfer(
          db,
          "legacy-fixture:" + id,
          "isolated_historical_receipt",
          "NGN",
          80000,
          "platform:premium_receivable:test",
          "platform:premium_deferred:test",
        );
      });
      await royalties.costs(key(), {
        order_id: id,
        fees_minor: 0,
        tax_minor: 0,
        evidence:
          "Historical NGN isolated classification; no currency conversion.",
      });
      assert.equal(
        (await royalties.preview("2026-09", "test", "USD")).snapshot_hash,
        before.snapshot_hash,
      );
      const legacy = await royalties.preview("2026-09", "test", "NGN");
      assert.equal(legacy.net_minor, 80000);
      assert.equal(legacy.stream_count, 0);
      const closed = await royalties.finalize(key(), {
        month: "2026-09",
        mode: "test",
        currency: "NGN",
        snapshot_hash: legacy.snapshot_hash,
        review_note:
          "Historical NGN-only fixture; keep separate from USD statements.",
      });
      assert.equal(closed.currency, "NGN");
      assert(
        (
          await pool.query(
            "SELECT DISTINCT currency FROM royalty_statements WHERE month='2026-09' AND mode='test'",
          )
        ).rowCount === 2,
      );
      await assert.rejects(
        service.prepareQuote(other.id, {
          order_id: id,
          provider: "paystack",
          currency: "NGN",
        }),
        (e) => e.status === 409,
      );
    },
  );
  await t.test(
    "small USD prices cap total listener commissions and preserve genuine zero-rounding without fictional payouts",
    async () => {
      const parent = await register("artist", "indirect-parent");
      await pool.query("UPDATE creators SET referred_by=$2 WHERE id=$1", [
        artist.id,
        parent.id,
      ]);
      const purchase = await service.prepare(other.id, key(), {
          plan: "daily",
          referrer_id: artist.id,
        }),
        q = await service.prepareQuote(other.id, {
          order_id: purchase.id,
          provider: "paystack",
          currency: "NGN",
        });
      assert.equal(Number(purchase.amount_minor), 8);
      assert.equal(Number(q.charge_minor), 12800);
      await service.checkout(other.id, key(), { quote_id: q.id });
      const a = (
          await pool.query(
            "SELECT reference FROM premium_attempts WHERE order_id=$1",
            [purchase.id],
          )
        ).rows[0],
        event = Buffer.from(
          JSON.stringify({
            event: "charge.success",
            data: { reference: a.reference },
          }),
        );
      await service.webhook("paystack", event, {
        "x-paystack-signature": crypto
          .createHmac("sha512", secret)
          .update(event)
          .digest("hex"),
      });
      const rows = (
        await pool.query(
          "SELECT * FROM premium_commissions WHERE order_id=$1",
          [purchase.id],
        )
      ).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].level, 1);
      assert.equal(Number(rows[0].amount_minor), 1);
      assert(
        rows.reduce((n, r) => n + Number(r.amount_minor), 0) <=
          Math.floor((8 * 15) / 100),
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_commissions WHERE order_id=$1 AND beneficiary_id=$2",
            [purchase.id, parent.id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "a verified local refund reverses USD accounting once while retaining the original local-currency amount and snapshot",
    async () => {
      const payment = payments.get(attempt.reference);
      refunds.set("9901", {
        id: 9901,
        domain: "test",
        transaction: { id: payment.id },
        currency: "NGN",
        amount: 96000,
        status: "processed",
      });
      await service.reverse(key(), { order_id: order.id, refund_id: "9901" });
      await service.reverse(key(), { order_id: order.id, refund_id: "9901" });
      const base = (
          await pool.query(
            "SELECT * FROM premium_reversals WHERE order_id=$1",
            [order.id],
          )
        ).rows[0],
        raw = (
          await pool.query(
            "SELECT * FROM premium_refund_presentments WHERE order_id=$1",
            [order.id],
          )
        ).rows[0];
      assert.equal(Number(base.amount_minor), 60);
      assert.equal(raw.base_currency, "USD");
      assert.equal(raw.charge_currency, "NGN");
      assert.equal(Number(raw.charge_minor), 96000);
      assert.equal(raw.rate_snapshot_id, quote.rate_snapshot_id);
      assert.equal(raw.exchange_rate, "1600");
      assert.equal((await service.status(user.id)).active, false);
      assert.equal(
        await require("../lib/finance").balance(
          pool,
          "artist:" + artist.id + ":premium_pending:test:USD",
        ),
        1,
      ); // only the separate daily purchase remains
      await assert.rejects(
        pool.query(
          "UPDATE premium_refund_presentments SET charge_minor=1 WHERE order_id=$1",
          [order.id],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "an in-flight historical NGN reference still fulfills without repricing or rewriting the old contract",
    async () => {
      const id = crypto.randomUUID(),
        attemptId = crypto.randomUUID(),
        reference = "laep-" + crypto.randomBytes(18).toString("hex");
      await pool.query(
        "INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,expires_at) VALUES($1,$2,'daily','NGN',10000,1,NOW()+INTERVAL '30 minutes')",
        [id, other.id],
      );
      await pool.query(
        "INSERT INTO premium_attempts(id,order_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,'paystack','international-fixture','test',$3,'ready')",
        [attemptId, id, reference],
      );
      payments.set(reference, {
        reference,
        domain: "test",
        status: "success",
        id: 70001,
        amount: 10000,
        currency: "NGN",
        metadata: { lae_order_id: id, lae_quote_id: attemptId },
      });
      const event = Buffer.from(
        JSON.stringify({ event: "charge.success", data: { reference } }),
      );
      await service.webhook("paystack", event, {
        "x-paystack-signature": crypto
          .createHmac("sha512", secret)
          .update(event)
          .digest("hex"),
      });
      const receipt = (
        await pool.query("SELECT * FROM premium_receipts WHERE order_id=$1", [
          id,
        ])
      ).rows[0];
      assert.equal(receipt.currency, "NGN");
      assert.equal(Number(receipt.amount_minor), 10000);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_entitlements WHERE order_id=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_presentments WHERE order_id=$1",
            [id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await service.prepare(other.id, key(), { plan: "daily" })).currency,
        "USD",
      );
    },
  );
  await t.test(
    "a successful local charge cannot be treated as verified USD cash settlement without treasury conversion evidence",
    async () => {
      const o = await service.prepare(user.id, key(), { plan: "monthly" }),
        q = await service.prepareQuote(user.id, {
          order_id: o.id,
          provider: "paystack",
          currency: "NGN",
        }),
        id = crypto.randomUUID(),
        reference = "isolated-fx-settlement-" + crypto.randomUUID();
      await transaction(pool, async (db) => {
        await db.query(
          "INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,$3,'paystack','international-fixture','live',$4,'paid')",
          [id, o.id, q.id, reference],
        );
        await db.query(
          "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'paystack','international-fixture',$2,'live','USD',60)",
          [o.id, reference],
        );
        await db.query(
          "INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,rate_snapshot_id,exchange_rate,conversion_at) SELECT $1,$2,$3,'USD',60,'NGN',96000,60,q.rate_snapshot_id,s.rates->>'NGN',s.as_of FROM payment_checkout_quotes q JOIN currency_rate_snapshots s ON s.id=q.rate_snapshot_id WHERE q.id=$2",
          [o.id, q.id, id],
        );
        await db.query(
          "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,'2026-06-01','2026-07-01')",
          [o.id, user.id],
        );
        await require("../lib/finance").transfer(
          db,
          "isolated-fx-live-book:" + o.id,
          "isolated_fixture_receipt",
          "USD",
          60,
          "platform:premium_receivable:live:USD",
          "platform:premium_deferred:live:USD",
        );
      });
      const royalties = require("../lib/streaming-royalties").createRoyalties(
        pool,
      );
      await royalties.costs(key(), {
        order_id: o.id,
        fees_minor: 0,
        tax_minor: 0,
        evidence:
          "Isolated live-book fixture only; no actual settlement or provider transport.",
      });
      const x = await royalties.preview("2026-06", "live", "USD"),
        statement = await royalties.finalize(key(), {
          month: "2026-06",
          mode: "live",
          currency: "USD",
          snapshot_hash: x.snapshot_hash,
          review_note:
            "Isolated fixture accounting only; no real money received.",
        });
      const cash = require("../lib/royalty-settlement").createRoyaltySettlement(
        {
          pool,
          verifier: {
            verified: true,
            verifyStatementFunding: async () => [
              {
                orderId: o.id,
                provider: "paystack",
                merchantId: "international-fixture",
                paymentId: reference,
                currency: "USD",
                receivedMinor: 60,
                settlementReference: "unverified-fx-conversion-fixture",
              },
            ],
          },
        },
      );
      await assert.rejects(
        cash.release(key(), { statement_id: statement.id }),
        (e) => e.status === 503 && e.message.includes("treasury conversion"),
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_funding_sources WHERE order_id=$1",
            [o.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_cash_releases WHERE statement_id=$1",
            [statement.id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "Flutterwave Standard uses the same USD listener order and quote while verifying the original KES charge independently",
    async () => {
      let transactionData,
        checks = 0;
      const hash = "isolated_international_flutterwave_secret_123456789";
      const flutterwave =
        require("../lib/payments/flutterwave").createFlutterwave({
          secretKey: "FLWSECK_TEST-isolated_premium_currency_fixture-X",
          secretHash: hash,
          merchantId: "1234",
          reviewed: true,
          mode: "test",
          approvedCurrencies: ["USD", "KES"],
          fetchImpl: async (url, options) => {
            if (url.endsWith("/payments")) {
              const payload = JSON.parse(options.body);
              assert.equal(payload.currency, "KES");
              assert.equal(payload.amount, "78.00");
              transactionData = {
                id: 80001,
                account_id: 1234,
                tx_ref: payload.tx_ref,
                status: "successful",
                currency: "KES",
                amount: payload.amount,
                meta: payload.meta,
              };
              return Response.json({
                status: "success",
                data: {
                  link: "https://checkout.flutterwave.com/v3/hosted/pay/isolated-listener",
                },
              });
            }
            if (url.includes("/transactions/")) {
              checks++;
              return Response.json({
                status: "success",
                data: transactionData,
              });
            }
            throw Error("Unexpected Flutterwave fixture request");
          },
        });
      const international = createPremium({
          pool,
          rates,
          pricing: approvedPricing(),
          adapters: { flutterwave },
          callbackOrigin: "https://lae.test",
        }),
        o = await international.prepare(user.id, key(), { plan: "monthly" }),
        q = await international.prepareQuote(user.id, {
          order_id: o.id,
          provider: "flutterwave",
          currency: "KES",
        });
      assert.equal(Number(q.base_minor), 60);
      assert.equal(Number(q.charge_minor), 7800);
      await international.checkout(user.id, key(), { quote_id: q.id });
      const a = (
          await pool.query("SELECT * FROM premium_attempts WHERE order_id=$1", [
            o.id,
          ])
        ).rows[0],
        event = Buffer.from(
          JSON.stringify({
            event: "charge.completed",
            data: { id: 80001, tx_ref: a.reference },
          }),
        );
      await assert.rejects(
        international.webhook("flutterwave", event, {
          "verif-hash": "incorrect",
        }),
        (e) => e.status === 401,
      );
      assert.equal(checks, 0);
      await international.webhook("flutterwave", event, { "verif-hash": hash });
      assert.equal(checks, 1);
      await assert.rejects(
        international.verify(other.id, a.id),
        (e) => e.status === 404,
      );
      await international.verify(user.id, a.id);
      assert.equal(checks, 2);
      const receipt = (
          await pool.query("SELECT * FROM premium_receipts WHERE order_id=$1", [
            o.id,
          ])
        ).rows[0],
        original = (
          await pool.query(
            "SELECT * FROM premium_presentments WHERE order_id=$1",
            [o.id],
          )
        ).rows[0];
      assert.equal(receipt.currency, "USD");
      assert.equal(Number(receipt.amount_minor), 60);
      assert.equal(original.charge_currency, "KES");
      assert.equal(Number(original.charge_minor), 7800);
      assert.equal(original.exchange_rate, "130");
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_entitlements WHERE order_id=$1",
            [o.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
};
