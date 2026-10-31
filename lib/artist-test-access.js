"use strict";
// Historical complimentary records are retained for reconciliation. Public free
// artist testing was closed by the owner; no environment flag can reopen it.
const { fail } = require("./transactions");
const LIMIT = 2;
function enabled() { return false; }
async function grantLyrics() { return false; }
async function remaining(db, artistId) {
  const q = await db.query(
    "SELECT COUNT(*)::int AS used FROM artist_test_generations WHERE artist_id=$1 AND status IN ('reserved','completed')",
    [artistId],
  );
  return Math.max(0, LIMIT - q.rows[0].used);
}
async function reserve() { throw fail(402,'Public free artist testing is closed. An active paid artist package is required.'); }
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
async function allowance(pool,artistId) {const used=LIMIT-await remaining(pool,artistId);return {active:false,artist_test_access:false,plan:null,included_generations:0,used_generations:used,remaining_generations:0,tracks_per_generation:2,studio_integration_active:false,notice:'An active, verified paid artist package is required.'};}
module.exports = {
  enabled,
  grantLyrics,
  remaining,
  reserve,
  attach,
  settle,
  allowance,
};
