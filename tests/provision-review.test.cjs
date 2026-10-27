"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  servicePayload,
  validateService,
  chooseOwner,
  safeUrl,
  provision,
  NAME,
  REPO,
  BRANCH,
} = require("../scripts/provision-review.cjs");
const owner = "tea-fixture123",
  key = "test-render-key-never-real";
const service = () => ({
  id: "srv-fixture123",
  name: NAME,
  type: "web_service",
  ownerId: owner,
  repo: REPO,
  branch: BRANCH,
  autoDeployTrigger: "off",
  serviceDetails: {
    plan: "free",
    url: "https://lae-music-review-sandbox.onrender.com",
  },
});
const response = (v, status = 200) =>
  new Response(JSON.stringify(v), { status });
test("creation requests only an isolated free Docker service and no external database or provider keys", () => {
  const p = servicePayload(owner);
  assert.equal(p.serviceDetails.plan, "free");
  assert.equal(p.branch, BRANCH);
  assert.equal(p.autoDeployTrigger, "off");
  assert.equal(p.serviceDetails.runtime, "docker");
  assert.equal(
    p.serviceDetails.envSpecificDetails.dockerfilePath,
    "./deploy/review.Dockerfile",
  );
  assert(
    !p.envVars.some((x) =>
      [
        "DATABASE_URL",
        "RENDER_API_KEY",
        "MUSICAPI_API_KEY",
        "OPENAI_API_KEY",
      ].includes(x.key),
    ),
  );
  assert.equal(p.envVars.find((x) => x.key === "ADMIN_KEY").value.length, 64);
  assert.notEqual(
    servicePayload(owner).envVars.find((x) => x.key === "ADMIN_KEY").value,
    p.envVars.find((x) => x.key === "ADMIN_KEY").value,
  );
});
test("production, wrong branch, paid plan, wrong owner and enabled auto-deploy are refused", () => {
  for (const change of [
    { name: "lae-music" },
    { branch: "main" },
    { ownerId: "tea-other" },
    { autoDeployTrigger: "commit" },
    { serviceDetails: { plan: "starter" } },
  ])
    assert.throws(() => validateService({ ...service(), ...change }, owner));
  assert.throws(() => safeUrl("https://lae-music.onrender.com"));
  assert.throws(() => safeUrl("https://evil.invalid"));
  assert.throws(() => safeUrl("https://key:secret@review.onrender.com"));
});
test("workspace ambiguity stops creation; a matching production metadata reference selects its workspace without mutation", () => {
  assert.throws(() => chooseOwner([{ id: owner }, { id: "tea-other" }], []));
  assert.equal(
    chooseOwner(
      [{ id: owner }, { id: "tea-other" }],
      [
        {
          ownerId: owner,
          repo: REPO,
          serviceDetails: { url: "https://lae-music.onrender.com" },
        },
      ],
    ),
    owner,
  );
});
test("missing or rejected credentials never create resources or disclose API responses", async () => {
  let calls = 0;
  await assert.rejects(
    provision({
      key: "",
      fetchImpl: () => {
        calls++;
      },
    }),
    /absent/,
  );
  assert.equal(calls, 0);
  const logs = [];
  await assert.rejects(
    provision({
      key,
      log: (x) => logs.push(x),
      fetchImpl: async () => {
        calls++;
        return response({ message: "sensitive-response-must-not-leak" }, 401);
      },
    }),
    (e) =>
      e.message.includes("HTTP 401") &&
      !e.message.includes("sensitive-response"),
  );
  assert.equal(calls, 1);
  assert.deepEqual(logs, []);
});
test("verified new service returns the actual URL, never changes existing production, and redacts secrets", async () => {
  const calls = [],
    logs = [];
  const result = await provision({
    key,
    log: (x) => logs.push(x),
    sleep: async () => {},
    verifyPreview: async (url) => {
      assert.equal(url, service().serviceDetails.url);
      return { status: "available_for_review" };
    },
    fetchImpl: async (url, options) => {
      const p = new URL(url).pathname.replace("/v1", "");
      calls.push({ p, method: options.method });
      assert.equal(options.headers.Authorization, "Bearer " + key);
      if (p === "/owners") return response([{ owner: { id: owner } }]);
      if (p === "/services" && options.method === "GET")
        return response([
          { service: { id: "srv-production", name: "lae-music" } },
        ]);
      if (p === "/services" && options.method === "POST") {
        const b = JSON.parse(options.body);
        assert.equal(b.name, NAME);
        return response({ service: service(), deployId: "dep-fixture" });
      }
      if (p.endsWith("/deploys"))
        return response([{ deploy: { status: "live" } }]);
      if (p === "/services/srv-fixture123") return response(service());
      throw Error("Unexpected API call");
    },
  });
  assert.equal(result.production_ready, false);
  assert.equal(result.temporary_database, true);
  assert.deepEqual(
    calls.filter((x) => x.method !== "GET"),
    [{ p: "/services", method: "POST" }],
  );
  assert(!JSON.stringify(logs).includes(key));
});
test("existing unmarked service is not overwritten or redeployed", async () => {
  let writes = 0;
  await assert.rejects(
    provision({
      key,
      fetchImpl: async (url, o) => {
        if (o.method !== "GET") writes++;
        const p = new URL(url).pathname;
        if (p.endsWith("/owners")) return response([{ owner: { id: owner } }]);
        if (p.endsWith("/env-vars")) return response([]);
        if (p.endsWith("/services")) return response([{ service: service() }]);
        throw Error("Unexpected");
      },
    }),
    /isolation marker/,
  );
  assert.equal(writes, 0);
});
test("a payment-required response stops without a paid fallback", async () => {
  let writes = 0;
  await assert.rejects(
    provision({
      key,
      fetchImpl: async (url, o) => {
        const p = new URL(url).pathname;
        if (p.endsWith("/owners")) return response([{ owner: { id: owner } }]);
        if (o.method === "GET") return response([]);
        writes++;
        return response({ error: "payment required" }, 402);
      },
    }),
    /HTTP 402/,
  );
  assert.equal(writes, 1);
});

test('existing verified review service hands off immediately instead of blocking its queued deployment',async()=>{
 const calls=[];const result=await provision({key,log:()=>{},sleep:async()=>{throw Error('Must not wait for another workflow');},verifyPreview:async()=>{throw Error('Existing readiness is not certified by provisioning');},fetchImpl:async(url,o)=>{
  const p=new URL(url).pathname;calls.push({p,method:o.method});
  if(p.endsWith('/owners'))return response([{owner:{id:owner}}]);
  if(p.endsWith('/services'))return response([{service:service()}]);
  if(p.endsWith('/env-vars'))return response([{envVar:{key:'LAE_REVIEW_ENVIRONMENT',value:'pr6-ephemeral-review-v1'}}]);
  throw Error('Unexpected wait or mutation');
 }});assert.equal(result.status,'awaiting_configured_deployment');assert.equal(result.production_ready,false);assert.equal(result.url,service().serviceDetails.url);assert.equal(calls.length,3);assert(calls.every(x=>x.method==='GET'));
});
