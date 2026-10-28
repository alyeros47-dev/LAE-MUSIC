"use strict";
// Storage adapter for the existing release importer, restricted to the review DB.
const fs = require("node:fs"),
  path = require("node:path");
const { fail } = require("./transactions");
const ROOT = "/tmp/lae-review-media/releases",
  CAPACITY = 200 * 1024 * 1024;
function enabled(env = process.env) {
  return (
    require("./review-testing").enabled(env) && env.LAE_REVIEW_TEST_OPEN === "1"
  );
}
function filePath(key) {
  if (
    !/^studio-releases\/[1-9][0-9]*\/[1-9][0-9]*\/[a-f0-9-]{36}(?:-cover)?\.(mp3|m4a|jpg|png|webp)$/.test(
      key,
    )
  )
    throw fail(400, "Invalid private release file reference");
  return path.join(ROOT, key);
}
function size(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((n, x) => {
      const p = path.join(dir, x.name);
      if (x.isSymbolicLink())
        throw fail(409, "Unexpected release storage link");
      return n + (x.isDirectory() ? size(p) : fs.statSync(p).size);
    }, 0);
  } catch (e) {
    if (e.code === "ENOENT") return 0;
    throw e;
  }
}
function create({ pool, env = process.env }) {
  let checked;
  async function identity() {
    if (!enabled(env)) throw fail(503, "Temporary release storage is disabled");
    if (!checked)
      checked = (async () => {
        require("./review-catalog").isolated(env);
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
          throw fail(503, "Temporary releases refuse this database");
      })().catch((e) => {
        checked = null;
        throw e;
      });
    return checked;
  }
  async function put(key, media) {
    await identity();
    if (
      !Buffer.isBuffer(media.bytes) ||
      !require("./file-signatures").matches(media.bytes, media.mime)
    )
      throw fail(415, "Release file validation failed");
    const file = filePath(key);
    if (size(ROOT) + media.bytes.length > CAPACITY)
      throw fail(
        507,
        "Temporary release storage is full. Download a copy of your work and contact support.",
      );
    await fs.promises.mkdir(path.dirname(file), {
      recursive: true,
      mode: 0o700,
    });
    await fs.promises.writeFile(file, media.bytes, { flag: "wx", mode: 0o600 });
  }
  function signed(key) {
    filePath(key);
    const p = key.split("/");
    return (
      "/api/platform/studio/media/" +
      p[2] +
      "/" +
      (p[3].includes("-cover.") ? "cover" : "audio")
    );
  }
  async function handle(req, res, url, { me, json }) {
    const direct = url.pathname.match(
        /^\/api\/platform\/studio\/media\/([1-9][0-9]{0,15})\/(audio|cover)$/,
      ),
      track = url.pathname.match(
        /^\/api\/music\/tracks\/([1-9][0-9]{0,15})\/(stream|cover|cover-image)$/,
      );
    if (!direct && !track) return false;
    if (!["GET", "HEAD"].includes(req.method))
      throw fail(405, "Method not allowed");
    await identity();
    let row, kind;
    if (track) {
      row = (
        await pool.query(
          "SELECT r.* FROM studio_releases r JOIN music_tracks t ON t.id=r.track_id WHERE t.id=$1 AND t.status='published' AND r.status='published'",
          [track[1]],
        )
      ).rows[0];
      if (!row) return false;
      kind = track[2] === "stream" ? "audio" : "cover";
      if (track[2] !== "cover-image") {
        if (!row[kind + "_key"]) throw fail(404, "No artwork for this release");
        const host = req.headers.host;
        if (
          !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host || "") &&
          host !== "lae-music-review-sandbox.onrender.com"
        )
          throw fail(400, "Invalid review origin");
        json(res, 200, {
          url:
            (host === "lae-music-review-sandbox.onrender.com"
              ? "https://"
              : "http://") +
            host +
            signed(row[kind + "_key"]),
        });
        return true;
      }
    } else {
      const artist = await me(req);
      row = (
        await pool.query(
          "SELECT r.* FROM studio_releases r LEFT JOIN music_tracks t ON t.id=r.track_id WHERE r.id=$1 AND r.status IN ('ready','published') AND (r.artist_id=$2 OR (r.status='published' AND t.status='published'))",
          [direct[1], artist?.id || null],
        )
      ).rows[0];
      if (!row) throw fail(404, "Release file not found for this account");
      kind = direct[2];
    }
    if (!row[kind + "_key"]) throw fail(404, "No artwork for this release");
    const file = filePath(row[kind + "_key"]);
    let stat;
    try {
      stat = await fs.promises.lstat(file);
    } catch {
      throw fail(
        404,
        "This temporary file expired after a sandbox restart. Your downloaded copy is unaffected.",
      );
    }
    if (stat.isSymbolicLink()) throw fail(404, "Release file unavailable");
    const range = require("./review-testing").byteRange(
      req.headers.range,
      stat.size,
    );
    res.writeHead(range.status, {
      "Content-Type": row[kind + "_mime"],
      "Content-Length": range.end - range.start + 1,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      ...(range.status === 206
        ? { "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}` }
        : {}),
    });
    if (req.method === "HEAD") res.end();
    else
      await require("node:stream/promises").pipeline(
        fs.createReadStream(file, { start: range.start, end: range.end }),
        res,
      );
    return true;
  }
  async function read(key, kind = "audio") {
    await identity();
    const file = filePath(key),
      stat = await fs.promises.lstat(file);
    if (stat.isSymbolicLink()) throw fail(404, "Release file unavailable");
    const bytes = await fs.promises.readFile(file);
    return { bytes, ...require("./media-download").detectFormat(bytes, kind) };
  }
  return {
    read,
    configured: () => enabled(env) && !!pool,
    put,
    signed,
    handle,
  };
}
module.exports = { enabled, create, filePath };
