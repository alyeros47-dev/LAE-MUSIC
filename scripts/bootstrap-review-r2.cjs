"use strict";
const crypto = require("node:crypto");
const {
  BUCKET,
  ORIGIN,
  MODE,
  ACTIONS,
  signS3,
  decodeGrant,
} = require("../lib/review-storage");
const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");
function derive(parent, now = Date.now(), ttl = 604800) {
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 604800)
    throw Error("Invalid review storage lifetime.");
  if (
    parent.bucket === BUCKET ||
    !/^[a-f0-9]{32}$/.test(parent.account) ||
    !parent.key ||
    !parent.secret
  )
    throw Error("Production and review storage must be distinct.");
  const iat = Math.floor(now / 1000),
    header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    claims = {
      sub: parent.account,
      iss: parent.key,
      aud: parent.account + ".r2.cloudflarestorage.com",
      iat,
      exp: iat + ttl,
      bucket: BUCKET,
      actions: ACTIONS,
    };
  const data =
      header + "." + Buffer.from(JSON.stringify(claims)).toString("base64url"),
    jwt =
      data +
      "." +
      crypto
        .createHmac("sha256", parent.secret)
        .update(data)
        .digest("base64url");
  return {
    account: parent.account,
    key: parent.key,
    secret: sha(jwt),
    bucket: BUCKET,
    sessionToken: Buffer.from("jwt/" + jwt).toString("base64"),
    expires_at: new Date((iat + ttl) * 1000).toISOString(),
  };
}
async function bootstrap(
  source,
  { fetchImpl = fetch, now = Date.now(), ticketKey } = {},
) {
  const parent = {
    account: source.R2_ACCOUNT_ID,
    key: source.R2_ACCESS_KEY_ID,
    secret: source.R2_SECRET_ACCESS_KEY,
    bucket: source.R2_BUCKET,
  };
  if (!Object.values(parent).every(Boolean))
    return { configured: false, reason: "production_r2_configuration_missing" };
  let child;
  try {
    child = derive(parent, now);
  } catch {
    return {
      configured: false,
      reason: "r2_source_configuration_requires_review",
    };
  }
  const parentReview = { ...parent, bucket: BUCKET },
    canary = "__lae_review_checks__/" + crypto.randomUUID() + ".txt",
    content = Buffer.from(
      "LAE-MUSIC isolated review storage " + crypto.randomUUID(),
    );
  let created = false,
    wrote = false;
  const call = async (config, key, method, body, extra = {}) => {
    try {
      return await fetchImpl(signS3(config, key, method, 120, now), {
        method,
        redirect: "error",
        headers: {
          ...(body
            ? {
                "Content-Type": "application/octet-stream",
                "Content-Length": String(body.length),
              }
            : {}),
          ...extra,
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return null;
    }
  };
  try {
    let head = await call(parentReview, "", "HEAD");
    if (!head) return { configured: false, reason: "r2_network_unavailable" };
    if (head.status === 404) {
      const put = await call(parentReview, "", "PUT", Buffer.alloc(0));
      if (!put?.ok)
        return {
          configured: false,
          reason: "separate_bucket_creation_not_authorized",
          http_status: put?.status || null,
        };
      created = true;
    } else if (!head.ok)
      return {
        configured: false,
        reason: "separate_bucket_access_not_authorized",
        http_status: head.status,
      };
    const put = await call(child, canary, "PUT", content);
    if (!put?.ok)
      return {
        configured: false,
        reason: "scoped_credentials_rejected",
        http_status: put?.status || null,
        bucket_created: created,
      };
    wrote = true;
    const headObject = await call(child, canary, "HEAD");
    if (
      !headObject?.ok ||
      Number(headObject.headers.get("content-length")) !== content.length
    )
      return { configured: false, reason: "scoped_head_failed" };
    const get = await call(child, canary, "GET");
    if (!get?.ok || !Buffer.from(await get.arrayBuffer()).equals(content))
      return { configured: false, reason: "scoped_read_failed" };
    const range = await call(child, canary, "GET", undefined, {
      Range: "bytes=0-7",
    });
    if (
      range?.status !== 206 ||
      !Buffer.from(await range.arrayBuffer()).equals(content.subarray(0, 8))
    )
      return { configured: false, reason: "scoped_range_failed" };
    const denied = await call(
      { ...child, bucket: parent.bucket },
      "__lae_review_denied__/" + crypto.randomUUID(),
      "HEAD",
    );
    if (denied?.status !== 403)
      return {
        configured: false,
        reason: "cross_bucket_isolation_not_verified",
        http_status: denied?.status || null,
      };
    return {
      configured: true,
      reason: null,
      bucket_created: created,
      put_head_get_range_verified: true,
      cross_bucket_read_denied: true,
      expires_at: child.expires_at,
      environment: {
        R2_ACCOUNT_ID: child.account,
        R2_ACCESS_KEY_ID: child.key,
        R2_SECRET_ACCESS_KEY: child.secret,
        R2_BUCKET: BUCKET,
        R2_SESSION_TOKEN: child.sessionToken,
        LAE_REVIEW_R2_MODE: MODE,
        REVIEW_STORAGE_ORIGIN: ORIGIN,
        REVIEW_STORAGE_TICKET_KEY:
          ticketKey || crypto.randomBytes(32).toString("hex"),
      },
    };
  } finally {
    if (wrote) {
      const removed = await call(parentReview, canary, "DELETE");
      await removed?.body?.cancel();
    }
  }
}
function verifyDerived(source, environment, now = Date.now()) {
  try {
    const expected = derive(
      {
        account: source.R2_ACCOUNT_ID,
        key: source.R2_ACCESS_KEY_ID,
        secret: source.R2_SECRET_ACCESS_KEY,
        bucket: source.R2_BUCKET,
      },
      now,
    );
    const decoded = decodeGrant(environment.R2_SESSION_TOKEN);
    const parts = decoded.jwt.split("."),
      signed = crypto
        .createHmac("sha256", source.R2_SECRET_ACCESS_KEY)
        .update(parts[0] + "." + parts[1])
        .digest("base64url");
    return (
      signed === parts[2] &&
      environment.R2_BUCKET === BUCKET &&
      source.R2_BUCKET !== BUCKET &&
      environment.R2_ACCOUNT_ID === source.R2_ACCOUNT_ID &&
      environment.R2_ACCESS_KEY_ID === source.R2_ACCESS_KEY_ID &&
      environment.R2_SECRET_ACCESS_KEY === sha(decoded.jwt) &&
      environment.R2_SECRET_ACCESS_KEY !== source.R2_SECRET_ACCESS_KEY &&
      require("../lib/review-storage").validGrant(
        {
          account: environment.R2_ACCOUNT_ID,
          key: environment.R2_ACCESS_KEY_ID,
          secret: environment.R2_SECRET_ACCESS_KEY,
          bucket: environment.R2_BUCKET,
          sessionToken: environment.R2_SESSION_TOKEN,
        },
        now,
      ) &&
      expected.account === environment.R2_ACCOUNT_ID
    );
  } catch {
    return false;
  }
}
module.exports = { derive, bootstrap, verifyDerived };
