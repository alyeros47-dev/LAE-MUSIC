"use strict";
const crypto = require("node:crypto"),
  { fail, transaction } = require("./transactions"),
  { uuid } = require("./premium-utils");
const { fence } = require("./streaming-royalties");
function createPlayback({ pool, now = Date.now } = {}) {
  async function start(listenerId, trackId) {
    if (!/^[1-9][0-9]{0,15}$/.test(String(trackId)))
      throw fail(400, "Choose a song.");
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
        listenerId,
      ]);
      const t = (
        await db.query(
          "SELECT t.id,t.creator_id FROM music_tracks t JOIN creators c ON c.id=t.creator_id JOIN listeners l ON l.id=$2 WHERE t.id=$1 AND t.status='published' AND LOWER(c.email)<>LOWER(l.email)",
          [trackId, listenerId],
        )
      ).rows[0];
      if (!t) return { eligible: false };
      const e = (
        await db.query(
          "SELECT e.id FROM premium_entitlements e WHERE e.listener_id=$1 AND e.starts_at<=$2 AND e.expires_at>$2 AND NOT EXISTS(SELECT 1 FROM premium_reversals r WHERE r.order_id=e.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews r WHERE r.order_id=e.order_id) ORDER BY e.expires_at DESC LIMIT 1",
          [listenerId, new Date(now())],
        )
      ).rows[0];
      if (!e) return { eligible: false };
      const id = crypto.randomUUID();
      await db.query(
        "INSERT INTO premium_playback(id,listener_id,track_id,artist_id,entitlement_id,started_at,last_at) VALUES($1,$2,$3,$4,$5,$6,$6)",
        [id, listenerId, t.id, t.creator_id, e.id, new Date(now())],
      );
      await db.query(
        "INSERT INTO premium_playback_active(listener_id,playback_id) VALUES($1,$2) ON CONFLICT(listener_id) DO UPDATE SET playback_id=EXCLUDED.playback_id",
        [listenerId, id],
      );
      return { eligible: true, id, sequence: 0, minimum_listening_seconds: 30 };
    });
  }
  async function heartbeat(listenerId, input) {
    if (
      !uuid(input?.id) ||
      !Number.isInteger(input.sequence) ||
      input.sequence < 1 ||
      typeof input.position !== "number" ||
      !Number.isFinite(input.position) ||
      input.position < 0 ||
      input.position > 86400
    )
      throw fail(400, "Invalid playback signal.");
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM listeners WHERE id=$1 FOR UPDATE", [
        listenerId,
      ]);
      const s = (
        await db.query(
          "SELECT p.*,r.mode,r.currency FROM premium_playback p JOIN premium_entitlements e ON e.id=p.entitlement_id JOIN premium_receipts r ON r.order_id=e.order_id JOIN premium_playback_active active ON active.listener_id=p.listener_id AND active.playback_id=p.id WHERE p.id=$1 AND p.listener_id=$2 AND e.starts_at<=$3 AND e.expires_at>$3 AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=e.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=e.order_id) AND EXISTS(SELECT 1 FROM music_tracks t WHERE t.id=p.track_id AND t.status='published') FOR UPDATE OF p",
          [input.id, listenerId, new Date(now())],
        )
      ).rows[0];
      if (!s)
        throw fail(409, "Playback accounting session expired or was replaced.");
      if (input.sequence <= s.sequence)
        return { ok: true, qualified: !!s.qualified_at, sequence: s.sequence };
      if (input.sequence !== s.sequence + 1)
        throw fail(409, "Use the next playback sequence.");
      const elapsed = Math.max(0, now() - new Date(s.last_at).getTime()),
        progress = input.position - s.last_position;
      const earned =
        elapsed <= 25000 &&
        progress >= 0 &&
        progress <= (elapsed / 1000) * 1.15 + 1
          ? Math.floor(Math.min(elapsed, progress * 1000, 15000))
          : 0;
      const listened = Math.min(300000, s.listened_ms + earned);
      await db.query(
        "UPDATE premium_playback SET sequence=$2,last_at=$3,last_position=$4,listened_ms=$5 WHERE id=$1",
        [s.id, input.sequence, new Date(now()), input.position, listened],
      );
      let qualified = !!s.qualified_at;
      if (
        !qualified &&
        listened >= 30000 &&
        now() - new Date(s.started_at).getTime() >= 30000
      ) {
        const month = new Date(now()).toISOString().slice(0, 7);
        await fence(db, month, s.mode);
        if (
          !(
            await db.query(
              "SELECT 1 FROM royalty_statements WHERE month=$1 AND mode=$2 AND currency=$3",
              [month, s.mode,s.currency],
            )
          ).rowCount
        ) {
          const limits = (
            await db.query(
              "SELECT COUNT(*) FILTER(WHERE track_id=$2 AND occurred_at>$3::timestamptz-INTERVAL '30 minutes')::int AS repeats,COUNT(*) FILTER(WHERE occurred_at>=date_trunc('day',$3::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS daily FROM premium_streams WHERE listener_id=$1 AND occurred_at>$3::timestamptz-INTERVAL '1 day'",
              [listenerId, s.track_id, new Date(now())],
            )
          ).rows[0];
          if (limits.repeats === 0 && limits.daily < 720) {
            await db.query(
              "INSERT INTO premium_streams(playback_id,listener_id,track_id,artist_id,entitlement_id,occurred_at,listened_ms) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(playback_id) DO NOTHING",
              [
                s.id,
                listenerId,
                s.track_id,
                s.artist_id,
                s.entitlement_id,
                new Date(now()),
                listened,
              ],
            );
            await db.query(
              "UPDATE premium_playback SET qualified_at=$2 WHERE id=$1",
              [s.id, new Date(now())],
            );
            qualified = true;
          }
        }
      }
      return { ok: true, sequence: input.sequence, qualified };
    });
  }
  return { start, heartbeat };
}
module.exports = { createPlayback };
