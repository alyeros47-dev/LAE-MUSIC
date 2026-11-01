"use strict";
const { fail } = require("./transactions");
async function lyricsLibrary(pool, artistId) {
  if (!pool) throw fail(503, "Lyrics history is temporarily unavailable.");
  if (!/^[1-9][0-9]*$/.test(String(artistId)))
    throw fail(401, "Artist sign-in required.");
  const result = await pool.query(
    "SELECT g.id,g.title,g.model,g.lyrics,g.style,g.used_at,g.created_at,(SELECT p.result->'output' FROM platform_requests p WHERE p.scope='lyrics:'||$1::text AND p.result->'output'->>'generation_record_id'=g.id::text LIMIT 1) AS description FROM generation_records g WHERE g.creator_id=$1::bigint AND g.model<>'musicapi-sonic' ORDER BY g.id DESC LIMIT 50",
    [artistId],
  );
  // Never expose upload codes, code hashes or another artist's record fields.
  return {
    records: result.rows.map(
      ({ id, title, model, lyrics, style, used_at, created_at, description }) => ({
        id,
        title,
        model,
        lyrics,
        style,
        used_at,
        created_at,
        ...(description?.description_mode?{detailed_style:description.detailed_style,duration_seconds:description.duration_seconds,description_mode:true}:{}),
      }),
    ),
  };
}
module.exports = { lyricsLibrary };
