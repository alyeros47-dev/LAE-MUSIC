"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const { createRequire } = require("node:module");
const access = require("../lib/artist-test-access"),
  credits = require("../lib/credits");
const { transaction } = require("../lib/transactions");
module.exports = async (t, { pool }) => {
  let serial = 0;
  async function artist() {
    return (
      await pool.query(
        "INSERT INTO creators(display_name,email,password_salt,password_hash,plan) VALUES('Free studio fixture',$1,'fixture','fixture','starter') RETURNING id",
        ["free-studio-" + Date.now() + "-" + ++serial + "@ci.invalid"],
      )
    ).rows[0].id;
  }
  function engine(owner, { enabled = true, outcome = "success" } = {}) {
    let calls = 0,
      next = 0;
    const context = {
      module: { exports: null },
      require: createRequire(path.resolve("musicapi-sonic.js")),
      process: {
        env: {
          MUSICAPI_API_KEY: "fixture-only",
          LAE_ARTIST_TEST_ACCESS: enabled ? "1" : "0",
        },
      },
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      console: { error() {} },
      fetch: async (url, opts) => {
        calls++;
        if (outcome === "rejected")
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({ message: "Invalid fixture request" }),
          };
        if (outcome === "uncertain") throw Error("fixture network ambiguity");
        if (opts.method === "POST")
          return {
            ok: true,
            status: 200,
            json: async () => ({
              task_id: "free_music_" + owner + "_" + ++next,
            }),
          };
        return {
          ok: true,
          status: 200,
          json: async () =>
            outcome === "failed"
              ? { status: "failed" }
              : {
                  status: "succeeded",
                  songs: [
                    {
                      id: "fixture_clip_123",
                      audio_url: "https://files.musicapi.ai/fixture.mp3",
                      status: "succeeded",
                    },
                  ],
                },
        };
      },
    };
    vm.runInNewContext(fs.readFileSync("musicapi-sonic.js", "utf8"), context);
    return {
      get calls() {
        return calls;
      },
      async request(route, key, as = owner) {
        const body = {
          title: "Original fixture",
          lyrics:
            "Original words with enough meaning for a complete short fixture song.",
          style: "Highlife guitars",
        };
        const req = {
          method: route.includes("status") ? "GET" : "POST",
          url: route,
          headers: { "idempotency-key": key },
          async *[Symbol.asyncIterator]() {
            yield JSON.stringify(body);
          },
        };
        const res = {
          writeHead(status) {
            this.status = status;
          },
          end(raw) {
            this.data = JSON.parse(raw);
          },
        };
        await context.module.exports(req, res, route.split("?")[0], {
          pool,
          me: async () => (as ? { id: as } : null),
          validOrigin: () => true,
        });
        return res;
      },
    };
  }
  await t.test(
    "real signup, logout, login and server replacement retain the complimentary account",
    async () => {
      const { spawn } = require("node:child_process");
      const origin = "http://127.0.0.1:3209",
        email = "persistent-artist-" + Date.now() + "@ci.invalid";
      let child,
        output = "";
      async function start(free = true) {
        output = "";
        child = spawn(process.execPath, ["server.js"], {
          cwd: path.resolve("."),
          env: {
            ...process.env,
            NODE_ENV: "test",
            PORT: "3209",
            LAE_ARTIST_TEST_ACCESS: free ? "1" : "0",
            OPENAI_API_KEY: "",
            MUSICAPI_API_KEY: "",
            STUDIO_RELEASE_WORKER_ENABLED: "false",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.on("data", (x) => {
          output = (output + x).slice(-4000);
        });
        child.stderr.on("data", (x) => {
          output = (output + x).slice(-4000);
        });
        for (let n = 0; n < 100; n++) {
          if (output.includes("listening on 3209")) return;
          if (child.exitCode !== null)
            throw Error("Complimentary account fixture failed to start");
          await new Promise((r) => setTimeout(r, 50));
        }
        throw Error("Complimentary account fixture startup timed out");
      }
      async function stop() {
        if (!child || child.exitCode !== null) return;
        const closed = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        await closed;
      }
      async function api(route, cookie, body) {
        const response = await fetch(origin + route, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return {
          status: response.status,
          cookie: response.headers.get("set-cookie")?.split(";")[0],
          data: await response.json(),
        };
      }
      try {
        await start();
        const signup = await api("/api/register", null, {
          name: "Persistent artist",
          country: "Nigeria",
          email,
          password: "PersistentFixturePassword123",
          confirmPassword: "PersistentFixturePassword123",
          plan: "starter",
        });
        assert.equal(signup.status, 201);
        assert(signup.cookie);
        const wallet = await api("/api/generation/wallet", signup.cookie);
        assert.equal(wallet.data.credits, 2);
        assert.deepEqual(wallet.data.models, ["gpt-6.1-sol", "gpt-6-astra"]);
        assert.equal(
          (await api("/api/artist/studio-allowance", signup.cookie)).data
            .remaining_generations,
          2,
        );
        const sub = await api("/api/artist/subscription", signup.cookie);
        assert.equal(sub.data.artist_test_access, true);
        assert.equal(sub.data.artist_features_active, false);
        await api("/api/logout", signup.cookie, {});
        assert.equal(
          (await api("/api/generation/wallet", signup.cookie)).status,
          401,
        );
        await stop();
        await start();
        const login = await api("/api/login", null, {
          email,
          password: "PersistentFixturePassword123",
        });
        assert.equal(login.status, 200);
        assert(login.cookie);
        assert.equal(
          (await api("/api/generation/wallet", login.cookie)).data.credits,
          2,
        );
        assert.equal(
          (await api("/api/artist/studio-allowance", login.cookie)).data
            .remaining_generations,
          2,
        );
        await stop();
        await start(false);
        const afterClose = await api("/api/login", null, {
          email,
          password: "PersistentFixturePassword123",
        });
        assert.equal(afterClose.status, 200);
        assert.equal(
          (await api("/api/generation/wallet", afterClose.cookie)).data.credits,
          2,
        );
        assert.equal(
          (await api("/api/artist/studio-allowance", afterClose.cookie)).data
            .active,
          false,
        );
      } finally {
        await stop();
      }
    },
  );
  await t.test(
    "persistent free lyrics grants survive replay and only confirmed failure restores a credit",
    async () => {
      const id = await artist();
      await Promise.all([
        access.grantLyrics(pool, id),
        access.grantLyrics(pool, id),
      ]);
      assert.equal(
        (
          await pool.query(
            "SELECT credits FROM generation_wallets WHERE creator_id=$1",
            [id],
          )
        ).rows[0].credits,
        2,
      );
      const first = await credits.reserveLyrics(
        pool,
        id,
        "free_lyrics_key_001",
        { idea: "fixture" },
      );
      await credits.completeLyrics(
        pool,
        id,
        first.reference,
        "free_lyrics_key_001",
        { title: "Original", lyrics: "Original lyrics", style: "Highlife" },
        "gpt-6.1-sol",
      );
      const replay = await credits.reserveLyrics(
        pool,
        id,
        "free_lyrics_key_001",
        { idea: "fixture" },
      );
      assert.equal(replay.replay.uploadCode,null);
      const second = await credits.reserveLyrics(
        pool,
        id,
        "free_lyrics_key_002",
        { idea: "fixture two" },
      );
      await assert.rejects(
        credits.reserveLyrics(pool, id, "free_lyrics_key_003", {
          idea: "third",
        }),
        /Insufficient/,
      );
      await Promise.all([
        credits.refundLyrics(pool, id, second.reference, "free_lyrics_key_002"),
        credits.refundLyrics(pool, id, second.reference, "free_lyrics_key_002"),
      ]);
      await access.grantLyrics(pool, id);
      assert.equal(
        (
          await pool.query(
            "SELECT credits FROM generation_wallets WHERE creator_id=$1",
            [id],
          )
        ).rows[0].credits,
        1,
      );
    },
  );
  await t.test(
    "unpaid artists get two persistent music requests with replay, ownership and no financial benefits",
    async () => {
      const id = await artist(),
        other = await artist(),
        e = engine(id);
      const balances = (
        await pool.query(
          "SELECT (SELECT COUNT(*) FROM artist_subscriptions) AS subscriptions,(SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COUNT(*) FROM affiliate_subscription_commissions) AS commissions",
        )
      ).rows;
      assert.equal(
        (await e.request("/api/music/sonic/create", "free_music_key_001", null))
          .status,
        401,
      );
      for (const number of [1, 2]) {
        const key = "free_music_key_00" + number;
        const results = await Promise.all([
          e.request("/api/music/sonic/create", key),
          e.request("/api/music/sonic/create", key),
        ]);
        assert(results.every((r) => r.status === 200));
        const replay = await e.request("/api/music/sonic/create", key);
        const task = replay.data.task_id;
        assert(results.some((r) => r.data.task_id === task));
        for (const r of results)
          if (r.data.task_id !== task) {
            assert(r.data.task_id.startsWith("sonic-"));
            assert.equal(
              (
                await pool.query(
                  "SELECT task_reference FROM studio_request_keys WHERE artist_id=$1 AND reservation_reference=$2",
                  [id, r.data.task_id],
                )
              ).rows[0].task_reference,
              task,
            );
          }
        assert.equal(
          (await e.request("/api/music/sonic/status?id=" + task, "", other))
            .status,
          404,
        );
        assert.equal(
          (await e.request("/api/music/sonic/status?id=" + task, "")).data
            .status,
          "succeeded",
        );
      }
      assert.equal(e.calls, 4); // two creates, two authoritative provider status lookups
      assert.equal(
        (await e.request("/api/music/sonic/create", "free_music_key_003"))
          .status,
        402,
      );
      assert.equal(e.calls, 4);
      assert.equal((await access.allowance(pool, id)).remaining_generations, 0);
      const fresh = engine(id);
      assert.equal(
        (await fresh.request("/api/music/sonic/create", "free_music_key_004"))
          .status,
        402,
      );
      assert.equal(fresh.calls, 0);
      assert.deepEqual(
        (
          await pool.query(
            "SELECT (SELECT COUNT(*) FROM artist_subscriptions) AS subscriptions,(SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COUNT(*) FROM affiliate_subscription_commissions) AS commissions",
          )
        ).rows,
        balances,
      );
      await pool.query(
        "INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,$2,'paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year')",
        [id, "isolated-fixture-paid-" + id],
      );
      assert.equal(
        (await e.request("/api/music/sonic/create", "free_paid_fallback_001"))
          .status,
        200,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE artist_id=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(await access.remaining(pool, id), 0);
    },
  );
  await t.test(
    "confirmed rejections restore free music once; ambiguous acceptance remains reserved",
    async () => {
      const id = await artist(),
        rejected = engine(id, { outcome: "rejected" });
      const first = await rejected.request(
        "/api/music/sonic/create",
        "free_rejected_key_001",
      );
      assert.equal(first.status, 502);
      assert.equal(await access.remaining(pool, id), 2);
      await rejected.request(
        "/api/music/sonic/create",
        "free_rejected_key_001",
      );
      assert.equal(rejected.calls, 1);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM artist_test_generations WHERE artist_id=$1 AND status='restored'",
            [id],
          )
        ).rows[0].n,
        1,
      );
      const uncertain = engine(id, { outcome: "uncertain" });
      assert.equal(
        (
          await uncertain.request(
            "/api/music/sonic/create",
            "free_uncertain_key_001",
          )
        ).data.status,
        "verification_required",
      );
      assert.equal(await access.remaining(pool, id), 1);
      assert.equal(
        (
          await uncertain.request(
            "/api/music/sonic/create",
            "free_uncertain_key_002",
          )
        ).status,
        429,
      );
      assert.equal(uncertain.calls, 1);
    },
  );
  await t.test(
    "disabling free access preserves usage and still reconciles confirmed provider failure",
    async () => {
      const id = await artist(),
        active = engine(id);
      const created = await active.request(
        "/api/music/sonic/create",
        "free_disable_key_001",
      );
      const disabled = engine(id, { enabled: false, outcome: "failed" });
      assert.equal(
        (
          await disabled.request(
            "/api/music/sonic/status?id=" + created.data.task_id,
            "",
          )
        ).data.status,
        "failed",
      );
      assert.equal(await access.remaining(pool, id), 2);
      assert.equal(
        (
          await disabled.request(
            "/api/music/sonic/create",
            "free_disable_key_002",
          )
        ).status,
        402,
      );
      assert.equal(disabled.calls, 1);
      await transaction(pool, async (db) => {
        await assert.rejects(
          access.attach(db, id, "missing-reference", "arbitrary_task_123"),
          /could not be linked/,
        );
      });
    },
  );
};
