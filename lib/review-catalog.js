"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const SOURCE = "https://lae-music.onrender.com",
  MODE = "pr6-ephemeral-review-v1";
const id = (x) => typeof x === "string" && /^[1-9][0-9]{0,15}$/.test(x);
function validateSnapshot(s) {
  if (
    !s ||
    s.version !== 1 ||
    s.source !== SOURCE ||
    s.scope !== "published_songs_and_public_artist_profiles_only" ||
    !Number.isFinite(Date.parse(s.captured_at)) ||
    !Array.isArray(s.artists) ||
    !Array.isArray(s.tracks) ||
    s.artists.length > 500 ||
    s.tracks.length > 5000
  )
    throw Error("Invalid public review snapshot");
  const exact = (x, keys) => Object.keys(x).every((k) => keys.includes(k));
  if (
    !exact(s, [
      "version",
      "source",
      "captured_at",
      "scope",
      "artists",
      "tracks",
    ])
  )
    throw Error("Private or unknown snapshot fields are not allowed");
  const text = (s, max) =>
    typeof s === "string" && s.length <= max && !s.includes("\0");
  const artists = new Set(),
    tracks = new Set();
  for (const a of s.artists) {
    if (
      !exact(a, ["id", "display_name"]) ||
      !id(a.id) ||
      artists.has(a.id) ||
      !text(a.display_name, 100) ||
      a.display_name.length < 2
    )
      throw Error("Invalid public artist");
    artists.add(a.id);
  }
  for (const t of s.tracks) {
    if (
      !exact(t, [
        "id",
        "artist_id",
        "title",
        "genre",
        "description",
        "plays",
        "created_at",
        "published_at",
        "status",
      ]) ||
      !id(t.id) ||
      tracks.has(t.id) ||
      !artists.has(t.artist_id) ||
      t.status !== "published" ||
      !text(t.title, 140) ||
      !t.title ||
      !text(t.genre, 60) ||
      !text(t.description, 800) ||
      !/^\d{1,18}$/.test(t.plays) ||
      !Number.isFinite(Date.parse(t.created_at)) ||
      !Number.isFinite(Date.parse(t.published_at))
    )
      throw Error("Invalid published track");
    tracks.add(t.id);
  }
  return s;
}
function enabled(env) {
  return env.NODE_ENV === "staging" && env.LAE_REVIEW_ENVIRONMENT === MODE;
}
function isolated(env) {
  if (!enabled(env))
    throw Error("Public catalog copies require the isolated review image");
  let u;
  try {
    u = new URL(env.DATABASE_URL);
  } catch {
    throw Error("Review database is unavailable");
  }
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "55432" ||
    u.pathname !== "/lae_music_review"
  )
    throw Error(
      "Public catalog import refuses external or production databases",
    );
}
function loadSnapshot() {
  return validateSnapshot(
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../data/review-public-catalog.json"),
        "utf8",
      ),
    ),
  );
}
async function seed(
  pool,
  { env = process.env, snapshot = loadSnapshot() } = {},
) {
  isolated(env);
  validateSnapshot(snapshot);
  if (!pool) throw Error("Review database required");
  const db = await pool.connect();
  let addedArtists = 0,
    addedTracks = 0,
    begun = false;
  try {
    const identity = await db.query(
      "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port",
    );
    const actual = identity.rows[0];
    if (
      actual?.name !== "lae_music_review" ||
      actual?.host !== "127.0.0.1" ||
      actual?.port !== 55432
    )
      throw Error("Review catalog refuses the connected database identity");
    await db.query("BEGIN");
    begun = true;
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('lae-review-public-catalog'))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS review_public_artists(source_id BIGINT PRIMARY KEY,artist_id BIGINT NOT NULL UNIQUE REFERENCES creators(id),imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS review_public_tracks(source_id BIGINT PRIMARY KEY,track_id BIGINT NOT NULL UNIQUE REFERENCES music_tracks(id),imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const mapping = new Map();
    for (const a of snapshot.artists) {
      let q = await db.query(
        "SELECT artist_id FROM review_public_artists WHERE source_id=$1",
        [a.id],
      );
      if (!q.rowCount) {
        // Unusable random credentials, reserved .invalid email, no subscription or funds.
        const user = await db.query(
          "INSERT INTO creators(display_name,email,password_salt,password_hash,plan,membership_status) VALUES($1,$2,$3,$4,'starter','review_public_profile') RETURNING id",
          [
            a.display_name,
            "public-artist-" + a.id + "@review-catalog.invalid",
            crypto.randomBytes(32).toString("hex"),
            crypto.randomBytes(64).toString("hex"),
          ],
        );
        q = { rows: [{ artist_id: user.rows[0].id }] };
        await db.query(
          "INSERT INTO review_public_artists(source_id,artist_id) VALUES($1,$2)",
          [a.id, q.rows[0].artist_id],
        );
        addedArtists++;
      }
      mapping.set(a.id, q.rows[0].artist_id);
    }
    for (const t of snapshot.tracks) {
      const existing = await db.query(
        "SELECT track_id FROM review_public_tracks WHERE source_id=$1",
        [t.id],
      );
      if (existing.rowCount) continue;
      const q = await db.query(
        "INSERT INTO music_tracks(creator_id,title,genre,description,audio_key,audio_mime,audio_bytes,status,plays,created_at,published_at) VALUES($1,$2,$3,$4,$5,'audio/mpeg',0,'published',$6,$7,$8) RETURNING id",
        [
          mapping.get(t.artist_id),
          t.title,
          t.genre,
          t.description,
          "review-public-catalog/" + t.id,
          t.plays,
          t.created_at,
          t.published_at,
        ],
      );
      await db.query(
        "INSERT INTO review_public_tracks(source_id,track_id) VALUES($1,$2)",
        [t.id, q.rows[0].id],
      );
      addedTracks++;
    }
    await db.query("COMMIT");
    return {
      added_artists: addedArtists,
      added_tracks: addedTracks,
      public_artists: snapshot.artists.length,
      published_songs: snapshot.tracks.length,
      private_accounts_copied: false,
    };
  } catch (e) {
    if (begun) await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}
function createReviewCatalog({ pool, env = process.env, fetchImpl = fetch }) {
  const active = enabled(env);
  const fail = (res, status, error) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ error }));
    return true;
  };
  async function upstream(p) {
    const r = await fetchImpl(SOURCE + p, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "application/json" },
    });
    if (r.status !== 200) throw Error("Public source unavailable");
    return r;
  }
  async function handle(req, res, url) {
    if (!active || !pool || req.method !== "GET") return false;
    const p = url.pathname;
    if (p === "/api/platform/review-catalog/status") {
      const [a, t] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS n FROM review_public_artists"),
        pool.query("SELECT COUNT(*)::int AS n FROM review_public_tracks"),
      ]);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          scope: "published_songs_and_public_artist_profiles_only",
          artists: a.rows[0].n,
          songs: t.rows[0].n,
          private_accounts_copied: false,
          source_writes: false,
          storage_credentials_copied: false,
        }),
      );
      return true;
    }
    const track = p.match(
        /^\/api\/music\/tracks\/([1-9][0-9]{0,15})\/(stream|cover|cover-image)$/,
      ),
      photo = p === "/api/artist/photo" && id(url.searchParams.get("id"));
    if (!track && !photo) return false;
    const q = track
      ? await pool.query(
          "SELECT m.source_id FROM review_public_tracks m JOIN music_tracks t ON t.id=m.track_id WHERE m.track_id=$1 AND t.status='published'",
          [track[1]],
        )
      : await pool.query(
          "SELECT source_id FROM review_public_artists WHERE artist_id=$1",
          [url.searchParams.get("id")],
        );
    if (!q.rowCount) return false;
    const sourceId = String(q.rows[0].source_id);
    if (!id(sourceId)) return fail(res, 502, "Invalid review media reference");
    try {
      const r = await upstream(
        track
          ? "/api/music/tracks/" + sourceId + "/" + track[2]
          : "/api/artist/photo?id=" + sourceId,
      );
      if (track && ["stream", "cover"].includes(track[2])) {
        const j = await r.json();
        let u;
        try {
          u = new URL(j.url);
        } catch {
          throw Error("Invalid media reference");
        }
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.port ||
          !u.hostname.endsWith(".r2.cloudflarestorage.com")
        )
          throw Error("Unexpected public media host");
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ url: u.toString() }));
        return true;
      }
      const type = (r.headers.get("content-type") || "").split(";")[0];
      if (
        !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)
      )
        throw Error("Unexpected public artwork type");
      const chunks = [];
      let length = 0;
      for await (const chunk of r.body) {
        length += chunk.length;
        if (length > 3 * 1024 * 1024) throw Error("Artwork too large");
        chunks.push(Buffer.from(chunk));
      }
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "private, max-age=120",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(Buffer.concat(chunks));
      return true;
    } catch {
      return fail(
        res,
        502,
        "Original public media is temporarily unavailable. Please try again.",
      );
    }
  }
  return { handle };
}
module.exports = {
  SOURCE,
  MODE,
  enabled,
  isolated,
  validateSnapshot,
  seed,
  createReviewCatalog,
};
