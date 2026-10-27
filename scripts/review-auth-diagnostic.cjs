"use strict";
// Owner-authorized account lookup. No password verification/reset, deployment,
// provider call, production service access, or account mutation is permitted.
const crypto = require("node:crypto");
const TARGET = "srv-dbfmk5ss728c73ded300",
  ORIGIN = "https://lae-music-review-sandbox.onrender.com";
async function diagnose({ key, emailHash, fetchImpl = fetch } = {}) {
  if (!key || !/^[a-f0-9]{64}$/.test(emailHash || ""))
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
  })
    .then((r) => console.log(JSON.stringify(r)))
    .catch(() => {
      console.error(
        "Isolated account diagnostic failed; credentials, account data and response bodies omitted.",
      );
      process.exitCode = 1;
    });
module.exports = { diagnose };
