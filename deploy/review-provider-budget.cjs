"use strict";
// Loaded only by the temporary review image. Production starts server.js normally.
const fs = require("node:fs");
const LIMITS = Object.freeze({ openai: 2, musicapi: 1 });
function createBudget({
  path = "/tmp/lae-review-provider-budget.json",
  fetchImpl = globalThis.fetch,
  fileSystem = fs,
} = {}) {
  return async function limitedFetch(input, options = {}) {
    const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      ),
      method = String(options.method || input?.method || "GET").toUpperCase();
    const kind =
      url.hostname === "api.openai.com"
        ? "openai"
        : url.hostname === "api.musicapi.ai"
          ? "musicapi"
          : null;
    if (kind && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      let state = { openai: 0, musicapi: 0 },
        ok = true;
      try {
        state = JSON.parse(fileSystem.readFileSync(path, "utf8"));
        if (
          !Object.keys(LIMITS).every(
            (k) => Number.isSafeInteger(state[k]) && state[k] >= 0,
          )
        )
          ok = false;
      } catch (e) {
        if (e.code !== "ENOENT") ok = false;
      }
      if (ok && state[kind] < LIMITS[kind]) {
        state[kind]++;
        try {
          fileSystem.writeFileSync(path, JSON.stringify(state), {
            mode: 0o600,
          });
        } catch {
          ok = false;
        }
      } else ok = false;
      if (!ok)
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Temporary sandbox provider test allowance reached. Production quotas and balances were not changed.",
            },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-LAE-Review-Limit": "reached",
            },
          },
        );
    }
    return fetchImpl(input, options);
  };
}
module.exports = { createBudget, LIMITS };
if (
  process.env.NODE_ENV === "staging" &&
  process.env.LAE_REVIEW_ENVIRONMENT === "pr6-ephemeral-review-v1"
)
  globalThis.fetch = createBudget();
