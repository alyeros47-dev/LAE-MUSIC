"use strict";
const crypto = require("node:crypto");
const { fail } = require("./transactions");
const { POLICIES, requestPolicy } = require("./request-policy");
const { createAddressResolver } = require("./client-address");
function createRequestProtection({
  pool,
  env = process.env,
  shared = !!pool && ["production", "staging"].includes(env.NODE_ENV),
  now = Date.now,
  maximumEntries = 5000,
} = {}) {
  const resolver = createAddressResolver(env.TRUSTED_PROXY_CIDRS || ""),
    buckets = new Map(),
    metrics = new Map();
  let metricsTruncated = false;
  let keyPromise = null,
    memoryKey = crypto.randomBytes(32),
    timer = null,
    cleaning = false,
    degraded = false;
  const mode = shared ? "shared_database" : "bounded_process_memory";
  async function key() {
    if (!shared) return memoryKey;
    if (!keyPromise)
      keyPromise = (async () => {
        let r = await pool.query(
          "SELECT network_key FROM request_security_settings WHERE id=1",
        );
        if (!r.rowCount) {
          await pool.query(
            "INSERT INTO request_security_settings(id,network_key) VALUES(1,$1) ON CONFLICT(id) DO NOTHING",
            [crypto.randomBytes(32).toString("hex")],
          );
          r = await pool.query(
            "SELECT network_key FROM request_security_settings WHERE id=1",
          );
        }
        if (!/^[a-f0-9]{64}$/.test(r.rows[0]?.network_key || ""))
          throw Error("Request protection initialization unavailable");
        return Buffer.from(r.rows[0].network_key, "hex");
      })().catch((e) => {
        keyPromise = null;
        throw e;
      });
    return keyPromise;
  }
  function memoryTake(bucket, rule, subject, source, maximum, seconds) {
    const at = now();
    let row = buckets.get(bucket);
    if (!row && buckets.size >= maximumEntries) {
      for (const [id, r] of buckets) if (r.expires_at <= at) buckets.delete(id);
      if (buckets.size >= maximumEntries)
        throw fail(503, "Request protection is busy. Try again shortly.");
    }
    if (!row || row.expires_at <= at)
      row = { attempts: 0, expires_at: at + seconds * 1000 };
    row.attempts = Math.min(1000000, row.attempts + 1);
    buckets.set(bucket, row);
    const allowed = row.attempts <= maximum;
    const hour = new Date(Math.floor(at / 3600000) * 3600000).toISOString(),
      id = [hour, rule, subject, source].join(":"),
      m = metrics.get(id) || {
        hour,
        rule,
        subject_kind: subject,
        client_source: source,
        allowed: 0n,
        blocked: 0n,
      };
    if (!metrics.has(id) && metrics.size >= maximumEntries) {
      metrics.delete(metrics.keys().next().value);
      metricsTruncated = true;
    }
    m[allowed ? "allowed" : "blocked"]++;
    metrics.set(id, m);
    for (const [id, r] of metrics)
      if (Date.parse(r.hour) < at - 31 * 86400000) metrics.delete(id);
    return {
      allowed,
      limit: maximum,
      remaining: Math.max(0, maximum - row.attempts),
      retry_after: Math.max(1, Math.ceil((row.expires_at - at) / 1000)),
      reset_after: Math.max(1, Math.ceil((row.expires_at - at) / 1000)),
    };
  }
  async function databaseTake(bucket, rule, subject, source, maximum, seconds) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL statement_timeout='5s'");
      const q = await db.query(
        "INSERT INTO request_rate_buckets(bucket,rule,subject_kind,attempts,expires_at) VALUES($1,$2,$3,1,NOW()+$4*INTERVAL '1 second') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN request_rate_buckets.expires_at<=NOW() THEN 1 ELSE LEAST(request_rate_buckets.attempts+1,1000000) END,expires_at=CASE WHEN request_rate_buckets.expires_at<=NOW() THEN EXCLUDED.expires_at ELSE request_rate_buckets.expires_at END RETURNING attempts,GREATEST(1,CEIL(EXTRACT(EPOCH FROM expires_at-NOW())))::int AS reset_after",
        [bucket, rule, subject, seconds],
      );
      const r = q.rows[0];
      if (!r) throw Error("Request budget unavailable");
      const allowed = r.attempts <= maximum;
      await db.query(
        "INSERT INTO request_security_metrics(hour,rule,subject_kind,client_source,allowed,blocked) VALUES(date_trunc('hour',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',$1,$2,$3,$4,$5) ON CONFLICT(hour,rule,subject_kind,client_source) DO UPDATE SET allowed=request_security_metrics.allowed+EXCLUDED.allowed,blocked=request_security_metrics.blocked+EXCLUDED.blocked",
        [rule, subject, source, allowed ? 1 : 0, allowed ? 0 : 1],
      );
      await db.query("COMMIT");
      degraded = false;
      return {
        allowed,
        limit: maximum,
        remaining: Math.max(0, maximum - r.attempts),
        retry_after: r.reset_after,
        reset_after: r.reset_after,
      };
    } catch (e) {
      await db.query("ROLLBACK");
      degraded = true;
      throw e;
    } finally {
      db.release();
    }
  }
  async function take(policy, subject, identity, source = "socket") {
    if (
      !policy ||
      !Object.hasOwn(POLICIES, policy.id) ||
      !["network", "account"].includes(subject) ||
      typeof identity !== "string" ||
      identity.length > 200 ||
      !["socket", "trusted_forwarded", "invalid_forwarded", "account"].includes(
        source,
      )
    )
      throw fail(400, "Invalid request budget.");
    const maximum =
      subject === "account" ? policy.actor_max : policy.client_max;
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 0 ||
      maximum > 1000000 ||
      !Number.isSafeInteger(policy.seconds) ||
      policy.seconds < 1 ||
      policy.seconds > 86400
    )
      throw fail(400, "Invalid request budget.");
    if (!maximum) return null;
    try {
      const hash = crypto
        .createHmac("sha256", await key())
        .update(
          policy.id + "|" + subject + "|" + policy.seconds + "|" + identity,
        )
        .digest("hex");
      return shared
        ? await databaseTake(
            hash,
            policy.id,
            subject,
            source,
            maximum,
            policy.seconds,
          )
        : memoryTake(hash, policy.id, subject, source, maximum, policy.seconds);
    } catch (e) {
      degraded = true;
      throw Object.assign(
        fail(
          503,
          "Request protection is temporarily unavailable. Try again shortly.",
        ),
        { code: "request_protection_unavailable" },
      );
    }
  }
  function respond(res, json, result) {
    if (!result) return false;
    const earlier = res.requestRateBudget;
    const selected =
      earlier &&
      (earlier.remaining < result.remaining ||
        (earlier.remaining === result.remaining &&
          earlier.reset_after > result.reset_after))
        ? earlier
        : result;
    res.requestRateBudget = selected;
    res.setHeader("RateLimit-Limit", String(selected.limit));
    res.setHeader("RateLimit-Remaining", String(selected.remaining));
    res.setHeader("RateLimit-Reset", String(selected.reset_after));
    if (result.allowed) return false;
    const retry =
      earlier?.remaining === 0
        ? Math.max(earlier.reset_after, result.retry_after)
        : result.retry_after;
    res.setHeader("Retry-After", String(retry));
    json(res, 429, {
      error: "Too many requests. Try again in " + retry + " seconds.",
      code: "request_rate_limited",
      retry_after_seconds: retry,
    });
    return true;
  }
  async function network(req, res, url, json) {
    const address = resolver.resolve(req);
    req.clientAddress = address.address;
    req.clientAddressSource = address.source;
    const policy = requestPolicy(req.method, url.pathname);
    req.requestBudgetPolicy = policy;
    if (!policy) return false;
    return respond(
      res,
      json,
      await take(policy, "network", address.address, address.source),
    );
  }
  async function account(req, res, json, { artist, listener } = {}) {
    const p = req.requestBudgetPolicy;
    if (!p?.actor_max) return false;
    let actor = null;
    if (p.role === "admin" && req.adminPrincipal)
      actor = { id: req.adminPrincipal.id, role: "admin" };
    else if (p.role === "artist") {
      const u = await artist?.(req);
      if (u) actor = { id: u.id, role: "artist" };
    } else if (p.role === "listener") {
      const u = await listener?.(req);
      if (u) actor = { id: u.id, role: "listener" };
    }
    return actor
      ? respond(
          res,
          json,
          await take(p, "account", actor.role + ":" + actor.id, "account"),
        )
      : false;
  }
  function summary() {
    return {
      mode,
      shared_across_instances: shared,
      storage_degraded: degraded,
      aggregate_history_truncated: metricsTruncated,
      proxy: resolver.status(),
      policies: Object.values(POLICIES).map((p) => ({
        id: p.id,
        label: p.label,
        network_limit: p.client_max,
        account_limit: p.actor_max,
        window_seconds: p.seconds,
      })),
      retention: { expired_bucket_grace_hours: 24, metric_days: 31 },
      public_streaming_requires_registration: false,
      provider_webhooks_budget_exempt: true,
      notice:
        "Counters describe technical budget checks, not unique people or fraudulent activity. Account and network checks are separate. Existing authentication, provider verification, generation quotas and financial protections remain authoritative.",
    };
  }
  async function report(input = {}) {
    const days = Number(input.days || 1);
    if (![1, 7, 30].includes(days))
      throw fail(400, "Choose a 1, 7 or 30 day security period.");
    let windows, groups;
    if (shared) {
      const db = await pool.connect();
      try {
        await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        await db.query("SET LOCAL statement_timeout='5s'");
        windows = (
          await db.query(
            "SELECT hour,subject_kind,SUM(allowed)::text AS allowed,SUM(blocked)::text AS blocked FROM request_security_metrics WHERE hour>=NOW()-($1*INTERVAL '1 day') GROUP BY hour,subject_kind ORDER BY hour,subject_kind",
            [days],
          )
        ).rows;
        groups = (
          await db.query(
            "SELECT rule,subject_kind,client_source,SUM(allowed)::text AS allowed,SUM(blocked)::text AS blocked FROM request_security_metrics WHERE hour>=NOW()-($1*INTERVAL '1 day') GROUP BY rule,subject_kind,client_source ORDER BY rule,subject_kind,client_source",
            [days],
          )
        ).rows;
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
    } else {
      const rows = [...metrics.values()].filter(
          (r) => Date.parse(r.hour) >= now() - days * 86400000,
        ),
        aggregate = (keys) => {
          const grouped = new Map();
          for (const r of rows) {
            const k = keys.map((key) => r[key]).join("|"),
              v = grouped.get(k) || {
                ...Object.fromEntries(keys.map((key) => [key, r[key]])),
                allowed: 0n,
                blocked: 0n,
              };
            v.allowed += r.allowed;
            v.blocked += r.blocked;
            grouped.set(k, v);
          }
          return [...grouped.values()].map((r) => ({
            ...r,
            allowed: r.allowed.toString(),
            blocked: r.blocked.toString(),
          }));
        };
      windows = aggregate(["hour", "subject_kind"]);
      groups = aggregate(["rule", "subject_kind", "client_source"]);
    }
    return { ...summary(), days, windows, groups };
  }
  async function cleanup() {
    if (!shared || cleaning) return;
    cleaning = true;
    try {
      await pool.query(
        "DELETE FROM request_rate_buckets WHERE bucket IN(SELECT bucket FROM request_rate_buckets WHERE expires_at<NOW()-INTERVAL '1 day' ORDER BY expires_at LIMIT 1000)",
      );
      await pool.query(
        "DELETE FROM request_security_metrics WHERE ctid IN(SELECT ctid FROM request_security_metrics WHERE hour<NOW()-INTERVAL '31 days' ORDER BY hour LIMIT 1000)",
      );
    } finally {
      cleaning = false;
    }
  }
  function start() {
    if (shared && !timer) {
      timer = setInterval(
        () =>
          cleanup().catch(() => {
            degraded = true;
            console.error("Request protection maintenance unavailable");
          }),
        300000,
      );
      timer.unref?.();
    }
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  return {
    take,
    network,
    account,
    report,
    summary,
    cleanup,
    start,
    stop,
    resolver,
  };
}
module.exports = { createRequestProtection };
