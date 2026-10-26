"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  envMap,
  planEnvironment,
  configure,
  TARGET,
  ORIGIN,
  LIVE,
  BUCKET,
} = require("../scripts/configure-review-integrations.cjs");
const { NAME, REPO, BRANCH } = require("../scripts/provision-review.cjs");
const isolated = {
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: "pr6-ephemeral-review-v1",
  ADMIN_KEY: "private-sandbox-admin",
};
const live = {
  OPENAI_API_KEY: "private-openai-value",
  MUSICAPI_API_KEY: "private-music-value",
  OPENAI_LYRICS_MODEL: "approved-model",
  GENERATED_MEDIA_ALLOWED_HOSTS: "media.musicapi.ai",
  DATABASE_URL: "postgres://production-do-not-copy",
  ADMIN_KEY: "live-admin-never-copy",
  R2_ACCOUNT_ID: "production-account",
  R2_ACCESS_KEY_ID: "production-storage-id",
  R2_SECRET_ACCESS_KEY: "production-storage-secret",
  R2_BUCKET: "production-music",
  PAYSTACK_SECRET_KEY: "live-payment-do-not-copy",
};
const sha = "b".repeat(40),
  response = (v, status = 200) => new Response(JSON.stringify(v), { status });
function fixture({
  targetEnvironment = isolated,
  sourceEnvironment = live,
  mutateSource = false,
  wrongTarget = false,
} = {}) {
  const calls = [],
    logs = [];
  let deployed = false,
    sourceReads = 0;
  const target = {
      id: TARGET,
      name: NAME,
      repo: REPO,
      ownerId: "tea-fixture",
      branch: wrongTarget ? "main" : BRANCH,
      type: "web_service",
      autoDeployTrigger: "off",
      serviceDetails: { plan: "free", url: ORIGIN },
    },
    source = {
      id: "srv-production",
      name: "lae-music",
      repo: REPO,
      ownerId: "tea-fixture",
      type: "web_service",
      serviceDetails: { url: LIVE },
    };
  const pairs = (o) =>
    Object.entries(o).map(([key, value]) => ({ envVar: { key, value } }));
  return {
    calls,
    logs,
    fetchImpl: async (url, o) => {
      calls.push({ url, method: o.method || "GET", body: o.body });
      const u = new URL(url),
        p = u.pathname.replace("/v1", "");
      if (u.hostname === "api.openai.com") return response({ data: [] });
      if (u.hostname === "api.musicapi.ai") return response({ credits: 100 });
      if (p === "/services/" + TARGET) return response(target);
      if (p === "/services")
        return response([{ service: source }, { service: target }]);
      if (p === "/services/srv-production/env-vars") {
        sourceReads++;
        return response(
          pairs(
            mutateSource && sourceReads > 1
              ? { ...sourceEnvironment, OPENAI_API_KEY: "changed-externally" }
              : sourceEnvironment,
          ),
        );
      }
      if (p === "/services/" + TARGET + "/env-vars")
        return response(pairs(targetEnvironment));
      if (
        p.startsWith("/services/" + TARGET + "/env-vars/") &&
        o.method === "PUT"
      )
        return response({});
      if (p === "/services/srv-production/deploys")
        return response([
          {
            deploy: {
              id: "dep-live-unchanged",
              status: "live",
              commit: { id: "a".repeat(40) },
            },
          },
        ]);
      if (p === "/services/" + TARGET + "/deploys") {
        if (o.method === "POST") {
          deployed = true;
          return response({ id: "dep-review" });
        }
        return response([
          {
            deploy: {
              id: deployed ? "dep-review" : "dep-old",
              status: "live",
              commit: { id: deployed ? sha : "c".repeat(40) },
            },
          },
        ]);
      }
      throw Error("Unexpected test request");
    },
  };
}
test("only explicitly approved provider keys are copied; live admin, storage, database and payment credentials stay out", () => {
  const p = planEnvironment(live, isolated);
  assert.deepEqual(
    p.map((x) => x.key),
    [
      "OPENAI_API_KEY",
      "OPENAI_LYRICS_MODEL",
      "MUSICAPI_API_KEY",
      "GENERATED_MEDIA_ALLOWED_HOSTS",
    ],
  );
  assert(!JSON.stringify(p).includes("production-do-not-copy"));
  assert(!JSON.stringify(p).includes("live-payment-do-not-copy"));
});
test("existing sandbox provider values remain independent and are not replaced", () => {
  assert(
    !planEnvironment(live, {
      ...isolated,
      OPENAI_API_KEY: "dedicated-sandbox-key",
    }).some((x) => x.key === "OPENAI_API_KEY"),
  );
});
test("production mode, external database, missing marker and leaked Render key are rejected", () => {
  for (const change of [
    { NODE_ENV: "production" },
    { DATABASE_URL: "postgres://production" },
    { LAE_REVIEW_ENVIRONMENT: "other" },
    { RENDER_API_KEY: "sensitive" },
  ])
    assert.throws(
      () => planEnvironment(live, { ...isolated, ...change }),
      /isolation/,
    );
});
test("the live bucket or its broad credentials cannot be installed on the sandbox", () => {
  assert.throws(
    () => planEnvironment(live, { ...isolated, R2_BUCKET: "production-music" }),
    /production storage/,
  );
  assert.throws(
    () =>
      planEnvironment(live, isolated, {
        SANDBOX_R2_ACCOUNT_ID: "account",
        SANDBOX_R2_ACCESS_KEY_ID: live.R2_ACCESS_KEY_ID,
        SANDBOX_R2_SECRET_ACCESS_KEY: "new",
        SANDBOX_R2_BUCKET: BUCKET,
      }),
    /separately scoped/,
  );
});
test("only a complete separate sandbox bucket credential group is accepted", () => {
  assert.throws(
    () => planEnvironment(live, isolated, { SANDBOX_R2_BUCKET: BUCKET }),
    /all four/,
  );
  assert.throws(
    () => planEnvironment(live, { ...isolated, R2_ACCESS_KEY_ID: "partial" }),
    /Partial/,
  );
  const p = planEnvironment(live, isolated, {
    SANDBOX_R2_ACCOUNT_ID: "account",
    SANDBOX_R2_ACCESS_KEY_ID: "new-sandbox-id",
    SANDBOX_R2_SECRET_ACCESS_KEY: "new-sandbox-secret",
    SANDBOX_R2_BUCKET: BUCKET,
  });
  assert.equal(p.filter((x) => x.key.startsWith("R2_")).length, 4);
});
test("duplicate environment names are rejected instead of choosing an ambiguous secret", () => {
  assert.throws(
    () =>
      envMap([
        { envVar: { key: "OPENAI_API_KEY", value: "a" } },
        { envVar: { key: "OPENAI_API_KEY", value: "b" } },
      ]),
    /Ambiguous/,
  );
});
test("real request coordinator writes and deploys only the pinned sandbox and verifies source preservation", async () => {
  const f = fixture();
  const r = await configure({
    key: "render-fixture",
    sha,
    fetchImpl: f.fetchImpl,
    sleep: async () => {},
    log: (x) => f.logs.push(x),
  });
  assert.equal(r.source_configuration_unchanged, true);
  assert.equal(r.source_deployment_unchanged, true);
  assert.equal(r.providers.openai.verified, true);
  assert.equal(r.providers.musicapi.verified, true);
  assert.equal(r.storage_configured, false);
  assert.equal(r.music_generation_verified, false);
  assert(
    f.calls
      .filter((c) => c.method !== "GET")
      .every((c) => c.url.includes("/services/" + TARGET + "/")),
  );
  assert(
    !f.calls.some(
      (c) => c.method !== "GET" && !c.url.startsWith("https://api.render.com/"),
    ),
  );
  for (const value of Object.values(live))
    assert(!JSON.stringify(f.logs).includes(value));
  for (const secret of [
    "DATABASE_URL",
    "ADMIN_KEY",
    "PAYSTACK_SECRET_KEY",
    "R2_SECRET_ACCESS_KEY",
  ])
    assert(
      !f.calls.some((c) => c.method === "PUT" && c.url.endsWith("/" + secret)),
    );
  assert(!JSON.stringify(r).includes(live.OPENAI_API_KEY));
});
test("a changed production source snapshot is detected without any production write or rollback", async () => {
  const f = fixture({ mutateSource: true });
  await assert.rejects(
    configure({
      key: "render-fixture",
      sha,
      fetchImpl: f.fetchImpl,
      sleep: async () => {},
      log: () => {},
    }),
    /Live configuration/,
  );
  assert(
    f.calls
      .filter((c) => c.method !== "GET")
      .every((c) => c.url.includes("/services/" + TARGET + "/")),
  );
});
test("a target pointing at main refuses environment reads and writes", async () => {
  const f = fixture({ wrongTarget: true });
  await assert.rejects(
    configure({
      key: "render-fixture",
      sha,
      fetchImpl: f.fetchImpl,
      log: () => {},
    }),
    /expected isolated/,
  );
  assert(
    !f.calls.some((c) => c.method !== "GET" || c.url.includes("/env-vars")),
  );
});
test("absent or invalid credentials stop before deployment", async () => {
  await assert.rejects(configure({ key: "", sha }), /required/);
  let calls = 0;
  await assert.rejects(
    configure({
      key: "bad",
      sha,
      fetchImpl: async () => {
        calls++;
        return response({ secret: "do-not-echo" }, 401);
      },
    }),
    (e) => e.message.includes("HTTP 401") && !e.message.includes("do-not-echo"),
  );
  assert.equal(calls, 1);
});

