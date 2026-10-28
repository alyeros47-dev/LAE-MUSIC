"use strict";
// Temporary review-only voice transport. Never reads or writes an R2 bucket.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { fail } = require("./transactions");
const ROOT = "/tmp/lae-review-media/voice",
  ORIGIN = "https://lae-music-review-sandbox.onrender.com",
  MAX = 12000000;
const ready = new WeakMap();
const enabled = (env = process.env) =>
  require("./review-testing").enabled(env) && env.LAE_REVIEW_TEST_OPEN === "1";
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
function keyPath(key) {
  if (!/^voice-profiles\/[1-9][0-9]*\/[a-f0-9-]{36}\.(mp3|wav)$/.test(key))
    throw fail(400, "Invalid voice sample reference");
  return path.join(ROOT, key);
}
function validAudio(b, mime) {
  if (mime === "audio/mpeg")
    return require("./file-signatures").matches(b, mime);
  return (
    b.length >= 44 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WAVE" &&
    b.toString("ascii", 12, 16) === "fmt " &&
    b.readUInt16LE(20) === 1 &&
    [1, 2].includes(b.readUInt16LE(22)) &&
    b.readUInt32LE(24) >= 8000 &&
    b.readUInt32LE(24) <= 192000 &&
    b.readUInt16LE(34) === 16 &&
    b.readUInt32LE(28) > 0 &&
    (b.length - 44) / b.readUInt32LE(28) >= 10
  );
}
async function init(pool) {
  if (!ready.has(pool))
    ready.set(
      pool,
      (async () => {
        require("./review-catalog").isolated(process.env);
        const x = (
          await pool.query(
            "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port",
          )
        ).rows[0];
        if (
          x.name !== "lae_music_review" ||
          x.host !== "127.0.0.1" ||
          x.port !== 55432
        )
          throw Error("Voice testing refuses a different database");
        await pool.query(
          "CREATE TABLE IF NOT EXISTS review_voice_samples(object_key TEXT PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),bytes INTEGER NOT NULL,mime TEXT NOT NULL,put_hash TEXT NOT NULL,get_hash TEXT,put_expires TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '15 minutes',get_expires TIMESTAMPTZ,uploaded BOOLEAN NOT NULL DEFAULT FALSE); CREATE TABLE IF NOT EXISTS review_voice_attempts(reference TEXT PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),status TEXT NOT NULL,task_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); ALTER TABLE review_voice_attempts ADD COLUMN IF NOT EXISTS task_id TEXT",
        );
      })().catch((e) => {
        ready.delete(pool);
        throw e;
      }),
    );
  return ready.get(pool);
}
function create(pool) {
  async function prepare(id, key, b) {
    await init(pool);
    keyPath(key);
    const token = crypto.randomBytes(32).toString("hex");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [id]);
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtext('review-voice-capacity'))",
      );
      const totals = (
        await db.query(
          "SELECT COUNT(*) FILTER(WHERE artist_id=$1)::int AS own,COALESCE(SUM(bytes),0)::bigint AS total FROM review_voice_samples",
          [id],
        )
      ).rows[0];
      if (totals.own >= 3 || Number(totals.total) + b.bytes > 60000000)
        throw fail(
          507,
          "Temporary voice sample storage is full. Clear testing storage before adding more samples.",
        );
      const current = (
        await db.query(
          "SELECT status FROM artist_voice_profiles WHERE creator_id=$1",
          [id],
        )
      ).rows[0];
      if (
        ["submitting", "training", "verification_required"].includes(
          current?.status,
        )
      )
        throw fail(
          409,
          "Your previous voice request is still processing or awaiting reconciliation.",
        );
      await db.query(
        "INSERT INTO review_voice_samples(object_key,artist_id,bytes,mime,put_hash) VALUES($1,$2,$3,$4,$5)",
        [key, id, b.bytes, b.type, hash(token)],
      );
      await db.query(
        "INSERT INTO artist_voice_profiles(creator_id,object_key,status) VALUES($1,$2,'uploading') ON CONFLICT(creator_id) DO UPDATE SET object_key=$2,task_id=NULL,persona_id=NULL,status='uploading',updated_at=NOW()",
        [id, key],
      );
      await db.query("COMMIT");
      return {
        url:
          ORIGIN +
          "/api/voice/sample/" +
          key.split("/").at(-1) +
          "?upload=" +
          token,
      };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async function head(key) {
    await init(pool);
    const q = await pool.query(
      "SELECT bytes,mime,uploaded FROM review_voice_samples WHERE object_key=$1",
      [key],
    );
    const x = q.rows[0];
    if (!x?.uploaded)
      throw fail(409, "Finish uploading a valid voice sample before training.");
    const stat = await fs.promises.lstat(keyPath(key));
    if (stat.isSymbolicLink() || stat.size !== x.bytes)
      throw fail(409, "Voice sample verification failed.");
    return { ContentLength: x.bytes, ContentType: x.mime };
  }
  async function readURL(key) {
    await head(key);
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      "UPDATE review_voice_samples SET get_hash=$2,get_expires=NOW()+INTERVAL '2 hours' WHERE object_key=$1",
      [key, hash(token)],
    );
    return (
      ORIGIN + "/api/voice/sample/" + key.split("/").at(-1) + "?access=" + token
    );
  }
  async function handle(req, res, url, validOrigin) {
    if (!url.pathname.startsWith("/api/voice/sample/")) return false;
    await init(pool);
    const filename = url.pathname.slice("/api/voice/sample/".length);
    if (!/^[a-f0-9-]{36}\.(mp3|wav)$/.test(filename))
      throw fail(404, "Voice sample unavailable");
    if (!["GET", "HEAD", "PUT"].includes(req.method))
      throw fail(405, "Method not allowed");
    const put = req.method === "PUT",
      token = url.searchParams.get(put ? "upload" : "access");
    if (!/^[a-f0-9]{64}$/.test(token || ""))
      throw fail(404, "Voice sample link is invalid or expired");
    if (put && !validOrigin(req)) throw fail(403, "Invalid upload origin");
    const q = await pool.query(
      `SELECT * FROM review_voice_samples WHERE ${put ? "put_hash" : "get_hash"}=$1 AND ${put ? "put_expires" : "get_expires"}>clock_timestamp()`,
      [hash(token)],
    );
    const x = q.rows[0];
    if (!x || x.object_key.split("/").at(-1) !== filename)
      throw fail(404, "Voice sample link is invalid or expired");
    const file = keyPath(x.object_key);
    if (put) {
      if (x.uploaded)
        throw fail(409, "This voice sample has already been uploaded");
      if (req.headers["content-type"]?.split(";")[0] !== x.mime)
        throw fail(415, "Voice sample format does not match");
      let n = 0,
        parts = [];
      for await (const c of req) {
        n += c.length;
        if (n > x.bytes || n > MAX)
          throw fail(413, "Voice sample exceeds the selected size");
        parts.push(Buffer.from(c));
      }
      const bytes = Buffer.concat(parts);
      if (n !== x.bytes || !validAudio(bytes, x.mime))
        throw fail(
          415,
          "Select a valid MP3 or a PCM WAV recording of at least ten seconds",
        );
      await fs.promises.mkdir(path.dirname(file), {
        recursive: true,
        mode: 0o700,
      });
      await fs.promises.writeFile(file, bytes, { mode: 0o600, flag: "wx" });
      await pool.query(
        "UPDATE review_voice_samples SET uploaded=TRUE WHERE object_key=$1",
        [x.object_key],
      );
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    if (!x.uploaded) throw fail(404, "Voice sample unavailable");
    const stat = await fs.promises.lstat(file);
    if (stat.isSymbolicLink() || stat.size !== x.bytes)
      throw fail(404, "Voice sample unavailable");
    const range = require("./review-testing").byteRange(
      req.headers.range,
      stat.size,
    );
    res.writeHead(range.status, {
      "Content-Type": x.mime,
      "Content-Length": range.end - range.start + 1,
      "Accept-Ranges": "bytes",
      ...(range.status === 206
        ? { "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}` }
        : {}),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (req.method === "HEAD") res.end();
    else
      await require("node:stream/promises").pipeline(
        fs.createReadStream(file, { start: range.start, end: range.end }),
        res,
      );
    return true;
  }
  return { prepare, head, readURL, handle };
}
module.exports = { enabled, init, create, keyPath, validAudio };
