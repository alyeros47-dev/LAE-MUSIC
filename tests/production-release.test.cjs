"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  release,
  featureSettings,
  preserved,
  ID,
  REQUIRED_JOBS,
} = require("../lib/production-release");
const candidate = "a".repeat(40),
  commit = "b".repeat(40),
  tree = "c".repeat(40),
  base = "706ee59ec4fe07594f40e30dcfab49cd4ba0901b";
const SOURCE = "br-flat-darkness-b42js8ma",
  PROJECT = "restless-brook-43273058";
function fixture(
  mode,
  {
    badService = false,
    badCI = false,
    badTree = false,
    existing = false,
    tamper = false,
    expiredBackup = false,
    oldBackup = false,
    movedBase = false,
    unmergedPR = false,
  } = {},
) {
  const calls = [];
  const env = {
    DATABASE_URL:
      "postgres://fixture:private-password@ep-fixture.us-east-2.aws.neon.tech/neondb",
    R2_BUCKET: "retained-bucket",
    R2_SECRET_ACCESS_KEY: "private-r2-fixture",
    OPENAI_API_KEY: "private-openai-fixture",
    STUDIO_RELEASE_WORKER_ENABLED: "false",
  };
  if (mode === "deploy") Object.assign(env, featureSettings(env));
  let deployed = existing;
  const fetcher = async (url, opt) => {
    calls.push({ url, method: opt.method });
    let data = {};
    const u = new URL(url),
      p = u.pathname;
    if (u.hostname === "api.render.com") {
      assert(p.startsWith("/v1/services/" + ID));
      if (opt.method === "PUT") {
        assert(
          /\/env-vars\/(LAE_ARTIST_TEST_ACCESS|GENERATED_MEDIA_ALLOWED_HOSTS|STUDIO_RELEASE_WORKER_ENABLED)$/.test(
            p,
          ),
        );
        env[p.split("/").pop()] = JSON.parse(opt.body).value;
        if (tamper) env.R2_SECRET_ACCESS_KEY = "changed-by-someone-else";
      } else if (opt.method === "POST") {
        assert(p.endsWith("/deploys"));
        assert.deepEqual(JSON.parse(opt.body), {
          commitId: commit,
          clearCache: "do_not_clear",
        });
        deployed = true;
        data = {
          id: "dep-fixture123",
          status: "build_in_progress",
          commit: { id: commit },
        };
      } else if (p.endsWith("/env-vars"))
        data = Object.entries(env).map(([key, value]) => ({ key, value }));
      else if (p.endsWith("/deploys"))
        data = deployed
          ? [
              {
                deploy: {
                  id: "dep-fixture123",
                  status: "live",
                  commit: { id: commit },
                },
              },
            ]
          : [];
      else
        data = {
          id: ID,
          name: badService ? "review-sandbox" : "LAE-MUSIC",
          type: "web_service",
          repo: "https://github.com/alyeros47-dev/LAE-MUSIC",
          branch: "main",
          autoDeployTrigger: "off",
          serviceDetails: {
            runtime: "node",
            url: "https://lae-music.onrender.com",
          },
        };
    } else if (u.hostname === "console.neon.tech") {
      assert.equal(opt.method, "GET");
      if (p.endsWith("/endpoints"))
        data = {
          endpoints: [
            {
              project_id: PROJECT,
              branch_id: SOURCE,
              host: "ep-fixture.us-east-2.aws.neon.tech",
            },
          ],
        };
      else if (p.endsWith("/snapshots")) data = { snapshots: [] };
      else if (p.endsWith("/branches/" + SOURCE))
        data = {
          branch: { id: SOURCE, project_id: PROJECT, current_state: "ready" },
        };
      else if (p.includes("/branches/"))
        data = {
          branch: {
            id: oldBackup ? "br-gentle-mud-b4iztfzt" : "br-spring-night-b4y9h9xp",
            project_id: PROJECT,
            parent_id: SOURCE,
            name: "lae-release-41141460115-backup",
            expires_at: expiredBackup ? "2000-01-01T00:00:00Z" : "2100-01-01T00:00:00Z",
          },
        };
      else
        data = { project: { id: PROJECT, history_retention_seconds: 21600 } };
    } else {
      assert.equal(u.hostname, "api.github.com");
      assert.equal(opt.method, "GET");
      if (p.endsWith("/pulls/12"))
        data = {
          merged: !unmergedPR,
          merge_commit_sha: commit,
          head: { sha: candidate },
        };
      else if (p.endsWith("/git/ref/heads/codex/gospel-phase-one"))
        data = { object: { sha: candidate } };
      else if (p.endsWith("/git/ref/heads/main"))
        data = { object: { sha: mode === "deploy" ? commit : movedBase ? "e".repeat(40) : base } };
      else if (p.includes("/git/commits/"))
        data = {
          tree: { sha: badTree && p.endsWith(commit) ? "d".repeat(40) : tree },
          parents: [{ sha: candidate }],
        };
      else if (p.endsWith("/jobs"))
        data = {
          jobs: REQUIRED_JOBS.map((name) => ({
            name,
            conclusion: badCI && name === "postgres" ? "failure" : "success",
          })),
        };
      else
        data = {
          head_sha: candidate,
          event: "pull_request",
          status: "completed",
          conclusion: "success",
        };
    }
    return new Response(JSON.stringify(data));
  };
  return {
    calls,
    env,
    run: () =>
      release({
        mode,
        candidate,
        commit,
        ciRun: "123456789",
        key: "private-render-fixture",
        neonKey: "private-neon-fixture",
        githubToken: "private-gh-fixture",
        fetcher,
        wait: async () => {},
      }),
  };
}
test("production plan is read-only, preserves secrets and identifies only approved feature keys", async () => {
  const f = fixture("plan"),
    r = await f.run();
  assert(f.calls.every((x) => x.method === "GET"));
  assert.equal(r.payments_enabled, false);
  assert.equal(r.service_id, ID);
  assert(!JSON.stringify(r).includes("private-"));
  assert(!r.feature_keys_to_update.includes("LAE_ARTIST_TEST_ACCESS"));
});
test("production preparation updates individual feature keys and retains database, R2 and API values", async () => {
  const f = fixture("prepare"),
    r = await f.run();
  assert(r.existing_environment_preserved);
  assert.equal(f.env.LAE_ARTIST_TEST_ACCESS, undefined);
  assert.equal(f.env.R2_SECRET_ACCESS_KEY, "private-r2-fixture");
  assert.equal(f.env.STUDIO_RELEASE_WORKER_ENABLED, "true");
  assert(!f.calls.some((x) => x.method === "POST"));
  assert(f.env.GENERATED_MEDIA_ALLOWED_HOSTS.includes("files.musicapi.ai"));
});
test("production deployment pins the merged tested tree and reuses a matching live deployment", async () => {
  for (const existing of [false, true]) {
    const f = fixture("deploy", { existing }),
      r = await f.run();
    assert.equal(r.status, "live");
    assert.equal(r.deployed_commit, commit);
    assert.equal(
      f.calls.filter((x) => x.method === "POST").length,
      existing ? 0 : 1,
    );
  }
});
test("wrong service, failed CI and changed merge tree stop before production mutations", async () => {
  for (const options of [
    { badService: true },
    { badCI: true },
    { badTree: true },
  ]) {
    const f = fixture("deploy", options);
    await assert.rejects(f.run());
    assert(f.calls.every((x) => x.method === "GET"));
  }
});
test("concurrent unrelated environment changes stop preparation without a deployment", async () => {
  const f = fixture("prepare", { tamper: true });
  await assert.rejects(f.run(), /environment settings changed/);
  assert(!f.calls.some((x) => x.method === "POST"));
});
test("release settings retain approved media hosts and reject unexpected live-money modes", async () => {
  assert(
    featureSettings({
      GENERATED_MEDIA_ALLOWED_HOSTS: "media.example.test",
    }).GENERATED_MEDIA_ALLOWED_HOSTS.includes("media.example.test"),
  );
  assert(
    preserved(
      { DATABASE_URL: "old" },
      { DATABASE_URL: "old", LAE_ARTIST_TEST_ACCESS: "1" },
      { LAE_ARTIST_TEST_ACCESS: "1" },
    ),
  );
  assert(!preserved({ DATABASE_URL: "old" }, { DATABASE_URL: "new" }, {}));
  await assert.rejects(
    release({
      mode: "unapproved",
      candidate,
      key: "fixture",
      neonKey: "fixture",
    }),
  );
});

test("PR 12 release refuses the prior or expired backup, moved main and an unmerged candidate before mutations", async () => {
  for (const [mode, options] of [["plan", {oldBackup:true}], ["plan", {expiredBackup:true}], ["plan", {movedBase:true}], ["deploy", {unmergedPR:true}]]) {
    const f=fixture(mode, options);
    await assert.rejects(f.run());
    assert(f.calls.every(call=>call.method==="GET"));
  }
});
