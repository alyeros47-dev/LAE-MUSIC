"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { runtime } = require("./runtime.cjs"),
  { createOffline } = require("../lib/offline-listening"),
  { message } = require("../web/offline-protocol"),
  { transaction } = require("../lib/transactions");
module.exports = async (t, { pool }) => {
  let clock = Date.now(),
    mediaCalls = 0,
    user,
    free,
    artist,
    track,
    track2,
    grant1,
    grant2,
    primary,
    secondary;
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    service = createOffline({
      pool,
      signingKey: pair.privateKey,
      now: () => clock,
      mediaSource: async () => {
        mediaCalls++;
        return { bytes: Buffer.from([1, 2, 3]), mime: "audio/mpeg" };
      },
    }),
    app = await runtime({ pool, offlineService: service });
  const key = () => crypto.randomUUID();
  async function api(path, body, cookie, requestKey = key()) {
    const r = await app.request(path, {
      method: body === undefined ? "GET" : "POST",
      body,
      headers: { ...(cookie ? { cookie } : {}), "idempotency-key": requestKey },
    });
    return {
      status: r.status,
      data: r.headers["content-type"]?.includes("json") ? r.json() : r.body,
      cookie: (Array.isArray(r.headers["set-cookie"])
        ? r.headers["set-cookie"][0]
        : r.headers["set-cookie"]
      )?.split(";")[0],
      headers: r.headers,
    };
  }
  async function register(role, name) {
    const r = await api(
      role === "artist" ? "/api/register" : "/api/listener/register",
      {
        name: "Offline " + name,
        email: name + "@offline-fixture.invalid",
        country: "Liberia",
        password: "OfflineStrongPassword123",
        confirmPassword: "OfflineStrongPassword123",
        plan: "starter",
      },
    );
    assert.equal(r.status, 201);
    return { id: r.data.user.id, cookie: r.cookie };
  }
  function device() {
    const p = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    return {
      id: key(),
      key: p.privateKey,
      jwk: p.publicKey.export({ format: "jwk" }),
    };
  }
  async function proof(d, action, payload) {
    const c = await service.challenge(user.id, { device_id: d.id, action });
    return {
      device_id: d.id,
      nonce: c.nonce,
      payload,
      signature: crypto
        .sign("sha256", Buffer.from(message(d.id, c.nonce, action, payload)), {
          key: d.key,
          dsaEncoding: "ieee-p1363",
        })
        .toString("base64url"),
    };
  }
  async function seedPremium() {
    const book = require("../lib/premium-pricing").catalog(
      require("./premium-fixtures.cjs").approvedPricing(),
    );
    await transaction(pool, async (db) => {
      await require("../lib/premium-pricing").recordApproval(db, book);
      const id = key(),
        q = key(),
        a = key();
      await db.query(
        "INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,expires_at,pricing_revision) VALUES($1,$2,'annual','USD',588,365,NOW()+INTERVAL '1 hour',$3)",
        [id, user.id, book.revision],
      );
      await db.query(
        "INSERT INTO payment_checkout_quotes(id,premium_order_id,provider,base_currency,base_minor,charge_currency,charge_minor,expires_at) VALUES($1,$2,'paystack','USD',588,'USD',588,NOW()+INTERVAL '5 minutes')",
        [q, id],
      );
      await db.query(
        "INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,$3,'paystack','offline-fixture','test',$4,'paid')",
        [a, id, q, "offline-fixture-" + key()],
      );
      await db.query(
        "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'paystack','offline-fixture',$2,'test','USD',588)",
        [id, key()],
      );
      await db.query(
        "INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,exchange_rate,conversion_at) SELECT $1,$2,$3,'USD',588,'USD',588,588,'1',created_at FROM payment_checkout_quotes WHERE id=$2",
        [id, q, a],
      );
      const end = new Date(clock + 7200000),
        start = new Date(end.getTime() - 365 * 86400000);
      await db.query(
        "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,$3,$4)",
        [id, user.id, start, end],
      );
      await require("../lib/finance").transfer(
        db,
        "offline-fixture-sale:" + id,
        "isolated_test_receipt",
        "USD",
        588,
        "platform:premium_receivable:test:USD",
        "platform:premium_deferred:test:USD",
      );
    });
  }
  await t.test(
    "offline device registration is Premium-only, account-owned and bounded, with no payment or download product",
    async () => {
      user = await register("listener", "buyer");
      free = await register("listener", "free");
      artist = await register("artist", "publisher");
      primary = device();
      assert.equal(
        (await api("/api/platform/offline/capabilities")).data
          .ordinary_downloads,
        false,
      );
      assert.equal(
        (
          await api("/api/platform/offline/register", {
            device_id: primary.id,
            public_jwk: primary.jwk,
          })
        ).status,
        401,
      );
      await assert.rejects(
        service.register(free.id, key(), {
          device_id: primary.id,
          public_jwk: primary.jwk,
        }),
        (e) => e.status === 403,
      );
      await seedPremium();
      assert.equal(
        (
          await api(
            "/api/platform/offline/register",
            { device_id: primary.id, public_jwk: primary.jwk },
            user.cookie,
          )
        ).status,
        200,
      );
      secondary = device();
      await service.register(user.id, key(), {
        device_id: secondary.id,
        public_jwk: secondary.jwk,
      });
      const third = device();
      await service.register(user.id, key(), {
        device_id: third.id,
        public_jwk: third.jwk,
      });
      await assert.rejects(
        service.register(user.id, key(), {
          device_id: key(),
          public_jwk: primary.jwk,
        }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        service.register(free.id, key(), {
          device_id: primary.id,
          public_jwk: primary.jwk,
        }),
        (e) => [403, 409].includes(e.status),
      );
      for (const title of ["Saved one", "Saved two"]) {
        const row = (
          await pool.query(
            "INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,$2,'Highlife',$3,'audio/mpeg',3,'published',NOW()) RETURNING *",
            [artist.id, title, "offline-fixture/" + key()],
          )
        ).rows[0];
        if (!track) track = row;
        else track2 = row;
      }
    },
  );
  await t.test(
    "signed grants clamp to Premium expiry, reject tampering and replay one challenge without duplicating saves",
    async () => {
      const input = await proof(primary, "grant", {
          track_id: String(track.id),
          include_media: true,
        }),
        tampered = {
          ...input,
          payload: { track_id: String(track2.id), include_media: true },
        };
      await assert.rejects(
        service.grant(user.id, key(), tampered),
        (e) => e.status === 403,
      );
      const requestKey = key(),
        [a, b] = await Promise.all([
          service.grant(user.id, requestKey, input),
          service.grant(user.id, requestKey, input),
        ]);
      assert.deepEqual(a, b);
      grant1 = a;
      const token = JSON.parse(Buffer.from(a.token.payload, "base64url"));
      assert.equal(token.until_ms, clock + 7200000);
      assert.equal(token.device_id, primary.id);
      assert.equal(token.listener_id, String(user.id));
      assert.equal(
        crypto.verify(
          "sha256",
          Buffer.from(a.token.payload),
          { key: pair.publicKey, dsaEncoding: "ieee-p1363" },
          Buffer.from(a.token.signature, "base64url"),
        ),
        true,
      );
      await assert.rejects(
        service.grant(user.id, key(), input),
        (e) => e.status === 403,
      );
      await assert.rejects(
        pool.query(
          "UPDATE offline_challenges SET consumed_at=NULL WHERE nonce=$1",
          [input.nonce],
        ),
        /single-use/,
      );
      grant2 = await service.grant(
        user.id,
        key(),
        await proof(secondary, "grant", {
          track_id: String(track2.id),
          include_media: true,
        }),
      );
    },
  );
  await t.test(
    "offline media stays owner-only, no-store and single-use; wrong account and replay cannot fetch audio",
    async () => {
      const grantId = JSON.parse(
        Buffer.from(grant1.token.payload, "base64url"),
      ).grant_id;
      assert.equal(
        (
          await api(
            "/api/platform/offline/media",
            { grant_id: grantId, media_ticket: grant1.media_ticket },
            free.cookie,
          )
        ).status,
        403,
      );
      const r = await api(
        "/api/platform/offline/media",
        { grant_id: grantId, media_ticket: grant1.media_ticket },
        user.cookie,
      );
      assert.equal(r.status, 200);
      assert.equal(r.headers["cache-control"], "no-store");
      assert.equal(r.headers["content-disposition"], "inline");
      assert.deepEqual(r.data, Buffer.from([1, 2, 3]));
      assert.equal(mediaCalls, 1);
      await assert.rejects(
        service.media(user.id, {
          grant_id: grantId,
          media_ticket: grant1.media_ticket,
        }),
        (e) => e.status === 409,
      );
      assert.equal(mediaCalls, 1);
    },
  );
  let event1;
  await t.test(
    "eligible offline plays synchronize into the existing 50% royalty inputs once, including lost-response retries",
    async () => {
      const start = clock;
      clock += 31000;
      event1 = {
        id: key(),
        grant_id: JSON.parse(Buffer.from(grant1.token.payload, "base64url"))
          .grant_id,
        sequence: 1,
        started_ms: start,
        ended_ms: clock,
        listened_ms: 31000,
      };
      const input = await proof(primary, "sync", { events: [event1] }),
        requestKey = key();
      const [a, b] = await Promise.all([
        service.sync(user.id, requestKey, input),
        service.sync(user.id, requestKey, input),
      ]);
      assert.equal(a.results[0].status, "qualified");
      assert.deepEqual(a, b);
      const again = await service.sync(
        user.id,
        key(),
        await proof(primary, "sync", { events: [event1] }),
      );
      assert.equal(again.results[0].duplicate, true);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_streams WHERE playback_id=$1",
            [event1.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT source FROM premium_streams WHERE playback_id=$1",
            [event1.id],
          )
        ).rows[0].source,
        "offline",
      );
      assert.equal(
        Number(
          (
            await pool.query("SELECT plays FROM music_tracks WHERE id=$1", [
              track.id,
            ])
          ).rows[0].plays,
        ),
        1,
      );
      assert.equal(
        await require("../lib/finance").balance(
          pool,
          "artist:" + artist.id + ":earned:USD",
        ),
        0,
      );
      await assert.rejects(
        pool.query(
          "UPDATE offline_play_events SET status='changed' WHERE id=$1",
          [event1.id],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "concurrent device intervals, mismatched event identities and invalid clock signals cannot inflate offline royalties",
    async () => {
      const second = {
        ...event1,
        id: key(),
        sequence: 1,
        started_ms: event1.started_ms + 100,
        ended_ms: event1.ended_ms - 100,
        listened_ms: 30000,
        grant_id: JSON.parse(Buffer.from(grant2.token.payload, "base64url"))
          .grant_id,
      };
      const r = await service.sync(
        user.id,
        key(),
        await proof(secondary, "sync", { events: [second] }),
      );
      assert.equal(r.results[0].status, "overlap");
      await assert.rejects(
        service.sync(
          user.id,
          key(),
          await proof(primary, "sync", {
            events: [{ ...event1, listened_ms: 30000 }],
          }),
        ),
        (e) => e.status === 409,
      );
      const invalid = {
        ...event1,
        id: key(),
        sequence: 2,
        started_ms: clock,
        ended_ms: clock + 600000,
        listened_ms: 31000,
      };
      const q = await service.sync(
        user.id,
        key(),
        await proof(primary, "sync", { events: [invalid] }),
      );
      assert.equal(q.results[0].status, "invalid_time");
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_streams WHERE listener_id=$1",
            [user.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "a malformed signed batch rolls back its challenge and earlier events, preserving the same retry sequence",
    async () => {
      const valid = {
        ...event1,
        id: key(),
        sequence: 3,
        started_ms: event1.started_ms,
        ended_ms: event1.ended_ms,
      };
      const input = await proof(primary, "sync", {
        events: [valid, { ...valid, id: "invalid", sequence: 4 }],
      });
      const before = await pool.query(
        "SELECT COUNT(*)::int AS n FROM offline_play_events WHERE device_id=$1",
        [primary.id],
      );
      await assert.rejects(
        service.sync(user.id, key(), input),
        (e) => e.status === 400,
      );
      assert.deepEqual(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM offline_play_events WHERE device_id=$1",
            [primary.id],
          )
        ).rows,
        before.rows,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT consumed_at FROM offline_challenges WHERE nonce=$1",
            [input.nonce],
          )
        ).rows[0].consumed_at,
        null,
      );
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT last_sequence FROM offline_devices WHERE id=$1",
              [primary.id],
            )
          ).rows[0].last_sequence,
        ),
        2,
      );
      const retry = await service.sync(
        user.id,
        key(),
        await proof(primary, "sync", { events: [valid] }),
      );
      assert.equal(retry.sequence, 3);
      assert.equal(retry.results[0].status, "duplicate_window");
    },
  );
  await t.test(
    "expired Premium cannot refresh or fetch saves, but valid pre-expiry offline reports may sync within the grace window",
    async () => {
      clock += 3 * 3600000;
      await assert.rejects(
        service.grant(
          user.id,
          key(),
          await proof(primary, "grant", { track_id: String(track.id) }),
        ),
        (e) => e.status === 403,
      );
      const valid = {
        id: key(),
        grant_id: JSON.parse(Buffer.from(grant2.token.payload, "base64url"))
          .grant_id,
        sequence: 2,
        started_ms: event1.ended_ms + 1900000,
        ended_ms: event1.ended_ms + 1931000,
        listened_ms: 31000,
      };
      const r = await service.sync(
        user.id,
        key(),
        await proof(secondary, "sync", { events: [valid] }),
      );
      assert.equal(r.results[0].status, "qualified");
      const after = {
        ...valid,
        id: key(),
        sequence: 3,
        started_ms: clock - 31000,
        ended_ms: clock,
      };
      const bad = await service.sync(
        user.id,
        key(),
        await proof(secondary, "sync", { events: [after] }),
      );
      assert.equal(bad.results[0].status, "invalid_time");
      await service.revoke(user.id, { device_id: primary.id });
      await assert.rejects(
        service.challenge(user.id, { device_id: primary.id, action: "sync" }),
        (e) => e.status === 404,
      );
      await assert.rejects(
        pool.query("UPDATE offline_devices SET revoked_at=NULL WHERE id=$1", [
          primary.id,
        ]),
        /cannot be rewritten/,
      );
      assert.equal((await service.devices(free.id)).devices.length, 0);
    },
  );
  await t.test(
    "late reports and payment-review holds cannot create streams or change the artist pool",
    async () => {
      const g = JSON.parse(Buffer.from(grant2.token.payload, "base64url")),
        event = {
          id: key(),
          grant_id: g.grant_id,
          sequence: 4,
          started_ms: g.issued_ms + 3700000,
          ended_ms: g.issued_ms + 3731000,
          listened_ms: 31000,
        };
      const original = clock;
      clock = event.ended_ms + 48 * 3600000 + 1;
      const late = await service.sync(
        user.id,
        key(),
        await proof(secondary, "sync", { events: [event] }),
      );
      assert.equal(late.results[0].status, "late_sync");
      clock = original;
      const order = (
        await pool.query(
          "SELECT order_id FROM premium_entitlements WHERE id=$1",
          [g.entitlement_id],
        )
      ).rows[0].order_id;
      await pool.query(
        "INSERT INTO premium_payment_reviews(order_id,reason) VALUES($1,'isolated offline hold fixture')",
        [order],
      );
      const held = await service.sync(
        user.id,
        key(),
        await proof(secondary, "sync", {
          events: [{ ...event, id: key(), sequence: 5 }],
        }),
      );
      assert.equal(held.results[0].status, "entitlement_unavailable");
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_streams WHERE listener_id=$1",
            [user.id],
          )
        ).rows[0].n,
        2,
      );
      assert.equal(
        await require("../lib/finance").balance(
          pool,
          "artist:" + artist.id + ":earned:USD",
        ),
        0,
      );
      const inspected =
        await require("../lib/release-preflight").inspectDatabase(pool);
      assert.equal(inspected.integrity.offline_stream_discrepancies, 0);
    },
  );
};
