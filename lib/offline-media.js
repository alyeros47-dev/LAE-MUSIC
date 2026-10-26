"use strict";
const { fail } = require("./transactions");
const { LIMITS } = require("../web/offline-protocol");
function createOfflineMedia({ storage, presign, fetcher = fetch } = {}) {
  if (!storage?.()) return undefined;
  return async (track) => {
    const config = storage();
    if (!config) throw fail(503, "Music storage is unavailable.");
    const r = await fetcher(presign(config, track.audio_key, "get", 60), {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (
      !r.ok ||
      r.headers.get("content-type")?.split(";")[0] !== track.audio_mime
    )
      throw fail(502, "The song could not be saved for offline listening.");
    let n = 0;
    const chunks = [];
    for await (const chunk of r.body) {
      n += chunk.length;
      if (n > LIMITS.maxBytes || n > Number(track.audio_bytes))
        throw fail(502, "Offline media exceeds its verified size.");
      chunks.push(Buffer.from(chunk));
    }
    if (n !== Number(track.audio_bytes))
      throw fail(502, "Offline media is incomplete.");
    return { bytes: Buffer.concat(chunks), mime: track.audio_mime };
  };
}
module.exports = { createOfflineMedia };
