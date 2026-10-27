"use strict";
// Paid changes require a separate explicit owner cost approval. Default is read-only.
const { ROOT, persistentService } = require("../deploy/review-state.cjs");
const TARGET = "srv-dbfmk5ss728c73ded300",
  NAME = "lae-music-review-state",
  ORIGIN = "https://lae-music-review-sandbox.onrender.com";
function identity(s) {
  if (
    s.id !== TARGET ||
    s.name !== "lae-music-review-sandbox" ||
    s.type !== "web_service" ||
    s.repo?.replace(/\.git$/, "") !==
      "https://github.com/alyeros47-dev/LAE-MUSIC" ||
    s.branch !== "codex/premium-platform-release" ||
    s.serviceDetails?.url !== ORIGIN ||
    (s.autoDeployTrigger !== undefined
      ? s.autoDeployTrigger !== "off"
      : s.autoDeploy !== "no") ||
    !["free", "starter"].includes(s.serviceDetails?.plan)
  )
    throw Error("Review persistence refuses an unexpected service or plan");
}
async function prepare({ key, approved = false, fetchImpl = fetch } = {}) {
  if (!key) throw Error("Secure Render access is required");
  async function api(route, method = "GET", data) {
    if (
      method !== "GET" &&
      !(
        approved === true &&
        ((method === "PATCH" && route === "/services/" + TARGET) ||
          (method === "POST" && route === "/disks"))
      )
    )
      throw Error(
        "Paid review storage changes require explicit owner approval",
      );
    const r = await fetchImpl("https://api.render.com/v1" + route, {
      method,
      redirect: "error",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw Error(
        "Review storage request failed (" + r.status + "); response omitted",
      );
    return r.json();
  }
  let service = await api("/services/" + TARGET);
  identity(service);
  const rows = await api("/disks?serviceId=" + TARGET + "&limit=100");
  if (!Array.isArray(rows) || rows.length >= 100)
    throw Error("Incomplete review disk inventory");
  const disks = rows.map((x) => x.disk || x);
  if (
    disks.some(
      (d) =>
        d.serviceId !== TARGET ||
        d.name !== NAME ||
        d.mountPath !== ROOT ||
        d.sizeGB !== 1 ||
        !/^dsk-[a-z0-9]+$/.test(d.id || ""),
    ) ||
    disks.length > 1
  )
    throw Error(
      "An unexpected review disk already exists; nothing was replaced",
    );
  if (
    service.serviceDetails.disk &&
    (!disks.length || service.serviceDetails.disk.id !== disks[0].id)
  )
    throw Error(
      "Review disk inventory does not match the service; stopped without replacement",
    );
  const plan = {
    service_id: TARGET,
    service_plan: "starter",
    disk_name: NAME,
    mount_path: ROOT,
    disk_gb: 1,
    estimated_monthly_usd: 7.25,
    prices_url: "https://render.com/pricing",
    needs_upgrade: service.serviceDetails.plan === "free",
    needs_disk: disks.length === 0,
    production_access: false,
  };
  if (!approved) return { ...plan, dry_run: true, paid_mutations: 0 };
  let paidMutations = 0;
  if (plan.needs_upgrade) {
    await api("/services/" + TARGET, "PATCH", {
      serviceDetails: { plan: "starter" },
    });
    paidMutations++;
  }
  if (plan.needs_disk) {
    await api("/disks", "POST", {
      name: NAME,
      mountPath: ROOT,
      sizeGB: 1,
      serviceId: TARGET,
    });
    paidMutations++;
  }
  service = await api("/services/" + TARGET);
  identity(service);
  if (!persistentService(service))
    throw Error(
      "Review disk attachment is not verified; do not deploy until reconciled",
    );
  return {
    ...plan,
    dry_run: false,
    paid_mutations: paidMutations,
    storage_attachment_verified: true,
  };
}
if (require.main === module)
  prepare({
    key: process.env.RENDER_API_KEY,
    approved:
      process.env.LAE_APPROVE_REVIEW_STORAGE_COST ===
      "I_APPROVE_SANDBOX_7_25_MONTHLY",
  })
    .then((r) => console.log(JSON.stringify(r)))
    .catch(() => {
      console.error(
        "Review storage preparation failed; no credentials or response payloads are printed. Inspect approved configuration before retrying.",
      );
      process.exitCode = 1;
    });
module.exports = { prepare, identity };
