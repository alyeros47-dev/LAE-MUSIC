"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { runtime } = require("./runtime.cjs"),
  { createPremium } = require("../lib/premium-listeners"),
  { createPaystack } = require("../lib/payments/paystack"),
  { createPlayback } = require("../lib/premium-playback"),
  { createRoyalties } = require("../lib/streaming-royalties"),
  { balance } = require("../lib/finance");
module.exports = async (t, { pool }) => {
  const payments = new Map(),
    refunds = new Map();
  let calls = 0,
    providerId = 100;
  const secret = "sk_test_premium_fixture_authorized_only",
    adapter = createPaystack({
      secretKey: secret,
      merchantId: "premium-fixture",
      mode: "test",
      approvedCurrencies: ["USD", "NGN"],
      reviewed: true,
      fetchImpl: async (url, options) => {
        if (url.endsWith("/transaction/initialize")) {
          calls++;
          const x = JSON.parse(options.body);
          payments.set(x.reference, {
            reference: x.reference,
            amount: Number(x.amount),
            currency: x.currency,
            metadata: JSON.parse(x.metadata),
            id: ++providerId,
            domain: "test",
            status: "success",
          });
          return Response.json({
            status: true,
            data: {
              reference: x.reference,
              authorization_url:
                "https://checkout.paystack.com/premium-fixture",
            },
          });
        }
        if (url.includes("/transaction/verify/"))
          return Response.json({
            status: true,
            data: payments.get(decodeURIComponent(url.split("/").at(-1))),
          });
        if (url.includes("/refund/"))
          return Response.json({
            status: true,
            data: refunds.get(url.split("/").at(-1)),
          });
        throw Error("Unexpected fixture provider call");
      },
    });
  const service = createPremium({
      pool,
      adapters: { paystack: adapter },
      callbackOrigin: "https://lae.test",
      pricing: require("./premium-fixtures.cjs").approvedPricing({
        referenceValues: true,
      }),
    }),
    royalties = createRoyalties(pool),
    env = {
      NODE_ENV: "test",
      ADMIN_KEY: "premium-fixture-owner-key-123456",
      STUDIO_RELEASE_WORKER_ENABLED: "false",
    },
    app = await runtime({ pool, premiumService: service, env });
  async function api(path, { body, cookie, key, headers = {} } = {}) {
    const r = await app.request(path, {
      method: body === undefined ? "GET" : "POST",
      body,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(key ? { "idempotency-key": key } : {}),
        ...headers,
      },
    });
    const c = r.headers["set-cookie"];
    return {
      status: r.status,
      data: r.json(),
      cookie: (Array.isArray(c) ? c[0] : c)?.split(";")[0],
    };
  }
  const key = () => crypto.randomUUID();
  async function register(role, name) {
    const r = await api(
      role === "artist" ? "/api/register" : "/api/listener/register",
      {
        body: {
          name: "Premium " + name,
          email: name + "@premium-ci.invalid",
          country: "Nigeria",
          password: "PremiumStrongPassword123",
          confirmPassword: "PremiumStrongPassword123",
          plan: "starter",
        },
      },
    );
    assert.equal(r.status, 201);
    return { id: r.data.user.id, cookie: r.cookie };
  }
  async function purchase(user, plan = "daily", ref = null) {
    const o = await service.prepare(user.id, key(), { plan, referrer_id: ref });
    const quote = await service.prepareQuote(user.id, {
      order_id: o.id,
      provider: "paystack",
      currency: "USD",
    });
    await service.checkout(user.id, key(), { quote_id: quote.id });
    const a = (
      await pool.query("SELECT * FROM premium_attempts WHERE order_id=$1", [
        o.id,
      ])
    ).rows[0];
    return { o, a, payment: payments.get(a.reference) };
  }
  async function verifyPurchase(purchase) {
    const raw = Buffer.from(
      JSON.stringify({
        event: "charge.success",
        data: { reference: purchase.a.reference },
      }),
    );
    return service.webhook("paystack", raw, {
      "x-paystack-signature": crypto
        .createHmac("sha512", secret)
        .update(raw)
        .digest("hex"),
    });
  }
  let direct,
    leader,
    third,
    user,
    stranger,
    paid,
    track,
    admin,
    statementOrder,
    statement,
    statementPreview;
  await t.test(
    "public USD plans, account isolation and disabled checkout never manufacture entitlements",
    async () => {
      const caps = await api("/api/platform/premium/plans");
      assert.equal(caps.status, 200);
      assert.deepEqual(
        caps.data.plans.map((p) => p.amount_minor),
        [10000, 30000, 80000, 160000, 780000],
      );
      assert.equal(caps.data.automatic_renewal, false);
      direct = await register("artist", "direct");
      leader = await register("artist", "leader");
      third = await register("artist", "third");
      user = await register("listener", "buyer");
      stranger = await register("listener", "stranger");
      await pool.query("UPDATE creators SET referred_by=$2 WHERE id=$1", [
        direct.id,
        leader.id,
      ]);
      assert.equal(
        (
          await api("/api/platform/premium/orders", {
            body: { plan: "daily" },
            key: key(),
          })
        ).status,
        401,
      );
      assert.equal((await service.status(user.id)).active, false);
      await assert.rejects(
        createPremium({ pool }).checkout(user.id, key(), {
          provider: "paystack",
          order_id: crypto.randomUUID(),
        }),
        (e) => [400, 503].includes(e.status),
      );
    },
  );
  await t.test(
    "one permanent checkout reference survives concurrent requests and only independent signed verification activates exact paid time",
    async () => {
      const order = await service.prepare(user.id, key(), {
          plan: "daily",
          referrer_id: direct.id,
        }),
        before = calls;
      const checkoutQuote = await service.prepareQuote(user.id, {
        order_id: order.id,
        provider: "paystack",
        currency: "USD",
      });
      await Promise.all([
        service.checkout(user.id, key(), { quote_id: checkoutQuote.id }),
        service.checkout(user.id, key(), { quote_id: checkoutQuote.id }),
      ]);
      assert.equal(calls - before, 1);
      const a = (
        await pool.query("SELECT * FROM premium_attempts WHERE order_id=$1", [
          order.id,
        ])
      ).rows[0];
      paid = { o: order, a, payment: payments.get(a.reference) };
      assert.equal((await service.status(user.id)).active, false);
      await assert.rejects(
        service.webhook(
          "paystack",
          Buffer.from(
            JSON.stringify({
              event: "charge.success",
              data: { reference: a.reference },
            }),
          ),
          { "x-paystack-signature": "invalid" },
        ),
        (e) => e.status === 401,
      );
      await Promise.all([verifyPurchase(paid), verifyPurchase(paid)]);
      const status = await service.status(user.id);
      assert.equal(status.active, true);
      assert.equal(
        new Date(status.current.expires_at) -
          new Date(status.current.starts_at),
        86400000,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_entitlements WHERE order_id=$1",
            [order.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await api("/api/platform/premium/verify", {
            cookie: stranger.cookie,
            body: { attempt_id: a.id },
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    "actual eligible listener commissions are 10%/5% with no registration reward and existing artist commissions unchanged",
    async () => {
      const rows = (
        await pool.query(
          "SELECT level,amount_minor FROM premium_commissions WHERE order_id=$1 ORDER BY level",
          [paid.o.id],
        )
      ).rows;
      assert.deepEqual(
        rows.map((x) => [x.level, Number(x.amount_minor)]),
        [
          [1, 1000],
          [2, 500],
        ],
      );
      assert.equal(
        require("../lib/plans").professional.directReferralPercent,
        25,
      );
      const noIndirect = await purchase(stranger, "weekly", third.id);
      await verifyPurchase(noIndirect);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_commissions WHERE order_id=$1",
            [noIndirect.o.id],
          )
        ).rows[0].n,
        1,
      );
      const noRef = await purchase(user, "monthly");
      await verifyPurchase(noRef);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_commissions WHERE order_id=$1",
            [noRef.o.id],
          )
        ).rows[0].n,
        0,
      );
      const renewed = await service.status(user.id);
      const terms = renewed.entitlements.sort(
        (a, b) => new Date(a.starts_at) - new Date(b.starts_at),
      );
      assert.equal(
        new Date(terms[1].starts_at).getTime(),
        new Date(terms[0].expires_at).getTime(),
      );
      assert.equal(
        new Date(terms[1].expires_at) - new Date(terms[1].starts_at),
        30 * 86400000,
      );
      const expired = await createPremium({
        pool,
        now: () => Date.now() + 32 * 86400000,
      }).status(user.id);
      assert.equal(expired.active, false);
      assert.equal(expired.entitlements.length, 2);
      const annualBuyer = await register("listener", "annual"),
        annual = await purchase(annualBuyer, "annual");
      await verifyPurchase(annual);
      const annualState = await service.status(annualBuyer.id);
      assert.equal(
        new Date(annualState.current.expires_at) -
          new Date(annualState.current.starts_at),
        365 * 86400000,
      );
    },
  );
  await t.test(
    "amount mismatch and authenticated out-of-order refund notices cannot activate a listener subscription",
    async () => {
      const buyer = await register("listener", "mismatch"),
        bad = await purchase(buyer);
      bad.payment.amount++;
      await assert.rejects(verifyPurchase(bad), (e) => e.status === 409);
      assert.equal((await service.status(buyer.id)).active, false);
      const held = await purchase(buyer);
      const raw = Buffer.from(
        JSON.stringify({
          event: "refund.pending",
          data: { transaction_reference: held.a.reference },
        }),
      );
      await service.webhook("paystack", raw, {
        "x-paystack-signature": crypto
          .createHmac("sha512", secret)
          .update(raw)
          .digest("hex"),
      });
      await assert.rejects(verifyPurchase(held), (e) => e.status === 409);
      assert.equal((await service.status(buyer.id)).active, false);
    },
  );
  await t.test(
    "server-paced playback sessions require 30 seconds, reject seeks/replays and preserve separate popularity classification",
    async () => {
      track = (
        await pool.query(
          "INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Premium eligible fixture','Highlife','isolated/premium.mp3','audio/mpeg',1024,'published',NOW()) RETURNING *",
          [direct.id],
        )
      ).rows[0];
      let time = Date.now();
      const playback = createPlayback({ pool, now: () => time });
      const session = await playback.start(user.id, track.id);
      assert.equal(session.eligible, true);
      let result;
      for (let i = 1; i <= 3; i++) {
        time += 10000;
        result = await playback.heartbeat(user.id, {
          id: session.id,
          sequence: i,
          position: i * 10,
        });
      }
      assert.equal(result.qualified, true);
      await playback.heartbeat(user.id, {
        id: session.id,
        sequence: 3,
        position: 30,
      });
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_streams WHERE playback_id=$1",
            [session.id],
          )
        ).rows[0].n,
        1,
      );
      const next = await playback.start(user.id, track.id);
      await assert.rejects(
        playback.heartbeat(user.id, {
          id: session.id,
          sequence: 4,
          position: 40,
        }),
        (e) => e.status === 409,
      );
      time += 10000;
      assert.equal(
        (
          await playback.heartbeat(user.id, {
            id: next.id,
            sequence: 1,
            position: 400,
          })
        ).qualified,
        false,
      );
      const event = (
        await pool.query(
          "INSERT INTO music_play_events(track_id,artist_id,listener_id,viewer_key,source) VALUES($1,$2,$3,$4,'player') RETURNING id",
          [track.id, direct.id, user.id, "c".repeat(64)],
        )
      ).rows[0];
      assert.equal(
        (
          await pool.query(
            "SELECT audience FROM play_audience_classifications WHERE event_id=$1",
            [event.id],
          )
        ).rows[0].audience,
        "premium",
      );
    },
  );
  async function seedAccounting({
    month = "2026-09",
    days = 30,
    amount = 80000,
    fee = 2000,
    commission = true,
    mode = "test",
  } = {}) {
    const order = await service.prepare(user.id, key(), {
        plan: days === 365 ? "annual" : "monthly",
        referrer_id: commission ? direct.id : null,
      }),
      reference = "laep-" + crypto.randomBytes(18).toString("hex"),
      attempt = crypto.randomUUID(),
      payment = {
        reference,
        amount,
        currency: "USD",
        metadata: { lae_order_id: order.id, lae_quote_id: attempt },
        id: ++providerId,
        domain: "test",
        status: "success",
      };
    payments.set(reference, payment);
    const quote = await service.prepareQuote(user.id, {
      order_id: order.id,
      provider: "paystack",
      currency: "USD",
    });
    payment.metadata.lae_quote_id = quote.id;
    await pool.query(
      "INSERT INTO premium_attempts(id,order_id,provider,merchant_id,mode,reference,status,quote_id) VALUES($1,$2,'paystack','premium-fixture',$4,$3,'paid',$5)",
      [attempt, order.id, reference, mode, quote.id],
    );
    await require("../lib/transactions").transaction(pool, async (db) => {
      await db.query(
        "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'paystack','premium-fixture',$2,$4,'USD',$3)",
        [order.id, reference, amount, mode],
      );
      await db.query(
        "INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,exchange_rate,conversion_at) VALUES($1,$2,$3,'USD',$4,'USD',$4,$4,'1',(SELECT created_at FROM payment_checkout_quotes WHERE id=$2))",
        [order.id, quote.id, attempt, amount],
      );
    });
    const start = new Date(month + "-01T00:00:00Z"),
      end = new Date(start.getTime() + days * 86400000),
      e = (
        await pool.query(
          "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,$3,$4) RETURNING id",
          [order.id, user.id, start, end],
        )
      ).rows[0];
    if (commission)
      for (const [level, id, percent] of [
        [1, direct.id, 10],
        [2, leader.id, 5],
      ])
        await pool.query(
          "INSERT INTO premium_commissions(order_id,beneficiary_id,level,percent,amount_minor) VALUES($1,$2,$3,$4,$5)",
          [order.id, id, level, percent, (amount * percent) / 100],
        );
    await require("../lib/transactions").transaction(pool, (db) =>
      require("../lib/finance").transfer(
        db,
        "premium:" + order.id,
        "premium_verified_sale",
        "USD",
        amount,
        "platform:premium_receivable:" + mode + ":USD",
        "platform:premium_deferred:" + mode + ":USD",
      ),
    );
    if (commission)
      for (const [level, id, percent] of [
        [1, direct.id, 10],
        [2, leader.id, 5],
      ])
        await require("../lib/transactions").transaction(pool, (db) =>
          require("../lib/finance").transfer(
            db,
            "premium:" + order.id + ":commission:" + level,
            "premium_pending_commission",
            "USD",
            (amount * percent) / 100,
            "platform:premium_commission_deferred_cost:" + mode + ":USD",
            "artist:" + id + ":premium_pending:" + mode + ":USD",
            id,
          ),
        );
    await royalties.costs(key(), {
      order_id: order.id,
      fees_minor: fee,
      tax_minor: 0,
      evidence: "Isolated provider statement and tax classification.",
    });
    return { order, payment, e, reference };
  }
  await t.test(
    "actual monthly recognition and universal 50% royalty pool allocate exactly by premium stream ownership",
    async () => {
      statementOrder = await seedAccounting();
      const songs = [];
      for (const [artist, count] of [
        [direct, 5],
        [leader, 3],
        [third, 2],
      ]) {
        const t = (
          await pool.query(
            "INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Monthly royalty fixture','Highlife',$2,'audio/mpeg',1024,'published',NOW()) RETURNING id",
            [artist.id, "isolated/" + artist.id],
          )
        ).rows[0];
        songs.push(t.id);
        for (let i = 0; i < count; i++) {
          const id = crypto.randomUUID();
          await pool.query(
            "INSERT INTO premium_playback(id,listener_id,track_id,artist_id,entitlement_id) VALUES($1,$2,$3,$4,$5)",
            [id, user.id, t.id, artist.id, statementOrder.e.id],
          );
          await pool.query(
            "INSERT INTO premium_streams(playback_id,listener_id,track_id,artist_id,entitlement_id,occurred_at,listened_ms) VALUES($1,$2,$3,$4,$5,'2026-09-10T12:00:00Z',30000)",
            [id, user.id, t.id, artist.id, statementOrder.e.id],
          );
        }
      }
      statementPreview = await royalties.preview("2026-09", "test");
      assert.equal(statementPreview.gross_minor, 80000);
      assert.equal(statementPreview.commissions_minor, 12000);
      assert.equal(statementPreview.net_minor, 66000);
      assert.equal(statementPreview.artist_pool_minor, 33000);
      assert.equal(statementPreview.stream_count, 10);
      assert.equal(statementPreview.royalty_percent, 50);
      assert.deepEqual(
        statementPreview.allocations.map((a) => a.amount_minor),
        [16500, 9900, 6600],
      );
      assert.deepEqual(statementPreview.issues, []);
      await pool.query(
        "INSERT INTO music_play_events(track_id,artist_id,listener_id,viewer_key,source,received_at) SELECT $1,$2,NULL,repeat('a',64),'legacy','2026-09-10T12:00:00Z' FROM generate_series(1,20)",
        [track.id, direct.id],
      );
      assert.equal(
        (await royalties.preview("2026-09", "test")).stream_count,
        10,
      );
    },
  );
  await t.test(
    "concurrent finalization pays no duplicate royalty and sandbox liabilities are never spendable cash",
    async () => {
      const input = {
          month: "2026-09",
          mode: "test",
          snapshot_hash: statementPreview.snapshot_hash,
          review_note:
            "Reviewed fixture costs, ownership, eligibility and fraud exclusions.",
        },
        requestKey = key();
      const [a, b] = await Promise.allSettled([
        royalties.finalize(requestKey, input),
        royalties.finalize(key(), input),
      ]);
      const winner = [a, b].find((x) => x.status === "fulfilled");
      assert(winner);
      assert.equal([a, b].filter((x) => x.status === "fulfilled").length, 1);
      statement = winner.value;
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_statements WHERE month='2026-09' AND mode='test'",
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        await balance(
          pool,
          "artist:" + direct.id + ":royalty_unsettled:test:USD",
        ),
        16500,
      );
      assert.equal(
        await balance(pool, "artist:" + direct.id + ":earned:USD"),
        0,
      );
      await assert.rejects(
        pool.query("UPDATE royalty_statements SET net_minor=1 WHERE id=$1", [
          statement.id,
        ]),
        /append-only/,
      );
      const dashboard = await royalties.artist(direct.id, "2026-09", "test");
      assert.equal(dashboard.royalty_percent, 50);
      assert(dashboard.finalized.some((x) => x.month === "2026-09"));
      assert.equal(dashboard.available_minor, 0);
      const id = (
        await pool.query(
          "SELECT id FROM premium_streams WHERE occurred_at<'2026-10-01' LIMIT 1",
        )
      ).rows[0].id;
      await assert.rejects(
        royalties.exclude(key(), {
          stream_id: id,
          reason: "Late fixture eligibility review.",
        }),
        (e) => e.status === 409,
      );
    },
  );
  await t.test(
    "no-stream revenue remains an auditable liability and zero revenue never creates artificial earnings",
    async () => {
      await seedAccounting({
        month: "2026-08",
        days: 365,
        amount: 780000,
        fee: 0,
        commission: false,
      });
      const x = await royalties.preview("2026-08", "test");
      assert.equal(x.stream_count, 0);
      assert.equal(x.gross_minor, Math.floor((780000 * 31) / 365));
      assert.equal(x.undistributed_minor, x.artist_pool_minor);
      const result = await royalties.finalize(key(), {
        month: "2026-08",
        mode: "test",
        snapshot_hash: x.snapshot_hash,
        review_note:
          "No eligible fixture streams; hold the undistributed liability.",
      });
      assert.equal(result.allocations.length, 0);
      const empty = await royalties.preview("2026-07", "test");
      assert.equal(empty.artist_pool_minor, 0);
    },
  );
  await t.test(
    "verified full refund after finalization appends adjustments and reverses unsettled liabilities without rewriting history",
    async () => {
      refunds.set("7001", {
        id: 7001,
        domain: "test",
        transaction: { id: statementOrder.payment.id },
        currency: "USD",
        amount: 80000,
        status: "processed",
      });
      const before = (
        await pool.query(
          "SELECT snapshot_hash FROM royalty_statements WHERE id=$1",
          [statement.id],
        )
      ).rows[0].snapshot_hash;
      await service.reverse(key(), {
        order_id: statementOrder.order.id,
        refund_id: "7001",
      });
      await service.reverse(key(), {
        order_id: statementOrder.order.id,
        refund_id: "7001",
      });
      assert.equal(
        (
          await pool.query(
            "SELECT snapshot_hash FROM royalty_statements WHERE id=$1",
            [statement.id],
          )
        ).rows[0].snapshot_hash,
        before,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_adjustments WHERE statement_id=$1",
            [statement.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        await balance(pool, "artist:" + direct.id + ":earned:USD"),
        0,
      );
      const rows = (
        await pool.query(
          "SELECT * FROM royalty_recovery_holds WHERE statement_id=$1",
          [statement.id],
        )
      ).rows;
      assert.equal(
        rows.reduce((n, r) => n + Number(r.amount_minor), 0),
        33000,
      );
      assert(rows.every((r) => r.resolution === "unsettled_reversed"));
      assert.equal(
        await balance(
          pool,
          "artist:" + direct.id + ":royalty_unsettled:test:USD",
        ),
        0,
      );
    },
  );
  await t.test(
    "administrator accounting endpoints remain private and ordinary listeners cannot finalize statements",
    async () => {
      assert.equal(
        (await api("/api/platform/admin/royalties", { cookie: user.cookie }))
          .status,
        401,
      );
      const login = await api("/api/admin/login", {
        body: { password: env.ADMIN_KEY },
      });
      admin = login.cookie;
      assert.equal(login.status, 200);
      assert.equal(
        (await api("/api/platform/admin/royalties", { cookie: admin })).status,
        200,
      );
      assert.equal(
        (
          await api("/api/platform/admin/royalties/finalize", {
            cookie: user.cookie,
            key: key(),
            body: {},
          })
        ).status,
        401,
      );
    },
  );
  await t.test(
    "only independently verified live settlement can release finalized royalties, once, without synthetic cash",
    async () => {
      const { createRoyaltySettlement } = require("../lib/royalty-settlement");
      await assert.rejects(
        createRoyaltySettlement({ pool }).release(key(), {
          statement_id: statement.id,
        }),
        (e) => e.status === 503,
      );
      const live = await seedAccounting({ mode: "live", commission: false });
      const id = crypto.randomUUID();
      await pool.query(
        "INSERT INTO premium_playback(id,listener_id,track_id,artist_id,entitlement_id) VALUES($1,$2,$3,$4,$5)",
        [id, user.id, track.id, direct.id, live.e.id],
      );
      await pool.query(
        "INSERT INTO premium_streams(playback_id,listener_id,track_id,artist_id,entitlement_id,occurred_at,listened_ms) VALUES($1,$2,$3,$4,$5,'2026-09-10T12:00:00Z',30000)",
        [id, user.id, track.id, direct.id, live.e.id],
      );
      const x = await royalties.preview("2026-09", "live");
      assert.equal(x.artist_pool_minor, 39000);
      const finalized = await royalties.finalize(key(), {
        month: "2026-09",
        mode: "live",
        snapshot_hash: x.snapshot_hash,
        review_note:
          "Live-book accounting fixture only; all external evidence is simulated.",
      });
      const proof = {
        orderId: live.order.id,
        provider: "paystack",
        merchantId: "premium-fixture",
        paymentId: live.reference,
        currency: "USD",
        receivedMinor: 78000,
        settlementReference: "isolated-bank-settlement-fixture",
      };
      const short = createRoyaltySettlement({
        pool,
        verifier: {
          verified: true,
          verifyStatementFunding: async () => [{ ...proof, receivedMinor: 1 }],
        },
      });
      await assert.rejects(
        short.release(key(), { statement_id: finalized.id }),
        (e) => e.status === 409,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_funding_sources WHERE order_id=$1",
            [live.order.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        await balance(pool, "artist:" + direct.id + ":earned:USD"),
        0,
      );
      const cash = createRoyaltySettlement({
        pool,
        verifier: {
          verified: true,
          verifyStatementFunding: async () => [proof],
        },
      });
      await Promise.all([
        cash.release(key(), { statement_id: finalized.id }),
        cash.release(key(), { statement_id: finalized.id }),
      ]);
      assert.equal(
        await balance(pool, "artist:" + direct.id + ":earned:USD"),
        39000,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_cash_releases WHERE statement_id=$1",
            [finalized.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        await balance(pool, "platform:premium_recognized:live:USD"),
        0,
      );
      assert.equal(
        await balance(pool, "platform:premium_receivable:live:USD"),
        0,
      );
      // A later independently established reversal uses the same internal adjustment path.
      // Live provider transports are intentionally not configured by this test.
      await require("../lib/transactions").transaction(pool, async (db) => {
        await require("../lib/streaming-royalties").lockReceiptPeriods(
          db,
          live.order.id,
        );
        await db.query(
          "INSERT INTO premium_reversals(order_id,provider,merchant_id,refund_id,amount_minor,reason) VALUES($1,'paystack','premium-fixture','isolated-post-settlement-refund',80000,'Independent live-book reversal fixture; no outside provider.')",
          [live.order.id],
        );
        await require("../lib/streaming-royalties").adjustReversal(
          db,
          live.order.id,
        );
      });
      assert.equal(
        await balance(pool, "artist:" + direct.id + ":earned:USD"),
        39000,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM royalty_recovery_holds WHERE statement_id=$1 AND resolution='recovery_required'",
            [finalized.id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        require("../lib/finance").requestWithdrawal(
          pool,
          direct.id,
          key(),
          "USD",
          100,
        ),
        (e) => e.status === 409,
      );
    },
  );
};
