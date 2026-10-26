"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { createAddressResolver, normalizeIP } = require("../lib/client-address"),
  { POLICIES, requestPolicy } = require("../lib/request-policy"),
  { createRequestProtection } = require("../lib/request-protection"),
  { routePermission } = require("../lib/admin-auth");
const req = (address, forwarded) => ({
  method: "POST",
  socket: { remoteAddress: address },
  headers: forwarded ? { "x-forwarded-for": forwarded } : {},
});
test("client addresses normalize IPv4/IPv6 and mapped equivalents without accepting ports, zones or malformed address text", () => {
  assert.equal(normalizeIP("::ffff:192.0.2.7"), "192.0.2.7");
  assert.equal(normalizeIP("::ffff:c000:207"), "192.0.2.7");
  assert.equal(normalizeIP("2001:0DB8:0:0:0:0:0:1"), "2001:db8::1");
  for (const ip of [
    "1.2.3.4:123",
    "fe80::1%eth0",
    "127.00.0.1",
    "unknown",
    "[::1]",
    " 127.0.0.1",
  ])
    assert.equal(normalizeIP(ip), null);
});
test("forwarded client headers require an explicitly trusted TCP peer and stop at the nearest untrusted hop", () => {
  const resolver = createAddressResolver("10.0.0.10/32,2001:db8::/64");
  assert.deepEqual(resolver.resolve(req("203.0.113.10", "1.1.1.1")), {
    address: "203.0.113.10",
    source: "socket",
  });
  assert.deepEqual(
    resolver.resolve(req("10.0.0.10", "1.1.1.1, 198.51.100.7, 2001:db8::2")),
    { address: "198.51.100.7", source: "trusted_forwarded" },
  );
  assert.equal(
    createAddressResolver().resolve(req("127.0.0.1", "8.8.8.8")).address,
    "127.0.0.1",
  );
});
test("invalid proxy configuration, malformed chains and all-trusted chains fail conservatively without accepting arbitrary client headers", () => {
  for (const text of [
    "0.0.0.0/0",
    "::/0",
    "10.0.0.1/33",
    "example.com",
    "10.0.0.1,invalid",
  ])
    assert.equal(createAddressResolver(text).status().state, "invalid");
  const resolver = createAddressResolver("127.0.0.1/32");
  for (const header of [
    "not-an-ip",
    "127.0.0.1",
    "1.1.1.1,".repeat(18),
    "x".repeat(2049),
  ])
    assert.equal(
      resolver.resolve(req("127.0.0.1", header)).source,
      "invalid_forwarded",
    );
  const request = req("127.0.0.1");
  request.headers["cf-connecting-ip"] = "8.8.8.8";
  assert.equal(resolver.resolve(request).address, "127.0.0.1");
});
test("policy grouping bounds arbitrary resource paths while preserving public streaming and provider-specific webhook verification", () => {
  assert.equal(
    requestPolicy("GET", "/api/music/tracks/1/stream").id,
    "public_api",
  );
  assert.equal(requestPolicy("GET", "/web/app.js"), null);
  assert.equal(
    requestPolicy("POST", "/api/platform/payments/webhooks/paystack"),
    null,
  );
  assert.equal(
    requestPolicy("POST", "/api/platform/payments/webhooks/flutterwave"),
    null,
  );
  assert.equal(
    requestPolicy("POST", "/api/platform/payments/webhooks/unknown").id,
    "artist_write",
  );
  assert.equal(
    requestPolicy("POST", "/api/platform/listener-profile").role,
    "listener",
  );
  assert.equal(
    requestPolicy("POST", "/api/artist/comment-moderation").role,
    "artist",
  );
  assert.equal(
    requestPolicy("POST", "/api/platform/offline/grant").id,
    "offline_write",
  );
  assert.equal(requestPolicy("POST", "/api/music/sonic/create").role, "artist");
  assert.equal(
    requestPolicy("POST", "/api/random/path/123").id,
    requestPolicy("POST", "/api/random/path/456").id,
  );
});
test("fixed-window budgets return useful retry information, separate client identities and reset only after expiration", async () => {
  let clock = 1700000000000;
  const control = createRequestProtection({ now: () => clock }),
    p = { ...POLICIES.artist_login, client_max: 2 };
  assert.equal((await control.take(p, "network", "198.51.100.1")).remaining, 1);
  assert((await control.take(p, "network", "198.51.100.1")).allowed);
  const denied = await control.take(p, "network", "198.51.100.1");
  assert.equal(denied.allowed, false);
  assert.equal(denied.retry_after, 60);
  assert((await control.take(p, "network", "198.51.100.2")).allowed);
  clock += 60001;
  assert.equal((await control.take(p, "network", "198.51.100.1")).remaining, 1);
});
test("bounded memory refuses new active identities instead of evicting existing budgets and allowing a reset bypass", async () => {
  let clock = 1700000000000;
  const control = createRequestProtection({
      now: () => clock,
      maximumEntries: 2,
    }),
    p = { ...POLICIES.artist_login, client_max: 1 };
  await control.take(p, "network", "one");
  await control.take(p, "network", "two");
  await assert.rejects(
    control.take(p, "network", "three"),
    (e) => e.status === 503,
  );
  assert.equal((await control.take(p, "network", "one")).allowed, false);
  clock += 60001;
  assert((await control.take(p, "network", "three")).allowed);
});
test("account budgets follow the verified account across addresses and cookies, never a caller-supplied owner", async () => {
  const control = createRequestProtection(),
    p = { ...POLICIES.offline_write, actor_max: 2 },
    res = () => ({
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
    }),
    json = (r, status, body) => {
      r.status = status;
      r.body = body;
    };
  for (let i = 0; i < 2; i++) {
    const request = {
      ...req("198.51.100." + (i + 1)),
      requestBudgetPolicy: p,
      body: { owner_id: i + 100 },
      headers: { cookie: "forged-" + i },
    };
    assert.equal(
      await control.account(request, res(), json, {
        listener: async () => ({ id: "7" }),
      }),
      false,
    );
  }
  const denied = res();
  assert(
    await control.account({ requestBudgetPolicy: p }, denied, json, {
      listener: async () => ({ id: "7" }),
    }),
  );
  assert.equal(denied.status, 429);
  assert.equal(denied.headers["Retry-After"], "60");
  assert.equal(denied.body.code, "request_rate_limited");
  assert.equal(
    await control.account({ requestBudgetPolicy: p }, res(), json, {
      listener: async () => ({ id: "8" }),
    }),
    false,
  );
});
test("storage failure cannot fail open or print a configured credential through the public error", async () => {
  const privateValue = "PRIVATE-DO-NOT-RETURN",
    control = createRequestProtection({
      shared: true,
      pool: {
        query() {
          throw Error(privateValue);
        },
      },
    });
  await assert.rejects(
    control.take(POLICIES.artist_login, "network", "198.51.100.1"),
    (e) => e.status === 503 && !e.message.includes(privateValue),
  );
  assert.equal(control.summary().storage_degraded, true);
});
test("security aggregates expose neither client addresses, account IDs, tokens nor the fingerprint key", async () => {
  const control = createRequestProtection();
  await control.take(POLICIES.artist_login, "network", "198.51.100.45");
  await control.take(POLICIES.offline_write, "account", "listener:777");
  const report = await control.report(),
    encoded = JSON.stringify(report);
  assert(!encoded.includes("198.51.100.45"));
  assert(!encoded.includes("listener:777"));
  assert(!encoded.includes("network_key"));
  assert.equal(report.groups.length, 2);
  assert.equal(report.public_streaming_requires_registration, false);
  assert.equal(report.shared_across_instances, false);
  await assert.rejects(control.report({ days: 99 }), (e) => e.status === 400);
});
test("only owners and support operators may read request protection reports; no support mutation permission is introduced", () => {
  const url = new URL("https://lae.test/api/platform/admin/request-security");
  for (const role of ["owner", "support"])
    assert.equal(routePermission(role, url, "GET").allowed, true);
  for (const role of ["finance", "content", "listener"])
    assert.equal(routePermission(role, url, "GET").allowed, false);
  assert.equal(routePermission("support", url, "POST").allowed, false);
});
test("the security dashboard retains exact counters beyond Number precision", async () => {
  const module = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/request-security.js").toString("base64")
  );
  assert.deepEqual(
    module.securityTotals([
      { allowed: "9007199254740993", blocked: "2" },
      { allowed: "1", blocked: "3" },
    ]),
    { allowed: 9007199254740994n, blocked: 5n },
  );
});

test("response headers retain the tighter network budget after an authenticated account check", async () => {
  const control = createRequestProtection(),
    url = new URL("https://lae.test/api/platform/offline/grant"),
    json = () => {},
    make = () => ({
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
    });
  let request, response;
  for (let i = 0; i < POLICIES.offline_write.client_max; i++) {
    request = req("198.51.100.60");
    response = make();
    assert.equal(await control.network(request, response, url, json), false);
  }
  assert.equal(
    await control.account(request, response, json, {
      listener: async () => ({ id: "99" }),
    }),
    false,
  );
  assert.equal(response.headers["RateLimit-Remaining"], "0");
  assert.equal(
    response.headers["RateLimit-Limit"],
    String(POLICIES.offline_write.client_max),
  );
});
