"use strict";
const crypto = require("node:crypto");
const PROJECT = "restless-brook-43273058",
  SOURCE = "br-flat-darkness-b42js8ma";
const { normalizedHost, inspect } = require("./neon-recovery-inspection");
const { databaseOptions } = require("./database");
const quoted = (x) => '"' + String(x).replace(/"/g, '""') + '"';
const stamp = (env) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest("hex");
async function fingerprint(pool, originalColumns, migrationVersions) {
  if (migrationVersions !== undefined && (!Array.isArray(migrationVersions) || migrationVersions.some(v => typeof v !== "string") || new Set(migrationVersions).size !== migrationVersions.length)) throw Error("Invalid recovery migration inventory");
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query("SET LOCAL statement_timeout='30s'");
    await db.query("SET LOCAL timezone='UTC'");
    const columns =
      originalColumns ||
      (
        await db.query(
          "SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name COLLATE \"C\",c.ordinal_position",
        )
      ).rows;
    const names = [...new Set(columns.map((c) => c.table_name))];
    if (!names.length || names.length > 200)
      throw Error("Unexpected recovery table inventory");
    const data = [];
    let totalBytes = 0;
    for (const name of names) {
      const size = Number(
        (
          await db.query("SELECT pg_total_relation_size($1)::text AS bytes", [
            "public." + quoted(name),
          ])
        ).rows[0].bytes,
      );
      totalBytes += size;
      if (totalBytes > 128 * 1024 * 1024)
        throw Error("Recovery dataset exceeds reviewed rehearsal bound");
      const fields = columns
        .filter((c) => c.table_name === name)
        .map((c) => quoted(c.column_name))
        .join(",");
      const q = await db.query(
        "SELECT COUNT(*)::int AS rows,encode(sha256(convert_to(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text COLLATE \"C\"),''),'UTF8')),'hex') AS checksum FROM (SELECT " +
          fields +
          " FROM public." +
          quoted(name) +
          (name === "platform_migrations" && migrationVersions !== undefined ? " WHERE version=ANY($1::text[])" : "") +
          ") t",
        name === "platform_migrations" && migrationVersions !== undefined ? [migrationVersions] : [],
      );
      if (q.rows[0].rows > 50000) throw Error("Recovery row bound exceeded");
      data.push({ name, rows: q.rows[0].rows, checksum: q.rows[0].checksum });
    }
    await db.query("COMMIT");
    return { columns, data }; // Internal only. Never log hashes, column values or private records.
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}
function matches(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function cloneIdentity(
  branch,
  endpoint,
  sourceUrl,
  expectedParent,
  expectedName,
) {
  if (
    !branch ||
    branch.id === SOURCE ||
    branch.project_id !== PROJECT ||
    branch.parent_id !== expectedParent ||
    branch.name !== expectedName ||
    !/^br-[a-z0-9-]+$/.test(branch.id)
  )
    throw Error("Owned recovery branch identity mismatch");
  if (
    !endpoint ||
    endpoint.branch_id !== branch.id ||
    endpoint.project_id !== PROJECT ||
    !/^ep-[a-z0-9-]+$/.test(endpoint.id) ||
    !endpoint.host?.endsWith(".neon.tech") ||
    normalizedHost(endpoint.host) ===
      normalizedHost(new URL(sourceUrl).hostname)
  )
    throw Error("Recovery endpoint identity mismatch");
}
async function rehearsal({
  neonKey,
  productionEnv,
  runId,
  fetcher = fetch,
  poolFactory = (options) => new (require("pg").Pool)(options),
  migrate = require("./migrations").migrate,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
  record = () => {},
  backupBranchId,
  backupRunId,
  restoreCopy = require("./private-recovery-copy").restore,
}) {
  if (!/^\d{6,20}$/.test(String(runId)))
    throw Error("A real workflow run identifier is required");
  const check = await inspect({
    key: neonKey,
    databaseUrl: productionEnv.DATABASE_URL,
    fetcher,
    now,
  });
  if (!check.database_binding_verified)
    throw Error(
      "Existing production database management binding is not verified",
    );
  const sourceUrl = new URL(productionEnv.DATABASE_URL),
    prefix = "lae-release-" + runId;
  let stage = "prepare";
  let backup = null,
    backupEndpoint = null;
  const report = {
    production_writes: 0,
    production_database_replaced: false,
    production_branch_restored: false,
    recovery_verified: false,
    restore_tested: false,
  };
  async function api(method, suffix, body) {
    // No reset/restore/finalize, production endpoint changes, billing or project mutation.
    const allowed =
      method === "GET" ||
      (method === "POST" && suffix === "/branches") ||
      (method === "POST" &&
        suffix === "/endpoints" &&
        backup &&
        body?.endpoint?.branch_id === backup.branch.id &&
        backup.branch.id !== SOURCE) ||
      (method === "DELETE" && /^\/endpoints\/ep-[a-z0-9-]+$/.test(suffix));
    if (!allowed || suffix.includes(SOURCE))
      throw Error("Forbidden recovery management mutation");
    const r = await fetcher(
      "https://console.neon.tech/api/v2/projects/" + PROJECT + suffix,
      {
        method,
        redirect: "error",
        headers: {
          Authorization: "Bearer " + neonKey,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!r.ok) throw Error("Recovery management HTTP " + r.status);
    return r.status === 204 ? {} : r.json();
  }
  async function ready(id) {
    for (let n = 0; n < 60; n++) {
      const b = (await api("GET", "/branches/" + id)).branch;
      if (b?.current_state === "ready") return b;
      await wait(5000);
    }
    throw Error("Recovery branch readiness timed out");
  }
  async function create(parent, name, hours) {
    const existing = (await api("GET", "/branches")).branches;
    if (!Array.isArray(existing) || existing.some((b) => b.name === name))
      throw Error(
        "Recovery run name already exists; inspect it before rerunning",
      );
    const result = await api("POST", "/branches", {
      branch: {
        name,
        parent_id: parent,
        init_source: "parent-data",
        expires_at: new Date(now() + hours * 3600000)
          .toISOString()
          .replace(/\.\d{3}Z$/, "Z"),
      },
      endpoints: [
        {
          type: "read_write",
          autoscaling_limit_min_cu: 0.25,
          autoscaling_limit_max_cu: 0.25,
        },
      ],
    });
    const branch = result.branch,
      endpoint = result.endpoints?.[0];
    cloneIdentity(branch, endpoint, sourceUrl, parent, name);
    record({
      created_branch_id: branch.id,
      kind: parent === SOURCE ? "backup" : "isolated_rehearsal",
      expires_at: branch.expires_at || null,
    });
    return { branch, endpoint, name, parent };
  }
  async function poolFor(target) {
    cloneIdentity(
      target.branch,
      target.endpoint,
      sourceUrl,
      target.parent,
      target.name,
    );
    await ready(target.branch.id);
    const q = new URLSearchParams({
      branch_id: target.branch.id,
      endpoint_id: target.endpoint.id,
      database_name: decodeURIComponent(sourceUrl.pathname.slice(1)),
      role_name: decodeURIComponent(sourceUrl.username),
      pooled: "false",
    });
    const uri = (await api("GET", "/connection_uri?" + q)).uri,
      url = new URL(uri);
    if (
      normalizedHost(url.hostname) !== normalizedHost(target.endpoint.host) ||
      normalizedHost(url.hostname) === normalizedHost(sourceUrl.hostname) ||
      url.pathname !== sourceUrl.pathname ||
      url.username !== sourceUrl.username
    )
      throw Error("Recovery connection binding mismatch");
    const options = databaseOptions({
      DATABASE_URL: uri,
      DATABASE_POOL_MAX: "1",
    });
    if (!options.ssl?.rejectUnauthorized)
      throw Error("Verified recovery TLS is required");
    const pool = poolFactory(options);
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      await pool.end();
      throw e;
    }
    return { pool, uri };
  }
  try {
    const pgVersion = Number((await api("GET", "")).project?.pg_version);
    if (![16, 17, 18].includes(pgVersion))
      throw Error("Unsupported backup PostgreSQL version");
    stage = "create_or_reopen_backup";
    if (backupBranchId) {
      if (
        !/^br-[a-z0-9-]+$/.test(backupBranchId) ||
        backupBranchId === SOURCE ||
        !/^\d{6,20}$/.test(String(backupRunId))
      )
        throw Error("Invalid saved backup identity");
      const branch = (await api("GET", "/branches/" + backupBranchId)).branch;
      const name = "lae-release-" + backupRunId + "-backup";
      if (
        branch?.id !== backupBranchId ||
        branch.project_id !== PROJECT ||
        branch.parent_id !== SOURCE ||
        branch.name !== name ||
        !branch.expires_at ||
        Date.parse(branch.expires_at) <= now()
      )
        throw Error("Saved backup binding or expiry mismatch");
      backup = { branch, name, parent: SOURCE };
      const endpoints = (await api("GET", "/endpoints")).endpoints?.filter(
        (e) => e.branch_id === backupBranchId,
      );
      if (!Array.isArray(endpoints) || endpoints.length > 1)
        throw Error("Ambiguous saved backup compute");
      const endpoint =
        endpoints[0] ||
        (
          await api("POST", "/endpoints", {
            endpoint: {
              branch_id: backupBranchId,
              type: "read_write",
              autoscaling_limit_min_cu: 0.25,
              autoscaling_limit_max_cu: 0.25,
            },
          })
        ).endpoint;
      cloneIdentity(branch, endpoint, sourceUrl, SOURCE, name);
      backup.endpoint = endpoint;
    } else backup = await create(SOURCE, prefix + "-backup", 168);
    backupEndpoint = backup.endpoint;
    report.backup_branch_id = backup.branch.id;
    report.backup_expires_at = backup.branch.expires_at;
    stage = "read_backup";
    const source = await poolFor(backup);
    let original;
    try {
      original = await fingerprint(source.pool);
    } finally {
      await source.pool.end();
    }
    stage = "restore_private_local_copy";
    const verified = await restoreCopy({
      uri: source.uri,
      original,
      pgVersion,
      runId,
      migrate,
    });
    if (
      !verified.restore_tested ||
      !verified.recovery_verified ||
      !verified.local_recovery_database_removed
    )
      throw Error("Local recovery did not verify and clean up");
    Object.assign(report, verified, {
      status: "verified_backup_and_isolated_upgrade",
    });
  } catch (e) {
    e.recoveryStage = stage;
    throw e;
  } finally {
    if (backupEndpoint && backup) {
      cloneIdentity(
        backup.branch,
        backupEndpoint,
        sourceUrl,
        SOURCE,
        backup.name,
      );
      await api("DELETE", "/endpoints/" + backupEndpoint.id);
    }
  }
  return report;
}
module.exports = { fingerprint, cloneIdentity, rehearsal, stamp };
