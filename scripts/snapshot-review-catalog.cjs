"use strict";
// Public metadata only. Never reads account, financial, storage or session secrets.
const fs = require("node:fs"),
  path = require("node:path");
const ORIGIN = "https://lae-music.onrender.com";
async function snapshot({ fetchImpl = fetch, now = () => new Date() } = {}) {
  async function get(p) {
    const r = await fetchImpl(ORIGIN + p, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (r.status !== 200) throw Error("Public catalog source unavailable");
    return r.json();
  }
  const [a, t] = await Promise.all([
    get("/api/music/artists"),
    get("/api/music/tracks?limit=50"),
  ]);
  if (
    !Array.isArray(a.artists) ||
    !Array.isArray(t.tracks) ||
    a.artists.length >= 50 ||
    t.tracks.length >= 50
  )
    throw Error(
      "Public source requires pagination review; refusing an incomplete snapshot",
    );
  const artists = a.artists.map((x) => ({
    id: String(x.id),
    display_name: x.display_name,
  }));
  const tracks = t.tracks.map((x) => ({
    id: String(x.id),
    artist_id: String(x.artist_id),
    title: x.title,
    genre: x.genre,
    description: x.description || "",
    plays: String(x.plays || 0),
    created_at: x.created_at,
    published_at: x.published_at,
    status: x.status,
  }));
  const result = {
    version: 1,
    source: ORIGIN,
    captured_at: now().toISOString(),
    scope: "published_songs_and_public_artist_profiles_only",
    artists,
    tracks,
  };
  require("../lib/review-catalog").validateSnapshot(result);
  return result;
}
module.exports = { snapshot };
if (require.main === module)
  snapshot()
    .then((data) => {
      const dest = path.join(__dirname, "../data/review-public-catalog.json");
      fs.writeFileSync(dest, JSON.stringify(data, null, 2) + "\n");
      console.log(
        JSON.stringify({
          public_artists: data.artists.length,
          published_songs: data.tracks.length,
          private_accounts_copied: false,
          production_writes: 0,
        }),
      );
    })
    .catch(() => {
      console.error(
        "Public catalog snapshot failed; no credentials or account data were requested.",
      );
      process.exitCode = 1;
    });