test("only cryptographically verified temporary review storage can reuse a parent access identifier", () => {
  const storage = require("../lib/review-storage"),
    grants = require("../scripts/bootstrap-review-r2.cjs");
  const source = { ...live, R2_ACCOUNT_ID: "a".repeat(32) };
  const child = grants.derive({
    account: source.R2_ACCOUNT_ID,
    key: source.R2_ACCESS_KEY_ID,
    secret: source.R2_SECRET_ACCESS_KEY,
    bucket: source.R2_BUCKET,
  });
  const proposal = {
    R2_ACCOUNT_ID: child.account,
    R2_ACCESS_KEY_ID: child.key,
    R2_SECRET_ACCESS_KEY: child.secret,
    R2_BUCKET: child.bucket,
    R2_SESSION_TOKEN: child.sessionToken,
    LAE_REVIEW_R2_MODE: storage.MODE,
    REVIEW_STORAGE_ORIGIN: storage.ORIGIN,
    REVIEW_STORAGE_TICKET_KEY: "a".repeat(64),
  };
  const updates = planEnvironment(source, isolated, proposal);
  assert(updates.some((x) => x.key === "R2_SESSION_TOKEN"));
  assert(!updates.some((x) => x.value === source.R2_SECRET_ACCESS_KEY));
  assert.throws(
    () =>
      planEnvironment(source, isolated, {
        ...proposal,
        R2_SECRET_ACCESS_KEY: source.R2_SECRET_ACCESS_KEY,
      }),
    /Invalid or expired/,
  );
  assert.throws(
    () =>
      planEnvironment(source, isolated, {
        ...proposal,
        REVIEW_STORAGE_ORIGIN: "https://unrelated.example",
      }),
    /proxy/,
  );
  assert.equal(
    planEnvironment(source, { ...isolated, ...proposal }).filter((x) =>
      x.key.startsWith("R2_"),
    ).length,
    0,
  );
});
test('deferred storage makes no R2 request even when isolated storage is already configured',async()=>{
 const f=fixture({targetEnvironment:{...isolated,R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'dedicated-review-id',R2_SECRET_ACCESS_KEY:'dedicated-review-secret',R2_BUCKET:BUCKET}});
 const result=await configure({key:'isolated-render-fixture',sha,fetchImpl:f.fetchImpl,sleep:async()=>{},log:()=>{},bootstrapStorage:false,verifyStorage:false});
 assert.equal(result.storage_probe,null);assert.equal(result.storage_bootstrap,null);assert.equal(result.storage_upload_verified,false);
 assert(!f.calls.some(c=>new URL(c.url).hostname.endsWith('.r2.cloudflarestorage.com')));
});
