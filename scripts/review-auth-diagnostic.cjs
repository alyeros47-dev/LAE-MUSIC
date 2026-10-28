"use strict";
// Owner-authorized account lookup. No password verification/reset, deployment,
// billed provider call, production access, or account mutation is permitted.
// Optional model mode performs only approved-model catalog GETs, without accounts.
const crypto = require("node:crypto");
const TARGET = "srv-dbfmk5ss728c73ded300",
  ORIGIN = "https://lae-music-review-sandbox.onrender.com";
async function diagnose({
  key,
  emailHash,
  modelCheck = false,
  fetchImpl = fetch,
} = {}) {
  if (!key || (!modelCheck && !/^[a-f0-9]{64}$/.test(emailHash || "")))
    throw Error(
      "Secure Render access and a valid account digest are required.",
    );
  async function render(suffix) {
    const r = await fetchImpl(
      "https://api.render.com/v1/services/" + TARGET + suffix,
      {
        method: "GET",
        redirect: "error",
        headers: { Authorization: "Bearer " + key, Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok)
      throw Error(
        "Isolated Render lookup failed (" +
          r.status +
          "); credentials and response body omitted.",
      );
    return r.json();
  }
  const service = await render("");
  require("./provision-review.cjs").validateService(service, service.ownerId);
  if (service.id !== TARGET || service.serviceDetails.url !== ORIGIN)
    throw Error("Unexpected review service; stopped.");
  const rows = await render("/env-vars?limit=100");
  const env = Object.fromEntries(
    rows.map((item) => {
      const e = item.envVar || item;
      return [e.key, e.value];
    }),
  );
  if (
    env.NODE_ENV !== "staging" ||
    env.LAE_REVIEW_ENVIRONMENT !== "pr6-ephemeral-review-v1" ||
    env.DATABASE_URL ||
    !env.ADMIN_KEY
  )
    throw Error(
      "Review isolation/access configuration is unexpected; stopped.",
    );
  if (modelCheck) {
    if (!env.OPENAI_API_KEY)
      throw Error("Review lyrics configuration is missing.");
    const { MODELS, verifiedModel } = require("../lib/lyrics-models");
    const models = [];
    for (const choice of MODELS) {
      try {
        await verifiedModel(choice.id, { key: env.OPENAI_API_KEY, fetchImpl });
        models.push({ ...choice, available: true });
      } catch (error) {
        models.push({
          ...choice,
          available: false,
          provider_status: error.providerStatus || null,
        });
      }
    }
    let available_candidates = [],
      catalog_status = null;
    if (models.every((choice) => !choice.available)) {
      try {
        const response = await fetchImpl("https://api.openai.com/v1/models", {
          method: "GET",
          redirect: "error",
          headers: { Authorization: "Bearer " + env.OPENAI_API_KEY },
          signal: AbortSignal.timeout(12000),
        });
        catalog_status = response.status;
        if (response.ok) {
          const catalog = await response.json();
          available_candidates = (catalog.data || [])
            .map((x) => x.id)
            .filter(
              (id) =>
                typeof id === "string" &&
                /^gpt-/.test(id) &&
                (/^(gpt-6)(?:[.-]|$)/.test(id) || /astra|sol/i.test(id)),
            )
            .slice(0, 20);
        }
      } catch {}
    }
    return {
      sandbox_only: true,
      models,
      available_candidates,
      catalog_status,
      configured_legacy_model: /^[a-zA-Z0-9_.-]{1,80}$/.test(
        env.OPENAI_LYRICS_MODEL || "",
      )
        ? env.OPENAI_LYRICS_MODEL
        : null,
      accounts_read: false,
      accounts_changed: false,
      deployments_triggered: 0,
      billed_provider_requests: 0,
      production_access: false,
    };
  }
  let cookie;
  async function app(path, body) {
    const r = await fetchImpl(ORIGIN + path, {
      method: body ? "POST" : "GET",
      redirect: "error",
      headers: {
        Origin: ORIGIN,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok)
      throw Error(
        "Isolated account report failed (" +
          r.status +
          "); response body omitted.",
      );
    return r;
  }
  const login = await app("/api/admin/login", { password: env.ADMIN_KEY });
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw Error("Administrator session was not returned.");
  try {
    const result = {
      sandbox_only: true,
      accounts_changed: false,
      passwords_read: false,
      production_access: false,
      deployments_triggered: 0,
      providers_called: 0,
      roles: {},
    };
    for (const role of ["artists", "listeners"]) {
      const report = await (
        await app("/api/platform/admin/report?section=" + role)
      ).json();
      if (!Array.isArray(report.rows))
        throw Error("Unexpected account report shape.");
      const matches = report.rows.filter(
        (row) =>
          crypto
            .createHash("sha256")
            .update(
              String(row.email || "")
                .trim()
                .toLowerCase(),
            )
            .digest("hex") === emailHash,
      );
      result.roles[role] = {
        found: matches.length,
        complete: report.rows.length < report.limit,
        created_at: matches.map((row) => row.created_at),
      };
    }
    return result;
  } finally {
    if (cookie) await app("/api/admin/logout", {}).catch(() => {});
  }
}
if (require.main === module)
  diagnose({
    key: process.env.RENDER_API_KEY,
    emailHash: process.env.REVIEW_AUTH_EMAIL_SHA256,
    modelCheck: process.env.REVIEW_LYRICS_MODEL_CHECK === "true",
  })
    .then((r) => console.log(JSON.stringify(r)))
    .catch(() => {
      console.error(
        "Isolated account diagnostic failed; credentials, account data and response bodies omitted.",
      );
      process.exitCode = 1;
    });
module.exports = { diagnose };
