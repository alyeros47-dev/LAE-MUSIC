"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { Readable, Writable } = require("node:stream");
const store = require("../lib/review-storage"),
  {
    derive,
    bootstrap,
    verifyDerived,
  } = require("../scripts/bootstrap-review-r2.cjs");
const parent = {
  account: "a".repeat(32),
  key: "parent-access-id",
  secret: "parent-secret-never-in-browser",
  bucket: "live-music",
};
const source = {
  R2_ACCOUNT_ID: parent.account,
  R2_ACCESS_KEY_ID: parent.key,
  R2_SECRET_ACCESS_KEY: parent.secret,
  R2_BUCKET: parent.bucket,
};
const envOf = (child) => ({
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: "pr6-ephemeral-review-v1",
  LAE_REVIEW_R2_MODE: store.MODE,
  REVIEW_STORAGE_ORIGIN: store.ORIGIN,
  REVIEW_STORAGE_TICKET_KEY: "b".repeat(64),
  R2_ACCOUNT_ID: child.account,
  R2_ACCESS_KEY_ID: child.key,
  R2_SECRET_ACCESS_KEY: child.secret,
  R2_BUCKET: child.bucket,
  R2_SESSION_TOKEN: child.sessionToken,
});
function config(child, now) {
  return store.configuration(child, envOf(child), now);
}
function recorder() {
  const chunks = [];
  const r = new Writable({
    write(chunk, enc, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  r.headersSent = false;
  r.writeHead = (status, headers = {}) => {
    r.status = status;
    r.headers = headers;
    r.headersSent = true;
  };
  r.output = () => Buffer.concat(chunks);
  return r;
}
test("restricted credential derivation never hands the parent secret to the sandbox", () => {
  const c = derive(parent),
    { claims } = store.decodeGrant(c.sessionToken);
  assert.notEqual(c.secret, parent.secret);
  assert.equal(c.key, parent.key);
  assert.equal(claims.bucket, store.BUCKET);
  assert.deepEqual(claims.actions, ["GetObject", "HeadObject", "PutObject"]);
  assert(!JSON.stringify(c).includes(parent.secret));
  assert(verifyDerived(source, envOf(c)));
  assert(store.validGrant(c));
  assert.throws(() => derive({ ...parent, bucket: store.BUCKET }));
  assert.throws(() => derive(parent, Date.now(), 604801));
});
test("forged, expired, broad and cross-bucket grants fail validation", () => {
  const now = Date.now(),
    c = derive(parent, now, 60);
  assert(!store.validGrant(c, now + 60001));
  assert(!store.validGrant({ ...c, bucket: parent.bucket }, now));
  assert(!store.validGrant({ ...c, secret: parent.secret }, now));
  assert(
    !verifyDerived({ ...source, R2_SECRET_ACCESS_KEY: "wrong" }, envOf(c), now),
  );
  const decoded = store.decodeGrant(c.sessionToken);
  const jwt = decoded.jwt.split(".");
  jwt[1] = Buffer.from(
    JSON.stringify({ ...decoded.claims, scope: "admin-read-write" }),
  ).toString("base64url");
  const tampered = jwt.join(".");
  assert(
    !store.validGrant(
      {
        ...c,
        sessionToken: Buffer.from("jwt/" + tampered).toString("base64"),
        secret: crypto.createHash("sha256").update(tampered).digest("hex"),
      },
      now,
    ),
  );
});
test("temporary configuration works only on the pinned sandbox and fails closed after expiry", () => {
  const now = Date.now(),
    child = derive(parent, now, 60);
  const e = envOf(child);
  assert(config(child, now).reviewProxy);
  assert.equal(
    store.configuration(child, { ...e, NODE_ENV: "production" }, now),
    null,
  );
  assert.equal(
    store.configuration(
      child,
      { ...e, REVIEW_STORAGE_ORIGIN: "https://evil.invalid" },
      now,
    ),
    null,
  );
  assert.equal(config(child, now + 61000), null);
  const plain = { account: "legacy" };
  assert.equal(store.configuration(plain, {}), plain);
});
test("client tickets are object/method/expiry bound and contain no R2 session or parent key", () => {
  const now = Date.now(),
    child = derive(parent, now),
    c = config(child, now),
    url = new URL(
      store.ticket(c, "voice-profiles/7/owned.mp3", "get", 900, now),
    );
  assert.equal(url.origin, store.ORIGIN);
  assert(url.pathname.endsWith(".mp3"));
  assert(!url.href.includes(child.key));
  assert(!url.href.includes("X-Amz-Security-Token"));
  assert(!url.href.includes(child.sessionToken));
  assert.equal(
    store.verifyTicket(c, url.pathname, "GET", now).key,
    "voice-profiles/7/owned.mp3",
  );
  for (const [path, method, time] of [
    [url.pathname, "PUT", now],
    [url.pathname.replace("owned.mp3", "another.mp3"), "GET", now],
    [
      url.pathname.replace(
        /\.([a-zA-Z0-9_-]{43})\//,
        "." + "x".repeat(43) + "/",
      ),
      "GET",
      now,
    ],
    [url.pathname, "GET", now + 900001],
  ])
    assert.throws(() => store.verifyTicket(c, path, method, time));
});
test("path traversal and overlong keys never get signed", () => {
  const c = config(derive(parent));
  for (const k of [
    "../live.mp3",
    "a/../b",
    "/absolute",
    "a//b",
    "a\\b",
    "a\u0000b",
    "x".repeat(1025),
  ])
    assert.throws(() => store.ticket(c, k, "get"));
});
test("only internal R2 requests include the session token and range support remains available", async () => {
  const c = config(derive(parent)),
    url = new URL(store.ticket(c, "music/owned.wav", "get"));
  const req = Readable.from([]);
  req.method = "GET";
  req.headers = { range: "bytes=0-7" };
  const res = recorder();
  let upstream;
  await store.handle(req, res, url, {
    storage: () => c,
    fetchImpl: async (u, o) => {
      upstream = { u: new URL(u), o };
      return new Response(Buffer.from("abcdefgh"), {
        status: 206,
        headers: {
          "content-type": "audio/wav",
          "content-length": "8",
          "content-range": "bytes 0-7/10",
          "accept-ranges": "bytes",
          "x-amz-security-token": "must-not-leak",
        },
      });
    },
  });
  assert.equal(res.status, 206);
  assert.equal(res.output().toString(), "abcdefgh");
  assert.equal(res.headers["content-range"], "bytes 0-7/10");
  assert(!JSON.stringify(res.headers).includes("must-not-leak"));
  assert.equal(
    upstream.u.searchParams.get("X-Amz-Security-Token"),
    c.sessionToken,
  );
  assert.equal(upstream.o.headers.Range, "bytes=0-7");
  assert.equal(upstream.o.redirect, "error");
});
test("streamed PUTs stay on the signed object, enforce length and omit copy/auth client headers", async () => {
  const c = config(derive(parent)),
    url = new URL(store.ticket(c, "uploads/owned.mp3", "put"));
  const req = Readable.from([Buffer.from("hello")]);
  req.method = "PUT";
  req.headers = {
    "content-length": "5",
    "content-type": "audio/mpeg",
    "x-amz-copy-source": "live-bucket/song.mp3",
    authorization: "arbitrary",
  };
  const res = recorder();
  await store.handle(req, res, url, {
    storage: () => c,
    fetchImpl: async (u, o) => {
      assert.equal(
        new URL(u).pathname,
        "/" + store.BUCKET + "/uploads/owned.mp3",
      );
      assert(!o.headers.authorization);
      assert(!o.headers["x-amz-copy-source"]);
      assert.equal(await new Response(o.body).text(), "hello");
      return new Response(null, { status: 200 });
    },
  });
  assert.equal(res.status, 200);
});
test("oversized PUTs and forged tickets make no R2 request", async () => {
  const c = config(derive(parent)),
    url = new URL(store.ticket(c, "uploads/owned.mp3", "put"));
  for (const length of [0, 65 * 1024 * 1024]) {
    const req = Readable.from([]);
    req.method = "PUT";
    req.headers = { "content-length": String(length) };
    const res = recorder();
    await store.handle(req, res, url, {
      storage: () => c,
      fetchImpl: () => {
        throw Error("Must not call upstream");
      },
    });
    assert.equal(res.status, 413);
  }
  const req = Readable.from([]);
  req.method = "GET";
  req.headers = {};
  const res = recorder();
  await store.handle(
    req,
    res,
    new URL(store.ORIGIN + "/api/platform/review-storage/forged.mp3"),
    {
      storage: () => c,
      fetchImpl: () => {
        throw Error("Must not call upstream");
      },
    },
  );
  assert.equal(res.status, 403);
});
test("upstream redirects and errors cannot expose signed credential URLs", async () => {
  const c = config(derive(parent)),
    url = new URL(store.ticket(c, "uploads/owned.mp3", "get"));
  const req = Readable.from([]);
  req.method = "GET";
  req.headers = {};
  const res = recorder();
  await store.handle(req, res, url, {
    storage: () => c,
    fetchImpl: async () =>
      new Response("secret upstream diagnostics", {
        status: 403,
        headers: { location: "https://secret.invalid" },
      }),
  });
  assert.equal(res.status, 502);
  assert(!res.output().toString().includes("secret"));
  assert(!res.headers.location);
});
function cloudFixture({
  createDenied = false,
  crossBucketAllowed = false,
} = {}) {
  let exists = false,
    object = null;
  const calls = [];
  return {
    calls,
    fetchImpl: async (value, o) => {
      const u = new URL(value),
        path = decodeURIComponent(u.pathname);
      calls.push({
        path,
        method: o.method,
        session: u.searchParams.has("X-Amz-Security-Token"),
      });
      assert.equal(u.hostname, parent.account + ".r2.cloudflarestorage.com");
      if (path === "/" + store.BUCKET) {
        if (o.method === "HEAD")
          return new Response(null, { status: exists ? 200 : 404 });
        assert.equal(o.method, "PUT");
        if (createDenied) return new Response(null, { status: 403 });
        exists = true;
        return new Response(null, { status: 200 });
      }
      if (path.startsWith("/" + parent.bucket + "/")) {
        assert.equal(o.method, "HEAD");
        return new Response(null, { status: crossBucketAllowed ? 404 : 403 });
      }
      assert(path.startsWith("/" + store.BUCKET + "/__lae_review_checks__/"));
      if (o.method === "PUT") {
        object = Buffer.from(o.body);
        return new Response(null, { status: 200 });
      }
      if (o.method === "HEAD")
        return new Response(null, {
          status: 200,
          headers: { "content-length": String(object.length) },
        });
      if (o.method === "GET") {
        const range = o.headers.Range;
        return new Response(range ? object.subarray(0, 8) : object, {
          status: range ? 206 : 200,
        });
      }
      if (o.method === "DELETE") {
        assert(!u.searchParams.has("X-Amz-Security-Token"));
        return new Response(null, { status: 204 });
      }
      throw Error("Unexpected");
    },
  };
}
test("bootstrap creates only the separate bucket, proves real operation sequence and denies production reads", async () => {
  const f = cloudFixture(),
    result = await bootstrap(source, { fetchImpl: f.fetchImpl });
  assert.equal(result.configured, true);
  assert.equal(result.put_head_get_range_verified, true);
  assert.equal(result.cross_bucket_read_denied, true);
  assert(verifyDerived(source, result.environment));
  assert(
    f.calls
      .filter((c) => c.method === "PUT" || c.method === "DELETE")
      .every((c) => c.path.startsWith("/" + store.BUCKET)),
  );
  assert(!JSON.stringify(result).includes(parent.secret));
});
test("insufficient bucket creation permission produces a concrete blocker without touching production objects", async () => {
  const f = cloudFixture({ createDenied: true }),
    r = await bootstrap(source, { fetchImpl: f.fetchImpl });
  assert.equal(r.configured, false);
  assert.equal(r.reason, "separate_bucket_creation_not_authorized");
  assert(!f.calls.some((c) => c.path.startsWith("/" + parent.bucket)));
  assert(!r.environment);
});
test("credentials are not installed unless cross-bucket denial is verified", async () => {
  const f = cloudFixture({ crossBucketAllowed: true }),
    r = await bootstrap(source, { fetchImpl: f.fetchImpl });
  assert.equal(r.configured, false);
  assert.equal(r.reason, "cross_bucket_isolation_not_verified");
  assert(!r.environment);
});

const { verifyStorage } = require("../scripts/verify-review-storage.cjs");
test("public sandbox audio transport probe verifies bytes, seeking and isolated cleanup", async () => {
  const environment = envOf(derive(parent)),
    calls = [];
  let bytes;
  const result = await verifyStorage(environment, {
    source,
    fetchImpl: async (address, opts = {}) => {
      const u = new URL(address);
      calls.push({ u, method: opts.method || "GET" });
      if (opts.method === "DELETE") return new Response(null, { status: 204 });
      assert.equal(u.origin, store.ORIGIN);
      assert(!address.includes(environment.R2_SESSION_TOKEN));
      if (opts.method === "PUT") {
        bytes = opts.body;
        return new Response(null, { status: 200 });
      }
      if (opts.method === "HEAD")
        return new Response(null, {
          headers: {
            "content-type": "audio/wav",
            "content-length": String(bytes.length),
          },
        });
      if (opts.headers?.Range)
        return new Response(bytes.subarray(0, 44), { status: 206 });
      return new Response(bytes);
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.artist_upload_verified, false);
  assert.equal(result.music_generation_verified, false);
  assert.equal(calls.length, 5);
  assert(
    calls
      .at(-1)
      .u.pathname.startsWith("/" + store.BUCKET + "/__lae_review_checks__/"),
  );
  assert(calls.every((c) => !c.u.pathname.includes(parent.bucket)));
});
test("storage probe refuses production, rejects mismatched audio and still removes its own fixture", async () => {
  let calls = 0;
  assert.equal(
    (
      await verifyStorage(source, {
        source,
        fetchImpl: async () => {
          calls++;
        },
      })
    ).reason,
    "storage_isolation_required",
  );
  assert.equal(calls, 0);
  const environment = envOf(derive(parent));
  let deleted = false;
  const result = await verifyStorage(environment, {
    source,
    fetchImpl: async (u, o = {}) => {
      if (o.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (o.method === "PUT") return new Response(null);
      return new Response(null, {
        headers: { "content-type": "audio/wav", "content-length": "1" },
      });
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, "sandbox_head_failed");
  assert(deleted);
});
