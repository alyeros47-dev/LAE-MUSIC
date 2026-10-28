"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  cloneIdentity,
  rehearsal,
  fingerprint,
} = require("../lib/neon-recovery-rehearsal");
const SOURCE = "br-flat-darkness-b42js8ma",
  PROJECT = "restless-brook-43273058";
const source =
  "postgres://fixture:private-fixture@ep-production.us-east-2.aws.neon.tech/neondb";
const branch = {
  id: "br-owned-test",
  project_id: PROJECT,
  parent_id: SOURCE,
  name: "owned-fixture",
};
const endpoint = {
  id: "ep-owned-test",
  project_id: PROJECT,
  branch_id: branch.id,
  host: "ep-owned-test.us-east-2.aws.neon.tech",
};
test("recovery guards refuse production, foreign lineages and production host aliases", () => {
  cloneIdentity(branch, endpoint, source, SOURCE, "owned-fixture");
  assert.throws(() =>
    cloneIdentity(
      { ...branch, id: SOURCE },
      endpoint,
      source,
      SOURCE,
      "owned-fixture",
    ),
  );
  assert.throws(() =>
    cloneIdentity(
      branch,
      { ...endpoint, host: "ep-production-pooler.us-east-2.aws.neon.tech" },
      source,
      SOURCE,
      "owned-fixture",
    ),
  );
  assert.throws(() =>
    cloneIdentity(
      { ...branch, parent_id: "br-other" },
      endpoint,
      source,
      SOURCE,
      "owned-fixture",
    ),
  );
  assert.throws(() =>
    cloneIdentity(
      branch,
      { ...endpoint, branch_id: SOURCE },
      source,
      SOURCE,
      "owned-fixture",
    ),
  );
});
function fixture({ drift = false, migrationFailure = false } = {}) {
  const events = [],
    branches = new Map(),
    endpoints = new Map();
  let next = 0,
    created = 0;
  const dbClient = (label) => ({
    query: async (sql, args) => {
      events.push({ db: label, sql });
      if (sql.includes("information_schema.columns"))
        return { rows: [{ table_name: "creators", column_name: "id" }] };
      if (sql.includes("pg_total_relation_size"))
        return { rows: [{ bytes: "8192" }] };
      if (sql.includes("COUNT(*)::int AS rows"))
        return {
          rows: [
            {
              rows: 11,
              checksum:
                drift && label === "rehearsal"
                  ? "different"
                  : "private-checksum",
            },
          ],
        };
      return { rows: [] };
    },
    release() {},
  });
  const poolFactory = (options) => {
    assert(options.ssl.rejectUnauthorized);
    assert(!options.connectionString.includes("ep-production."));
    const label = options.connectionString.includes("ep-rehearsal.")
      ? "rehearsal"
      : "backup";
    return {
      query: async () => ({ rows: [] }),
      connect: async () => dbClient(label),
      end: async () => {},
    };
  };
  const fetcher = async (url, opt) => {
    const suffix = new URL(url).pathname.replace(
      "/api/v2/projects/" + PROJECT,
      "",
    );
    events.push({ method: opt.method, suffix });
    let data = {};
    if (opt.method === "GET" && suffix === "/endpoints")
      data = {
        endpoints: [
          {
            project_id: PROJECT,
            branch_id: SOURCE,
            host: "ep-production.us-east-2.aws.neon.tech",
          },
        ],
      };
    else if (opt.method === "GET" && suffix === "")
      data = { project: { id: PROJECT, history_retention_seconds: 21600 } };
    else if (opt.method === "GET" && suffix === "/branches/" + SOURCE)
      data = {
        branch: { id: SOURCE, project_id: PROJECT, current_state: "ready" },
      };
    else if (opt.method === "GET" && suffix === "/snapshots")
      data = { snapshots: [] };
    else if (opt.method === "GET" && suffix === "/branches")
      data = { branches: [...branches.values()] };
    else if (opt.method === "POST" && suffix === "/branches") {
      const body = JSON.parse(opt.body),
        kind = created++ ? "rehearsal" : "backup";
      assert.equal(body.endpoints[0].autoscaling_limit_max_cu, 0.25);
      assert(body.branch.expires_at);
      const b = {
          ...body.branch,
          id: "br-" + kind,
          project_id: PROJECT,
          current_state: "ready",
        },
        e = {
          id: "ep-" + kind,
          project_id: PROJECT,
          branch_id: b.id,
          host: "ep-" + kind + ".us-east-2.aws.neon.tech",
        };
      branches.set(b.id, b);
      endpoints.set(e.id, e);
      data = { branch: b, endpoints: [e] };
    } else if (opt.method === "GET" && suffix.startsWith("/branches/"))
      data = { branch: branches.get(suffix.split("/").pop()) };
    else if (opt.method === "GET" && suffix === "/connection_uri") {
      const q = new URL(url).searchParams;
      const e = endpoints.get(q.get("endpoint_id"));
      data = {
        uri:
          "postgres://fixture:private-fixture@" +
          e.host +
          "/neondb?sslmode=require",
      };
    } else if (opt.method === "DELETE" && suffix.startsWith("/endpoints/")) {
      assert.equal(suffix, "/endpoints/ep-backup");
      endpoints.delete("ep-backup");
    } else if (opt.method === "DELETE" && suffix.startsWith("/branches/")) {
      assert.equal(suffix, "/branches/br-rehearsal");
      branches.delete("br-rehearsal");
    } else
      throw Error("Unexpected management request " + opt.method + " " + suffix);
    return new Response(JSON.stringify(data));
  };
  return {
    events,
    branches,
    run: () =>
      rehearsal({
        neonKey: "private-management-fixture",
        productionEnv: { DATABASE_URL: source },
        runId: "123456789",
        fetcher,
        poolFactory,
        migrate: async (pool) => {
          if (migrationFailure) throw Error("fixture migration failed");
          return next++ ? [] : ["fixture.sql"];
        },
        wait: async () => {},
      }),
  };
}
test("backup rehearsal hashes isolated copies, preserves original fields, removes test compute and never restores production", async () => {
  const f = fixture(),
    r = await f.run();
  assert(r.recovery_verified && r.restore_tested);
  assert.equal(r.production_writes, 0);
  assert.equal(r.existing_rows_preserved, 11);
  assert.equal(r.migrations_applied, 1);
  assert(f.branches.has("br-backup"));
  assert(!f.branches.has("br-rehearsal"));
  assert(!JSON.stringify(r).includes("private-"));
  assert(
    f.events
      .filter((x) => x.method !== "GET" && x.method)
      .every(
        (x) => !x.suffix.includes(SOURCE) && !x.suffix.includes("restore"),
      ),
  );
  assert(
    f.events
      .filter((x) => x.db)
      .every((x) => /^(BEGIN|SET LOCAL|SELECT|COMMIT|ROLLBACK)/.test(x.sql)),
  );
});
test("failed comparison or migration keeps the backup and removes only its own rehearsal", async () => {
  for (const options of [{ drift: true }, { migrationFailure: true }]) {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert(f.branches.has("br-backup"));
    assert(!f.branches.has("br-rehearsal"));
  }
});
test("fingerprint failure releases a read-only transaction without outputting private rows", async () => {
  const sql = [];
  let released = false;
  await assert.rejects(
    fingerprint({
      connect: async () => ({
        query: async (q) => {
          sql.push(q);
          if (q.includes("information_schema")) throw Error("fixture failure");
          return { rows: [] };
        },
        release() {
          released = true;
        },
      }),
    }),
  );
  assert.equal(sql.at(-1), "ROLLBACK");
  assert(released);
});
