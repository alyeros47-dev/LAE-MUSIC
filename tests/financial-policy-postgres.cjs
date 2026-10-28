"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  vm = require("node:vm"),
  fs = require("node:fs");
module.exports = async (t, { pool }) => {
  const id = (
    await pool.query(
      "INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Policy generation fixture',$1,$2,$3) RETURNING id",
      [
        "policy-" + crypto.randomUUID() + "@ci.invalid",
        "a".repeat(32),
        "b".repeat(128),
      ],
    )
  ).rows[0].id;
  const sub = (
    await pool.query(
      "INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'professional',2000,$2,'paid',NOW(),NOW()+INTERVAL '1 year') RETURNING id",
      [id, "policy-fixture-" + crypto.randomUUID()],
    )
  ).rows[0].id;
  async function task() {
    const ref = "policy-task-" + crypto.randomUUID();
    await pool.query(
      "INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'running')",
      [ref, id],
    );
    await pool.query(
      "INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference) VALUES($1,$2,$3)",
      [sub, id, ref],
    );
    return ref;
  }
  async function poll(ref, result, actor = id) {
    let calls = 0;
    const context = {
      module: { exports: null },
      require,
      console,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      process: {
        env: { MUSICAPI_API_KEY: "isolated-policy-provider-fixture" },
      },
      fetch: async () => {
        calls++;
        return { ok: true, status: 200, json: async () => result };
      },
    };
    vm.runInNewContext(fs.readFileSync("musicapi-sonic.js", "utf8"), context);
    const req = {
        method: "GET",
        url: "/api/music/sonic/status?id=" + ref,
        headers: {},
      },
      res = {
        writeHead(status) {
          this.status = status;
        },
        end(body) {
          this.data = JSON.parse(body);
        },
      };
    await context.module.exports(req, res, "/api/music/sonic/status", {
      pool,
      me: async () => ({ id: actor }),
      validOrigin: () => true,
    });
    return { ...res, calls };
  }
  await t.test(
    "provider failure with delivered audio and later disappearing results retain the reservation and immutable review evidence",
    async () => {
      const ref = await task();
      const first = await poll(ref, {
        status: "failed",
        data: [
          {
            id: "clip_fixture_123",
            audio_url: "https://fixture.invalid/usable.mp3",
          },
        ],
      });
      assert.equal(first.data.status, "verification_required");
      assert.equal(first.data.songs.length, 1);
      const second = await poll(ref, { status: "failed" });
      assert.equal(second.data.status, "verification_required");
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE generation_reference=$1",
            [ref],
          )
        ).rows[0].n,
        1,
      );
      const decisions = (
        await pool.query(
          "SELECT * FROM studio_failure_decisions WHERE task_reference=$1",
          [ref],
        )
      ).rows;
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].decision, "held_for_review");
      assert.equal(decisions[0].had_usable_output, true);
      await assert.rejects(
        pool.query(
          "DELETE FROM studio_failure_decisions WHERE task_reference=$1",
          [ref],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "concurrent verified failures restore one reservation and retain one source decision without granting money or extra credits",
    async () => {
      const ref = await task(),
        before = (
          await pool.query("SELECT COUNT(*)::int AS n FROM finance_transfers")
        ).rows[0].n;
      await Promise.all([
        poll(ref, { status: "failed" }),
        poll(ref, { status: "failed" }),
      ]);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE generation_reference=$1",
            [ref],
          )
        ).rows[0].n,
        0,
      );
      const decisions = (
        await pool.query(
          "SELECT * FROM studio_failure_decisions WHERE task_reference=$1",
          [ref],
        )
      ).rows;
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].decision, "credit_restored");
      assert.equal(decisions[0].had_usable_output, false);
      assert.equal((await poll(ref, { status: "failed" })).calls, 0);
      assert.equal(
        (await pool.query("SELECT COUNT(*)::int AS n FROM finance_transfers"))
          .rows[0].n,
        before,
      );
    },
  );
  await t.test(
    "completed generations keep their entitlement on later provider failure and another artist cannot inspect or restore them",
    async () => {
      const ref = await task();
      assert.equal(
        (
          await poll(ref, {
            status: "succeeded",
            data: [
              {
                id: "clip_fixture_456",
                audio_url: "https://fixture.invalid/completed.mp3",
              },
            ],
          })
        ).data.status,
        "succeeded",
      );
      assert.equal(
        (await poll(ref, { status: "failed" })).data.status,
        "succeeded",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE generation_reference=$1",
            [ref],
          )
        ).rows[0].n,
        1,
      );
      const other = await poll(ref, { status: "failed" }, "0");
      assert.equal(other.status, 404);
      assert.equal(other.calls, 0);
    },
  );
};
