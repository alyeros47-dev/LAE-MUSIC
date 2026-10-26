"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const { createRequestProtection } = require("../lib/request-protection"),
  { POLICIES } = require("../lib/request-policy"),
  { runtime } = require("./runtime.cjs");
module.exports = async (t, { pool }) => {
  const env = {
      NODE_ENV: "staging",
      TRUSTED_PROXY_CIDRS: "10.0.0.10/32",
      ADMIN_KEY: "isolated-protection-owner-key-123456",
      STUDIO_RELEASE_WORKER_ENABLED: "false",
      ARTIST_NOTIFICATION_WORKER_ENABLED: "false",
    },
    control = createRequestProtection({ pool, env });
  const key = () => crypto.randomUUID(),
    financial = async () =>
      (
        await pool.query(
          "SELECT (SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COUNT(*) FROM commerce_receipts) AS purchases,(SELECT COUNT(*) FROM premium_receipts) AS premium,(SELECT COUNT(*) FROM premium_streams) AS streams",
        )
      ).rows[0];
  let listener, cookie1, cookie2, app;
  await t.test(
    "database request budgets serialize concurrent instances and retain their limit after a new instance starts",
    async () => {
      const a = createRequestProtection({ pool, env }),
        b = createRequestProtection({ pool, env }),
        policy = { ...POLICIES.artist_registration, client_max: 10 },
        identity = "concurrent-fixture-" + key();
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          (i % 2 ? a : b).take(policy, "network", identity),
        ),
      );
      assert.equal(results.filter((r) => r.allowed).length, 10);
      assert.equal(results.filter((r) => !r.allowed).length, 30);
      assert(results.every((r) => r.remaining >= 0 && r.retry_after > 0));
      assert.equal(
        (
          await createRequestProtection({ pool, env }).take(
            policy,
            "network",
            identity,
          )
        ).allowed,
        false,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM request_security_settings",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "the authoritative database clock resets an expired budget without changing any financial balance or receipt",
    async () => {
      const identity = "expiry-fixture-" + key(),
        policy = { ...POLICIES.listener_registration, client_max: 1 },
        before = await financial();
      assert((await control.take(policy, "network", identity)).allowed);
      assert(!(await control.take(policy, "network", identity)).allowed);
      await pool.query(
        "UPDATE request_rate_buckets SET expires_at=NOW()-INTERVAL '1 second' WHERE rule='listener_registration'",
      );
      assert((await control.take(policy, "network", identity)).allowed);
      assert.deepEqual(await financial(), before);
    },
  );
  await t.test(
    "verified listener budgets follow both real account sessions across changing forwarded addresses and ignore body owner IDs",
    async () => {
      app = await runtime({ pool, env });
      const account = {
        name: "Protection listener",
        country: "Kenya",
        email: "request-protection@ci.invalid",
        password: "ProtectionListenerPassword123",
        confirmPassword: "ProtectionListenerPassword123",
      };
      const register = await app.request("/api/listener/register", {
        method: "POST",
        body: account,
        remoteAddress: "10.0.0.10",
        headers: { "x-forwarded-for": "198.51.100.211" },
      });
      assert.equal(register.status, 201);
      listener = register.json().user.id;
      cookie1 = [register.headers["set-cookie"]].flat()[0].split(";")[0];
      const login = await app.request("/api/listener/login", {
        method: "POST",
        body: account,
        remoteAddress: "10.0.0.10",
        headers: { "x-forwarded-for": "198.51.100.212" },
      });
      assert.equal(login.status, 200);
      cookie2 = [login.headers["set-cookie"]].flat()[0].split(";")[0];
      assert.notEqual(cookie1, cookie2);
      const before = await financial();
      for (let i = 0; i < POLICIES.listener_write.actor_max; i++) {
        const result = await app.request("/api/platform/premium/playback", {
          method: "POST",
          body: { track_id: "999999999", listener_id: "forged-" + i },
          remoteAddress: "10.0.0.10",
          headers: {
            cookie: i % 2 ? cookie1 : cookie2,
            "x-forwarded-for": "203.0.113." + ((i % 200) + 1),
          },
        });
        assert.equal(
          result.status,
          200,
          "budget check " + i + ": " + result.text,
        );
        assert.equal(result.json().eligible, false);
      }
      const denied = await app.request("/api/platform/premium/playback", {
        method: "POST",
        body: { track_id: "999999999" },
        remoteAddress: "10.0.0.10",
        headers: { cookie: cookie2, "x-forwarded-for": "192.0.2.250" },
      });
      assert.equal(denied.status, 429);
      assert.equal(denied.json().code, "request_rate_limited");
      assert.equal(denied.headers["ratelimit-limit"], "240");
      assert(Number(denied.headers["retry-after"]) > 0);
      assert.deepEqual(await financial(), before);
    },
  );
  await t.test(
    "a failed aggregate write rolls back the admission and refuses execution until the shared store recovers",
    async () => {
      await pool.query(
        "CREATE FUNCTION lae_fixture_reject_budget_metric() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.rule='admin_identity' THEN RAISE EXCEPTION 'isolated aggregate failure'; END IF; RETURN NEW; END $$",
      );
      await pool.query(
        "CREATE TRIGGER lae_fixture_budget_metric BEFORE INSERT OR UPDATE ON request_security_metrics FOR EACH ROW EXECUTE FUNCTION lae_fixture_reject_budget_metric()",
      );
      const before = (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM request_rate_buckets WHERE rule='admin_identity'",
          )
        ).rows[0].n,
        identity = "failed-fixture-" + key();
      try {
        await assert.rejects(
          control.take(POLICIES.admin_identity, "network", identity),
          (e) => e.status === 503,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT COUNT(*)::int AS n FROM request_rate_buckets WHERE rule='admin_identity'",
            )
          ).rows[0].n,
          before,
        );
      } finally {
        await pool.query(
          "DROP TRIGGER lae_fixture_budget_metric ON request_security_metrics",
        );
        await pool.query("DROP FUNCTION lae_fixture_reject_budget_metric()");
      }
      assert(
        (await control.take(POLICIES.admin_identity, "network", identity))
          .allowed,
      );
      assert.equal(control.summary().storage_degraded, false);
    },
  );
  await t.test(
    "shared reports aggregate exact counters without exposing network identifiers, cookies or the immutable fingerprint key",
    async () => {
      const before = await financial(),
        report = await control.report({ days: 7 }),
        text = JSON.stringify(report);
      assert.equal(report.mode, "shared_database");
      assert.equal(report.proxy.state, "configured");
      assert(report.windows.length > 0);
      assert(report.groups.some((r) => BigInt(r.blocked) > 0n));
      for (const value of [
        "198.51.100.211",
        "203.0.113.1",
        cookie1.split("=")[1],
        "network_key",
      ])
        assert(!text.includes(value));
      assert(
        report.groups.every(
          (r) => /^\d+$/.test(r.allowed) && /^\d+$/.test(r.blocked),
        ),
      );
      assert.deepEqual(await financial(), before);
      await assert.rejects(
        pool.query(
          "UPDATE request_security_settings SET network_key=repeat('a',64) WHERE id=1",
        ),
        /append-only/,
      );
      await assert.rejects(
        pool.query("DELETE FROM request_security_settings"),
        /append-only/,
      );
    },
  );
  await t.test(
    "bounded retention removes only expired technical records and preserves active account limits and all financial evidence",
    async () => {
      const before = await financial();
      await pool.query(
        "UPDATE request_rate_buckets SET expires_at=NOW()-INTERVAL '25 hours' WHERE rule='artist_registration'",
      );
      await pool.query(
        "INSERT INTO request_security_metrics(hour,rule,subject_kind,client_source,allowed,blocked) VALUES(NOW()-INTERVAL '32 days','public_api','network','socket',1,0)",
      );
      await control.cleanup();
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM request_rate_buckets WHERE expires_at<NOW()-INTERVAL '1 day'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM request_security_metrics WHERE hour<NOW()-INTERVAL '31 days'",
          )
        ).rows[0].n,
        0,
      );
      assert(
        !(
          await control.take(
            POLICIES.listener_write,
            "account",
            "listener:" + listener,
            "account",
          )
        ).allowed,
      );
      assert.deepEqual(await financial(), before);
    },
  );
  await t.test(
    "actual HTTP proxy-chain limits survive process restart; forged leftmost headers cannot reset them, public access and webhooks retain their own rules",
    async () => {
      const port = 3199,
        origin = "http://127.0.0.1:" + port,
        before = await financial();
      let child,
        output = "";
      const stop = async () => {
        if (child && child.exitCode === null) {
          const exited = new Promise((resolve) => child.once("exit", resolve));
          child.kill("SIGTERM");
          await exited;
        }
      };
      const start = async () => {
        output = "";
        child = spawn(process.execPath, ["server.js"], {
          cwd: require("node:path").join(__dirname, ".."),
          env: {
            ...process.env,
            ...env,
            PORT: String(port),
            TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
            DATABASE_SSL_MODE: "local",
            MUSICAPI_API_KEY: "",
            OPENAI_API_KEY: "",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.on("data", (x) => (output = (output + x).slice(-1500)));
        child.stderr.on("data", (x) => (output = (output + x).slice(-1500)));
        for (let i = 0; i < 100; i++) {
          if (child.exitCode !== null)
            throw Error("Fixture server failed: " + output);
          try {
            if ((await fetch(origin + "/health")).ok) return;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw Error("Fixture server did not start: " + output);
      };
      const request = async (ip, left = 1, path = "/api/login") =>
        fetch(origin + path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113." + left + ", " + ip,
          },
          body: JSON.stringify({
            email: "http-budget-" + left + "@ci.invalid",
            password: "WrongFixturePassword123",
          }),
        });
      try {
        await start();
        for (let i = 1; i <= 20; i++) {
          const r = await request("198.51.100.197", i);
          assert.notEqual(r.status, 200);
          assert.notEqual((await r.json()).code, "request_rate_limited");
        }
        let r = await request("198.51.100.197", 21);
        assert.equal(r.status, 429);
        assert.equal((await r.json()).code, "request_rate_limited");
        await stop();
        await start();
        r = await request("198.51.100.197", 22);
        assert.equal(r.status, 429);
        assert.equal((await r.json()).code, "request_rate_limited");
        r = await request("198.51.100.198", 23);
        assert.equal(r.status, 401);
        const publicRead = await fetch(origin + "/api/platform/currencies", {
          headers: { "x-forwarded-for": "198.51.100.197" },
        });
        assert.equal(publicRead.status, 200);
        r = await fetch(origin + "/api/platform/payments/webhooks/paystack", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.197",
            origin: "https://outside.invalid",
          },
          body: "{}",
        });
        assert.equal(r.status, 503);
        assert.notEqual((await r.json()).code, "request_rate_limited");
        assert.deepEqual(await financial(), before);
      } finally {
        await stop();
      }
    },
  );
};
