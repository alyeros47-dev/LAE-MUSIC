"use strict";
const crypto = require("node:crypto"),
  fs = require("node:fs");
const REPO = "https://github.com/alyeros47-dev/LAE-MUSIC",
  BRANCH = "codex/premium-platform-release",
  NAME = "lae-music-review-sandbox";
const marker = "pr6-ephemeral-review-v1";
function safeUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".onrender.com") ||
    u.hostname === "lae-music.onrender.com" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("Render did not return an isolated HTTPS review origin.");
  return u.origin;
}
function servicePayload(ownerId) {
  if (!/^(tea|usr)-[a-z0-9]+$/.test(ownerId))
    throw Error("Invalid Render workspace.");
  return {
    type: "web_service",
    name: NAME,
    ownerId,
    repo: REPO,
    branch: BRANCH,
    autoDeployTrigger: "off",
    envVars: [
      { key: "NODE_ENV", value: "staging" },
      { key: "LAE_REVIEW_ENVIRONMENT", value: marker },
      { key: "ADMIN_KEY", value: crypto.randomBytes(32).toString("hex") },
      { key: "STUDIO_RELEASE_WORKER_ENABLED", value: "false" },
      { key: "ARTIST_NOTIFICATION_WORKER_ENABLED", value: "false" },
    ],
    serviceDetails: {
      runtime: "docker",
      plan: "free",
      region: "oregon",
      healthCheckPath: "/health",
      envSpecificDetails: {
        dockerfilePath: "./deploy/review.Dockerfile",
        dockerContext: ".",
      },
    },
  };
}
function validateService(s, owner) {
  if (
    s.name !== NAME ||
    s.type !== "web_service" ||
    s.ownerId !== owner ||
    s.repo?.replace(/\.git$/, "") !== REPO ||
    s.branch !== BRANCH ||
    !((s.serviceDetails?.plan === "free" && !s.serviceDetails?.disk) || require("../deploy/review-state.cjs").persistentService(s)) ||
    (s.autoDeployTrigger !== undefined
      ? s.autoDeployTrigger !== "off"
      : s.autoDeploy !== "no")
  )
    throw Error(
      "Existing service is not the expected isolated review service; no modification performed.",
    );
  if (!/^srv-[a-z0-9]+$/.test(s.id)) throw Error("Invalid review resource ID.");
  if (s.serviceDetails?.url) safeUrl(s.serviceDetails.url);
  return s;
}
function chooseOwner(owners, services) {
  if (owners.length === 1) return owners[0].id;
  const found = services.filter(
    (s) =>
      s.serviceDetails?.url === "https://lae-music.onrender.com" &&
      s.repo?.replace(/\.git$/, "") === REPO,
  );
  if (found.length === 1 && owners.some((o) => o.id === found[0].ownerId))
    return found[0].ownerId;
  throw Error(
    "Multiple Render workspaces are available; provide the intended workspace ID before creation.",
  );
}
async function provision({
  key,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  attempts = 110,
  verifyPreview = require("./check-preview.cjs").checkPreview,
} = {}) {
  if (!key?.trim())
    throw Error(
      "RENDER_API_KEY is absent from this GitHub workflow. Add it as a repository Actions secret; do not paste it into chat.",
    );
  key = key.trim();
  async function api(path, method = "GET", body) {
    if (
      !(
        (method === "GET" && /^\/(owners|services)(\?|\/|$)/.test(path)) ||
        (method === "POST" && path === "/services")
      )
    )
      throw Error("Non-review mutation refused.");
    let r;
    try {
      r = await fetchImpl("https://api.render.com/v1" + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Error(
        "Render API transport failed; credentials and response bodies are omitted. Inspect the review service before retrying a create.",
      );
    }
    if (!r.ok)
      throw Error(
        `Render API ${method} ${path.split("?")[0]} returned HTTP ${r.status}. No paid-plan fallback, production mutation or credential output is allowed.`,
      );
    try {
      return await r.json();
    } catch {
      throw Error("Render API returned an invalid response.");
    }
  }
  async function list(kind) {
    const rows = [];
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const batch = await api(
        "/" +
          kind +
          "?limit=100" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      if (!Array.isArray(batch)) throw Error("Invalid Render inventory.");
      rows.push(
        ...batch.map((x) => x[kind === "owners" ? "owner" : "service"]),
      );
      if (batch.length < 100) return rows;
      const next = batch.at(-1).cursor;
      if (!next || next === cursor)
        throw Error("Incomplete Render inventory; creation refused.");
      cursor = next;
    }
    throw Error("Render inventory exceeds review safety limit.");
  }
  const owners = await list("owners"),
    services = await list("services"),
    owner = chooseOwner(owners, services);
  const matches = services.filter(
    (s) => s.name === NAME && s.ownerId === owner,
  );
  if (matches.length > 1)
    throw Error("Ambiguous review service; creation refused.");
  let s;
  if (matches.length) {
    s = validateService(matches[0], owner);
    const env = await api("/services/" + s.id + "/env-vars?limit=100");
    if (
      !Array.isArray(env) ||
      !env.some(
        (x) =>
          (x.envVar || x).key === "LAE_REVIEW_ENVIRONMENT" &&
          (x.envVar || x).value === marker,
      ) ||
      env.some((x) =>
        ["DATABASE_URL", "RENDER_API_KEY"].includes((x.envVar || x).key),
      )
    )
      throw Error(
        "Existing review isolation marker or database configuration is unexpected; no changes performed.",
      );
    log(
      "Existing isolated review service found; configuration and credentials were not replaced.",
    );
    // Existing services have automatic deployment disabled. Do not occupy the
    // shared release lock waiting for code that the queued integration job deploys.
    return {
      url:safeUrl(s.serviceDetails.url),status:'awaiting_configured_deployment',
      production_ready:false,temporary_database:true,service_id:s.id,
    };
  } else {
    const result = await api("/services", "POST", servicePayload(owner));
    s = validateService(result.service || result, owner);
    log("Created isolated free review service: " + s.id);
  }
  let origin = s.serviceDetails?.url ? safeUrl(s.serviceDetails.url) : null;
  if (origin) log("Review URL: " + origin);
  for (let i = 0; i < attempts; i++) {
    const current = validateService(await api("/services/" + s.id), owner);
    if (current.serviceDetails?.url)
      origin = safeUrl(current.serviceDetails.url);
    const deploys = await api("/services/" + s.id + "/deploys?limit=1");
    const deploy = deploys[0]?.deploy || deploys[0];
    if (
      ["build_failed", "update_failed", "canceled", "deactivated"].includes(
        deploy?.status,
      )
    )
      throw Error(
        "Isolated review deploy stopped: " +
          deploy.status +
          ". Production was not changed.",
      );
    if (origin && deploy?.status === "live") {
      const report = await verifyPreview(origin);
      if (report.status === "available_for_review") {
        log(
          "PASS: read-only review probes. Test data is temporary; real providers remain unverified.",
        );
        return {
          url: origin,
          status: "available_for_review",
          production_ready: false,
          temporary_database: true,
          service_id: s.id,
        };
      }
    }
    if (i % 6 === 0)
      log(
        "Waiting for isolated review build/startup; production remains unchanged.",
      );
    await sleep(10000);
  }
  throw Error(
    "Review deployment is still pending. Its resources were preserved; no production deployment or paid upgrade was attempted.",
  );
}
module.exports = {
  servicePayload,
  validateService,
  chooseOwner,
  safeUrl,
  provision,
  NAME,
  REPO,
  BRANCH,
};
if (require.main === module)
  (async () => {
    if (
      process.env.GITHUB_REPOSITORY !== "alyeros47-dev/LAE-MUSIC" ||
      process.env.GITHUB_REF !== "refs/heads/" + BRANCH
    )
      throw Error(
        "This command is limited to the authorized repository development branch.",
      );
    const result = await provision({ key: process.env.RENDER_API_KEY });
    const text =
      "## LAE-MUSIC test site\n\n" +
      result.url +
      "\n\nStatus: " + result.status + ". Temporary isolated database; data can reset on restart. Existing services hand off to the isolated integration workflow for deployment and verification. No production merge/deploy or live finance is authorized.\n";
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
