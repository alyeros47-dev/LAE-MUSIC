"use strict";
// Loaded only by the temporary review image. Production starts server.js normally.
const fs = require("node:fs");
const LIMITS = Object.freeze({ openai: 2, musicapi: 1 });
function createBudget({
  path = "/tmp/lae-review-provider-budget.json",
  mode = "shared",
  getContext = () => require("../lib/request-context").get(),
  now = Date.now,
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
    if (
      mode === "account" &&
      kind &&
      !["GET", "HEAD", "OPTIONS"].includes(method)
    ) {
      const context = getContext()?.reviewProvider;
      const allowed =
        method === "POST" &&
        ((url.origin === "https://api.openai.com" &&
          ["/v1/responses", "/v1/chat/completions"].includes(url.pathname)) ||
          (url.origin === "https://api.musicapi.ai" &&
            url.pathname === "/api/v1/sonic/create"));
      const deny = (message, status = 503, definitelyNotSent = true) =>
        new Response(JSON.stringify({ error: { message } }), {
          status,
          headers: {
            "Content-Type": "application/json",
            "X-LAE-Review-Limit": "account",
            ...(definitelyNotSent
              ? { "X-LAE-Review-Rejected": "before-provider" }
              : {}),
          },
        });
      if (
        !allowed ||
        context?.kind !== kind ||
        !/^[1-9][0-9]*$/.test(context?.artistId || "") ||
        !/^(?:sonic-[a-f0-9]{32}|[a-f0-9-]{36})$/.test(context?.reference || "")
      )
        return deny(
          "This sandbox provider request has no authenticated generation reservation. No provider charge was made.",
        );
      let state = { openai: 0, musicapi: 0, requests: {} };
      try {
        state = JSON.parse(fileSystem.readFileSync(path, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT")
          return deny(
            "The test request journal needs review. No provider request was sent.",
          );
      }
      if (
        !Number.isSafeInteger(state.openai) ||
        !Number.isSafeInteger(state.musicapi) ||
        state.openai < 0 ||
        state.musicapi < 0 ||
        (state.requests && typeof state.requests !== "object")
      )
        return deny("The test request journal needs review.");
      state.requests = state.requests || {};
      const digest = require("node:crypto")
        .createHash("sha256")
        .update(kind + ":" + context.artistId + ":" + context.reference)
        .digest("hex");
      if (state.requests[digest])
        return deny(
          "This generation reservation was already submitted. Check its status instead of submitting it again.",
          409,
          false,
        );
      const day = now() - 24 * 60 * 60 * 1000;
      const attempts = Object.values(state.requests).filter(
        (x) =>
          x.artistId === context.artistId && x.kind === kind && x.at >= day,
      ).length;
      if (attempts >= 5)
        return deny(
          "Five provider attempts have been made for this account today. Stop and reconcile failed attempts before more tests.",
          429,
        );
      state.requests[digest] = { artistId: context.artistId, kind, at: now() };
      state[kind]++;
      try {
        fileSystem.writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
      } catch {
        return deny(
          "The test request could not be recorded. No provider charge was made.",
        );
      }
      return fetchImpl(input, options);
    }
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
  globalThis.fetch = createBudget({
    mode: process.env.LAE_REVIEW_TEST_OPEN === "1" ? "account" : "shared",
  });
