"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { enabled: reviewMode, isolated } = require("./review-catalog");
const { fail } = require("./transactions");
const { matches } = require("./file-signatures");
const MAX_AUDIO = 30 * 1024 * 1024,
  MAX_COVER = 3 * 1024 * 1024,
  MAX_TOTAL = 200 * 1024 * 1024,
  UPLOADS = 5;
const ROOT = "/tmp/lae-review-media";
function trackId(value) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(value)))
    throw fail(400, "Invalid test song reference");
  return String(value);
}
const AUDIO = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a" },
  ART = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
function enabled(env = process.env) {
  return reviewMode(env) && env.LAE_REVIEW_TEST_ACCESS === "1";
}
async function identity(db) {
  const r = await db.query(
      "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port",
    ),
    x = r.rows[0];
  if (
    x?.name !== "lae_music_review" ||
    x.host !== "127.0.0.1" ||
    x.port !== 55432
  )
    throw Error("Review testing refuses the connected database identity");
}
async function init(pool, env = process.env) {
  if (!enabled(env)) return;
  isolated(env);
  const db = await pool.connect();
  try {
    await identity(db);
    await db.query(
      "CREATE TABLE IF NOT EXISTS review_test_accounts(artist_id BIGINT PRIMARY KEY REFERENCES creators(id),expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours'); CREATE TABLE IF NOT EXISTS review_trial_usage(artist_id BIGINT PRIMARY KEY REFERENCES creators(id),generation_reference TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS review_uploads(track_id BIGINT PRIMARY KEY REFERENCES music_tracks(id),artist_id BIGINT NOT NULL REFERENCES creators(id),audio_key TEXT NOT NULL,audio_mime TEXT NOT NULL,audio_bytes INTEGER NOT NULL,cover_key TEXT,cover_mime TEXT,cover_bytes INTEGER NOT NULL DEFAULT 0,audio_uploaded BOOLEAN NOT NULL DEFAULT FALSE,cover_uploaded BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
  } finally {
    db.release();
  }
}
async function access(db, artistId) {
  await db.query(
    "INSERT INTO review_test_accounts(artist_id) VALUES($1) ON CONFLICT DO NOTHING",
    [artistId],
  );
  const q = await db.query(
    "SELECT expires_at,expires_at>clock_timestamp() AS active FROM review_test_accounts WHERE artist_id=$1",
    [artistId],
  );
  return q.rows[0];
}
function providerRemaining(file = "/tmp/lae-review-provider-budget.json") {
  try {
    const x = JSON.parse(fs.readFileSync(file, "utf8"));
    return Number.isSafeInteger(x.musicapi) && x.musicapi >= 0
      ? Math.max(0, 1 - x.musicapi)
      : 0;
  } catch (e) {
    return e.code === "ENOENT" ? 1 : 0;
  }
}
async function allowance(pool, artistId, env=process.env) {
  const a = await access(pool, artistId),
    q = await pool.query(
      "SELECT COUNT(*)::int AS used FROM review_trial_usage WHERE artist_id=$1",
      [artistId],
    );
  return {
    active: a.active,
    review_test_access: true,
    review_persistent_storage: env.LAE_REVIEW_PERSISTENT_STORAGE==="1",
    expires_at: a.expires_at,
    plan: null,
    included_generations: 1,
    used_generations: q.rows[0].used,
    remaining_generations: a.active ? Math.max(0, 1 - q.rows[0].used) : 0,
    review_shared_music_remaining: providerRemaining(),
    tracks_per_generation: 2,
    studio_integration_active: true,
    notice:
      "Temporary sandbox test access. One music generation per artist, subject to the shared provider test capacity. No subscription purchase or charge is recorded.",
  };
}
async function reserve(db, artistId, reference) {
  const a = await access(db, artistId);
  if (!a.active)
    throw fail(403, "Your temporary sandbox test access has expired.");
  const r = await db.query(
    "INSERT INTO review_trial_usage(artist_id,generation_reference) VALUES($1,$2) ON CONFLICT(artist_id) DO NOTHING RETURNING artist_id",
    [artistId, reference],
  );
  if (!r.rowCount)
    throw fail(
      402,
      "Your complimentary sandbox music generation is already used or reserved.",
    );
}
function filePath(root, key) {
  if (
    !/^review\/[1-9][0-9]{0,15}\/[a-f0-9]{32}\.(mp3|m4a|jpg|png|webp)$/.test(
      key,
    )
  )
    throw fail(400, "Invalid review media reference");
  const target = path.resolve(root, key);
  if (!target.startsWith(path.resolve(root) + path.sep))
    throw fail(400, "Invalid review media path");
  return target;
}
function byteRange(value, size) {
  if (!value) return { start: 0, end: size - 1, status: 200 };
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2])) throw fail(416, "Invalid audio range");
  let start, end;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1)
      throw fail(416, "Invalid audio range");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw fail(416, "Audio range is outside this file");
  return { start, end, status: 206 };
}
function create({
  pool,
  me,
  env = process.env,
  validOrigin,
  body,
  json,
  root = ROOT,
} = {}) {
  async function member(req) {
    const u = await me(req);
    if (!u) throw fail(401, "Artist sign-in required");
    return u;
  }
  async function liveAccess(id) {
    const a = await access(pool, id);
    if (!a.active) throw fail(403, "Temporary sandbox test access has expired");
    return a;
  }
  async function start(u, b) {
    await liveAccess(u.id);
    if (b.rightsConfirmed !== true)
      throw fail(400, "Confirm that you have permission to share this music");
    const title = String(b.title || "").trim(),
      genre = String(b.genre || "").trim(),
      description = String(b.description || "").trim();
    if (
      title.length < 2 ||
      title.length > 140 ||
      !genre ||
      genre.length > 60 ||
      description.length > 800 ||
      !AUDIO[b.audioMime] ||
      !Number.isSafeInteger(b.audioBytes) ||
      b.audioBytes < 1024 ||
      b.audioBytes > MAX_AUDIO ||
      (b.coverMime &&
        (!ART[b.coverMime] ||
          !Number.isSafeInteger(b.coverBytes) ||
          b.coverBytes < 12 ||
          b.coverBytes > MAX_COVER)) ||
      (!b.coverMime && b.coverBytes)
    )
      throw fail(
        400,
        "Check title, genre and MP3/M4A audio (30 MB maximum), and optional artwork (3 MB maximum)",
      );
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [u.id]);
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtext('lae-review-media-capacity'))",
      );
      const n = await db.query(
        "SELECT COUNT(*)::int AS n FROM review_uploads WHERE artist_id=$1",
        [u.id],
      );
      if (n.rows[0].n >= UPLOADS)
        throw fail(403, "Sandbox limit: five uploaded songs per test artist");
      const total = await db.query(
        "SELECT COALESCE(SUM(audio_bytes+cover_bytes),0)::bigint AS n FROM review_uploads",
      );
      if (
        Number(total.rows[0].n) + b.audioBytes + (b.coverBytes || 0) >
        MAX_TOTAL
      )
        throw fail(507, "Temporary sandbox storage is full");
      const key =
          "review/" + u.id + "/" + crypto.randomBytes(16).toString("hex"),
        audio = key + "." + AUDIO[b.audioMime],
        cover = b.coverMime ? key + "." + ART[b.coverMime] : null;
      const q = await db.query(
        "INSERT INTO music_tracks(creator_id,title,genre,description,audio_key,audio_mime,audio_bytes,cover_key,cover_mime,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_upload') RETURNING id",
        [
          u.id,
          title,
          genre,
          description,
          audio,
          b.audioMime,
          b.audioBytes,
          cover,
          b.coverMime || null,
        ],
      );
      const id = q.rows[0].id;
      await db.query(
        "INSERT INTO review_uploads(track_id,artist_id,audio_key,audio_mime,audio_bytes,cover_key,cover_mime,cover_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          u.id,
          audio,
          b.audioMime,
          b.audioBytes,
          cover,
          b.coverMime || null,
          b.coverBytes || 0,
        ],
      );
      await db.query("COMMIT");
      return { id, temporary_review_storage: true };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async function put(req, u, id, kind) {
    await liveAccess(u.id);
    if (!["audio", "cover"].includes(kind))
      throw fail(400, "Choose audio or artwork");
    const db = await pool.connect();
    let destination,
      created = false;
    try {
      await db.query("BEGIN");
      const q = await db.query(
          "SELECT r.* FROM review_uploads r JOIN music_tracks t ON t.id=r.track_id WHERE r.track_id=$1 AND r.artist_id=$2 AND t.status='pending_upload' FOR UPDATE OF r,t",
          [id, u.id],
        ),
        r = q.rows[0];
      if (!r) throw fail(404, "Pending test upload not found for this artist");
      const key = r[kind + "_key"],
        mime = r[kind + "_mime"],
        expected = Number(r[kind + "_bytes"]);
      if (!key) throw fail(400, "No artwork was requested");
      if (req.headers["content-type"] !== mime)
        throw fail(415, "The uploaded format does not match the selected file");
      if (Number(req.headers["content-length"]) !== expected)
        throw fail(413, "The uploaded size does not match the selected file");
      if (r[kind + "_uploaded"])
        throw fail(409, "This test file is already uploaded");
      destination = filePath(root, key);
      await fs.promises.mkdir(path.dirname(destination), {
        recursive: true,
        mode: 0o700,
      });
      const file = await fs.promises.open(destination, "wx", 0o600);
      created = true;
      let bytes = 0,
        prefix = Buffer.alloc(0);
      try {
        req.setTimeout?.(120000, () => req.destroy());
        for await (const part of req) {
          bytes += part.length;
          if (bytes > expected)
            throw fail(413, "Uploaded file exceeds its declared size");
          if (prefix.length < 64)
            prefix = Buffer.concat([
              prefix,
              Buffer.from(part).subarray(0, 64 - prefix.length),
            ]);
          await file.write(part);
        }
        if (bytes !== expected) throw fail(413, "Upload was incomplete");
        if (!matches(prefix, mime))
          throw fail(415, "File content does not match the selected format");
      } finally {
        await file.close();
      }
      await db.query(
        "UPDATE review_uploads SET " +
          kind +
          "_uploaded=TRUE WHERE track_id=$1",
        [id],
      );
      await db.query("COMMIT");
      return { ok: true };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      if (created) await fs.promises.unlink(destination).catch(() => {});
      if (e.code === "EEXIST")
        throw fail(409, "This file is already being uploaded");
      throw e;
    } finally {
      db.release();
    }
  }
  async function finish(u, id) {
    await liveAccess(u.id);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const q = await db.query(
          "SELECT r.*,t.status FROM review_uploads r JOIN music_tracks t ON t.id=r.track_id WHERE r.track_id=$1 AND r.artist_id=$2 FOR UPDATE OF r,t",
          [id, u.id],
        ),
        r = q.rows[0];
      if (!r) throw fail(404, "Test upload not found");
      if (r.status === "published") {
        await db.query("COMMIT");
        return { ok: true, id, published: true };
      }
      if (
        r.status !== "pending_upload" ||
        !r.audio_uploaded ||
        (r.cover_key && !r.cover_uploaded)
      )
        throw fail(409, "Complete all selected files before publishing");
      for (const kind of ["audio", "cover"])
        if (r[kind + "_key"]) {
          const st = await fs.promises.stat(filePath(root, r[kind + "_key"]));
          if (st.size !== Number(r[kind + "_bytes"]))
            throw fail(409, "Test file size could not be verified");
        }
      await db.query(
        "UPDATE music_tracks SET status='published',published_at=NOW() WHERE id=$1",
        [id],
      );
      await db.query("COMMIT");
      return { ok: true, id, published: true, temporary_review_storage: true };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async function cancel(u, id) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const q = await db.query(
        "SELECT r.* FROM review_uploads r JOIN music_tracks t ON t.id=r.track_id WHERE r.track_id=$1 AND r.artist_id=$2 AND t.status='pending_upload' FOR UPDATE OF r,t",
        [id, u.id],
      );
      if (!q.rowCount) throw fail(404, "Pending test upload not found");
      for (const key of [q.rows[0].audio_key, q.rows[0].cover_key].filter(
        Boolean,
      ))
        await fs.promises.unlink(filePath(root, key)).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      await db.query("UPDATE music_tracks SET status='removed' WHERE id=$1", [
        id,
      ]);
      await db.query("DELETE FROM review_uploads WHERE track_id=$1", [id]);
      await db.query("COMMIT");
      return { ok: true };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async function handle(req, res, url) {
    if (!enabled(env) || !pool) return false;
    const p = url.pathname;
    const writable = [
      "/api/music/upload/start",
      "/api/music/upload/file",
      "/api/music/upload/finish",
      "/api/platform/review-upload/cancel",
    ];
    if (writable.includes(p)) {
      if (!validOrigin(req)) throw fail(403, "Invalid origin");
      const method = p.endsWith("/file") ? "PUT" : "POST";
      if (req.method !== method) {
        json(res, 405, { error: "Method not allowed" });
        return true;
      }
      const u = await member(req);
      if (p.endsWith("/start"))
        json(res, 200, await start(u, await body(req, 5000)));
      else if (p.endsWith("/file"))
        json(
          res,
          200,
          await put(
            req,
            u,
            trackId(url.searchParams.get("id")),
            url.searchParams.get("kind"),
          ),
        );
      else {
        const b = await body(req, 1000);
        json(
          res,
          200,
          p.endsWith("/finish")
            ? await finish(u, trackId(b.id))
            : await cancel(u, trackId(b.id)),
        );
      }
      return true;
    }
    if (p === "/api/music/status" && req.method === "GET") {
      json(res, 200, {
        uploadsEnabled: true,
        storageConfigured: false,
        temporaryReviewStorage: env.LAE_REVIEW_PERSISTENT_STORAGE!=="1",
        persistentReviewStorage: env.LAE_REVIEW_PERSISTENT_STORAGE==="1",
        maxAudioBytes: MAX_AUDIO,
        maxArtBytes: MAX_COVER,
      });
      return true;
    }
    if (p === "/api/artist/subscription" && req.method === "GET") {
      const u = await member(req),
        s = await require("./subscription-view").subscriptionView(
          pool,
          u.id,
          u.plan,
        ),
        a = await access(pool, u.id);
      const used = await pool.query(
        "SELECT COUNT(*)::int AS n FROM review_uploads WHERE artist_id=$1",
        [u.id],
      );
      json(res, 200, {
        ...s,
        review_test_access: a.active,
        review_persistent_storage: env.LAE_REVIEW_PERSISTENT_STORAGE==='1',
        review_expires_at: a.expires_at,
        review_upload_limit: UPLOADS,
        review_uploads_used: used.rows[0].n,
      });
      return true;
    }
    if (p === "/api/artist/studio-allowance" && req.method === "GET") {
      const u = await member(req),
        paid = await pool.query(
          "SELECT id FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold LIMIT 1",
          [u.id],
        );
      if (paid.rowCount) return false;
      json(res, 200, await allowance(pool, u.id, env));
      return true;
    }
    const media = p.match(
        /^\/api\/music\/tracks\/([1-9][0-9]{0,15})\/(stream|cover-image|cover)$/,
      ),
      direct = p.match(
        /^\/api\/platform\/review-media\/([1-9][0-9]{0,15})\/(audio|cover)$/,
      );
    if (!media && !direct) return false;
    if (!["GET", "HEAD"].includes(req.method)) {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    const id = media?.[1] || direct[1],
      q = await pool.query(
        "SELECT r.* FROM review_uploads r JOIN music_tracks t ON t.id=r.track_id WHERE r.track_id=$1 AND t.status='published'",
        [id],
      );
    if (!q.rowCount) return false;
    const r = q.rows[0],
      kind =
        media?.[2] === "stream" || direct?.[2] === "audio" ? "audio" : "cover";
    if (!r[kind + "_key"]) throw fail(404, "No artwork for this song");
    if (media && ["stream", "cover"].includes(media[2])) {
      const protocol =
        enabled(env) && env.NODE_ENV === "staging" ? "https:" : "http:";
      const hostname = req.headers.host;
      const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostname || "");
      if (!local && hostname !== "lae-music-review-sandbox.onrender.com")
        throw fail(400, "Invalid review origin");
      json(res, 200, {
        url:
          (local ? "http:" : protocol) +
          "//" +
          hostname +
          "/api/platform/review-media/" +
          id +
          "/" +
          kind,
      });
      return true;
    }
    const file = filePath(root, r[kind + "_key"]);
    let stat;
    try {
      stat = await fs.promises.stat(file);
    } catch {
      throw fail(404, "This temporary file has expired; upload it again");
    }
    let range;
    try {
      range = byteRange(req.headers.range, stat.size);
    } catch (e) {
      res.setHeader("Content-Range", "bytes */" + stat.size);
      throw e;
    }
    const headers = {
      "Content-Type": r[kind + "_mime"],
      "Content-Length": String(range.end - range.start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    };
    if (range.status === 206)
      headers["Content-Range"] =
        "bytes " + range.start + "-" + range.end + "/" + stat.size;
    res.writeHead(range.status, headers);
    if (req.method === "HEAD") res.end();
    else {
      const stream = fs.createReadStream(file, {
        start: range.start,
        end: range.end,
      });
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    }
    return true;
  }
  return { handle };
}
module.exports = {
  enabled,
  init,
  access,
  allowance,
  reserve,
  providerRemaining,
  filePath,
  byteRange,
  create,
  UPLOADS,
  MAX_AUDIO,
  MAX_COVER,
  MAX_TOTAL,
};
