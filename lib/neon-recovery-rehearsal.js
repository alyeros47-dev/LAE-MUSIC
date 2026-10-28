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
async function fingerprint(pool, originalColumns) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query("SET LOCAL statement_timeout='30s'");
    await db.query("SET LOCAL timezone='UTC'");
    const columns =
      originalColumns ||
      (
        await db.query(
          "SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.ordinal_position",
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
        "SELECT COUNT(*)::int AS rows,encode(sha256(convert_to(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),''),'UTF8')),'hex') AS checksum FROM (SELECT " +
          fields +
          " FROM public." +
          quoted(name) +
          ") t",
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
  let clone = null,
    backup = null,
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
      (method === "DELETE" &&
        /^\/(branches\/br-|endpoints\/ep-)[a-z0-9-]+$/.test(suffix));
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
    return pool;
  }
  try {
    stage = "create_backup";
    backup = await create(SOURCE, prefix + "-backup", 168);
    report.backup_branch_id = backup.branch.id;
    backupEndpoint = backup.endpoint;
    stage = "read_backup";
    let pool = await poolFor(backup),
      original;
    try {
      original = await fingerprint(pool);
    } finally {
      await pool.end();
    }
    await api("DELETE", "/endpoints/" + backupEndpoint.id);
    backupEndpoint = null;
    stage = "create_isolated_rehearsal";
    clone = await create(backup.branch.id, prefix + "-rehearsal", 24);
    pool = await poolFor(clone);
    try {
      stage = "verify_recovered_copy";
      const restored = await fingerprint(pool);
      if (!matches(original, restored))
        throw Error("Restored application records differ from the backup");
      report.restore_tested = true;
      stage = "migrate_isolated_rehearsal";
      const applied = await migrate(pool);
      stage = "verify_migrated_records";
      if (!matches(original, await fingerprint(pool, original.columns)))
        throw Error("Migration modified pre-existing application records");
      if ((await migrate(pool)).length)
        throw Error("Migration replay was not a no-op");
      report.migrations_applied = applied.length;
      report.existing_tables_preserved = original.data.length;
      report.existing_rows_preserved = original.data.reduce(
        (n, x) => n + x.rows,
        0,
      );
      report.recovery_verified = true;
      report.status = "verified_backup_and_isolated_upgrade";
    } finally {
      await pool.end();
    }
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
    if (clone) {
      cloneIdentity(
        clone.branch,
        clone.endpoint,
        sourceUrl,
        backup.branch.id,
        clone.name,
      );
      await api("DELETE", "/branches/" + clone.branch.id);
      report.rehearsal_branch_removed = true;
    }
  }
  return report;
}
module.exports = { fingerprint, cloneIdentity, rehearsal, stamp };
