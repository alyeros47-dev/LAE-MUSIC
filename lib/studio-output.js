"use strict";
const { fail } = require("./transactions");
const { allowedHosts, createMediaDownloader } = require("./media-download");
// Exact hosts from official Sonic examples and files.musicapi.ai observed in authenticated completed-task responses.
const DEFAULT_HOSTS =
  "cdn1.suno.ai,cdn2.suno.ai,audiopipe.suno.ai,files.musicapi.ai";
function mediaHosts(env = process.env) {
  return allowedHosts(env.GENERATED_MEDIA_ALLOWED_HOSTS || DEFAULT_HOSTS);
}
function filename(title, extension) {
  return (
    (String(title || "LAE-MUSIC-song")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N} ._-]/gu, "")
      .trim()
      .slice(0, 70) || "LAE-MUSIC-song") +
    "." +
    extension
  );
}
function create({ pool, provider, env = process.env, download }) {
  const get = download || createMediaDownloader({ hosts: mediaHosts(env) });
  async function handle(req, res, url, me) {
    if (url.pathname !== "/api/music/sonic/output") return false;
    if (!["GET", "HEAD"].includes(req.method))
      throw fail(405, "Method not allowed");
    const owner = await me(req);
    if (!owner)
      throw fail(
        401,
        "Sign in to your artist account to save your generated work.",
      );
    const task = url.searchParams.get("task"),
      clip = url.searchParams.get("clip"),
      kind = url.searchParams.get("kind") || "audio";
    if (
      !/^[a-zA-Z0-9_-]{8,128}$/.test(task || "") ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(clip || "") ||
      !["audio", "art"].includes(kind)
    )
      throw fail(400, "Choose a completed song and its audio or artwork.");
    const owned = await pool.query(
      "SELECT task_id FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2 AND status='succeeded'",
      [task, owner.id],
    );
    if (!owned.rowCount)
      throw fail(404, "Completed song not found for this artist.");
    const songs = await provider.clips(task),
      song = songs.find((x) => x.clip_id === clip);
    if (!song) throw fail(404, "This song is not part of your generation.");
    const address = kind === "audio" ? song.audio_url : song.image_url;
    if (!address)
      throw fail(
        404,
        kind === "art"
          ? "The provider has not supplied artwork for this song."
          : "Your song audio is not ready.",
      );
    const media = await get(address, kind);
    const name = filename(song.title, media.extension);
    res.writeHead(200, {
      "Content-Type": media.mime,
      "Content-Length": media.bytes.length,
      "Content-Disposition": `attachment; filename="LAE-MUSIC.${media.extension}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(req.method === "HEAD" ? undefined : media.bytes);
    return true;
  }
  return { handle };
}
module.exports = { DEFAULT_HOSTS, mediaHosts, filename, create };
