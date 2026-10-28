"use strict";
// Read-only management inspection; never creates/restores/resets a branch or snapshot.
const PROJECT = "restless-brook-43273058";
const BRANCH = "br-flat-darkness-b42js8ma";
function normalizedHost(raw) {
  const labels = String(raw || "")
    .toLowerCase()
    .split(".");
  labels[0] = labels[0].replace(/-pooler$/, "");
  return labels.join(".");
}
async function inspect({
  key,
  databaseUrl,
  fetcher = fetch,
  now = Date.now,
} = {}) {
  const base = {
    read_only: true,
    production_writes: 0,
    recovery_verified: false,
    restore_tested: false,
  };
  if (!key?.trim())
    return {
      ...base,
      status: "management_access_missing",
      required_secret: "NEON_API_KEY",
    };
  let db;
  try {
    db = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.hostname.endsWith(".neon.tech")
    )
      throw Error();
  } catch {
    return { ...base, status: "database_identity_unverified" };
  }
  async function get(suffix) {
    const r = await fetcher(
      "https://console.neon.tech/api/v2/projects/" + PROJECT + suffix,
      {
        method: "GET",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + key.trim(),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw Error("Neon inspection HTTP " + r.status);
    return r.json();
  }
  try {
    const endpoints = await get("/endpoints");
    const matching = endpoints.endpoints?.filter(
      (x) =>
        x.project_id === PROJECT &&
        x.branch_id === BRANCH &&
        normalizedHost(x.host) === normalizedHost(db.hostname),
    );
    if (!Array.isArray(matching) || matching.length !== 1)
      return { ...base, status: "database_identity_unverified" };
    const project = (await get("")).project,
      branch = (await get("/branches/" + BRANCH)).branch;
    if (
      project?.id !== PROJECT ||
      branch?.id !== BRANCH ||
      branch.project_id !== PROJECT ||
      branch.current_state !== "ready"
    )
      return { ...base, status: "database_identity_unverified" };
    const result = {
      ...base,
      status: "metadata_only",
      database_binding_verified: true,
      branch_protected: branch.protected === true,
      history_retention_seconds:
        Number.isSafeInteger(project.history_retention_seconds) &&
        project.history_retention_seconds >= 0
          ? project.history_retention_seconds
          : null,
    };
    try {
      const data = await get("/snapshots");
      if (!Array.isArray(data.snapshots)) throw Error();
      const valid = data.snapshots.filter(
        (s) =>
          s.source_branch_id === BRANCH &&
          typeof s.created_at === "string" &&
          Number.isFinite(Date.parse(s.created_at)) &&
          Date.parse(s.created_at) <= now() &&
          (s.expires_at == null ||
            (Number.isFinite(Date.parse(s.expires_at)) &&
              Date.parse(s.expires_at) > now())),
      );
      result.snapshot_records_checked = data.snapshots.length;
      result.unexpired_source_snapshots = valid.length;
      result.latest_snapshot_created_at = valid.length
        ? new Date(
            Math.max(...valid.map((s) => Date.parse(s.created_at))),
          ).toISOString()
        : null;
    } catch {
      result.snapshot_inventory = "unavailable";
    }
    // Retention settings and an unexpired snapshot are not an executed restore rehearsal.
    return result;
  } catch {
    return {
      ...base,
      status: "management_read_failed",
      credentials_omitted: true,
    };
  }
}
module.exports = { inspect, normalizedHost };
