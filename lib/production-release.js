"use strict";
const {
  serviceValid,
  inventory,
} = require("../scripts/audit-existing-service.cjs");
const { normalizedHost, inspect } = require("./neon-recovery-inspection");
const { allowedHosts } = require("./media-download");
const ID = "srv-db84s7m89jmc73c7l9rg",
  REPO = "alyeros47-dev/LAE-MUSIC";
const SOURCE = "br-flat-darkness-b42js8ma",
  PROJECT = "restless-brook-43273058";
const BACKUP = "br-rapid-brook-b4o7ybnx",
  BACKUP_NAME = "lae-release-40891503538-backup";
const BASE = "4e749296bc7a51239684fabffdf00e2c984d113c";
const REQUIRED_JOBS = [
  "application",
  "postgres",
  "review-persistence",
  "browser-compatibility (firefox)",
  "browser-compatibility (webkit)",
];
const SHA = /^[a-f0-9]{40}$/;
function featureSettings(env) {
  const hosts = allowedHosts(env.GENERATED_MEDIA_ALLOWED_HOSTS);
  for (const host of require("./studio-output").DEFAULT_HOSTS.split(","))
    hosts.add(host);
  return {
    LAE_ARTIST_TEST_ACCESS: "1",
    GENERATED_MEDIA_ALLOWED_HOSTS: [...hosts].sort().join(","),
    ...(env.STUDIO_RELEASE_WORKER_ENABLED === "false"
      ? { STUDIO_RELEASE_WORKER_ENABLED: "true" }
      : {}),
  };
}
function preserved(before, after, changes) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].every((k) =>
    Object.hasOwn(changes, k)
      ? after[k] === changes[k]
      : before[k] === after[k],
  );
}
async function release({
  mode,
  candidate,
  commit,
  ciRun,
  key,
  neonKey,
  githubToken,
  fetcher = fetch,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
  attempts = 100,
  record = () => {},
}) {
  if (
    !["plan", "prepare", "deploy"].includes(mode) ||
    !SHA.test(candidate) ||
    !key ||
    !neonKey
  )
    throw Error("Invalid authorized production release configuration");
  if (require("../config/payment-merchant.json").checkout_mode !== "disabled")
    throw Error("This artist-testing release must keep payments disabled");
  async function request(url, method = "GET", body, token) {
    const r = await fetcher(url, {
      method,
      redirect: "error",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) throw Error("Release API HTTP " + r.status);
    return r.status === 204 ? {} : r.json();
  }
  const gh = (path) =>
    request(
      "https://api.github.com/repos/" + REPO + path,
      "GET",
      undefined,
      githubToken,
    );
  async function render(path, method = "GET", body) {
    if (!path.startsWith("/services/" + ID))
      throw Error("Production target mismatch");
    if (
      method !== "GET" &&
      !(
        method === "PUT" &&
        /^\/services\/[^/]+\/env-vars\/(LAE_ARTIST_TEST_ACCESS|GENERATED_MEDIA_ALLOWED_HOSTS|STUDIO_RELEASE_WORKER_ENABLED)$/.test(
          path,
        )
      ) &&
      !(method === "POST" && path === "/services/" + ID + "/deploys")
    )
      throw Error("Forbidden production release mutation");
    return request("https://api.render.com/v1" + path, method, body, key);
  }
  const raw = await render("/services/" + ID),
    service = raw.service || raw;
  if (
    !serviceValid(service) ||
    service.id !== ID ||
    service.branch !== "main" ||
    service.serviceDetails?.runtime !== "node"
  )
    throw Error("Existing production Node service identity mismatch");
  const env = inventory(
    await render("/services/" + ID + "/env-vars?limit=100"),
  );
  if (
    !env.DATABASE_URL ||
    !env.R2_BUCKET ||
    Object.keys(env).some((k) => k.startsWith("LAE_REVIEW_") && env[k])
  )
    throw Error("Existing production configuration is not verified");
  const backupCheck = await inspect({
    key: neonKey,
    databaseUrl: env.DATABASE_URL,
    fetcher,
    now,
  });
  if (!backupCheck.database_binding_verified)
    throw Error("Production database binding changed since recovery");
  const backup = (
    await request(
      "https://console.neon.tech/api/v2/projects/" +
        PROJECT +
        "/branches/" +
        BACKUP,
      "GET",
      undefined,
      neonKey,
    )
  ).branch;
  if (
    backup?.id !== BACKUP ||
    backup.project_id !== PROJECT ||
    backup.parent_id !== SOURCE ||
    backup.name !== BACKUP_NAME ||
    !Number.isFinite(Date.parse(backup.expires_at)) ||
    Date.parse(backup.expires_at) < now() + 3600000
  )
    throw Error("Verified recovery backup is unavailable or near expiry");
  if (mode === "deploy") {
    const pr = await gh("/pulls/10");
    if (
      !pr.merged ||
      pr.head?.sha !== candidate ||
      pr.merge_commit_sha !== commit
    )
      throw Error("Approved production pull request merge is not verified");
  } else {
    const head = (await gh("/git/ref/heads/codex/music-dna-foundation"))
      .object?.sha;
    if (head !== candidate)
      throw Error(
        "Development candidate moved; refusing an unreviewed release",
      );
  }
  const main = (await gh("/git/ref/heads/main")).object?.sha;
  if (mode !== "deploy" && main !== BASE)
    throw Error("Production branch changed before release preparation");
  if (mode === "deploy") {
    if (!SHA.test(commit) || main !== commit)
      throw Error("Deployment must pin the current production merge commit");
    const [merged, prepared] = await Promise.all([
      gh("/git/commits/" + commit),
      gh("/git/commits/" + candidate),
    ]);
    if (
      merged.tree.sha !== prepared.tree.sha ||
      !merged.parents.some((p) => p.sha === candidate)
    )
      throw Error("Production merge differs from the verified candidate");
  }
  if (mode !== "plan") {
    if (!/^\d{6,20}$/.test(String(ciRun)))
      throw Error("A completed candidate CI run is required");
    const run = await gh("/actions/runs/" + ciRun),
      jobs = (await gh("/actions/runs/" + ciRun + "/jobs?per_page=100")).jobs;
    if (
      run.head_sha !== candidate ||
      run.event !== "pull_request" ||
      run.status !== "completed" ||
      run.conclusion !== "success" ||
      !Array.isArray(jobs) ||
      !REQUIRED_JOBS.every((name) =>
        jobs.some((j) => j.name === name && j.conclusion === "success"),
      )
    )
      throw Error(
        "Exact-candidate application/database/browser CI has not passed",
      );
  }
  const desired = featureSettings(env),
    updates = Object.keys(desired).filter((k) => env[k] !== desired[k]);
  const report = {
    mode,
    service_id: ID,
    candidate,
    payments_enabled: false,
    backup_branch: BACKUP,
    backup_binding_verified: true,
    feature_keys_to_update: updates,
    auto_deploy_trigger:
      service.autoDeployTrigger ?? service.autoDeploy ?? "unknown",
    branch: "main",
    runtime: "node",
    secret_values_exposed: false,
  };
  if (mode === "plan") return report;
  if (mode === "prepare") {
    for (const name of updates)
      await render("/services/" + ID + "/env-vars/" + name, "PUT", {
        value: desired[name],
      });
  } else if (updates.length)
    throw Error("Feature settings were not prepared before merge");
  const configured = inventory(
    await render("/services/" + ID + "/env-vars?limit=100"),
  );
  if (!preserved(env, configured, desired))
    throw Error("Unrelated production environment settings changed");
  report.existing_environment_preserved = true;
  report.feature_keys_updated = mode === "prepare" ? updates : [];
  if (mode === "prepare")
    return {
      ...report,
      status: "prepared_for_approved_merge",
      deployment_requested: false,
    };
  const deployments = async () => {
    const list = await render("/services/" + ID + "/deploys?limit=10");
    return list.map((x) => x.deploy || x);
  };
  const active = (await deployments()).find(
    (d) =>
      d.commit?.id === commit &&
      !["build_failed", "update_failed", "canceled", "deactivated"].includes(
        d.status,
      ),
  );
  let deployment = active;
  if (!deployment) {
    const result = await render("/services/" + ID + "/deploys", "POST", {
      commitId: commit,
      clearCache: "do_not_clear",
    });
    deployment = result.deploy || result;
  }
  if (!/^dep-[a-z0-9]+$/.test(deployment?.id))
    throw Error("Deployment reference is invalid");
  record({
    production_deploy_id: deployment.id,
    commit,
    reused_existing_deployment: !!active,
  });
  for (let i = 0; i < attempts; i++) {
    const current = (await deployments()).find((d) => d.id === deployment.id);
    if (current?.commit?.id !== commit)
      throw Error("Pinned production deployment could not be verified");
    if (current.status === "live") {
      const finalEnv = inventory(
        await render("/services/" + ID + "/env-vars?limit=100"),
      );
      if (!preserved(configured, finalEnv, desired))
        throw Error("Production configuration changed during deployment");
      return {
        ...report,
        status: "live",
        deployed_commit: commit,
        deploy_id: deployment.id,
        deployment_requested: !active,
        existing_environment_preserved: true,
      };
    }
    if (
      ["build_failed", "update_failed", "canceled", "deactivated"].includes(
        current.status,
      )
    )
      throw Error("Production deploy failed: " + current.status);
    if (i % 6 === 0) record({ deploy_status: current.status });
    await wait(10000);
  }
  throw Error(
    "Production deployment remains pending; inspect the pinned deployment before retrying",
  );
}
module.exports = { release, featureSettings, preserved, ID, REQUIRED_JOBS };
