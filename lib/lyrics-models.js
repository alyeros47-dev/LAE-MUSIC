"use strict";
const crypto = require("node:crypto");
const MODELS = Object.freeze([
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
]);
const fail = (message, status = 503) =>
  Object.assign(Error(message), { status });
function createVerifier({ now = Date.now } = {}) {
  const cache = new Map();
  return async function verifiedModel(id, { key, fetchImpl = fetch } = {}) {
    if (!MODELS.some((x) => x.id === id))
      throw fail("Choose GPT-6.1 Sol or GPT-6 Astra.", 400);
    if (!key)
      throw fail(
        "The lyrics service is not connected. No lyrics credit was spent.",
      );
    const fingerprint = crypto
      .createHash("sha256")
      .update(key + "\0" + id)
      .digest("hex");
    const old = cache.get(fingerprint);
    if (old && old.until > now()) return old.promise;
    if (cache.size > 8) cache.clear();
    const entry = { until: now() + 60000, promise: null };
    entry.promise = (async () => {
      let response;
      try {
        response = await fetchImpl(
          "https://api.openai.com/v1/models/" + encodeURIComponent(id),
          {
            method: "GET",
            redirect: "error",
            headers: { Authorization: "Bearer " + key },
            signal: AbortSignal.timeout(12000),
          },
        );
      } catch {
        throw fail(
          "The selected lyrics model could not be verified. No lyrics credit was spent.",
        );
      }
      if (!response.ok)
        throw Object.assign(
          fail(
            "The selected lyrics model is unavailable through the connected service. No lyrics credit was spent.",
          ),
          { providerStatus: response.status },
        );
      let data;
      try {
        data = await response.json();
      } catch {
        throw fail(
          "The selected lyrics model could not be verified. No lyrics credit was spent.",
        );
      }
      if (data.id !== id)
        throw fail(
          "The lyrics service did not confirm the selected model. No lyrics credit was spent.",
        );
      entry.until = now() + 15 * 60000;
      return id;
    })();
    cache.set(fingerprint, entry);
    return entry.promise;
  };
}
module.exports = { MODELS, createVerifier, verifiedModel: createVerifier() };
