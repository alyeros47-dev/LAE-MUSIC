"use strict";
const crypto = require("node:crypto"),
  { fail, transaction, idempotent, audit, digest } = require("./transactions"),
  { uuid } = require("./premium-utils"),
  { LIMITS, canonical, message } = require("../web/offline-protocol"),
  { fence } = require("./streaming-royalties");
function signing(value) {
  try {
    const key =
      value instanceof crypto.KeyObject && value.type === "private"
        ? value
        : crypto.createPrivateKey(
            typeof value === "string" && !value.includes("BEGIN")
              ? Buffer.from(value, "base64")
              : value,
          );
    if (
      key.asymmetricKeyType !== "ec" ||
      key.asymmetricKeyDetails.namedCurve !== "prime256v1"
    )
      return null;
    const pub = crypto.createPublicKey(key),
      jwk = pub.export({ format: "jwk" }),
      kid = digest(jwk).slice(0, 20);
    return { key, jwk, kid };
  } catch {
    return null;
  }
}
function deviceKey(jwk) {
  if (
    !jwk ||
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    jwk.d !== undefined
  )
    throw fail(400, "A public P-256 device key is required.");
  try {
    return crypto.createPublicKey({
      key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
      format: "jwk",
    });
  } catch {
    throw fail(400, "Invalid offline device key.");
  }
}
function createOffline({
  pool,
  signingKey = process.env.OFFLINE_LICENSE_PRIVATE_KEY,
  mediaSource,
  now = Date.now,
} = {}) {
  const signer = signing(signingKey),
    enabled = () => !!pool && !!signer && typeof mediaSource === "function";
  const capabilities = () => ({
    enabled: enabled(),
    limits: LIMITS,
    public_key: signer?.jwk || null,
    kid: signer?.kid || null,
    offline_path: "/offline",
    ordinary_downloads: false,
    paid_song_purchases: false,
    notice:
      "Saved audio stays in the app browser library. Reconnect at least every 24 hours; Premium expiry ends access. Browser storage is not DRM.",
  });
  function ready() {
    if (!enabled())
      throw fail(
        503,
        "Offline listening is temporarily unavailable. Online streaming remains available.",
      );
  }
  async function paid(db, id, at = now()) {
    return (
      await db.query(
        "SELECT e.*,r.mode,r.currency FROM premium_entitlements e JOIN premium_receipts r ON r.order_id=e.order_id WHERE e.listener_id=$1 AND e.starts_at<=$2 AND e.expires_at>$2 AND NOT EXISTS(SELECT 1 FROM premium_reversals v WHERE v.order_id=e.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews v WHERE v.order_id=e.order_id) ORDER BY e.expires_at DESC LIMIT 1",
        [id, new Date(at)],
      )
    ).rows[0];
  }
  async function register(id, key, input) {
    ready();
    if (!uuid(input?.device_id)) throw fail(400, "Invalid offline device.");
    deviceKey(input.public_jwk);
    const jwk = {
        kty: "EC",
        crv: "P-256",
        x: input.public_jwk.x,
        y: input.public_jwk.y,
      },
      label = String(input.label || "This browser").slice(0, 80);
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [id]);
      if (!(await paid(db, id)))
        throw fail(403, "An active Premium Listener subscription is required.");
      return idempotent(
        db,
        "offline-register:" + id,
        key,
        { device: input.device_id, jwk, label },
        async () => {
          const old = (
            await db.query("SELECT * FROM offline_devices WHERE id=$1", [
              input.device_id,
            ])
          ).rows[0];
          if (old) {
            if (
              String(old.listener_id) !== String(id) ||
              digest(old.public_jwk) !== digest(jwk) ||
              old.revoked_at
            )
              throw fail(409, "This offline device cannot be reused.");
            return { device_id: old.id };
          }
          const count = Number(
            (
              await db.query(
                "SELECT COUNT(*) AS n FROM offline_devices WHERE listener_id=$1 AND revoked_at IS NULL",
                [id],
              )
            ).rows[0].n,
          );
          if (count >= LIMITS.maxDevices)
            throw fail(
              409,
              "Remove an old offline device before adding this browser.",
            );
          await db.query(
            "INSERT INTO offline_devices(id,listener_id,public_jwk,label) VALUES($1,$2,$3,$4)",
            [input.device_id, id, JSON.stringify(jwk), label],
          );
          await audit(
            db,
            { type: "listener", id },
            "offline.device.register",
            input.device_id,
          );
          return { device_id: input.device_id };
        },
      );
    });
  }
  async function challenge(id, input) {
    ready();
    if (!uuid(input?.device_id) || !["grant", "sync"].includes(input.action))
      throw fail(400, "Invalid offline verification request.");
    return transaction(pool, async (db) => {
      const d = (
        await db.query(
          "SELECT * FROM offline_devices WHERE id=$1 AND listener_id=$2 AND revoked_at IS NULL FOR UPDATE",
          [input.device_id, id],
        )
      ).rows[0];
      if (!d) throw fail(404, "Your offline device is unavailable.");
      const count = Number(
        (
          await db.query(
            "SELECT COUNT(*) AS n FROM offline_challenges WHERE device_id=$1 AND created_at>$2::timestamptz-INTERVAL '1 minute'",
            [d.id, new Date(now())],
          )
        ).rows[0].n,
      );
      if (count >= 240)
        throw fail(
          429,
          "Please wait before requesting another offline verification.",
        );
      const r = (
        await db.query(
          "INSERT INTO offline_challenges(id,device_id,nonce,action,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,nonce,expires_at",
          [
            crypto.randomUUID(),
            d.id,
            crypto.randomBytes(24).toString("hex"),
            input.action,
            new Date(now() + 300000),
          ],
        )
      ).rows[0];
      return { ...r, server_ms: now() };
    });
  }
  async function proof(db, id, input, action) {
    if (
      !uuid(input?.device_id) ||
      typeof input.nonce !== "string" ||
      typeof input.signature !== "string" ||
      input.signature.length > 200
    )
      throw fail(400, "Invalid offline proof.");
    const d = (
      await db.query(
        "SELECT * FROM offline_devices WHERE id=$1 AND listener_id=$2 AND revoked_at IS NULL FOR UPDATE",
        [input.device_id, id],
      )
    ).rows[0];
    if (!d) throw fail(404, "Your offline device is unavailable.");
    const c = (
      await db.query(
        "SELECT * FROM offline_challenges WHERE device_id=$1 AND nonce=$2 AND action=$3 AND consumed_at IS NULL AND expires_at>$4 FOR UPDATE",
        [d.id, input.nonce, action, new Date(now())],
      )
    ).rows[0];
    if (
      !c ||
      !crypto.verify(
        "sha256",
        Buffer.from(message(d.id, input.nonce, action, input.payload)),
        { key: deviceKey(d.public_jwk), dsaEncoding: "ieee-p1363" },
        Buffer.from(input.signature, "base64url"),
      )
    )
      throw fail(403, "Offline device verification failed.");
    await db.query("UPDATE offline_challenges SET consumed_at=$2 WHERE id=$1", [
      c.id,
      new Date(now()),
    ]);
    return { d, c };
  }
  async function grant(id, key, input) {
    ready();
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [id]);
      return idempotent(db, "offline-grant:" + id, key, input, async () => {
        const { d } = await proof(db, id, input, "grant"),
          trackId = String(input.payload?.track_id || "");
        if (!/^[1-9][0-9]{0,15}$/.test(trackId))
          throw fail(400, "Choose a song.");
        const e = await paid(db, id);
        if (!e)
          throw fail(
            403,
            "An active Premium Listener subscription is required.",
          );
        const t = (
          await db.query(
            "SELECT t.*,c.display_name AS artist,l.display_name AS listener_name FROM music_tracks t JOIN creators c ON c.id=t.creator_id JOIN listeners l ON l.id=$2 WHERE t.id=$1 AND t.status='published' FOR SHARE OF t",
            [trackId, id],
          )
        ).rows[0];
        if (!t) throw fail(404, "This song is unavailable.");
        if (Number(t.audio_bytes) > LIMITS.maxBytes)
          throw fail(
            409,
            "This song is too large for browser offline storage.",
          );
        const count = Number(
          (
            await db.query(
              "SELECT COUNT(DISTINCT track_id) AS n FROM offline_grants g WHERE device_id=$1 AND track_id<>$2 AND expires_at>$3 AND NOT EXISTS(SELECT 1 FROM offline_grant_revocations v WHERE v.grant_id=g.id)",
              [d.id, t.id, new Date(now())],
            )
          ).rows[0].n,
        );
        if (count >= LIMITS.maxSongs)
          throw fail(409, "Your offline song limit is reached.");
        const issued = now();
        if (new Date(e.expires_at).getTime() - issued < 1000)
          throw fail(403, "Premium is expiring. Renew before saving offline.");
        const grantId = crypto.randomUUID(),
          until = Math.min(
            issued + LIMITS.leaseMs,
            new Date(e.expires_at).getTime(),
          ),
          asset = digest({
            key: t.audio_key,
            bytes: t.audio_bytes,
            mime: t.audio_mime,
          }),
          payload = {
            v: 1,
            grant_id: grantId,
            listener_id: String(id),
            device_id: d.id,
            track_id: String(t.id),
            entitlement_id: String(e.id),
            issued_ms: issued,
            until_ms: until,
            asset_hash: asset,
            display_name: t.listener_name,
            title: t.title,
            artist: t.artist,
            artist_id: String(t.creator_id),
            genre: t.genre || "",
            audio_mime: t.audio_mime,
            audio_bytes: Number(t.audio_bytes),
            kid: signer.kid,
          },
          encoded = Buffer.from(canonical(payload)).toString("base64url"),
          token = {
            payload: encoded,
            signature: crypto
              .sign("sha256", Buffer.from(encoded), {
                key: signer.key,
                dsaEncoding: "ieee-p1363",
              })
              .toString("base64url"),
            kid: signer.kid,
          };
        await db.query(
          "INSERT INTO offline_grants(id,listener_id,device_id,track_id,entitlement_id,asset_hash,issued_at,expires_at,token) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            grantId,
            id,
            d.id,
            t.id,
            e.id,
            asset,
            new Date(issued),
            new Date(until),
            JSON.stringify(token),
          ],
        );
        let ticket = null;
        if (input.payload.include_media !== false) {
          ticket = crypto.randomBytes(32).toString("hex");
          await db.query(
            "INSERT INTO offline_media_tickets(id,grant_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
            [
              crypto.randomUUID(),
              grantId,
              digest(ticket),
              new Date(now() + 300000),
            ],
          );
        }
        return {
          token,
          media_ticket: ticket,
          public_key: signer.jwk,
          server_ms: now(),
        };
      });
    });
  }
  async function media(id, input) {
    ready();
    if (!uuid(input?.grant_id) || typeof input.media_ticket !== "string")
      throw fail(400, "Invalid offline media request.");
    const track = await transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [id]);
      const r = (
        await db.query(
          "SELECT g.*,t.audio_key,t.audio_mime,t.audio_bytes FROM offline_grants g JOIN offline_devices d ON d.id=g.device_id JOIN music_tracks t ON t.id=g.track_id WHERE g.id=$1 AND g.listener_id=$2 AND d.revoked_at IS NULL AND g.expires_at>$3 AND t.status='published' AND NOT EXISTS(SELECT 1 FROM offline_grant_revocations v WHERE v.grant_id=g.id) AND NOT EXISTS(SELECT 1 FROM premium_entitlements e JOIN premium_reversals v ON v.order_id=e.order_id WHERE e.id=g.entitlement_id) AND NOT EXISTS(SELECT 1 FROM premium_entitlements e JOIN premium_payment_reviews v ON v.order_id=e.order_id WHERE e.id=g.entitlement_id) FOR UPDATE OF g",
          [input.grant_id, id, new Date(now())],
        )
      ).rows[0];
      if (!r || !(await paid(db, id)))
        throw fail(403, "Offline media access is unavailable.");
      const ticket = await db.query(
        "UPDATE offline_media_tickets SET consumed_at=$3 WHERE grant_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>$3 RETURNING id",
        [r.id, digest(input.media_ticket), new Date(now())],
      );
      if (!ticket.rowCount)
        throw fail(
          409,
          "Offline media verification expired or was used. Save the song again.",
        );
      return r;
    });
    return mediaSource(track);
  }
  async function sync(id, key, input) {
    ready();
    if (
      !Array.isArray(input?.payload?.events) ||
      input.payload.events.length > LIMITS.maxBatch
    )
      throw fail(400, "Invalid offline listening batch.");
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [id]);
      return idempotent(db, "offline-sync:" + id, key, input, async () => {
        const { d, c } = await proof(db, id, input, "sync"),
          batch = crypto.randomUUID();
        await db.query(
          "INSERT INTO offline_sync_batches(id,device_id,challenge_id,payload_hash,signature) VALUES($1,$2,$3,$4,$5)",
          [batch, d.id, c.id, digest(input.payload), input.signature],
        );
        const results = [];
        let sequence = Number(d.last_sequence);
        for (const event of input.payload.events) {
          if (
            !uuid(event?.id) ||
            !uuid(event?.grant_id) ||
            !Number.isSafeInteger(event.sequence) ||
            event.sequence < 1 ||
            ![event.started_ms, event.ended_ms, event.listened_ms].every(
              Number.isSafeInteger,
            ) ||
            event.started_ms < 946684800000 ||
            event.ended_ms > 4102444800000
          )
            throw fail(400, "Invalid offline play.");
          const hash = digest(event),
            old = (
              await db.query(
                "SELECT * FROM offline_play_events WHERE id=$1 OR (device_id=$2 AND sequence=$3)",
                [event.id, d.id, event.sequence],
              )
            ).rows[0];
          if (old) {
            if (old.device_id !== d.id || old.event_hash !== hash)
              throw fail(
                409,
                "Offline listening reference conflicts with an existing play.",
              );
            results.push({ id: event.id, status: old.status, duplicate: true });
            continue;
          }
          if (event.sequence !== sequence + 1)
            throw fail(409, "Sync offline plays in sequence.");
          const g = (
            await db.query(
              "SELECT g.*,e.starts_at,e.expires_at AS premium_until,r.mode,r.currency,t.status AS track_status,t.creator_id,LOWER(c.email)=LOWER(l.email) AS self_play,(SELECT created_at FROM offline_grant_revocations v WHERE v.grant_id=g.id) AS revoked_at,EXISTS(SELECT 1 FROM premium_reversals v WHERE v.order_id=e.order_id) OR EXISTS(SELECT 1 FROM premium_payment_reviews v WHERE v.order_id=e.order_id) AS held FROM offline_grants g JOIN premium_entitlements e ON e.id=g.entitlement_id JOIN premium_receipts r ON r.order_id=e.order_id JOIN music_tracks t ON t.id=g.track_id JOIN creators c ON c.id=t.creator_id JOIN listeners l ON l.id=g.listener_id WHERE g.id=$1 AND g.device_id=$2 AND g.listener_id=$3",
              [event.grant_id, d.id, id],
            )
          ).rows[0];
          if (!g) throw fail(403, "Offline play belongs to another library.");
          let status = "qualified";
          if (
            event.started_ms < new Date(g.issued_at).getTime() ||
            event.ended_ms > new Date(g.expires_at).getTime() ||
            event.ended_ms > now() + 60000 ||
            event.ended_ms < event.started_ms ||
            event.listened_ms < 30000 ||
            event.listened_ms > 300000 ||
            event.listened_ms > event.ended_ms - event.started_ms + 1000
          )
            status = "invalid_time";
          else if (now() - event.ended_ms > LIMITS.syncMs) status = "late_sync";
          else if (
            (g.revoked_at &&
              event.ended_ms >= new Date(g.revoked_at).getTime()) ||
            g.held ||
            g.track_status !== "published" ||
            event.ended_ms >= new Date(g.premium_until).getTime()
          )
            status = "entitlement_unavailable";
          else if (g.self_play) status = "self_play";
          const month = new Date(event.ended_ms).toISOString().slice(0, 7);
          if (status === "qualified") {
            await fence(db, month, g.mode);
            if (
              (
                await db.query(
                  "SELECT 1 FROM royalty_statements WHERE month=$1 AND mode=$2 AND currency=$3",
                  [month, g.mode, g.currency],
                )
              ).rowCount
            )
              status = "closed_period";
            else {
              const limits = (
                await db.query(
                  "SELECT COUNT(*) FILTER(WHERE track_id=$2 AND ABS(EXTRACT(EPOCH FROM occurred_at-$3::timestamptz))<1800)::int AS repeats,COUNT(*) FILTER(WHERE occurred_at>=date_trunc('day',$3::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND occurred_at<(date_trunc('day',$3::timestamptz AT TIME ZONE 'UTC')+INTERVAL '1 day') AT TIME ZONE 'UTC')::int AS daily,COUNT(*) FILTER(WHERE occurred_at>$4 AND occurred_at-(listened_ms*INTERVAL '1 millisecond')<$3)::int AS overlaps FROM premium_streams WHERE listener_id=$1",
                  [
                    id,
                    g.track_id,
                    new Date(event.ended_ms),
                    new Date(event.started_ms),
                  ],
                )
              ).rows[0];
              if (limits.repeats) status = "duplicate_window";
              else if (limits.overlaps) status = "overlap";
              else if (limits.daily >= 720) status = "daily_cap";
            }
          }
          const playback = status === "qualified" ? event.id : null;
          if (playback)
            await db.query(
              "INSERT INTO premium_playback(id,listener_id,track_id,artist_id,entitlement_id,started_at,last_at,listened_ms,qualified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7)",
              [
                playback,
                id,
                g.track_id,
                g.creator_id,
                g.entitlement_id,
                new Date(event.started_ms),
                new Date(event.ended_ms),
                event.listened_ms,
              ],
            );
          await db.query(
            "INSERT INTO offline_play_events(id,device_id,listener_id,grant_id,batch_id,sequence,event_hash,started_at,ended_at,listened_ms,status,playback_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            [
              event.id,
              d.id,
              id,
              g.id,
              batch,
              event.sequence,
              hash,
              new Date(event.started_ms),
              new Date(event.ended_ms),
              event.listened_ms,
              status,
              playback,
            ],
          );
          if (playback) {
            await db.query(
              "INSERT INTO premium_streams(playback_id,listener_id,track_id,artist_id,entitlement_id,occurred_at,listened_ms,source,offline_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,'offline',$1)",
              [
                playback,
                id,
                g.track_id,
                g.creator_id,
                g.entitlement_id,
                new Date(event.ended_ms),
                event.listened_ms,
              ],
            );
            const viewer = digest("offline-listener:" + id);
            await db.query(
              "INSERT INTO music_play_events(track_id,artist_id,listener_id,viewer_key,source,received_at) VALUES($1,$2,$3,$4,'player',$5)",
              [g.track_id, g.creator_id, id, viewer, new Date(event.ended_ms)],
            );
            await db.query(
              "UPDATE music_tracks SET plays=plays+1 WHERE id=$1",
              [g.track_id],
            );
            await db.query(
              "INSERT INTO listener_history(listener_id,track_id) VALUES($1,$2) ON CONFLICT(listener_id,track_id) DO UPDATE SET last_played=NOW(),play_count=listener_history.play_count+1",
              [id, g.track_id],
            );
          }
          sequence = event.sequence;
          results.push({ id: event.id, status, duplicate: false });
        }
        await db.query(
          "UPDATE offline_devices SET last_sequence=$2 WHERE id=$1",
          [d.id, sequence],
        );
        return { results, sequence, server_ms: now() };
      });
    });
  }
  async function remove(id, input) {
    if (
      !uuid(input?.device_id) ||
      !/^[1-9][0-9]{0,15}$/.test(String(input?.track_id))
    )
      throw fail(400, "Choose a saved song.");
    await pool.query(
      "INSERT INTO offline_grant_revocations(grant_id) SELECT g.id FROM offline_grants g WHERE g.device_id=$1 AND g.listener_id=$2 AND g.track_id=$3 ON CONFLICT DO NOTHING",
      [input.device_id, id, input.track_id],
    );
    return { ok: true };
  }
  async function devices(id) {
    return {
      devices: (
        await pool.query(
          "SELECT id,label,created_at,revoked_at FROM offline_devices WHERE listener_id=$1 ORDER BY created_at DESC",
          [id],
        )
      ).rows,
    };
  }
  async function revoke(id, input) {
    if (!uuid(input?.device_id)) throw fail(400, "Invalid device.");
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [id]);
      const r = await db.query(
        "UPDATE offline_devices SET revoked_at=COALESCE(revoked_at,$3) WHERE id=$1 AND listener_id=$2 RETURNING id",
        [input.device_id, id, new Date(now())],
      );
      if (!r.rowCount) throw fail(404, "Your offline device is unavailable.");
      await audit(
        db,
        { type: "listener", id },
        "offline.device.revoke",
        input.device_id,
      );
      return { ok: true };
    });
  }
  return {
    capabilities,
    register,
    challenge,
    grant,
    media,
    sync,
    devices,
    revoke,
    remove,
  };
}
module.exports = { createOffline, signing, deviceKey };
