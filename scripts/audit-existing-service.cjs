"use strict";
// Read-only production inspection. Never imports server.js or runs initialization/migrations.
const crypto = require("node:crypto");
const REPO = "https://github.com/alyeros47-dev/LAE-MUSIC",
  LIVE = "https://lae-music.onrender.com";
function inventory(rows) {
  if (!Array.isArray(rows)) throw Error("Invalid environment inventory");
  const out = {};
  for (const row of rows) {
    const v = row.envVar || row;
    if (
      typeof v.key !== "string" ||
      typeof v.value !== "string" ||
      Object.hasOwn(out, v.key)
    )
      throw Error("Ambiguous environment inventory");
    out[v.key] = v.value;
  }
  return out;
}
const digest = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function serviceValid(s) {
  return (
    s?.name === "LAE-MUSIC" &&
    s.type === "web_service" &&
    s.serviceDetails?.url === LIVE &&
    s.repo?.replace(/\.git$/, "") === REPO &&
    /^srv-[a-z0-9]+$/.test(s.id)
  );
}
async function providerChecks(env, fetcher = fetch) {
  const report = {
    billed_generation_requests: 0,
    lyrics: { configured: !!env.OPENAI_API_KEY, verified: false },
    music: { configured: !!env.MUSICAPI_API_KEY, verified: false },
  };
  for (const [name, url, key] of [
    ["lyrics", "https://api.openai.com/v1/models", env.OPENAI_API_KEY],
    [
      "music",
      "https://api.musicapi.ai/api/v1/get-credits",
      env.MUSICAPI_API_KEY,
    ],
  ]) {
    if (!key) continue;
    try {
      const r = await fetcher(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + key },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      report[name].http_status = r.status;
      const data = await r.json();
      if (name === "lyrics") {
        report.lyrics.verified = r.ok && Array.isArray(data.data);
        report.lyrics.approved_models =
          require("../lib/lyrics-models").MODELS.map((m) => ({
            id: m.id,
            available:
              r.ok &&
              Array.isArray(data.data) &&
              data.data.some((x) => x.id === m.id),
          }));
      } else
        report.music.verified =
          r.ok &&
          Number.isFinite(data.credits ?? data.data?.credits) &&
          Number(data.credits ?? data.data?.credits) >= 0;
    } catch {
      report[name].verification_error = true;
    }
  }
  return report;
}
async function audit({
  key,
  neonKey,
  fetcher = fetch,
  verifyProviders = false,
  dbFactory = (options) => new (require("pg").Pool)(options),
} = {}) {
  if (!key?.trim()) throw Error("Render read access is not configured");
  async function get(p) {
    if (!/^\/services(?:\?|\/)/.test(p))
      throw Error("Read-only service path required");
    const r = await fetcher("https://api.render.com/v1" + p, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + key.trim(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error("Render read failed with HTTP " + r.status);
    return r.json();
  }
  let services = [],
    cursor = "";
  for (let page = 0; page < 10; page++) {
    const rows = await get(
      "/services?limit=100" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!Array.isArray(rows)) throw Error("Invalid service inventory");
    services.push(...rows.map((x) => x.service || x));
    if (rows.length < 100) break;
    cursor = rows.at(-1).cursor;
    if (!cursor) break;
  }
  const candidates = services.filter(serviceValid);
  if (candidates.length !== 1)
    throw Error(
      "The existing production service could not be uniquely verified",
    );
  const service = candidates[0],
    env = inventory(await get("/services/" + service.id + "/env-vars")),
    deploys = await get("/services/" + service.id + "/deploys?limit=5");
  const before = digest(env),
    latest = (Array.isArray(deploys) ? deploys : [])
      .map((x) => x.deploy || x)
      .find((x) => x.status === "live");
  const present = (keys) =>
    keys.every((k) => typeof env[k] === "string" && env[k].trim());
  const report = {
    read_only: true,
    production_writes: 0,
    target: {
      id: service.id,
      name: service.name,
      branch: service.branch,
      runtime: service.serviceDetails?.runtime,
      build_command: service.serviceDetails?.envSpecificDetails?.buildCommand,
      start_command: service.serviceDetails?.envSpecificDetails?.startCommand,
      deployed_commit: latest?.commit?.id || null,
    },
    configuration: {
      database_present: present(["DATABASE_URL"]),
      lyrics_present: present(["OPENAI_API_KEY"]),
      music_present: present(["MUSICAPI_API_KEY"]),
      r2_present: present([
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
      ]),
      admin_key_present: present(["ADMIN_KEY"]),
      review_flags_present: Object.keys(env).filter(
        (k) => k.startsWith("LAE_REVIEW_") && env[k],
      ),
      payment_keys_present: {
        paystack: present(["PAYSTACK_SECRET_KEY"]),
        flutterwave: present(["FLUTTERWAVE_SECRET_KEY"]),
      },
    },
    database: { status: "not_checked" },
  };
  let pool;
  try {
    const options = require("../lib/database").databaseOptions(env);
    if (options) {
      pool = dbFactory({ ...options, max: 1 });
      report.database =
        await require("../lib/release-preflight").inspectDatabase(pool);
      const client = await pool.connect();
      try {
        await client.query("BEGIN READ ONLY");
        await client.query("SET LOCAL statement_timeout='15s'");
        const tables = [
          "creators",
          "listeners",
          "music_tracks",
          "artist_subscriptions",
          "generation_records",
          "artist_voice_profiles",
          "sessions",
        ];
        report.legacy_inventory = {};
        for (const table of tables) {
          const exists = await client.query(
            "SELECT to_regclass($1) IS NOT NULL AS present",
            [table],
          );
          if (exists.rows[0].present)
            report.legacy_inventory[table] = Number(
              (await client.query("SELECT COUNT(*)::text AS n FROM " + table))
                .rows[0].n,
            );
          else report.legacy_inventory[table] = null;
        }
        report.legacy_columns = (
          await client.query(
            "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[]) ORDER BY table_name,ordinal_position",
            ["public", tables],
          )
        ).rows;
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
        report.legacy_inventory_status = "read_failed";
      } finally {
        client.release();
      }
    }
  } catch {
    report.database = {
      status: "read_failed",
      checks_complete: false,
      credentials_omitted: true,
    };
  } finally {
    await pool?.end();
  }
  const after = inventory(await get("/services/" + service.id + "/env-vars"));
  report.environment_unchanged = before === digest(after);
  report.configuration_values_exposed = false;
  report.recovery = await require("../lib/neon-recovery-inspection").inspect({
    key: neonKey || env.NEON_API_KEY,
    databaseUrl: env.DATABASE_URL,
    fetcher,
  });
  if (verifyProviders)
    report.provider_checks = await providerChecks(env, fetcher);
  return report;
}
module.exports = { audit, inventory, serviceValid, providerChecks };
if (require.main === module)
  audit({
    key: process.env.RENDER_API_KEY,
    neonKey: process.env.NEON_API_KEY,
    verifyProviders: true,
  })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Existing-service read-only audit failed:", e.message);
      process.exitCode = 1;
    });
