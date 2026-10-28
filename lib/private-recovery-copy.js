"use strict";
// Private CI-only pg_dump -> pg_restore pipe. No dump artifact or raw records are logged.
const { spawn } = require("node:child_process"),
  crypto = require("node:crypto");
const { databaseOptions } = require("./database");
function start(args, env = {}) {
  const child = spawn("docker", args, {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let diagnostic = "";
  child.stderr.on("data", (chunk) => {
    diagnostic = (diagnostic + chunk).slice(-8000);
  }); // PostgreSQL errors can contain private values. Never echo them.
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Private recovery command timed out"));
    }, 180000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error("Private recovery tool could not start"));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(
            Object.assign(Error("Private recovery tool failed"), {
              toolExitCode: code,
              toolCategory: /certificate|SSL.*error|root.crt/i.test(diagnostic)
                ? "tls"
                : /password authentication|no password supplied/i.test(
                      diagnostic,
                    )
                  ? "authentication"
                  : /server version.*pg_dump version|aborting because of server version/i.test(
                        diagnostic,
                      )
                    ? "client_version"
                    : /permission denied/i.test(diagnostic)
                      ? "permission"
                      : /does not exist/i.test(diagnostic)
                        ? "missing_object"
                        : /already exists/i.test(diagnostic)
                          ? "existing_object"
                          : /unrecognized configuration/i.test(diagnostic)
                            ? "server_configuration"
                            : /connection refused|could not connect|could not translate/i.test(
                                  diagnostic,
                                )
                              ? "connection"
                              : /COPY|copying data/i.test(diagnostic)
                                ? "restore_data"
                                : "tool_failure",
            }),
          );
    });
  });
  return { child, done };
}
async function command(args, env) {
  const p = start(args, env);
  p.child.stdout.resume();
  p.child.stdin.end();
  await p.done;
}
const DUMP_TLS_ARGS = Object.freeze([
  "--mount",
  "type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/run/lae-recovery-ca.pem,readonly",
  "-e",
  "PGSSLMODE=verify-full",
  "-e",
  "PGSSLROOTCERT=/run/lae-recovery-ca.pem",
]);
async function restore({
  uri,
  original,
  pgVersion,
  runId,
  migrate,
  poolFactory = (options) => new (require("pg").Pool)(options),
}) {
  if (![16, 17, 18].includes(pgVersion) || !/^\d{6,20}$/.test(String(runId)))
    throw Error("Invalid private recovery configuration");
  const remote = new URL(uri);
  if (
    !remote.hostname.endsWith(".neon.tech") ||
    !["postgres:", "postgresql:"].includes(remote.protocol)
  )
    throw Error("Invalid private backup origin");
  const name = "lae-private-recovery-" + runId,
    image = "postgres:" + pgVersion,
    password = crypto.randomBytes(24).toString("hex");
  let privateStage = "create_container";
  let created = false,
    pool,
    report;
  try {
    await command(
      [
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "lae.recovery.run=" + runId,
        "-p",
        "127.0.0.1:55438:5432",
        "-e",
        "POSTGRES_PASSWORD",
        "-e",
        "POSTGRES_DB=lae_music_recovery",
        image,
      ],
      { POSTGRES_PASSWORD: password },
    );
    created = true;
    privateStage = "wait_local_database";
    pool = poolFactory(
      databaseOptions({
        DATABASE_URL:
          "postgres://postgres:" +
          password +
          "@127.0.0.1:55438/lae_music_recovery",
        DATABASE_POOL_MAX: "1",
      }),
    );
    let ready = false;
    for (let n = 0; n < 30; n++) {
      try {
        await pool.query("SELECT 1");
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!ready) throw Error("Private restore database did not become ready");
    privateStage = "stream_dump_restore";
    const dump = start(
      [
        "run",
        "--rm",
        "-i",
        ...DUMP_TLS_ARGS,
        "-e",
        "PGHOST",
        "-e",
        "PGPORT",
        "-e",
        "PGUSER",
        "-e",
        "PGPASSWORD",
        "-e",
        "PGDATABASE",
        image,
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--schema=public",
      ],
      {
        PGHOST: remote.hostname,
        PGPORT: remote.port || "5432",
        PGUSER: decodeURIComponent(remote.username),
        PGPASSWORD: decodeURIComponent(remote.password),
        PGDATABASE: decodeURIComponent(remote.pathname.slice(1)),
      },
    );
    const load = start([
      "exec",
      "-i",
      name,
      "pg_restore",
      "--username=postgres",
      "--dbname=lae_music_recovery",
      "--no-owner",
      "--no-acl",
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--single-transaction",
    ]);
    dump.child.stdin.end();
    dump.child.stdout.pipe(load.child.stdin);
    load.child.stdout.resume();
    load.child.stdin.on("error", () => {});
    try {
      await Promise.all([dump.done, load.done]);
    } catch (e) {
      dump.child.kill("SIGKILL");
      load.child.kill("SIGKILL");
      throw e;
    }
    const { fingerprint } = require("./neon-recovery-rehearsal");
    privateStage = "compare_restored_records";
    const restored = await fingerprint(pool);
    if (JSON.stringify(restored) !== JSON.stringify(original))
      throw Object.assign(
        Error("Actual restored records differ from the backup"),
        {
          comparison: {
            original_tables: original.data.length,
            restored_tables: restored.data.length,
            column_inventory_matches:
              JSON.stringify(original.columns) ===
              JSON.stringify(restored.columns),
            record_counts_match:
              JSON.stringify(original.data.map((x) => [x.name, x.rows])) ===
              JSON.stringify(restored.data.map((x) => [x.name, x.rows])),
            changed_record_tables: original.data.filter(
              (x) =>
                restored.data.find((y) => y.name === x.name)?.checksum !==
                x.checksum,
            ).length,
          },
        },
      );
    privateStage = "migrate_private_restore";
    const applied = await migrate(pool);
    privateStage = "compare_migrated_records";
    if (
      JSON.stringify(await fingerprint(pool, original.columns)) !==
      JSON.stringify(original)
    )
      throw Error("Isolated migration changed original records");
    if ((await migrate(pool)).length)
      throw Error("Isolated migration replay changed history");
    privateStage = "verify_existing_engine_initialization";
    // Runs the actual initialization against this private copy with no network
    // listener, background workers, provider keys or real notifications.
    await require("../tests/legacy-bootstrap.cjs").bootstrap(pool);
    if (
      JSON.stringify(await fingerprint(pool, original.columns)) !==
      JSON.stringify(original)
    )
      throw Error(
        "Engine initialization changed pre-existing restored records",
      );
    report = {
      restore_tested: true,
      recovery_verified: true,
      existing_engine_initialization_verified: true,
      migrations_applied: applied.length,
      existing_tables_preserved: original.data.length,
      existing_rows_preserved: original.data.reduce((n, x) => n + x.rows, 0),
    };
  } catch (e) {
    e.privateStage = privateStage;
    throw e;
  } finally {
    await pool?.end();
    if (created) await command(["rm", "-f", name]);
  }
  return { ...report, local_recovery_database_removed: true };
}
module.exports = { restore, DUMP_TLS_ARGS };
