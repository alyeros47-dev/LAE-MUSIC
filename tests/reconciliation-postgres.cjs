"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { runtime } = require("./runtime.cjs"),
  finance = require("../lib/finance"),
  { transaction } = require("../lib/transactions");
module.exports = async (t, { pool }) => {
  const service = require("../lib/reconciliation").createReconciliation({
      pool,
    }),
    key = () => crypto.randomUUID();
  const env = {
    NODE_ENV: "test",
    ADMIN_KEY: "isolated-reconciliation-owner-123456",
    STUDIO_RELEASE_WORKER_ENABLED: "false",
  };
  const app = await runtime({ pool, env });
  let cookie, artist, cookieArtist, withdrawal, review;
  async function api(path, body, auth = cookie, requestKey = key()) {
    const r = await app.request(path, {
      method: body === undefined ? "GET" : "POST",
      body,
      headers: {
        ...(auth ? { cookie: auth } : {}),
        "idempotency-key": requestKey,
      },
    });
    return {
      status: r.status,
      data: r.headers["content-type"]?.includes("json") ? r.json() : r.text,
      headers: r.headers,
    };
  }
  const base = "/api/platform/admin/reconciliation";
  const counts = async () =>
    (
      await pool.query(
        "SELECT (SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COUNT(*) FROM commerce_receipts) AS products,(SELECT COUNT(*) FROM premium_receipts) AS premium,(SELECT COUNT(*) FROM premium_streams) AS streams",
      )
    ).rows[0];
  await t.test(
    "financial operations endpoints require administrator authorization and preserve ordinary account isolation",
    async () => {
      assert.equal((await api(base, undefined, null)).status, 401);
      const r = await app.request("/api/register", {
        method: "POST",
        body: {
          name: "Reconciliation fixture",
          country: "Ghana",
          email: "reconciliation@ci.invalid",
          password: "ReconciliationFixture123",
          confirmPassword: "ReconciliationFixture123",
          plan: "starter",
        },
      });
      assert.equal(r.status, 201);
      artist = r.json().user.id;
      cookieArtist = r.headers["set-cookie"].split(";")[0];
      assert.equal(
        (await api(base + "/ledger.csv", undefined, cookieArtist)).status,
        401,
      );
      const a = await app.request("/api/admin/login", {
        method: "POST",
        body: { password: env.ADMIN_KEY },
      });
      assert.equal(a.status, 200);
      cookie = a.headers["set-cookie"].split(";")[0];
      await transaction(pool, async (db) => {
        await finance.transfer(
          db,
          "recon-fixture-funding-usd",
          "isolated_test_funding",
          "USD",
          10000,
          "platform:recon_fixture:USD",
          finance.earnedAccount(artist, "USD"),
          artist,
        );
        await finance.transfer(
          db,
          "recon-fixture-funding-ngn",
          "isolated_test_funding",
          "NGN",
          10000,
          "platform:recon_fixture:NGN",
          finance.earnedAccount(artist, "NGN"),
          artist,
        );
      });
      for (let i = 0; i < 28; i++) {
        const w = await finance.requestWithdrawal(
          pool,
          artist,
          key(),
          "USD",
          100,
        );
        if (!withdrawal) withdrawal = w;
      }
      await finance.requestWithdrawal(pool, artist, key(), "NGN", 200);
    },
  );
  await t.test(
    "read-only reconciliation reports separate currencies, modes and gross receipts without treating them as bank cash",
    async () => {
      const before = await counts();
      const x = await api(base + "?currency=USD&mode=all");
      assert.equal(x.status, 200, JSON.stringify(x));
      assert.equal(x.data.currency, "USD");
      assert.equal(x.data.live_payments_enabled, false);
      assert.equal(x.data.payouts_enabled, false);
      assert(
        x.data.totals.every(
          (r) => r.currency === "USD" && typeof r.gross_minor === "string",
        ),
      );
      assert(
        x.data.attention.some(
          (r) => r.kind === "withdrawal" && r.mode === "ledger",
        ),
      );
      const test = await service.overview({ currency: "USD", mode: "test" });
      assert(test.totals.every((r) => r.mode === "test"));
      const ngn = await service.overview({ currency: "NGN" });
      assert(ngn.ledger_accounts.every((r) => r.currency === "NGN"));
      assert.deepEqual(await counts(), before);
    },
  );
  await t.test(
    "review queue pagination remains bounded and deterministic for tied timestamps without mixing NGN into USD",
    async () => {
      const first = await service.queue({
        currency: "USD",
        mode: "ledger",
        kind: "withdrawal",
      });
      assert.equal(first.rows.length, 25);
      assert(first.next_cursor);
      const second = await service.queue({
        currency: "USD",
        mode: "ledger",
        kind: "withdrawal",
        cursor: first.next_cursor,
      });
      assert(second.rows.length >= 3);
      assert(
        !second.rows.some((r) =>
          first.rows.some((a) => a.source_id === r.source_id),
        ),
      );
      assert(
        [...first.rows, ...second.rows].every((r) => r.currency === "USD"),
      );
      const search = await service.queue({
        currency: "USD",
        search: withdrawal.request_key,
      });
      assert.equal(search.rows.length, 1);
      assert.equal(search.rows[0].source_id, String(withdrawal.id));
      assert.equal(
        (await service.queue({ search: "%' OR 1=1 --" })).rows.length,
        0,
      );
    },
  );
  await t.test(
    "concurrent retries create one review revision and audit event without changing a single financial record",
    async () => {
      const before = await counts(),
        payload = {
          kind: "withdrawal",
          source_id: String(withdrawal.id),
          revision: 0,
          action: "claim",
          note: "Reviewed the isolated withdrawal and its reserved ledger source.",
        },
        requestKey = key();
      const [a, b] = await Promise.all([
        api(base + "/review", payload, cookie, requestKey),
        api(base + "/review", payload, cookie, requestKey),
      ]);
      assert.equal(a.status, 200, JSON.stringify(a));
      assert.deepEqual(a.data, b.data);
      review = a.data.review;
      assert.equal(review.assigned_actor, "legacy-shared-key");
      assert.equal(a.data.financial_records_changed, false);
      const detail = await service.detail("withdrawal", String(withdrawal.id));
      assert.equal(detail.history.length, 1);
      assert.deepEqual(await counts(), before);
    },
  );
  await t.test(
    "competing reviewers cannot overwrite a revision and a still-active source cannot be resolved",
    async () => {
      const p = {
        kind: "withdrawal",
        source_id: String(withdrawal.id),
        revision: 1,
        action: "note",
        note: "Independent evidence remains outstanding for this withdrawal.",
      };
      const results = await Promise.all([
        api(base + "/review", p),
        api(base + "/review", {
          ...p,
          note: "A second reviewer also checked the same immutable ledger source.",
        }),
      ]);
      assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
      assert.equal(
        (await service.detail("withdrawal", String(withdrawal.id))).review
          .revision,
        2,
      );
      const r = await api(base + "/review", {
        ...p,
        revision: 2,
        action: "resolve",
      });
      assert.equal(r.status, 409);
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM finance_withdrawals WHERE id=$1",
            [withdrawal.id],
          )
        ).rows[0].status,
        "pending",
      );
    },
  );
  await t.test(
    "waiting for external evidence is auditable and never approves or sends a withdrawal",
    async () => {
      const r = await api(base + "/review", {
        kind: "withdrawal",
        source_id: String(withdrawal.id),
        revision: 2,
        action: "wait",
        note: "Waiting for independently verified bank and settlement evidence.",
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.review.status, "waiting_external");
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM finance_withdrawals WHERE id=$1",
            [withdrawal.id],
          )
        ).rows[0].status,
        "pending",
      );
    },
  );
  await t.test(
    "underlying verification precedes review resolution while all review notes and source evidence remain intact",
    async () => {
      await finance.reviewWithdrawal(pool, withdrawal.id, "rejected", key());
      const before = await counts();
      const r = await api(base + "/review", {
        kind: "withdrawal",
        source_id: String(withdrawal.id),
        revision: 3,
        action: "resolve",
        note: "The existing withdrawal workflow rejected the request and released its reserve.",
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.review.status, "resolved");
      assert.equal(
        (await service.detail("withdrawal", String(withdrawal.id))).history
          .length,
        4,
      );
      assert(
        !(await service.queue({ search: withdrawal.request_key })).rows.some(
          (r) => r.source_id === String(withdrawal.id),
        ),
      );
      assert.deepEqual(await counts(), before);
    },
  );
  await t.test(
    "database guards reject rewriting notes, deleting reviews or changing a case without matching immutable evidence",
    async () => {
      await assert.rejects(
        pool.query(
          "UPDATE reconciliation_events SET note='rewritten history' WHERE case_id=$1",
          [review.id],
        ),
        /append-only/,
      );
      await assert.rejects(
        pool.query("DELETE FROM reconciliation_cases WHERE id=$1", [review.id]),
        /cannot be deleted/,
      );
      await assert.rejects(
        transaction(pool, (db) =>
          db.query(
            "UPDATE reconciliation_cases SET status='in_review',revision=revision+1 WHERE id=$1",
            [review.id],
          ),
        ),
        /requires matching immutable/,
      );
      assert.equal(
        (await service.detail("withdrawal", String(withdrawal.id))).review
          .status,
        "resolved",
      );
    },
  );
  await t.test(
    "authenticated ledger exports preserve exact currency records and reject cross-origin or invented financial actions",
    async () => {
      const r = await api(base + "/ledger.csv?currency=NGN&days=30");
      assert.equal(r.status, 200);
      assert.match(r.headers["content-type"], /text\/csv/);
      assert.match(r.headers["cache-control"], /no-store/);
      assert(r.data.includes('"NGN"'));
      assert(!r.data.includes('"USD"'));
      assert.equal((await api(base + "?currency=NGN&mode=live")).status, 200);
      assert.equal((await api(base + "?currency=GHS")).status, 400);
      assert.equal((await api(base + "/ledger?days=900")).status, 400);
      const bad = await app.request(base + "/review", {
        method: "POST",
        body: {},
        headers: { cookie, origin: "https://evil.invalid" },
      });
      assert.equal(bad.status, 403);
      assert.equal((await api(base + "/mark-paid", {})).status, 405);
    },
  );
  await t.test(
    "operator lookup derives artist/listener ownership from the existing checkout and never trusts a supplied owner",
    async () => {
      const artistSource = (
          await pool.query(
            "SELECT a.id,o.artist_id AS owner_id FROM payment_checkout_attempts a JOIN commerce_orders o ON o.id=a.order_id LIMIT 1",
          )
        ).rows[0],
        listenerSource = (
          await pool.query(
            "SELECT a.id,o.listener_id AS owner_id FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id LIMIT 1",
          )
        ).rows[0];
      assert(artistSource && listenerSource);
      const calls = [],
        checked = require("../lib/reconciliation").createReconciliation({
          pool,
          verifyArtist: async (owner, id) =>
            calls.push(["artist", String(owner), id]),
          verifyListener: async (owner, id) =>
            calls.push(["listener", String(owner), id]),
        }),
        before = await counts();
      await checked.verifySource(
        { role: "owner", source: "shared_key" },
        {
          kind: "artist_checkout",
          source_id: artistSource.id,
          owner_id: "999999",
        },
      );
      await checked.verifySource(
        { role: "owner", source: "shared_key" },
        {
          kind: "listener_checkout",
          source_id: listenerSource.id,
          owner_id: "999999",
        },
      );
      assert.deepEqual(calls, [
        ["artist", String(artistSource.owner_id), artistSource.id],
        ["listener", String(listenerSource.owner_id), listenerSource.id],
      ]);
      assert.deepEqual(await counts(), before);
    },
  );
  await t.test(
    "the actual admin lookup route keeps unconfigured providers closed and cannot manufacture a verified payment",
    async () => {
      const id = (
          await pool.query("SELECT id FROM payment_checkout_attempts LIMIT 1")
        ).rows[0].id,
        before = await counts();
      const r = await api(base + "/verify-source", {
        kind: "artist_checkout",
        source_id: id,
      });
      assert.equal(r.status, 503);
      assert.deepEqual(await counts(), before);
      assert.equal(
        (
          await api(base + "/verify-source", {
            kind: "withdrawal",
            source_id: "1",
          })
        ).status,
        400,
      );
    },
  );
};
