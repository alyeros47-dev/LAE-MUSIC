"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { transaction } = require("../lib/transactions");
const { createComplaints } = require("../lib/refund-complaints");
const { createLateDisputes } = require("../lib/late-royalty-disputes");
module.exports = async (t, { pool, api }) => {
  const service = createComplaints(pool),
    key = () => crypto.randomUUID();
  const originalApi = api;
  api = (path, options = {}) =>
    originalApi(path, { ...options, key: options.key || key() });
  async function listener() {
    const p = "SevenDayFixturePassword123";
    const r = await api("/api/listener/register", {
      method: "POST",
      body: {
        name: "Seven-day listener",
        email: key() + "@ci.invalid",
        password: p,
        confirmPassword: p,
      },
    });
    assert.equal(r.status, 201);
    return { id: r.data.user.id, cookie: r.cookie };
  }
  async function purchase(who, days = 0, month = null) {
    const id = key(),
      ref = "seven-day-" + key();
    await pool.query(
      "INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,expires_at) VALUES($1,$2,'monthly','NGN',80000,30,NOW()+INTERVAL '30 minutes')",
      [id, who.id],
    );
    await pool.query(
      "INSERT INTO premium_attempts(id,order_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,'paystack','seven-day-fixture','test',$3,'paid')",
      [key(), id, ref],
    );
    await pool.query(
      "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor,verified_at) VALUES($1,'paystack','seven-day-fixture',$2,'test','NGN',80000,NOW()-$3*INTERVAL '1 day')",
      [id, ref, days],
    );
    await pool.query(
      "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,COALESCE($3::timestamptz,NOW()-INTERVAL '1 day'),COALESCE($3::timestamptz,NOW()-INTERVAL '1 day')+INTERVAL '30 days')",
      [id, who.id, month ? month + "-01T00:00:00Z" : null],
    );
    await pool.query(
      "INSERT INTO premium_payment_costs(order_id,revision,fees_minor,tax_minor,evidence) VALUES($1,1,0,0,'Isolated original NGN fixture cost evidence')",
      [id],
    );
    return id;
  }
  const who = await listener(),
    other = await listener();
  let timely, late;
  await t.test(
    "expired ordinary complaints cannot be reopened with a client date or another account; protected exceptions remain reviewable",
    async () => {
      const id = await purchase(who, 8);
      for (const body of [
        { reason: "Ordinary request after eight days", ground: "voluntary" },
        {
          reason: "Attempt to restart a payment deadline",
          ground: "voluntary",
          occurred_at: new Date().toISOString(),
        },
      ]) {
        const r = await api("/api/platform/premium/complaints", {
          method: "POST",
          cookie: who.cookie,
          body: { order_id: id, ...body },
        });
        assert.equal(r.status, 409);
      }
      assert.equal(
        (
          await api("/api/platform/premium/complaints", {
            method: "POST",
            cookie: other.cookie,
            body: {
              order_id: id,
              ground: "legal_requirement",
              reason: "Another account cannot claim this receipt",
            },
          })
        ).status,
        404,
      );
      const r = await api("/api/platform/premium/complaints", {
        method: "POST",
        cookie: who.cookie,
        body: {
          order_id: id,
          ground: "legal_requirement",
          reason: "Legal exception requiring a documented review",
        },
      });
      assert.equal(r.status, 201);
      assert.equal(r.data.refund_sent, false);
      assert.equal(r.data.complaint.intake, "exception_review");
      late = r.data.complaint;
    },
  );
  await t.test(
    "a matching staff-verified incident supplies the relevant date without allowing another order or a future timestamp",
    async () => {
      const id = await purchase(who, 20),
        different = await purchase(who, 20);
      const event = await service.incident(key(), {
        kind: "listener",
        order_id: id,
        occurred_at: new Date(Date.now() - 86400000).toISOString(),
        evidence_reference: "Reviewed isolated service incident reference",
      });
      await assert.rejects(
        service.incident(key(), {
          kind: "listener",
          order_id: id,
          occurred_at: new Date(Date.now() + 86400000).toISOString(),
          evidence_reference: "Future event is not verified",
        }),
        (e) => e.status === 400,
      );
      await assert.rejects(
        service.request("listener", who.id, different, key(), {
          ground: "service_error",
          incident_id: event.id,
          reason: "Incident reference must match this specific purchase",
        }),
        (e) => e.status === 404,
      );
      const c = await service.request("listener", who.id, id, key(), {
        ground: "service_error",
        incident_id: event.id,
        reason: "A verified incident reported during its complaint window",
      });
      assert.equal(c.intake, "timely");
      assert.equal(c.incident_id, event.id);
      await assert.rejects(
        service.request("listener", who.id, id, key(), {
          ground: "service_error",
          incident_id: event.id,
          reason: "A duplicate claim must use its original review reference",
        }),
        (e) => e.status === 409,
      );
      const nextIncident = await service.incident(key(), {
        kind: "listener",
        order_id: id,
        occurred_at: new Date(Date.now() - 3600000).toISOString(),
        evidence_reference: "A distinct independently verified later incident",
      });
      const nextClaim = await service.request("listener", who.id, id, key(), {
        ground: "service_error",
        incident_id: nextIncident.id,
        reason:
          "A different verified service incident on the same annual purchase",
      });
      assert.equal(nextClaim.intake, "timely");
      assert.notEqual(nextClaim.id, c.id);
      await assert.rejects(
        service.request("listener", who.id, id, key(), {
          ground: "service_error",
          incident_id: "invalid-reference",
          reason: "An invalid incident must receive a safe validation error",
        }),
        (e) => e.status === 400,
      );
      const dstOrder = await purchase(
        who,
        Math.ceil((Date.now() - Date.parse("2026-03-01T00:00:00Z")) / 86400000),
      );
      const dstEvent = await service.incident(key(), {
        kind: "listener",
        order_id: dstOrder,
        occurred_at: "2026-03-07T12:00:00.000Z",
        evidence_reference:
          "Verified fixture incident across a daylight saving boundary",
      });
      const dstClaim = await transaction(pool, async (db) => {
        await db.query("SET LOCAL TIME ZONE 'America/New_York'");
        return require("../lib/refund-complaints").intake(
          db,
          "listener",
          who.id,
          dstOrder,
          {
            ground: "legal_requirement",
            incident_id: dstEvent.id,
            reason:
              "Legal review keeps the exact UTC calendar deadline across DST",
          },
        );
      });
      assert.equal(
        new Date(dstClaim.deadline_at).toISOString(),
        "2026-03-14T12:00:00.000Z",
      );
      await assert.rejects(
        pool.query("DELETE FROM refund_service_incidents WHERE id=$1", [
          event.id,
        ]),
        /append-only/,
      );
    },
  );
  await t.test(
    "concurrent complaint retry is once-only, receipt times are server assigned and payment access is unchanged",
    async () => {
      const id = await purchase(who),
        requestKey = key(),
        input = {
          ground: "duplicate_charge",
          reason: "Please verify this reported duplicate payment",
        };
      const before = (
        await pool.query(
          "SELECT starts_at,expires_at FROM premium_entitlements WHERE order_id=$1",
          [id],
        )
      ).rows;
      const rows = await Promise.all([
        service.request("listener", who.id, id, requestKey, input),
        service.request("listener", who.id, id, requestKey, input),
      ]);
      assert.equal(rows[0].id, rows[1].id);
      timely = rows[0];
      assert.deepEqual(
        (
          await pool.query(
            "SELECT starts_at,expires_at FROM premium_entitlements WHERE order_id=$1",
            [id],
          )
        ).rows,
        before,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM premium_reversals WHERE order_id=$1",
            [id],
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(
        service.request("listener", who.id, id, key(), input),
        (e) => e.status === 409,
      );
      await assert.rejects(
        pool.query(
          "UPDATE refund_complaints SET received_at=NOW() WHERE id=$1",
          [timely.id],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "review revisions reject competing edits and preserve a permanent history without creating refund evidence",
    async () => {
      const input = {
        complaint_id: timely.id,
        revision: 0,
        status: "resolved_no_refund",
        note: "Duplicate claim reviewed and not established in this fixture",
        evidence_reference: "Reviewed original immutable payment references",
      };
      const results = await Promise.allSettled([
        service.review(key(), input),
        service.review(key(), { ...input, status: "provider_review" }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM refund_complaint_events WHERE complaint_id=$1",
            [timely.id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        pool.query(
          "DELETE FROM refund_complaint_events WHERE complaint_id=$1",
          [timely.id],
        ),
        /append-only/,
      );
    },
  );
  await t.test(
    "month-end estimates hold unresolved complaints and include verified reversals before finalization",
    async () => {
      const id = await purchase(who, 0, "2026-08"),
        c = await service.request("listener", who.id, id, key(), {
          ground: "service_error",
          reason: "Eligible report to review before period finalization",
        });
      const royalties = require("../lib/streaming-royalties").createRoyalties(
        pool,
      );
      let preview = await royalties.preview("2026-08", "test", "NGN");
      assert(preview.issues.some((x) => x.includes(id)));
      await assert.rejects(
        royalties.finalize(key(), {
          month: "2026-08",
          mode: "test",
          currency: "NGN",
          snapshot_hash: preview.snapshot_hash,
          review_note: "Cannot ignore a pending source complaint",
        }),
        (e) => e.status === 409,
      );
      await transaction(pool, async (db) => {
        await require("../lib/streaming-royalties").lockReceiptPeriods(db, id);
        await db.query(
          "INSERT INTO premium_reversals(order_id,provider,merchant_id,refund_id,amount_minor,reason) VALUES($1,'paystack','seven-day-fixture',$2,80000,'Independently verified reversal fixture; no outside money')",
          [id, key()],
        );
      });
      preview = await royalties.preview("2026-08", "test", "NGN");
      const line = preview.lines.find((x) => x.order_id === id);
      assert.equal(line.net_minor, 0);
      assert.equal(line.refund_minor, line.gross_minor);
      assert(!preview.issues.some((x) => x.includes(id)));
    },
  );
  await t.test(
    "API and database prevent early finalization and the funding verifier is not called before maturity",
    async () => {
      const month = new Date().toISOString().slice(0, 7),
        royalties = require("../lib/streaming-royalties").createRoyalties(pool);
      await assert.rejects(
        royalties.finalize(key(), {
          month,
          mode: "test",
          currency: "USD",
          review_note: "Current period cannot be released early",
          snapshot_hash: "x",
        }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        pool.query(
          "INSERT INTO royalty_statements(id,month,currency,mode,snapshot_hash,snapshot,review_note,gross_minor,refund_minor,tax_minor,fees_minor,commissions_minor,rounding_minor,net_minor,artist_pool_minor,platform_minor,stream_count,undistributed_minor) VALUES($1,$2,'USD','test',$3,'{}','Direct insert must obey the seven-day hold',0,0,0,0,0,0,0,0,0,0,0)",
          [key(), month, "a".repeat(64)],
        ),
        /Seven-day/,
      );
      let calls = 0;
      const settlement =
        require("../lib/royalty-settlement").createRoyaltySettlement({
          pool: {
            query: async () => ({
              rows: [
                { id: key(), month, mode: "live", snapshot: { lines: [] } },
              ],
            }),
          },
          verifier: {
            verified: true,
            verifyStatementFunding() {
              calls++;
              return [];
            },
          },
        });
      await assert.rejects(
        settlement.release(key(), { statement_id: key() }),
        (e) => e.status === 409,
      );
      assert.equal(calls, 0);
    },
  );
  await t.test(
    "late disputes allow only documented review routes; no financial resolution, automatic company expense or artist deduction is claimed",
    async () => {
      const cases = await createLateDisputes(pool).report();
      assert(cases.length > 0);
      const c = cases[0],
        before = (
          await pool.query("SELECT COUNT(*)::int AS n FROM finance_transfers")
        ).rows[0].n;
      const input = {
        order_id: c.order_id,
        statement_id: c.statement_id,
        revision: 0,
        route: "legal_review",
        note: "Review fair artist agreement and applicable recovery rights",
        evidence_reference: "Documented isolated legal-review source reference",
      };
      const result = await createLateDisputes(pool).review(key(), input);
      assert.equal(result.financial_resolution, false);
      await assert.rejects(
        createLateDisputes(pool).review(key(), {
          ...input,
          route: "reserve_review",
        }),
        (e) => e.status === 409,
      );
      assert.equal(
        (await pool.query("SELECT COUNT(*)::int AS n FROM finance_transfers"))
          .rows[0].n,
        before,
      );
      await assert.rejects(
        pool.query(
          "DELETE FROM royalty_late_events WHERE order_id=$1 AND statement_id=$2",
          [c.order_id, c.statement_id],
        ),
        /append-only/,
      );
      const r = await api("/api/platform/admin/royalties/late-review", {
        method: "POST",
        cookie: who.cookie,
        body: input,
      });
      assert.equal(r.status, 401);
    },
  );
};
