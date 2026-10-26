"use strict";
const crypto = require("node:crypto"),
  fs = require("node:fs");
const {
  validateService,
  BRANCH,
  REPO,
  safeUrl,
} = require("./provision-review.cjs");
const TARGET = "srv-dbfmk5ss728c73ded300",
  ORIGIN = "https://lae-music-review-sandbox.onrender.com",
  LIVE = "https://lae-music.onrender.com",
  BUCKET = "lae-music-review-sandbox";
const COPY = [
  "OPENAI_API_KEY",
  "OPENAI_LYRICS_MODEL",
  "MUSICAPI_API_KEY",
  "GENERATED_MEDIA_ALLOWED_HOSTS",
];
const STORAGE = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];
const DELEGATED = [
  "R2_SESSION_TOKEN",
  "LAE_REVIEW_R2_MODE",
  "REVIEW_STORAGE_ORIGIN",
  "REVIEW_STORAGE_TICKET_KEY",
];
const ALLOWED = new Set([...COPY, ...STORAGE, ...DELEGATED]);
function envMap(rows) {
  if (!Array.isArray(rows)) throw Error("Invalid environment inventory.");
  const out = {};
  for (const item of rows) {
    const e = item.envVar || item;
    if (
      typeof e.key !== "string" ||
      typeof e.value !== "string" ||
      Object.hasOwn(out, e.key)
    )
      throw Error("Ambiguous environment inventory.");
    out[e.key] = e.value;
  }
  return out;
}
function fingerprint(env) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        Object.keys(env)
          .sort()
          .map((k) => [k, env[k]]),
      ),
    )
    .digest("hex");
}
function validateTarget(service, source) {
  validateService(service, source.ownerId);
  if (
    service.id !== TARGET ||
    safeUrl(service.serviceDetails.url) !== ORIGIN ||
    source.id === TARGET ||
    source.serviceDetails?.url !== LIVE ||
    source.repo?.replace(/\.git$/, "") !== REPO ||
    source.type !== "web_service" ||
    !/^srv-[a-z0-9]+$/.test(source.id)
  )
    throw Error("Source/target isolation check failed.");
}
function planEnvironment(source, target, sandbox = {}) {
  if (
    target.NODE_ENV !== "staging" ||
    target.LAE_REVIEW_ENVIRONMENT !== "pr6-ephemeral-review-v1" ||
    target.DATABASE_URL ||
    target.RENDER_API_KEY
  )
    throw Error("Sandbox isolation configuration is invalid.");
  if (
    target.R2_BUCKET &&
    (target.R2_BUCKET !== BUCKET || target.R2_BUCKET === source.R2_BUCKET)
  )
    throw Error("Sandbox must not use production storage.");
  const grant = require("./bootstrap-review-r2.cjs");
  const proposalTemporary =
    sandbox.LAE_REVIEW_R2_MODE === require("../lib/review-storage").MODE &&
    grant.verifyDerived(source, sandbox);
  if (
    sandbox.LAE_REVIEW_R2_MODE === require("../lib/review-storage").MODE &&
    !proposalTemporary
  )
    throw Error("Invalid or expired review storage delegation.");
  const targetTemporary =
    target.LAE_REVIEW_R2_MODE === require("../lib/review-storage").MODE &&
    grant.verifyDerived(source, target);
  if (proposalTemporary || targetTemporary) {
    const updates = [];
    for (const key of COPY)
      if (!target[key]?.trim() && source[key]?.trim())
        updates.push({ key, value: source[key].trim() });
    if (proposalTemporary) {
      if (
        sandbox.REVIEW_STORAGE_ORIGIN !== ORIGIN ||
        !/^[a-f0-9]{64}$/.test(sandbox.REVIEW_STORAGE_TICKET_KEY || "")
      )
        throw Error("Invalid review object proxy configuration.");
      for (const key of [...STORAGE, ...DELEGATED])
        if (target[key] !== sandbox[key])
          updates.push({ key, value: sandbox[key] });
    }
    return updates;
  }
  const existingStorage = STORAGE.filter((k) => !!target[k]);
  if (existingStorage.length && existingStorage.length !== 4)
    throw Error(
      "Partial sandbox storage configuration must be reviewed before merging credentials.",
    );
  if (
    existingStorage.length &&
    (target.R2_ACCESS_KEY_ID === source.R2_ACCESS_KEY_ID ||
      target.R2_SECRET_ACCESS_KEY === source.R2_SECRET_ACCESS_KEY)
  )
    throw Error("Sandbox storage credentials must be separately scoped.");
  const updates = [];
  for (const key of COPY)
    if (!target[key]?.trim() && source[key]?.trim())
      updates.push({ key, value: source[key].trim() });
  const supplied = STORAGE.map((k) => sandbox["SANDBOX_" + k]?.trim() || "");
  if (supplied.some(Boolean) && !supplied.every(Boolean))
    throw Error("Supply all four SANDBOX_R2 settings together.");
  if (supplied.every(Boolean)) {
    if (supplied[3] !== BUCKET || supplied[3] === source.R2_BUCKET)
      throw Error("Dedicated sandbox bucket is required.");
    if (
      supplied[1] === source.R2_ACCESS_KEY_ID ||
      supplied[2] === source.R2_SECRET_ACCESS_KEY
    )
      throw Error(
        "Use a separately scoped sandbox R2 key, not the production storage credential.",
      );
    for (let i = 0; i < STORAGE.length; i++)
      if (!target[STORAGE[i]])
        updates.push({ key: STORAGE[i], value: supplied[i] });
  }
  return updates;
}
async function configure({
  key,
  sha,
  sandbox = {},
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  attempts = 110,
  verify = true,
  bootstrapStorage = false,
  verifyStorage = false,
} = {}) {
  if (!key?.trim()) throw Error("GitHub RENDER_API_KEY secret is required.");
  if (!/^[a-f0-9]{40}$/.test(sha || ""))
    throw Error("An exact development commit is required.");
  let sourceId = null;
  async function api(path, method = "GET", data) {
    if (
      method !== "GET" &&
      !(
        method === "PUT" &&
        path.startsWith("/services/" + TARGET + "/env-vars/") &&
        ALLOWED.has(decodeURIComponent(path.split("/").at(-1)))
      ) &&
      !(method === "POST" && path === "/services/" + TARGET + "/deploys")
    )
      throw Error("Production mutation is forbidden.");
    if (
      method === "GET" &&
      path.includes("/env-vars") &&
      ![
        "/services/" + TARGET + "/env-vars",
        "/services/" + sourceId + "/env-vars",
      ].some((p) => path === p || path.startsWith(p + "?"))
    )
      throw Error("Environment access is restricted to the verified services.");
    let r;
    try {
      r = await fetchImpl("https://api.render.com/v1" + path, {
        method,
        redirect: "error",
        headers: {
          Authorization: "Bearer " + key.trim(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw Error(
        "Render transport failed; response bodies and credential values are omitted.",
      );
    }
    if (!r.ok)
      throw Error(
        "Render " +
          method +
          " failed with HTTP " +
          r.status +
          "; no production mutations are permitted.",
      );
    try {
      return await r.json();
    } catch {
      throw Error("Invalid Render response.");
    }
  }
  const target = await api("/services/" + TARGET);
  let services = [],
    cursor = "";
  for (let i = 0; i < 10; i++) {
    const batch = await api(
      "/services?limit=100" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!Array.isArray(batch)) throw Error("Invalid service inventory.");
    services.push(...batch.map((x) => x.service));
    if (batch.length < 100) break;
    const next = batch.at(-1)?.cursor;
    if (!next || next === cursor || i === 9)
      throw Error("Incomplete service inventory.");
    cursor = next;
  }
  const matches = services.filter(
    (s) =>
      s.serviceDetails?.url === LIVE &&
      s.repo?.replace(/\.git$/, "") === REPO &&
      s.ownerId === target.ownerId,
  );
  if (matches.length !== 1)
    throw Error("The live source service cannot be identified unambiguously.");
  const source = matches[0];
  validateTarget(target, source);
  sourceId = source.id;
  const readEnv = async (id) => {
    let rows = [],
      c = "";
    for (let i = 0; i < 10; i++) {
      const batch = await api(
        "/services/" +
          id +
          "/env-vars?limit=100" +
          (c ? "&cursor=" + encodeURIComponent(c) : ""),
      );
      if (!Array.isArray(batch)) throw Error("Invalid environment inventory.");
      rows.push(...batch);
      if (batch.length < 100) return envMap(rows);
      const n = batch.at(-1)?.cursor;
      if (!n || n === c) throw Error("Incomplete environment inventory.");
      c = n;
    }
    throw Error("Environment inventory exceeds safety limit.");
  };
  const sourceEnv = await readEnv(sourceId),
    targetEnv = await readEnv(TARGET),
    before = fingerprint(sourceEnv),
    sourceDeploys = await api("/services/" + sourceId + "/deploys?limit=1");
  let storageBootstrap = null;
  if (bootstrapStorage && !STORAGE.some((k) => sandbox["SANDBOX_" + k])) {
    const storageModule = require("../lib/review-storage");
    let refresh = !STORAGE.every((k) => targetEnv[k]);
    if (targetEnv.LAE_REVIEW_R2_MODE === storageModule.MODE) {
      try {
        refresh =
          storageModule.decodeGrant(targetEnv.R2_SESSION_TOKEN).claims.exp *
            1000 -
            Date.now() <
          86400000;
      } catch {
        refresh = true;
      }
    }
    if (refresh) {
      const prepared = await require("./bootstrap-review-r2.cjs").bootstrap(
        sourceEnv,
        { fetchImpl, ticketKey: targetEnv.REVIEW_STORAGE_TICKET_KEY },
      );
      const { environment, ...safeReport } = prepared;
      storageBootstrap = safeReport;
      if (prepared.configured) sandbox = { ...sandbox, ...environment };
      log("Review storage bootstrap: " + JSON.stringify(safeReport));
    }
  }
  const updates = planEnvironment(sourceEnv, targetEnv, sandbox);
  for (const item of updates) {
    await api("/services/" + TARGET + "/env-vars/" + item.key, "PUT", {
      value: item.value,
    });
    targetEnv[item.key] = item.value;
    log("Configured a separate sandbox value: " + item.key);
  }
  const latest = await api("/services/" + TARGET + "/deploys?limit=1");
  const last = latest[0]?.deploy || latest[0];
  if (updates.length || last?.commit?.id !== sha || last?.status !== "live")
    await api("/services/" + TARGET + "/deploys", "POST", {
      commitId: sha,
      clearCache: "do_not_clear",
    });
  let live = false;
  for (let i = 0; i < attempts; i++) {
    const list = await api("/services/" + TARGET + "/deploys?limit=1"),
      d = list[0]?.deploy || list[0];
    if (
      ["build_failed", "update_failed", "canceled", "deactivated"].includes(
        d?.status,
      )
    )
      throw Error(
        "Sandbox deploy failed: " +
          d.status +
          ". The live site was not modified.",
      );
    if (d?.status === "live" && d.commit?.id === sha) {
      live = true;
      break;
    }
    if (i % 6 === 0) log("Waiting for sandbox-only configuration deployment.");
    await sleep(10000);
  }
  if (!live)
    throw Error(
      "Sandbox rollout is pending. No production deployment was requested.",
    );
  const checks = {};
  if (verify) {
    for (const [name, url, credential] of [
      ["openai", "https://api.openai.com/v1/models", targetEnv.OPENAI_API_KEY],
      [
        "musicapi",
        "https://api.musicapi.ai/api/v1/get-credits",
        targetEnv.MUSICAPI_API_KEY,
      ],
    ]) {
      if (!credential) {
        checks[name] = { configured: false, verified: false };
        continue;
      }
      try {
        const r = await fetchImpl(url, {
          headers: { Authorization: "Bearer " + credential },
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        });
        const b = await r.json();
        checks[name] = {
          configured: true,
          verified:
            r.ok &&
            (name === "openai"
              ? Array.isArray(b.data)
              : Number.isFinite(b.credits ?? b.data?.credits)),
          http_status: r.status,
        };
      } catch {
        checks[name] = { configured: true, verified: false };
      }
    }
  }
  const storageProbe =
    verify && verifyStorage && STORAGE.every((k) => !!targetEnv[k])
      ? await require("./verify-review-storage.cjs").verifyStorage(targetEnv, {
          source: sourceEnv,
          fetchImpl,
        })
      : null;
  const sourceAfter = await readEnv(sourceId),
    deploysAfter = await api("/services/" + sourceId + "/deploys?limit=1");
  if (
    fingerprint(sourceAfter) !== before ||
    fingerprint({ deploy: JSON.stringify(sourceDeploys) }) !==
      fingerprint({ deploy: JSON.stringify(deploysAfter) })
  )
    throw Error(
      "Live configuration/deployment changed during verification. This workflow performed no source writes.",
    );
  const result = {
    url: ORIGIN,
    source_configuration_unchanged: true,
    source_deployment_unchanged: true,
    separate_environment: true,
    updated_keys: updates.map((x) => x.key),
    providers: checks,
    storage_configured: STORAGE.every((k) => !!targetEnv[k]),
    storage_requires_separate_credentials: !STORAGE.every(
      (k) => !!targetEnv[k],
    ),
    storage_bootstrap: storageBootstrap,
    storage_upload_verified: storageProbe?.verified === true,
    storage_probe: storageProbe,
    voice_training_verified: false,
    music_generation_verified: false,
    production_ready: false,
  };
  return result;
}
module.exports = {
  envMap,
  fingerprint,
  validateTarget,
  planEnvironment,
  configure,
  TARGET,
  ORIGIN,
  LIVE,
  BUCKET,
};
if (require.main === module)
  (async () => {
    if (
      process.env.GITHUB_REPOSITORY !== "alyeros47-dev/LAE-MUSIC" ||
      process.env.GITHUB_REF !== "refs/heads/" + BRANCH
    )
      throw Error("Restricted to the development repository and branch.");
    const sandbox = Object.fromEntries(
      STORAGE.map((k) => ["SANDBOX_" + k, process.env["SANDBOX_" + k] || ""]),
    );
    const result = await configure({
      key: process.env.RENDER_API_KEY,
      sha: process.env.GITHUB_SHA,
      sandbox,
      bootstrapStorage: process.env.LAE_BOOTSTRAP_REVIEW_R2 === "1",
      verifyStorage: process.env.LAE_VERIFY_REVIEW_STORAGE === "1",
    });
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "## Sandbox integration configuration\n\n" +
          JSON.stringify(result, null, 2) +
          "\n\nShared provider credentials retain shared billing/rate limits. No production key was moved, rotated, removed or replaced. Generation/voice execution remains a separate test.\n",
      );
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
