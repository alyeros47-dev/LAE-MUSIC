"use strict";
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const BUCKET = "lae-music-review-sandbox",
  ORIGIN = "https://lae-music-review-sandbox.onrender.com",
  MODE = "scoped-temporary-v1";
const ACTIONS = ["GetObject", "HeadObject", "PutObject"];
const encode = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex"),
  mac = (k, x) => crypto.createHmac("sha256", k).update(x).digest();
function objectKey(key) {
  if (
    typeof key !== "string" ||
    !key ||
    key.length > 1024 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\x00-\x1f]/.test(key)
  )
    throw Error("Invalid review object key.");
  return key;
}
function signS3(
  config,
  key = "",
  method = "GET",
  expires = 120,
  now = Date.now(),
) {
  if (
    !/^[a-f0-9]{32}$/.test(config.account) ||
    !config.bucket ||
    !["GET", "HEAD", "PUT", "DELETE"].includes(method)
  )
    throw Error("Invalid storage signing parameters.");
  if (key) objectKey(key);
  const stamp = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, ""),
    date = stamp.slice(0, 8),
    scope = date + "/auto/s3/aws4_request",
    host = config.account + ".r2.cloudflarestorage.com";
  const uri =
    "/" + [config.bucket, ...(key ? key.split("/") : [])].map(encode).join("/");
  const pairs = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": config.key + "/" + scope,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  if (config.sessionToken) pairs["X-Amz-Security-Token"] = config.sessionToken;
  const query = Object.entries(pairs)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => encode(k) + "=" + encode(v))
    .join("&");
  const canonical = [
    method,
    uri,
    query,
    "host:" + host + "\n",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const signing = mac(
    mac(mac(mac("AWS4" + config.secret, date), "auto"), "s3"),
    "aws4_request",
  );
  const signature = crypto
    .createHmac("sha256", signing)
    .update(["AWS4-HMAC-SHA256", stamp, scope, hash(canonical)].join("\n"))
    .digest("hex");
  return (
    "https://" + host + uri + "?" + query + "&X-Amz-Signature=" + signature
  );
}
function decodeGrant(session) {
  if (typeof session !== "string" || session.length > 12000)
    throw Error("Invalid storage session.");
  const plain = Buffer.from(session, "base64").toString();
  if (!plain.startsWith("jwt/")) throw Error("Invalid storage session.");
  const jwt = plain.slice(4),
    parts = jwt.split(".");
  if (parts.length !== 3) throw Error("Invalid storage session.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url")),
    claims = JSON.parse(Buffer.from(parts[1], "base64url"));
  return { jwt, header, claims, signature: parts[2] };
}
function validGrant(config, now = Date.now()) {
  try {
    const { jwt, header, claims } = decodeGrant(config.sessionToken);
    const n = Math.floor(now / 1000);
    return (
      header.alg === "HS256" &&
      header.typ === "JWT" &&
      claims.sub === config.account &&
      claims.iss === config.key &&
      claims.aud === config.account + ".r2.cloudflarestorage.com" &&
      claims.bucket === BUCKET &&
      config.bucket === BUCKET &&
      !claims.scope &&
      !claims.paths &&
      Array.isArray(claims.actions) &&
      claims.actions.length === ACTIONS.length &&
      ACTIONS.every((a) => claims.actions.includes(a)) &&
      Number.isInteger(claims.iat) &&
      Number.isInteger(claims.exp) &&
      claims.iat <= n + 60 &&
      claims.exp > n + 30 &&
      claims.exp - claims.iat <= 604800 &&
      hash(jwt) === config.secret
    );
  } catch {
    return false;
  }
}
function configuration(base, env = process.env, now = Date.now()) {
  if (env.LAE_REVIEW_R2_MODE !== MODE) return base;
  if (
    env.NODE_ENV !== "staging" ||
    env.LAE_REVIEW_ENVIRONMENT !== "pr6-ephemeral-review-v1" ||
    env.REVIEW_STORAGE_ORIGIN !== ORIGIN ||
    !/^[a-f0-9]{64}$/.test(env.REVIEW_STORAGE_TICKET_KEY || "")
  )
    return null;
  const config = { ...base, sessionToken: env.R2_SESSION_TOKEN };
  if (!validGrant(config, now)) return null;
  const { claims } = decodeGrant(config.sessionToken);
  return {
    ...config,
    reviewProxy: {
      origin: ORIGIN,
      ticketKey: env.REVIEW_STORAGE_TICKET_KEY,
      expires: claims.exp * 1000,
    },
  };
}
function ticket(config, key, action, expires = 900, now = Date.now()) {
  objectKey(key);
  const method = { get: "GET", head: "HEAD", put: "PUT" }[action];
  if (!method || !config.reviewProxy)
    throw Error("Invalid review storage action.");
  const end = Math.min(
    now + Math.max(1, Math.min(expires, 86400)) * 1000,
    config.reviewProxy.expires,
  );
  if (end <= now) throw Error("Review storage lease expired.");
  const payload = Buffer.from(
      JSON.stringify({ v: 1, key, method, exp: end }),
    ).toString("base64url"),
    sig = mac(
      Buffer.from(config.reviewProxy.ticketKey, "hex"),
      payload,
    ).toString("base64url");
  return (
    config.reviewProxy.origin +
    "/api/platform/review-storage/" +
    payload +
    "." +
    sig +
    "/" +
    encodeURIComponent(key.split("/").at(-1))
  );
}
function verifyTicket(config, pathname, method, now = Date.now()) {
  if (!config?.reviewProxy) throw Error("Review storage unavailable.");
  const m =
    /^\/api\/platform\/review-storage\/([A-Za-z0-9_-]{1,2000})\.([A-Za-z0-9_-]{43})\/([^/]+)$/.exec(
      pathname,
    );
  if (!m) throw Error("Invalid object ticket.");
  const expected = mac(Buffer.from(config.reviewProxy.ticketKey, "hex"), m[1]),
    signature = Buffer.from(m[2], "base64url");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(expected, signature)
  )
    throw Error("Invalid object ticket.");
  const value = JSON.parse(Buffer.from(m[1], "base64url"));
  objectKey(value.key);
  if (
    value.v !== 1 ||
    value.method !== method ||
    !Number.isSafeInteger(value.exp) ||
    value.exp <= now ||
    value.exp > config.reviewProxy.expires ||
    decodeURIComponent(m[3]) !== value.key.split("/").at(-1)
  )
    throw Error("Expired or mismatched object ticket.");
  return value;
}
async function handle(req, res, url, { storage, fetchImpl = fetch } = {}) {
  if (!url.pathname.startsWith("/api/platform/review-storage/")) return false;
  const config = storage?.();
  let claim;
  try {
    claim = verifyTicket(config, url.pathname, req.method);
  } catch {
    res.writeHead(403, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error: "Review storage access expired or is unavailable.",
      }),
    );
    return true;
  }
  const headers = {};
  if (req.method === "PUT") {
    const length = Number(req.headers["content-length"]);
    if (
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > 64 * 1024 * 1024
    ) {
      res.writeHead(413);
      res.end();
      return true;
    }
    headers["Content-Length"] = String(length);
    headers["Content-Type"] =
      req.headers["content-type"] || "application/octet-stream";
  }
  if (req.headers.range) {
    if (
      req.method !== "GET" ||
      !/^bytes=(?:\d+-\d*|-\d+)$/.test(req.headers.range)
    ) {
      res.writeHead(416);
      res.end();
      return true;
    }
    headers.Range = req.headers.range;
  }
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 90000);
  const abort = () => controller.abort();
  req.once("aborted", abort);
  try {
    let bytes = 0;
    const body =
      req.method === "PUT"
        ? Readable.toWeb(
            req.pipe(
              new Transform({
                transform(chunk, encoding, done) {
                  bytes += chunk.length;
                  done(
                    bytes > Number(headers["Content-Length"])
                      ? Error("Review upload exceeds declared length.")
                      : null,
                    chunk,
                  );
                },
              }),
            ),
          )
        : undefined;
    const upstream = await fetchImpl(
      signS3(config, claim.key, req.method, 120),
      {
        method: req.method,
        headers,
        redirect: "error",
        body,
        ...(body ? { duplex: "half" } : {}),
        signal: controller.signal,
      },
    );
    if (![200, 201, 204, 206, 304, 404, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      res.writeHead(502, { "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    if ([404, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      res.writeHead(upstream.status, { "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    const outgoing = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
    ]) {
      const v = upstream.headers.get(name);
      if (v) outgoing[name] = v;
    }
    res.writeHead(upstream.status, outgoing);
    if (req.method === "HEAD" || !upstream.body) res.end();
    else await pipeline(Readable.fromWeb(upstream.body), res);
    return true;
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { "Cache-Control": "no-store" });
      res.end();
    } else res.destroy();
    return true;
  } finally {
    clearTimeout(timeout);
    req.removeListener("aborted", abort);
  }
}
module.exports = {
  BUCKET,
  ORIGIN,
  MODE,
  ACTIONS,
  objectKey,
  signS3,
  decodeGrant,
  validGrant,
  configuration,
  ticket,
  verifyTicket,
  handle,
};
