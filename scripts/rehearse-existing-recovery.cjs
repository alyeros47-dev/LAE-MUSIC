"use strict";
const { serviceValid, inventory } = require("./audit-existing-service.cjs");
const { rehearsal, stamp } = require("../lib/neon-recovery-rehearsal");
async function main() {
  if (
    process.env.LAE_EXISTING_RECOVERY_REHEARSAL !== "1" ||
    !process.env.RENDER_API_KEY ||
    !process.env.NEON_API_KEY
  )
    throw Error("Authorized recovery configuration is required");
  async function get(path) {
    const r = await fetch("https://api.render.com/v1" + path, {
      method: "GET",
      headers: { Authorization: "Bearer " + process.env.RENDER_API_KEY },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error("Render read failed");
    return r.json();
  }
  const services = (await get("/services?limit=100"))
    .map((x) => x.service || x)
    .filter(serviceValid);
  if (services.length !== 1)
    throw Error("Existing service is not uniquely verified");
  const id = services[0].id,
    env = inventory(await get("/services/" + id + "/env-vars")),
    before = stamp(env);
  let report;
  try {
    report = await rehearsal({
      neonKey: process.env.NEON_API_KEY,
      productionEnv: env,
      runId: process.env.GITHUB_RUN_ID,
      backupBranchId: process.env.LAE_RECOVERY_BACKUP_BRANCH || undefined,
      backupRunId: process.env.LAE_RECOVERY_BACKUP_RUN || undefined,
      record: (x) => console.log(JSON.stringify(x)),
    });
  } finally {
    const same =
      stamp(inventory(await get("/services/" + id + "/env-vars"))) === before;
    console.log(JSON.stringify({ production_environment_unchanged: same }));
    if (!same) throw Error("Production environment changed during rehearsal");
  }
  console.log(JSON.stringify(report));
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      "Existing recovery rehearsal did not complete. Production was not migrated or restored. Review owned recovery branch metadata.",
    );
    console.error(
      JSON.stringify({
        phase: e.recoveryStage || "configuration",
        sqlstate: /^[0-9A-Z]{5}$/.test(e.code || "") ? e.code : null,
        management_http_status:
          Number(e.message?.match(/^Recovery management HTTP (\d{3})$/)?.[1]) ||
          null,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { main };
