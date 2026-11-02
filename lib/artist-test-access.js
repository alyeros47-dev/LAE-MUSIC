"use strict";
// Owner-approved temporary testing. The new explicit switch leaves retired flags closed.
// This fixed campaign never resets on deploy; historical grants and usage are retained.
const { fail } = require("./transactions");
const LIMIT = 2;
function enabled(env = process.env) {
  return env.LAE_ARTIST_STUDIO_TESTING === "1";
}
async function grantLyrics(pool, artistId, env = process.env) {
  if (!enabled(env)) return false;
  // A separate once-only campaign preserves all historical credits and grants.
  await pool.query(
    "WITH awarded AS (INSERT INTO generation_ledger(creator_id,delta,reason,reference) SELECT id,2,'artist_free_lyrics_test','artist-studio-inspection-20261102:'||id::text FROM creators WHERE id=$1 ON CONFLICT(reference) DO NOTHING RETURNING creator_id,delta) INSERT INTO generation_wallets(creator_id,credits) SELECT creator_id,delta FROM awarded ON CONFLICT(creator_id) DO UPDATE SET credits=generation_wallets.credits+EXCLUDED.credits,updated_at=NOW()",
    [artistId],
  );
}
async function remaining(db, artistId) {
  const q = await db.query(
    "SELECT COUNT(*)::int AS used FROM artist_test_generations WHERE artist_id=$1 AND status IN ('reserved','completed') AND created_at>='2026-11-02T00:00:00Z'",
    [artistId],
  );
  return Math.max(0, LIMIT - q.rows[0].used);
}
async function reserve(db, artistId, reference, env = process.env) {
  if (!enabled(env)) throw fail(402,'Complimentary studio testing is closed. An active paid artist package is required.');
  // Caller owns a transaction. This lock also protects direct/internal callers.
  const owner = await db.query(
    "SELECT id FROM creators WHERE id=$1 FOR UPDATE",
    [artistId],
  );
  if (!owner.rowCount) throw fail(404, "Artist account not found.");
  if (!(await remaining(db, artistId)))
    throw fail(
      402,
      "Your two complimentary music-generation requests have been used or reserved. No payment was taken.",
    );
  const q = await db.query(
    "INSERT INTO artist_test_generations(reservation_reference,artist_id) VALUES($1,$2) ON CONFLICT(reservation_reference) DO NOTHING RETURNING artist_id",
    [reference, artistId],
  );
  if (!q.rowCount)
    throw fail(
      409,
      "This complimentary request is already recorded. Reuse its original request key.",
    );
}
async function attach(db, artistId, reference, taskId) {
  const q = await db.query(
    "UPDATE artist_test_generations SET task_reference=$3,updated_at=NOW() WHERE artist_id=$1 AND reservation_reference=$2 AND status='reserved' AND task_reference IS NULL RETURNING artist_id AS id",
    [artistId, reference, taskId],
  );
  if (!q.rowCount)
    throw fail(
      409,
      "Complimentary generation reservation could not be linked.",
    );
  return q;
}
async function settle(db, artistId, reference, status) {
  if (!["completed", "restored"].includes(status))
    throw Error("Invalid complimentary result");
  return db.query(
    "UPDATE artist_test_generations SET status=$3,updated_at=NOW() WHERE artist_id=$1 AND (reservation_reference=$2 OR task_reference=$2) AND status='reserved' RETURNING artist_id",
    [artistId, reference, status],
  );
}
async function allowance(pool, artistId, env = process.env) {
  if(!enabled(env))return {active:false,artist_test_access:false,plan:null,included_generations:0,used_generations:0,remaining_generations:0,tracks_per_generation:2,studio_integration_active:false};
  const left = await remaining(pool, artistId);
  return {
    active: true,
    artist_test_access: true,
    plan: null,
    included_generations: LIMIT,
    used_generations: LIMIT - left,
    remaining_generations: left,
    tracks_per_generation: 2,
    studio_integration_active: true,
    notice:
      "Complimentary artist testing: two music-generation requests, each intended to return two songs subject to provider output. No subscription purchase is required. Your account and usage remain in the platform database.",
  };
}
module.exports = {
  enabled,
  grantLyrics,
  remaining,
  reserve,
  attach,
  settle,
  allowance,
};
