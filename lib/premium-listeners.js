"use strict";
const crypto = require("node:crypto");
const { fail, transaction, idempotent, audit } = require("./transactions"),
  { transfer } = require("./finance");
const money = require("./currency"),
  pricingPolicy = require("./premium-pricing"),
  books = require("./premium-books");
const policy = require("./premium-policy"),
  { uuid } = require("./premium-utils");
function createPremium({
  pool,
  adapters = {},
  callbackOrigin = "",
  now = Date.now,
  rates,
  pricing,
} = {}) {
  const account = (name) =>
    ["paystack", "flutterwave"].includes(name) &&
    adapters[name]?.verified === true &&
    adapters[name].mode === "test" &&
    adapters[name].currencies.length > 0
      ? adapters[name]
      : null;
  const capabilities = () => ({
    currency: "USD",
    base_currency: "USD",
    price_status: pricingPolicy.catalog(pricing).status,
    pricing_revision: pricingPolicy.catalog(pricing).revision,
    plans: pricingPolicy.catalog(pricing).plans,
    providers: ["paystack", "flutterwave"]
      .filter((p) => account(p))
      .map((p) => ({ id: p, currencies: account(p).currencies })),
    automatic_renewal: false,
    live_payments: false,
    benefits: [
      "Ad-free playback without advertising interruptions",
      "Premium badge and subscription records",
      "Detailed Premium listening insights",
      "Qualifying Premium listening informs the artist royalty pool",
    ],
    rights_notice:
      "A subscription does not grant commercial or public-performance rights.",
  });
  async function prepare(listenerId, key, input) {
    const catalog = pricingPolicy.catalog(pricing);
    if (!catalog.approved)
      throw fail(503, "Premium Listener USD base prices await owner approval.");
    const p = catalog.plans.find((p) => p.code === input?.plan);
    if (!p) throw fail(400, "Choose a Premium Listener package.");
    const ref = input?.referrer_id ? String(input.referrer_id) : null;
    if (ref && !/^[1-9][0-9]{0,15}$/.test(ref))
      throw fail(400, "Invalid product referral.");
    return transaction(pool, (db) =>
      idempotent(
        db,
        "premium-order:" + listenerId,
        key,
        { plan: p.code, ref, pricing_revision: catalog.revision },
        async () => {
          const u = (
            await db.query(
              "SELECT id,email FROM listeners WHERE id=$1 FOR UPDATE",
              [listenerId],
            )
          ).rows[0];
          if (!u) throw fail(401, "Listener sign-in required.");
          const count = await db.query(
            "SELECT COUNT(*)::int AS n FROM premium_orders o WHERE listener_id=$1 AND expires_at>NOW() AND NOT EXISTS(SELECT 1 FROM premium_receipts r WHERE r.order_id=o.id)",
            [listenerId],
          );
          if (count.rows[0].n >= 10)
            throw fail(
              429,
              "Review your existing Premium purchase records first.",
            );
          let indirect = null;
          if (ref) {
            const r = (
              await db.query(
                "SELECT id,email,referred_by FROM creators WHERE id=$1",
                [ref],
              )
            ).rows[0];
            if (!r || r.email.toLowerCase() === u.email.toLowerCase())
              throw fail(
                400,
                "Choose an eligible affiliate other than your own account.",
              );
            if (r.referred_by && String(r.referred_by) !== ref) {
              const parent = (
                await db.query("SELECT id,email FROM creators WHERE id=$1", [
                  r.referred_by,
                ])
              ).rows[0];
              if (
                parent &&
                parent.email.toLowerCase() !== u.email.toLowerCase()
              )
                indirect = parent.id;
            }
          }
          await pricingPolicy.recordApproval(db, catalog);
          const r = await db.query(
            "INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,referrer_id,indirect_id,expires_at,pricing_revision) VALUES($1,$2,$3,'USD',$4,$5,$6,$7,NOW()+INTERVAL '30 minutes',$8) RETURNING *",
            [
              crypto.randomUUID(),
              listenerId,
              p.code,
              p.amount_minor,
              p.days,
              ref,
              indirect,
              catalog.revision,
            ],
          );
          await audit(
            db,
            { type: "listener", id: listenerId },
            "premium.order",
            r.rows[0].id,
          );
          return r.rows[0];
        },
      ),
    );
  }
  async function active(listenerId) {
    return (
      (
        await pool.query(
          "SELECT e.id,e.starts_at,e.expires_at,o.plan,r.mode FROM premium_entitlements e JOIN premium_orders o ON o.id=e.order_id JOIN premium_receipts r ON r.order_id=e.order_id WHERE e.listener_id=$1 AND e.starts_at<=$2 AND e.expires_at>$2 AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=e.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=e.order_id) ORDER BY e.expires_at DESC LIMIT 1",
          [listenerId, new Date(now())],
        )
      ).rows[0] || null
    );
  }
  async function status(listenerId) {
    const [terms, orders] = await Promise.all([
      pool.query(
        "SELECT e.*,o.plan,r.mode,rev.order_id IS NOT NULL AS reversed,EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=e.order_id) AS held FROM premium_entitlements e JOIN premium_orders o ON o.id=e.order_id JOIN premium_receipts r ON r.order_id=e.order_id LEFT JOIN premium_reversals rev ON rev.order_id=e.order_id WHERE e.listener_id=$1 ORDER BY e.starts_at DESC LIMIT 100",
        [listenerId],
      ),
      pool.query(
        "SELECT o.*,a.id AS attempt_id,a.provider,a.reference,a.status AS checkout_status,a.checkout_url,r.verified_at,r.mode,q.charge_currency,q.charge_minor,q.expires_at AS quote_expires_at FROM premium_orders o LEFT JOIN premium_attempts a ON a.order_id=o.id LEFT JOIN premium_receipts r ON r.order_id=o.id LEFT JOIN payment_checkout_quotes q ON q.id=a.quote_id WHERE o.listener_id=$1 ORDER BY o.created_at DESC LIMIT 100",
        [listenerId],
      ),
    ]);
    const current =
      terms.rows.find(
        (e) =>
          !e.reversed &&
          !e.held &&
          new Date(e.starts_at).getTime() <= now() &&
          new Date(e.expires_at).getTime() > now(),
      ) || null;
    const streams = await pool.query(
      "SELECT COUNT(*)::int AS premium_streams,COUNT(DISTINCT track_id)::int AS songs FROM premium_streams WHERE listener_id=$1 AND occurred_at>=date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
      [listenerId],
    );
    return {
      active: !!current,
      current,
      entitlements: terms.rows,
      orders: orders.rows,
      activity: streams.rows[0],
      automatic_renewal: false,
    };
  }
  async function prepareQuote(listenerId, input) {
    if (!uuid(input?.order_id))
      throw fail(400, "Choose your Premium purchase record.");
    const a = account(input.provider);
    money.currencyCode(input.currency);
    if (!a || !a.currencies.includes(input.currency))
      throw fail(
        409,
        "This merchant cannot charge that currency. Choose one of the supported payment alternatives.",
      );
    const snapshot = input.currency === "USD" ? null : await rates?.snapshot();
    if (input.currency !== "USD" && !snapshot?.rates[input.currency])
      throw fail(
        503,
        "A current exchange rate is unavailable. Choose a supported USD payment option.",
      );
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
        listenerId,
      ]);
      const order = (
        await db.query(
          "SELECT * FROM premium_orders WHERE id=$1 AND listener_id=$2 FOR UPDATE",
          [input.order_id, listenerId],
        )
      ).rows[0];
      if (
        !order ||
        order.currency !== "USD" ||
        new Date(order.expires_at) <= new Date(now()) ||
        (
          await db.query("SELECT 1 FROM premium_attempts WHERE order_id=$1", [
            order.id,
          ])
        ).rowCount
      )
        throw fail(
          409,
          "This purchase is unavailable or already has a permanent payment reference.",
        );
      const q = await require("./payments/quotes").insertQuote(db, {
        order,
        provider: a.name,
        currency: input.currency,
        snapshot,
        premium: true,
      });
      if (
        a.name === "paystack" &&
        ((q.charge_currency === "USD" && Number(q.charge_minor) < 200) ||
          (q.charge_currency === "NGN" && Number(q.charge_minor) < 5000))
      )
        throw fail(
          409,
          "This amount is below the Paystack currency minimum. Choose another supported currency or provider.",
        );
      return {
        ...q,
        rate: snapshot?.rates[input.currency] || "1",
        conversion_at: snapshot?.as_of || q.created_at,
        final_amount: money.format(Number(q.charge_minor), q.charge_currency),
        notice:
          "Review this final payment amount before creating a payment reference. No money was charged.",
      };
    });
  }
  async function checkout(listenerId, key, input) {
    if (!uuid(input?.quote_id))
      throw fail(400, "Review a server-issued final payment quote first.");
    let claim;
    const saved = await transaction(pool, (db) =>
      idempotent(
        db,
        "premium-checkout:" + listenerId,
        key,
        { quote_id: input.quote_id },
        async () => {
          await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
            listenerId,
          ]);
          const q = (
            await db.query(
              "SELECT q.*,o.listener_id,o.expires_at AS order_expires_at,l.email FROM payment_checkout_quotes q JOIN premium_orders o ON o.id=q.premium_order_id JOIN listeners l ON l.id=o.listener_id WHERE q.id=$1 AND o.listener_id=$2 FOR UPDATE OF o",
              [input.quote_id, listenerId],
            )
          ).rows[0];
          if (!q) throw fail(404, "Your Premium quote is unavailable.");
          const old = (
            await db.query("SELECT * FROM premium_attempts WHERE order_id=$1", [
              q.premium_order_id,
            ])
          ).rows[0];
          if (old) {
            if (old.quote_id !== q.id)
              throw fail(
                409,
                "Reconcile the existing payment reference before changing provider or currency.",
              );
            return old;
          }
          const a = account(q.provider);
          if (!a || !a.currencies.includes(q.charge_currency))
            throw fail(503, "This payment account or currency is unavailable.");
          if (
            new Date(q.expires_at) <= new Date(now()) ||
            new Date(q.order_expires_at) <= new Date(now())
          )
            throw fail(
              409,
              "The final payment quote expired. Review a fresh quote.",
            );
          const saved = (
            await db.query(
              "INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference) VALUES($1,$2,$3,$4,$5,'test',$6) RETURNING *",
              [
                crypto.randomUUID(),
                q.premium_order_id,
                q.id,
                a.name,
                a.merchantId,
                "laep-" + crypto.randomBytes(18).toString("hex"),
              ],
            )
          ).rows[0];
          claim = { saved, a, q: { ...q, order_id: q.premium_order_id } };
          return saved;
        },
      ),
    );
    if (claim) {
      try {
        const { a, q } = claim,
          result = await a.initializeCheckout({
            quote: q,
            email: q.email,
            reference: saved.reference,
            callback: new URL("/premium?payment=" + saved.id, callbackOrigin)
              .href,
          });
        if (result.reference !== saved.reference)
          throw Error("Provider reference mismatch");
        const url = require("./payments/common").redirectUrl(
          result.url,
          a.name === "paystack"
            ? ["checkout.paystack.com"]
            : ["checkout.flutterwave.com"],
        );
        await pool.query(
          "UPDATE premium_attempts SET status='ready',checkout_url=$2,updated_at=NOW() WHERE id=$1 AND status='initializing'",
          [saved.id, url],
        );
      } catch {
        await pool.query(
          "UPDATE premium_attempts SET status='review',updated_at=NOW() WHERE id=$1 AND status='initializing'",
          [saved.id],
        );
      }
    }
    return (await status(listenerId)).orders.find(
      (o) => o.id === saved.order_id,
    );
  }
  async function accept(adapter, payment) {
    if (
      !account(adapter.name) ||
      payment.mode !== adapter.mode ||
      payment.merchantId !== adapter.merchantId ||
      payment.status !== "paid" ||
      !uuid(payment.orderId) ||
      !uuid(payment.quoteId)
    )
      throw fail(
        409,
        "Verified Premium payment evidence does not match this account.",
      );
    return transaction(pool, async (db) => {
      const identity = (
        await db.query("SELECT listener_id FROM premium_orders WHERE id=$1", [
          payment.orderId,
        ])
      ).rows[0];
      if (!identity) throw fail(404, "Premium purchase unavailable.");
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
        identity.listener_id,
      ]);
      const o = (
          await db.query(
            "SELECT * FROM premium_orders WHERE id=$1 FOR UPDATE",
            [payment.orderId],
          )
        ).rows[0],
        a = (
          await db.query(
            "SELECT * FROM premium_attempts WHERE order_id=$1 FOR UPDATE",
            [o.id],
          )
        ).rows[0];
      const q = a?.quote_id
        ? (
            await db.query(
              "SELECT q.*,s.rates,s.as_of FROM payment_checkout_quotes q LEFT JOIN currency_rate_snapshots s ON s.id=q.rate_snapshot_id WHERE q.id=$1",
              [a.quote_id],
            )
          ).rows[0]
        : null;
      if (
        !a ||
        a.benefit_hold ||
        (a.quote_id || a.id) !== payment.quoteId ||
        a.reference !== payment.reference ||
        a.provider !== adapter.name ||
        a.merchant_id !== adapter.merchantId ||
        a.mode !== payment.mode ||
        policy.minor(payment.amountMinor) !==
          Number(q?.charge_minor || o.amount_minor) ||
        payment.currency !== (q?.charge_currency || o.currency)
      )
        throw fail(
          409,
          "Payment must match the original amount, currency and reference.",
        );
      const old = (
        await db.query("SELECT * FROM premium_receipts WHERE order_id=$1", [
          o.id,
        ])
      ).rows[0];
      if (old) {
        if (old.payment_id !== payment.id)
          throw fail(409, "Purchase already has another receipt.");
        return { ok: true, duplicate: true };
      }
      // A late authoritative lookup may fulfill the original immutable order, never issue another charge.
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "payment:" + adapter.name + ":" + adapter.merchantId + ":" + payment.id,
      ]);
      if (
        (
          await db.query(
            "SELECT 1 FROM commerce_receipts WHERE provider=$1 AND merchant_id=$2 AND payment_id=$3",
            [adapter.name, adapter.merchantId, payment.id],
          )
        ).rowCount
      )
        throw fail(409, "Payment was used for another product.");
      await db.query(
        "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          o.id,
          adapter.name,
          adapter.merchantId,
          payment.id,
          payment.mode,
          o.currency,
          o.amount_minor,
        ],
      );
      if (q)
        await db.query(
          "INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,rate_snapshot_id,exchange_rate,conversion_at) VALUES($1,$2,$3,'USD',$4,$5,$6,$4,$7,$8,(SELECT COALESCE(s.as_of,q.created_at) FROM payment_checkout_quotes q LEFT JOIN currency_rate_snapshots s ON s.id=q.rate_snapshot_id WHERE q.id=$2))",
          [
            o.id,
            q.id,
            a.id,
            o.amount_minor,
            payment.currency,
            payment.amountMinor,
            q.rate_snapshot_id,
            payment.currency === "USD" ? "1" : q.rates[payment.currency],
          ],
        );
      const clock = (await db.query("SELECT clock_timestamp() AS now")).rows[0]
          .now,
        last = (
          await db.query(
            "SELECT MAX(e.expires_at) AS expires_at FROM premium_entitlements e WHERE listener_id=$1 AND NOT EXISTS(SELECT 1 FROM premium_reversals r WHERE r.order_id=e.order_id)",
            [o.listener_id],
          )
        ).rows[0].expires_at;
      const start = new Date(
          Math.max(new Date(clock).getTime(), new Date(last || 0).getTime()),
        ),
        end = new Date(start.getTime() + o.days * policy.DAY);
      await db.query(
        "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,$3,$4)",
        [o.id, o.listener_id, start, end],
      );
      for (const [level, id, percent] of [
        [1, o.referrer_id, 10],
        [2, o.indirect_id, 5],
      ])
        if (id) {
          const direct = policy.percentage(Number(o.amount_minor), 10),
            amount =
              level === 1
                ? direct
                : Math.min(
                    policy.percentage(Number(o.amount_minor), 5),
                    Math.max(
                      0,
                      Math.floor((Number(o.amount_minor) * 15) / 100) - direct,
                    ),
                  );
          if (!amount) continue;
          await db.query(
            "INSERT INTO premium_commissions(order_id,beneficiary_id,level,percent,amount_minor) VALUES($1,$2,$3,$4,$5)",
            [o.id, id, level, percent, amount],
          );
          await transfer(
            db,
            "premium:" + o.id + ":commission:" + level,
            "premium_pending_commission",
            o.currency,
            amount,
            books.platform(
              "commission_deferred_cost",
              payment.mode,
              o.currency,
            ),
            "artist:" +
              id +
              ":premium_pending:" +
              payment.mode +
              ":" +
              o.currency,
            id,
          );
        }
      await transfer(
        db,
        "premium:" + o.id,
        "premium_verified_sale",
        o.currency,
        Number(o.amount_minor),
        books.platform("receivable", payment.mode, o.currency),
        books.platform("deferred", payment.mode, o.currency),
      );
      await db.query(
        "UPDATE premium_attempts SET status='paid',checkout_url=NULL,updated_at=NOW() WHERE id=$1",
        [a.id],
      );
      await audit(
        db,
        { type: "provider", id: adapter.name },
        "premium.verified",
        o.id,
        {
          currency: o.currency,
          charge_currency: payment.currency,
          charge_minor: payment.amountMinor,
          amount_minor: Number(o.amount_minor),
          mode: payment.mode,
        },
      );
      return { ok: true, duplicate: false };
    });
  }
  async function verify(listenerId, attemptId) {
    if (!uuid(attemptId)) throw fail(400, "Invalid checkout reference.");
    const a = (
      await pool.query(
        "SELECT a.* FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id WHERE a.id=$1 AND o.listener_id=$2",
        [attemptId, listenerId],
      )
    ).rows[0];
    if (!a) throw fail(404, "Your checkout is unavailable.");
    const adapter = account(a.provider);
    if (!adapter) throw fail(503, "Provider verification is unavailable.");
    await transaction(pool, (db) =>
      idempotent(
        db,
        "premium-lookup:" + a.id,
        crypto.randomUUID(),
        {},
        async () => {
          await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "premium-lookup:" + a.id,
          ]);
          const q = await db.query(
            "SELECT 1 FROM platform_requests WHERE scope=$1 AND created_at>NOW()-INTERVAL '15 seconds' LIMIT 1",
            ["premium-lookup:" + a.id],
          );
          if (q.rowCount)
            throw fail(
              429,
              "Keep the same payment reference and check again shortly.",
            );
          return { lookup: true };
        },
      ),
    );
    await accept(adapter, await adapter.retrieveByReference(a.reference));
    return status(listenerId);
  }
  async function owns(provider, raw) {
    let d;
    try {
      d = JSON.parse(raw).data;
    } catch {
      return false;
    }
    const reference =
      d?.reference ||
      d?.tx_ref ||
      d?.transaction_reference ||
      d?.transaction?.reference;
    if (typeof reference !== "string" || !reference.startsWith("laep-"))
      return false;
    return !!(
      await pool.query(
        "SELECT 1 FROM premium_attempts WHERE provider=$1 AND reference=$2",
        [provider, reference],
      )
    ).rowCount;
  }
  async function webhook(provider, raw, headers) {
    const a = account(provider);
    if (!a) throw fail(503, "Premium payment verification is unavailable.");
    if (a.lifecycleNotice) {
      const notice = a.lifecycleNotice(raw, headers);
      if (notice) {
        await transaction(pool, async (db) => {
          const q = await db.query(
            "SELECT a.order_id,o.listener_id FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id WHERE a.provider=$1 AND a.reference=$2",
            [provider, notice.reference],
          );
          if (q.rowCount) {
            await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
              q.rows[0].listener_id,
            ]);
            await require("./streaming-royalties").lockReceiptPeriods(
              db,
              q.rows[0].order_id,
            );
            await db.query(
              "INSERT INTO premium_payment_reviews(order_id,reason) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM premium_receipts WHERE order_id=$1) ON CONFLICT DO NOTHING",
              [q.rows[0].order_id, notice.event],
            );
            await db.query(
              "UPDATE premium_attempts SET status='review',benefit_hold=TRUE,checkout_url=NULL WHERE order_id=$1",
              [q.rows[0].order_id],
            );
          }
        });
        return { ok: true, review: true };
      }
    }
    const event = await a.verifyEvent(raw, headers),
      payment = await a.retrievePayment(event.paymentId);
    if (payment.id !== event.paymentId)
      throw fail(409, "Payment identity mismatch.");
    return accept(a, payment);
  }
  async function reverse(key, input) {
    if (!uuid(input?.order_id) || typeof input.refund_id !== "string")
      throw fail(400, "Choose a Premium receipt and provider refund ID.");
    const receipt = (
      await pool.query(
        "SELECT r.*,a.reference,o.listener_id,p.charge_currency,p.charge_minor FROM premium_receipts r JOIN premium_attempts a ON a.order_id=r.order_id JOIN premium_orders o ON o.id=r.order_id LEFT JOIN premium_presentments p ON p.order_id=r.order_id WHERE r.order_id=$1",
        [input.order_id],
      )
    ).rows[0];
    if (!receipt) throw fail(404, "Premium receipt unavailable.");
    const a = account(receipt.provider);
    if (!a || !a.retrieveRefund)
      throw fail(503, "Verified refunds for this provider are not available.");
    const original = await a.retrieveByReference(receipt.reference);
    if (
      original.id !== receipt.payment_id ||
      original.merchantId !== receipt.merchant_id ||
      original.amountMinor !==
        Number(receipt.charge_minor || receipt.amount_minor) ||
      original.mode !== receipt.mode ||
      original.currency !== (receipt.charge_currency || receipt.currency)
    )
      throw fail(
        409,
        "Original payment verification does not match the receipt.",
      );
    const refund = await a.retrieveRefund(input.refund_id, original);
    if (
      !refund.completed ||
      refund.currency !== (receipt.charge_currency || receipt.currency) ||
      refund.amountMinor !==
        Number(receipt.charge_minor || receipt.amount_minor) ||
      refund.merchantId !== receipt.merchant_id ||
      refund.mode !== receipt.mode
    ) {
      await pool.query(
        "INSERT INTO premium_payment_reviews(order_id,reason) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [
          receipt.order_id,
          "Incomplete, partial or conflicting refund evidence.",
        ],
      );
      throw fail(
        409,
        "Refund evidence requires review; benefits and royalty recognition are held.",
      );
    }
    return transaction(pool, (db) =>
      idempotent(
        db,
        "premium-refund",
        key,
        { order: receipt.order_id, refund: refund.id },
        async () => {
          await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
            receipt.listener_id,
          ]);
          await db.query(
            "SELECT order_id FROM premium_receipts WHERE order_id=$1 FOR NO KEY UPDATE",
            [receipt.order_id],
          );
          await require("./streaming-royalties").lockReceiptPeriods(
            db,
            receipt.order_id,
          );
          const old = (
            await db.query(
              "SELECT refund_id FROM premium_reversals WHERE order_id=$1",
              [receipt.order_id],
            )
          ).rows[0];
          if (old) {
            if (old.refund_id !== refund.id)
              throw fail(409, "Receipt already has a different refund.");
            return { ok: true, duplicate: true };
          }
          await db.query(
            "INSERT INTO premium_reversals(order_id,provider,merchant_id,refund_id,amount_minor,reason) VALUES($1,$2,$3,$4,$5,$6)",
            [
              receipt.order_id,
              a.name,
              a.merchantId,
              refund.id,
              Number(receipt.amount_minor),
              "Independently verified full refund.",
            ],
          );
          await db.query(
            "INSERT INTO premium_refund_presentments(order_id,charge_currency,charge_minor,base_currency,base_minor,rate_snapshot_id,exchange_rate,conversion_at) SELECT r.order_id,COALESCE(p.charge_currency,r.currency),COALESCE(p.charge_minor,r.amount_minor),r.currency,r.amount_minor,p.rate_snapshot_id,COALESCE(p.exchange_rate,'1'),COALESCE(p.conversion_at,r.verified_at) FROM premium_receipts r LEFT JOIN premium_presentments p ON p.order_id=r.order_id WHERE r.order_id=$1",
            [receipt.order_id],
          );
          for (const c of (
            await db.query(
              "SELECT * FROM premium_commissions WHERE order_id=$1",
              [receipt.order_id],
            )
          ).rows)
            await transfer(
              db,
              "premium-refund:" + receipt.order_id + ":commission:" + c.level,
              "premium_commission_reversal",
              receipt.currency,
              Number(c.amount_minor),
              "artist:" +
                c.beneficiary_id +
                ":premium_pending:" +
                receipt.mode +
                ":" +
                receipt.currency,
              books.platform(
                "commission_deferred_cost",
                receipt.mode,
                receipt.currency,
              ),
              c.beneficiary_id,
            );
          await transfer(
            db,
            "premium-refund:" + receipt.order_id,
            "premium_sale_reversal",
            receipt.currency,
            Number(receipt.amount_minor),
            books.platform("deferred", receipt.mode, receipt.currency),
            books.platform("receivable", receipt.mode, receipt.currency),
          );
          await require("./streaming-royalties").adjustReversal(
            db,
            receipt.order_id,
          );
          await audit(
            db,
            { type: "provider", id: a.name },
            "premium.refund",
            receipt.order_id,
            {
              mode: receipt.mode,
              charge_currency: refund.currency,
              charge_minor: refund.amountMinor,
              base_currency: receipt.currency,
              base_minor: Number(receipt.amount_minor),
            },
          );
          return { ok: true };
        },
      ),
    );
  }
  async function affiliate(artistId) {
    return {
      commissions: (
        await pool.query(
          `SELECT pc.*,r.mode,r.currency,rev.order_id IS NOT NULL AS reversed,CASE WHEN rev.order_id IS NOT NULL THEN 'reversed' WHEN EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=pc.order_id) THEN 'under_review' ELSE 'pending_settlement' END AS status FROM premium_commissions pc JOIN premium_receipts r ON r.order_id=pc.order_id LEFT JOIN premium_reversals rev ON rev.order_id=pc.order_id WHERE beneficiary_id=$1 ORDER BY pc.created_at DESC LIMIT 100`,
          [artistId],
        )
      ).rows,
      notice:
        "Listener product commissions are separate from artist-package commissions and require settlement/reconciliation. No recruitment rewards.",
    };
  }
  return {
    capabilities,
    prepare,
    status,
    active,
    checkout,
    prepareQuote,
    verify,
    webhook,
    owns,
    accept,
    account,
    reverse,
    affiliate,
  };
}
module.exports = { createPremium };
