"use strict";
const config = require("../config/listening-ads.json");
function createListeningAds({ premium, source, settings = config } = {}) {
  return {
    async next(listenerId) {
      if (listenerId && (await premium.active(listenerId)))
        return { premium: true, ad: null };
      const c = settings.creative;
      if (
        settings.enabled !== true ||
        !c ||
        c.reviewed !== true ||
        !/^platform\/ads\/[a-zA-Z0-9_./-]+$/.test(c.audio_key || "") ||
        c.audio_key.includes("..") ||
        typeof source !== "function"
      )
        return {
          premium: false,
          ad: null,
          configured: false,
          every_completed_tracks: 3,
        };
      try {
        const url = await source(c.audio_key),
          u = new URL(url);
        if (u.protocol !== "https:") throw Error("Invalid ad source");
        return {
          premium: false,
          configured: true,
          every_completed_tracks: 3,
          ad: {
            id: String(c.id).slice(0, 80),
            sponsor: String(c.sponsor || "LAE-MUSIC").slice(0, 100),
            url: u.href,
            max_seconds: 60,
          },
        };
      } catch {
        return {
          premium: false,
          ad: null,
          configured: false,
          every_completed_tracks: 3,
        };
      }
    },
  };
}
module.exports = { createListeningAds };
