"use strict";
const crypto = require("node:crypto"),
  p = require("./premium-policy");
const {
    fail,
    transaction,
    idempotent,
    audit,
    digest,
  } = require("./transactions"),
  { transfer } = require("./finance");
const { uuid, evidence, mode } = require("./premium-utils");
async function fence(db, period, book) {
  await db.query(
    "INSERT INTO royalty_period_fences(month,mode) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [period, book],
  );
  await db.query(
    "SELECT month FROM royalty_period_fences WHERE month=$1 AND mode=$2 FOR UPDATE",
    [period, book],
  );
}
async function lockReceiptPeriods(db, orderId) {
  const e = (
    await db.query(
      "SELECT e.starts_at,e.expires_at,r.mode FROM premium_entitlements e JOIN premium_receipts r ON r.order_id=e.order_id WHERE e.order_id=$1",
      [orderId],
    )
  ).rows[0];
  if (!e) return;
  let period = p.month(new Date(e.starts_at).toISOString().slice(0, 7));
  while (period.start < new Date(e.expires_at)) {
    await fence(db, period.code, e.mode);
    period = p.month(period.end.toISOString().slice(0, 7));
  }
}
async function build(db, month, book) {
  const period = p.month(month);
  mode(book);
  const receipts = (
    await db.query(
      `SELECT r.order_id,r.amount_minor,r.mode,e.starts_at,e.expires_at,c.fees_minor,c.tax_minor,
 rev.amount_minor AS refund_minor,EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=r.order_id) AS review,
 COALESCE((SELECT SUM(amount_minor) FROM premium_commissions pc WHERE pc.order_id=r.order_id),0) AS commissions_minor
 FROM premium_receipts r JOIN premium_entitlements e ON e.order_id=r.order_id LEFT JOIN LATERAL(SELECT * FROM premium_payment_costs pc WHERE pc.order_id=r.order_id ORDER BY revision DESC LIMIT 1)c ON TRUE LEFT JOIN premium_reversals rev ON rev.order_id=r.order_id WHERE r.mode=$1 AND e.starts_at<$3 AND e.expires_at>$2 ORDER BY r.order_id`,
      [book, period.start, period.end],
    )
  ).rows;
  const issues = [],
    lines = [];
  const totals = {
    gross_minor: 0,
    refund_minor: 0,
    tax_minor: 0,
    fees_minor: 0,
    commissions_minor: 0,
    net_minor: 0,
    rounding_minor: 0,
  };
  for (const r of receipts) {
    const gross = Number(r.amount_minor),
      refunded = Number(r.refund_minor || 0),
      full = refunded === gross;
    if (r.review && !full) issues.push("Payment review: " + r.order_id);
    if (!full && (r.fees_minor === null || r.tax_minor === null))
      issues.push("Missing verified cost/tax classification: " + r.order_id);
    const tax = full ? 0 : Number(r.tax_minor || 0),
      fees = full ? 0 : Number(r.fees_minor || 0),
      comm = full ? 0 : Number(r.commissions_minor);
    let net = 0;
    try {
      net = p.netBasis({
        gross,
        refund: refunded,
        tax,
        fees,
        commissions: comm,
      });
    } catch {
      issues.push("Deductions exceed eligible revenue: " + r.order_id);
    }
    const recognized = (amount) =>
        p.recognize(amount, r.starts_at, r.expires_at, period),
      line = {
        order_id: r.order_id,
        net_basis_minor: net,
        starts_at: r.starts_at,
        expires_at: r.expires_at,
        gross_minor: recognized(gross),
        refund_minor: recognized(refunded),
        tax_minor: recognized(tax),
        fees_minor: recognized(fees),
        commissions_minor: recognized(comm),
        net_minor: recognized(net),
      };
    line.rounding_minor =
      line.gross_minor -
      line.refund_minor -
      line.tax_minor -
      line.fees_minor -
      line.commissions_minor -
      line.net_minor;
    lines.push(line);
    for (const key of Object.keys(totals)) totals[key] += line[key];
  }
  const songs = (
    await db.query(
      `SELECT s.artist_id,s.track_id,COUNT(*)::int AS streams FROM premium_streams s JOIN premium_entitlements e ON e.id=s.entitlement_id JOIN premium_receipts r ON r.order_id=e.order_id WHERE s.occurred_at>=$1 AND s.occurred_at<$2 AND r.mode=$3 AND NOT EXISTS(SELECT 1 FROM premium_stream_exclusions x WHERE x.stream_id=s.id) AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=r.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=r.order_id) GROUP BY s.artist_id,s.track_id ORDER BY s.artist_id,s.track_id`,
      [period.start, period.end, book],
    )
  ).rows;
  const totalStreams = songs.reduce((n, s) => n + Number(s.streams), 0),
    pool = Math.floor(totals.net_minor / 2),
    artists = new Map();
  for (const s of songs)
    artists.set(
      String(s.artist_id),
      (artists.get(String(s.artist_id)) || 0) + Number(s.streams),
    );
  const allocations = [];
  for (const a of p.allocate(
    pool,
    [...artists].map(([id, weight]) => ({ id, weight })),
  ))
    for (const song of p.allocate(
      a.amount_minor,
      songs
        .filter((s) => String(s.artist_id) === a.id)
        .map((s) => ({ id: String(s.track_id), weight: Number(s.streams) })),
    ))
      allocations.push({
        artist_id: a.id,
        track_id: song.id,
        streams: Number(
          songs.find(
            (s) =>
              String(s.artist_id) === a.id && String(s.track_id) === song.id,
          ).streams,
        ),
        amount_minor: song.amount_minor,
      });
  for (const share of p.allocate(
    pool,
    lines.map((l) => ({ id: l.order_id, weight: l.net_minor })),
  )) {
    const line = lines.find((l) => l.order_id === share.id);
    line.artist_pool_share_minor = share.amount_minor;
    line.platform_share_minor = line.net_minor - share.amount_minor;
  }
  const snapshot = {
    month,
    currency: "NGN",
    mode: book,
    royalty_percent: 50,
    ...totals,
    artist_pool_minor: pool,
    platform_minor: totals.net_minor - pool,
    stream_count: totalStreams,
    royalty_per_stream: {
      numerator_minor: pool,
      denominator: totalStreams || null,
      currency: "NGN",
    },
    undistributed_minor: totalStreams ? 0 : pool,
    lines,
    allocations,
    issues,
    eligibility_policy: "premium-v1",
    deduction_order: [
      "recognized verified gross",
      "verified refunds/reversals",
      "excluded taxes",
      "actual payment fees",
      "earned 10%/5% commissions",
      "cumulative-allocation rounding reconciliation",
    ],
    available_for_withdrawal: false,
  };
  return { ...snapshot, snapshot_hash: digest(snapshot) };
}
async function adjustReversal(db, orderId) {
  const statements = (
    await db.query(
      "SELECT * FROM royalty_statements WHERE snapshot->'lines' @> $1::jsonb ORDER BY month,mode",
      [JSON.stringify([{ order_id: orderId }])],
    )
  ).rows;
  for (const s of statements) {
    const line = s.snapshot.lines.find((l) => l.order_id === orderId);
    const reduction = Number(line.artist_pool_share_minor || 0);
    const existing = (
      await db.query(
        "SELECT 1 FROM royalty_adjustments WHERE order_id=$1 AND statement_id=$2",
        [orderId, s.id],
      )
    ).rowCount;
    if (existing) continue;
    const prior = (
      await db.query(
        "SELECT COALESCE(SUM(artist_reduction_minor+carry_reduction_minor),0) AS n FROM royalty_adjustments WHERE statement_id=$1",
        [s.id],
      )
    ).rows[0];
    const cap = Math.max(0, Number(s.artist_pool_minor) - Number(prior.n)),
      amount = Math.min(cap, reduction),
      carry = Number(s.stream_count) === 0 ? amount : 0;
    const reverseBook = async (reference, amount, from, to) => {
      if (amount)
        await transfer(
          db,
          "royalty-refund:" + orderId + ":" + s.id + ":" + reference,
          "royalty_recognition_reversal",
          "NGN",
          amount,
          from,
          to,
        );
    };
    await reverseBook(
      "recognized",
      Number(line.gross_minor) - Number(line.refund_minor),
      "platform:premium_recognized:" + s.mode,
      "platform:premium_deferred:" + s.mode,
    );
    await reverseBook(
      "tax",
      Number(line.tax_minor),
      "platform:premium_tax_payable:" + s.mode,
      "platform:premium_recognized:" + s.mode,
    );
    await reverseBook(
      "commission",
      Number(line.commissions_minor),
      "platform:premium_commission_deferred_cost:" + s.mode,
      "platform:premium_recognized:" + s.mode,
    );
    await reverseBook(
      "platform",
      Number(line.platform_share_minor || 0),
      "platform:premium_platform_income:" + s.mode,
      "platform:premium_recognized:" + s.mode,
    );
    const rounding = Number(line.rounding_minor);
    await reverseBook(
      "rounding",
      Math.abs(rounding),
      rounding >= 0
        ? "platform:premium_rounding:" + s.mode
        : "platform:premium_recognized:" + s.mode,
      rounding >= 0
        ? "platform:premium_recognized:" + s.mode
        : "platform:premium_rounding:" + s.mode,
    );
    await db.query(
      "INSERT INTO royalty_adjustments(order_id,statement_id,artist_reduction_minor,carry_reduction_minor,reason) VALUES($1,$2,$3,$4,$5)",
      [
        orderId,
        s.id,
        amount - carry,
        carry,
        "Verified full refund after finalization; original statement retained.",
      ],
    );
    if (carry && amount)
      await transfer(
        db,
        "royalty-refund:" + orderId + ":" + s.id + ":carry",
        "royalty_carry_reversal",
        "NGN",
        amount,
        "platform:royalty_undistributed:" + s.mode,
        "platform:premium_recognized:" + s.mode,
      );
    if (!carry) {
      const byArtist = (
        await db.query(
          "SELECT a.artist_id,SUM(a.amount_minor)::bigint-COALESCE((SELECT SUM(h.amount_minor) FROM royalty_recovery_holds h WHERE h.statement_id=$1 AND h.artist_id=a.artist_id),0) AS amount FROM royalty_allocations a WHERE a.statement_id=$1 GROUP BY a.artist_id ORDER BY a.artist_id",
          [s.id],
        )
      ).rows;
      for (const a of p.allocate(
        amount,
        byArtist.map((a) => ({
          id: String(a.artist_id),
          weight: Number(a.amount),
        })),
      ))
        if (a.amount_minor) {
          const account =
              "artist:" + a.id + ":royalty_unsettled:" + s.mode + ":NGN",
            pending = await require("./finance").balance(db, account),
            resolved = pending >= a.amount_minor;
          if (resolved)
            await transfer(
              db,
              "royalty-refund:" + orderId + ":" + s.id + ":" + a.id,
              "royalty_refund_reversal",
              "NGN",
              a.amount_minor,
              account,
              "platform:premium_recognized:" + s.mode,
              a.id,
            );
          await db.query(
            "INSERT INTO royalty_recovery_holds(order_id,statement_id,artist_id,amount_minor,resolution) VALUES($1,$2,$3,$4,$5)",
            [
              orderId,
              s.id,
              a.id,
              a.amount_minor,
              resolved ? "unsettled_reversed" : "recovery_required",
            ],
          );
        }
    }
    await audit(
      db,
      { type: "provider", id: "premium-refund" },
      "royalty.adjustment",
      s.id,
      {
        order_id: orderId,
        amount_minor: amount,
        available_balances_debited: false,
      },
    );
  }
  const fee = (
    await db.query(
      "SELECT c.fees_minor,r.mode FROM premium_payment_costs c JOIN premium_receipts r ON r.order_id=c.order_id WHERE c.order_id=$1 ORDER BY c.revision DESC LIMIT 1",
      [orderId],
    )
  ).rows[0];
  if (fee) {
    const recognized = statements.reduce(
        (n, s) =>
          n +
          Number(
            s.snapshot.lines.find((l) => l.order_id === orderId).fees_minor,
          ),
        0,
      ),
      remaining = Math.max(0, Number(fee.fees_minor) - recognized);
    if (remaining)
      await transfer(
        db,
        "premium-refund:" + orderId + ":unamortized-fee",
        "refunded_service_fee_expense",
        "NGN",
        remaining,
        "platform:premium_recognized:" + fee.mode,
        "platform:premium_fee_deferred_cost:" + fee.mode,
      );
  }
}
function createRoyalties(pool) {
  const preview = (month, book) =>
    transaction(pool, (db) => build(db, month, mode(book)));
  async function finalize(key, input) {
    const period = p.month(input?.month),
      book = mode(input?.mode),
      note = evidence(input?.review_note);
    if (period.end.getTime() > Date.now())
      throw fail(409, "Only a completed UTC month can be finalized.");
    return transaction(pool, (db) =>
      idempotent(
        db,
        "royalty-finalize",
        key,
        { month: period.code, book, hash: input.snapshot_hash, note },
        async () => {
          await fence(db, period.code, book);
          const old = (
            await db.query(
              "SELECT id FROM royalty_statements WHERE month=$1 AND mode=$2",
              [period.code, book],
            )
          ).rows[0];
          if (old)
            throw fail(
              409,
              "This royalty period is already finalized. Use an auditable adjustment.",
            );
          const x = await build(db, period.code, book);
          if (input.snapshot_hash !== x.snapshot_hash)
            throw fail(
              409,
              "Royalty inputs changed. Review a current statement preview.",
            );
          if (x.issues.length)
            throw fail(
              409,
              "Resolve payment, deduction and eligibility review issues before finalizing.",
            );
          const id = crypto.randomUUID();
          await db.query(
            "INSERT INTO royalty_statements(id,month,currency,mode,snapshot_hash,snapshot,review_note,gross_minor,refund_minor,tax_minor,fees_minor,commissions_minor,rounding_minor,net_minor,artist_pool_minor,platform_minor,stream_count,undistributed_minor) VALUES($1,$2,'NGN',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
            [
              id,
              period.code,
              book,
              x.snapshot_hash,
              JSON.stringify(x),
              note,
              x.gross_minor,
              x.refund_minor,
              x.tax_minor,
              x.fees_minor,
              x.commissions_minor,
              x.rounding_minor,
              x.net_minor,
              x.artist_pool_minor,
              x.platform_minor,
              x.stream_count,
              x.undistributed_minor,
            ],
          );
          const post = async (name, amount, debit, credit) => {
            if (amount)
              await transfer(
                db,
                "royalty:" + id + ":" + name,
                "premium_monthly_recognition",
                "NGN",
                amount,
                debit,
                credit,
              );
          };
          await post(
            "gross-less-refunds",
            x.gross_minor - x.refund_minor,
            "platform:premium_deferred:" + book,
            "platform:premium_recognized:" + book,
          );
          for (const [name, amount, target] of [
            ["tax", x.tax_minor, "platform:premium_tax_payable:"],
            ["fees", x.fees_minor, "platform:premium_fee_deferred_cost:"],
            [
              "commissions",
              x.commissions_minor,
              "platform:premium_commission_deferred_cost:",
            ],
            ["platform", x.platform_minor, "platform:premium_platform_income:"],
          ])
            await post(
              name,
              amount,
              "platform:premium_recognized:" + book,
              target + book,
            );
          await post(
            "rounding",
            Math.abs(x.rounding_minor),
            x.rounding_minor >= 0
              ? "platform:premium_recognized:" + book
              : "platform:premium_rounding:" + book,
            x.rounding_minor >= 0
              ? "platform:premium_rounding:" + book
              : "platform:premium_recognized:" + book,
          );
          for (const a of x.allocations)
            await db.query(
              "INSERT INTO royalty_allocations(statement_id,track_id,artist_id,stream_count,amount_minor) VALUES($1,$2,$3,$4,$5)",
              [id, a.track_id, a.artist_id, a.streams, a.amount_minor],
            );
          const totals = new Map();
          for (const a of x.allocations)
            totals.set(
              a.artist_id,
              (totals.get(a.artist_id) || 0) + a.amount_minor,
            );
          for (const [artist, amount] of totals)
            if (amount)
              await transfer(
                db,
                "royalty:" + id + ":" + artist,
                "finalized_unsettled_streaming_royalty",
                "NGN",
                amount,
                "platform:premium_recognized:" + book,
                "artist:" + artist + ":royalty_unsettled:" + book + ":NGN",
                artist,
              );
          if (x.undistributed_minor)
            await transfer(
              db,
              "royalty:" + id + ":carry",
              "undistributed_royalty_liability",
              "NGN",
              x.undistributed_minor,
              "platform:premium_recognized:" + book,
              "platform:royalty_undistributed:" + book,
            );
          await audit(
            db,
            { type: "admin", id: "session" },
            "royalty.finalize",
            id,
            {
              month: period.code,
              mode: book,
              streams: x.stream_count,
              artist_pool_minor: x.artist_pool_minor,
              funds_withdrawable: false,
            },
          );
          return { id, ...x, finalized: true };
        },
      ),
    );
  }
  async function costs(key, input) {
    if (!uuid(input?.order_id))
      throw fail(400, "Choose a verified Premium receipt.");
    const fees = p.minor(input.fees_minor),
      tax = p.minor(input.tax_minor),
      note = evidence(input.evidence),
      expectedRevision = input.revision === undefined ? 0 : input.revision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw fail(400, "Choose a valid cost evidence revision.");
    return transaction(pool, (db) =>
      idempotent(
        db,
        "premium-costs",
        key,
        { id: input.order_id, fees, tax, note, revision: expectedRevision },
        async () => {
          const r = (
            await db.query(
              "SELECT * FROM premium_receipts WHERE order_id=$1 FOR NO KEY UPDATE",
              [input.order_id],
            )
          ).rows[0];
          if (!r) throw fail(404, "Verified receipt unavailable.");
          await lockReceiptPeriods(db, r.order_id);
          if (fees + tax > Number(r.amount_minor))
            throw fail(400, "Fees and excluded taxes exceed the payment.");
          if (
            (
              await db.query(
                "SELECT 1 FROM royalty_statements WHERE snapshot->'lines' @> $1::jsonb",
                [JSON.stringify([{ order_id: r.order_id }])],
              )
            ).rowCount
          )
            throw fail(
              409,
              "A finalized statement already includes this receipt. Create an audited correction through reconciliation.",
            );
          const revision = Number(
            (
              await db.query(
                "SELECT COALESCE(MAX(revision),0) AS n FROM premium_payment_costs WHERE order_id=$1",
                [r.order_id],
              )
            ).rows[0].n,
          );
          if (expectedRevision !== revision)
            throw fail(
              409,
              "Cost evidence changed. Refresh before recording a correction.",
            );
          const previous = revision
              ? Number(
                  (
                    await db.query(
                      "SELECT fees_minor FROM premium_payment_costs WHERE order_id=$1 AND revision=$2",
                      [r.order_id, revision],
                    )
                  ).rows[0].fees_minor,
                )
              : 0,
            delta = fees - previous;
          if (delta) {
            const reversed = (
                await db.query(
                  "SELECT 1 FROM premium_reversals WHERE order_id=$1",
                  [r.order_id],
                )
              ).rowCount,
              expense = reversed
                ? "platform:premium_recognized:" + r.mode
                : "platform:premium_fee_deferred_cost:" + r.mode;
            await transfer(
              db,
              "premium-costs:" + r.order_id + ":" + (revision + 1),
              "verified_premium_processing_fee",
              "NGN",
              Math.abs(delta),
              delta > 0 ? expense : "platform:premium_receivable:" + r.mode,
              delta > 0 ? "platform:premium_receivable:" + r.mode : expense,
            );
          }
          await db.query(
            "INSERT INTO premium_payment_costs(order_id,revision,fees_minor,tax_minor,evidence) VALUES($1,$2,$3,$4,$5)",
            [r.order_id, revision + 1, fees, tax, note],
          );
          await audit(
            db,
            { type: "admin", id: "session" },
            "premium.costs",
            r.order_id,
            { fees_minor: fees, tax_minor: tax, evidence: note },
          );
          return { ok: true };
        },
      ),
    );
  }
  async function exclude(key, input) {
    const id = String(input?.stream_id);
    if (!/^[1-9][0-9]{0,15}$/.test(id)) throw fail(400, "Choose a stream.");
    const note = evidence(input.reason);
    return transaction(pool, (db) =>
      idempotent(
        db,
        "premium-stream-exclusion",
        key,
        { id, note },
        async () => {
          const s = (
            await db.query(
              "SELECT to_char(s.occurred_at AT TIME ZONE 'UTC','YYYY-MM') AS month,r.mode FROM premium_streams s JOIN premium_entitlements e ON e.id=s.entitlement_id JOIN premium_receipts r ON r.order_id=e.order_id WHERE s.id=$1",
              [id],
            )
          ).rows[0];
          if (!s) throw fail(404, "Stream unavailable.");
          await fence(db, s.month, s.mode);
          if (
            (
              await db.query(
                "SELECT 1 FROM royalty_statements WHERE month=$1 AND mode=$2",
                [s.month, s.mode],
              )
            ).rowCount
          )
            throw fail(
              409,
              "Finalized stream inputs require a separate audited correction.",
            );
          await db.query(
            "INSERT INTO premium_stream_exclusions(stream_id,reason) VALUES($1,$2)",
            [id, note],
          );
          await audit(
            db,
            { type: "admin", id: "session" },
            "premium.stream.exclude",
            id,
            { reason: note },
          );
          return { ok: true };
        },
      ),
    );
  }
  async function artist(artistId, month, book = "live") {
    mode(book);
    const current = await preview(month, book),
      [finalized, withdrawals, holds, counts] = await Promise.all([
        pool.query(
          "SELECT s.id,s.month,s.mode,s.created_at,SUM(a.amount_minor)::bigint AS amount_minor,SUM(a.stream_count)::bigint AS streams FROM royalty_allocations a JOIN royalty_statements s ON s.id=a.statement_id WHERE a.artist_id=$1 GROUP BY s.id ORDER BY s.month DESC LIMIT 100",
          [artistId],
        ),
        pool.query(
          "SELECT id,currency,gross_minor,fee_minor,net_minor,status,created_at FROM finance_withdrawals WHERE artist_id=$1 ORDER BY id DESC LIMIT 100",
          [artistId],
        ),
        pool.query(
          "SELECT h.*,s.month,s.mode FROM royalty_recovery_holds h JOIN royalty_statements s ON s.id=h.statement_id WHERE artist_id=$1 ORDER BY h.id DESC",
          [artistId],
        ),
        pool.query(
          "SELECT (SELECT COALESCE(SUM(plays),0) FROM music_tracks WHERE creator_id=$1) AS total_plays,(SELECT COUNT(*) FROM premium_streams ps JOIN premium_entitlements pe ON pe.id=ps.entitlement_id WHERE ps.artist_id=$1 AND NOT EXISTS(SELECT 1 FROM premium_stream_exclusions ex WHERE ex.stream_id=ps.id) AND NOT EXISTS(SELECT 1 FROM premium_reversals pr WHERE pr.order_id=pe.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews pr WHERE pr.order_id=pe.order_id)) AS qualifying_premium_plays,(SELECT COUNT(*) FROM music_play_events WHERE artist_id=$1) AS dated_plays,(SELECT COUNT(*) FROM play_audience_classifications ac JOIN music_play_events pe ON pe.id=ac.event_id WHERE pe.artist_id=$1 AND ac.audience='free') AS free_plays",
          [artistId],
        ),
      ]);
    const lifetime = (
      await pool.query(
        `SELECT COALESCE(SUM(a.amount_minor),0)::bigint AS finalized_minor,COALESCE(SUM(a.amount_minor) FILTER(WHERE s.month=to_char(($3::date-INTERVAL '1 month'),'YYYY-MM')),0)::bigint AS previous_month_minor FROM royalty_allocations a JOIN royalty_statements s ON s.id=a.statement_id WHERE a.artist_id=$1 AND s.mode=$2`,
        [artistId, book, month + "-01"],
      )
    ).rows[0];
    return {
      month,
      mode: book,
      currency: "NGN",
      royalty_percent: 50,
      lifetime_finalized_minor: Number(lifetime.finalized_minor),
      previous_month_finalized_minor: Number(lifetime.previous_month_minor),
      lifetime_adjustments_minor: holds.rows
        .filter((h) => h.mode === book)
        .reduce((n, h) => n + Number(h.amount_minor), 0),
      estimated_minor: current.allocations
        .filter((a) => a.artist_id === String(artistId))
        .reduce((n, a) => n + a.amount_minor, 0),
      estimate_issues: current.issues.length,
      songs: current.allocations.filter(
        (a) => a.artist_id === String(artistId),
      ),
      finalized: finalized.rows,
      withdrawals: withdrawals.rows,
      adjustments: holds.rows,
      counts: counts.rows[0],
      settlement_enabled: false,
      available_minor: await require("./finance").balance(
        pool,
        require("./finance").earnedAccount(artistId, "NGN"),
      ),
      notice:
        "Estimates may change. Finalized liabilities require verified cash settlement before release; sandbox amounts are never available for withdrawal.",
    };
  }
  async function report() {
    const [statements, payments, streams, calculations] = await Promise.all([
      pool.query(
        "SELECT id,month,mode,currency,gross_minor,refund_minor,fees_minor,tax_minor,commissions_minor,rounding_minor,net_minor,artist_pool_minor,platform_minor,stream_count,undistributed_minor,created_at,(SELECT amount_minor FROM royalty_cash_releases cr WHERE cr.statement_id=royalty_statements.id) AS released_minor FROM royalty_statements ORDER BY month DESC LIMIT 100",
      ),
      pool.query(
        "SELECT r.*,c.fees_minor,c.tax_minor FROM premium_receipts r LEFT JOIN LATERAL(SELECT * FROM premium_payment_costs pc WHERE pc.order_id=r.order_id ORDER BY revision DESC LIMIT 1)c ON TRUE ORDER BY r.verified_at DESC LIMIT 100",
      ),
      pool.query(
        "SELECT s.*,r.mode,x.reason AS exclusion FROM premium_streams s JOIN premium_entitlements e ON e.id=s.entitlement_id JOIN premium_receipts r ON r.order_id=e.order_id LEFT JOIN premium_stream_exclusions x ON x.stream_id=s.id ORDER BY s.id DESC LIMIT 100",
      ),
      pool.query(
        "SELECT actor_id,action,resource,details,created_at FROM platform_audit WHERE action IN ('royalty.preview','royalty.calculation_failed','royalty.finalize') ORDER BY id DESC LIMIT 100",
      ),
    ]);
    return {
      calculations: calculations.rows,
      statements: statements.rows,
      payments: payments.rows,
      streams: streams.rows,
      settlement_enabled: false,
    };
  }
  return { preview, finalize, costs, exclude, artist, report };
}
module.exports = {
  createRoyalties,
  build,
  adjustReversal,
  fence,
  lockReceiptPeriods,
};
