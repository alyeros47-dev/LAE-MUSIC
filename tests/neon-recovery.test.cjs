"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { inspect } = require("../lib/neon-recovery-inspection");
const PROJECT = "restless-brook-43273058",
  BRANCH = "br-flat-darkness-b42js8ma";
const databaseUrl =
  "postgres://fixture:private-db-password@ep-fixture-pooler.us-east-1.aws.neon.tech/neondb";
test("missing Neon management access performs no requests and cannot claim recovery", async () => {
  const r = await inspect({
    databaseUrl,
    fetcher: () => {
      throw Error("Unexpected request");
    },
  });
  assert.equal(r.status, "management_access_missing");
  assert.equal(r.recovery_verified, false);
});
test("Neon inspection binds the existing database and uses only GET without exposing secrets or snapshot names", async () => {
  const calls = [];
  const r = await inspect({
    key: "private-neon-fixture",
    databaseUrl,
    now: () => Date.parse("2026-10-28T00:00:00Z"),
    fetcher: async (url, opt) => {
      calls.push(url);
      assert.equal(opt.method, "GET");
      assert.equal(opt.redirect, "error");
      assert(
        url.startsWith("https://console.neon.tech/api/v2/projects/" + PROJECT),
      );
      const data = url.endsWith("/endpoints")
        ? {
            endpoints: [
              {
                project_id: PROJECT,
                branch_id: BRANCH,
                host: "ep-fixture.us-east-1.aws.neon.tech",
              },
            ],
          }
        : url.endsWith("/snapshots")
          ? {
              snapshots: [
                {
                  name: "private-snapshot-name",
                  source_branch_id: BRANCH,
                  created_at: "2026-10-27T23:00:00Z",
                  expires_at: null,
                },
                {
                  source_branch_id: BRANCH,
                  created_at: "2026-10-26T23:00:00Z",
                  expires_at: "2026-10-27T00:00:00Z",
                },
                {
                  source_branch_id: "br-other",
                  created_at: "2026-10-27T23:00:00Z",
                },
              ],
            }
          : url.includes("/branches/")
            ? {
                branch: {
                  id: BRANCH,
                  project_id: PROJECT,
                  current_state: "ready",
                  protected: true,
                },
              }
            : { project: { id: PROJECT, history_retention_seconds: 21600 } };
      return new Response(JSON.stringify(data));
    },
  });
  assert.equal(calls.length, 4);
  assert.equal(r.database_binding_verified, true);
  assert.equal(r.unexpired_source_snapshots, 1);
  assert.equal(r.history_retention_seconds, 21600);
  assert.equal(r.restore_tested, false);
  assert.equal(r.recovery_verified, false);
  assert(!/private-|neondb|ep-fixture/.test(JSON.stringify(r)));
});
test("wrong database binding and management failures stop safely without an invented backup", async () => {
  let calls = 0;
  const r = await inspect({
    key: "fixture",
    databaseUrl,
    fetcher: async () => {
      calls++;
      return new Response(JSON.stringify({ endpoints: [] }));
    },
  });
  assert.equal(r.status, "database_identity_unverified");
  assert.equal(calls, 1);
  const fail = await inspect({
    key: "fixture",
    databaseUrl,
    fetcher: async () => {
      throw Error("private credential data");
    },
  });
  assert.equal(fail.status, "management_read_failed");
  assert(!JSON.stringify(fail).includes("private credential data"));
});
