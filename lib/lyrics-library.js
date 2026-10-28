"use strict";
const { fail } = require("./transactions");
async function lyricsLibrary(pool, artistId) {
  if (!pool) throw fail(503, "Lyrics history is temporarily unavailable.");
  if (!/^[1-9][0-9]*$/.test(String(artistId)))
    throw fail(401, "Artist sign-in required.");
  const result = await pool.query(
    "SELECT id,title,model,lyrics,style,used_at,created_at FROM generation_records WHERE creator_id=$1 ORDER BY id DESC LIMIT 50",
    [artistId],
  );
  // Never expose upload codes, code hashes or another artist's record fields.
  return {
    records: result.rows.map(
      ({ id, title, model, lyrics, style, used_at, created_at }) => ({
        id,
        title,
        model,
        lyrics,
        style,
        used_at,
        created_at,
      }),
    ),
  };
}
module.exports = { lyricsLibrary };
