"use strict";
// Read-only verification on the existing sandbox. Never posts playback or account mutations.
const assert = require("node:assert/strict"),
  snapshot = require("../data/review-public-catalog.json");
const ORIGIN = "https://lae-music-review-sandbox.onrender.com";
async function verify({ fetchImpl = fetch } = {}) {
  async function get(p) {
    const r = await fetchImpl(ORIGIN + p, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    assert.equal(r.status, 200, "Review route unavailable: " + p);
    return r;
  }
  const status = await (
    await get("/api/platform/review-catalog/status")
  ).json();
  assert.equal(status.artists, snapshot.artists.length);
  assert.equal(status.songs, snapshot.tracks.length);
  assert.equal(status.private_accounts_copied, false);
  assert.equal(status.source_writes, false);
  const catalog = await (await get("/api/platform/discover?limit=50")).json();
  assert(catalog.tracks.length >= snapshot.tracks.length);
  const artists = await (await get("/api/music/artists")).json();
  for (const source of snapshot.artists) {
    const a = artists.artists.find(
      (x) => x.display_name === source.display_name,
    );
    assert(a, "Missing imported public artist");
    const profile = await (await get("/api/music/artist?id=" + a.id)).json();
    assert.equal(String(profile.artist.id), String(a.id));
    assert(profile.tracks.length > 0);
  }
  let audioChecks = 0;
  for (const source of snapshot.tracks) {
    const artist = snapshot.artists.find((x) => x.id === source.artist_id);
    const t = catalog.tracks.find(
      (x) => x.title === source.title && x.artist === artist.display_name,
    );
    assert(t, "Missing imported published song");
    const stream = await (
      await get("/api/music/tracks/" + t.id + "/stream")
    ).json();
    const u = new URL(stream.url);
    assert.equal(u.protocol, "https:");
    assert(u.hostname.endsWith(".r2.cloudflarestorage.com"));
    assert(!u.username && !u.password && !u.port);
    const r = await fetchImpl(u, {
      method: "GET",
      redirect: "error",
      headers: { Range: "bytes=0-63" },
      signal: AbortSignal.timeout(45000),
    });
    if (r.status !== 206) {
      await r.body?.cancel();
      throw Error("Review audio range is unavailable");
    }
    assert.equal((await r.arrayBuffer()).byteLength, 64);
    audioChecks++;
  }
  for (const p of [
    "/",
    "/artists",
    "/discover",
    "/account",
    "/workspace",
    "/studio",
    "/music-prompt-studio.html",
    "/admin/studio",
  ]) {
    const r = await get(p);
    assert(
      (await r.text()).includes("/web/app.js"),
      "Integrated navigation shell missing: " + p,
    );
  }
  return {
    public_artist_profiles_verified: snapshot.artists.length,
    published_songs_verified: snapshot.tracks.length,
    audio_range_reads_verified: audioChecks,
    private_accounts_restored: false,
    navigation_shells_verified: 8,
    production_writes: 0,
    storage_credentials_copied: false,
  };
}
module.exports = { verify };
if (require.main === module)
  verify()
    .then((x) => console.log(JSON.stringify(x)))
    .catch(() => {
      console.error(
        "Review catalog verification failed. No production writes or account operations were attempted.",
      );
      process.exitCode = 1;
    });
