export function financialAmount(value, currency = "USD") {
  if (!["USD", "NGN"].includes(currency) || !/^\-?\d+$/.test(String(value)))
    return "Unavailable";
  const n = BigInt(value),
    negative = n < 0n,
    abs = negative ? -n : n;
  return (
    currency +
    " " +
    (negative ? "-" : "") +
    (abs / 100n).toLocaleString("en-US") +
    "." +
    String(abs % 100n).padStart(2, "0")
  );
}
const modes = {
  test: "Sandbox · not cash",
  live: "Live records",
  legacy: "Legacy · unclassified",
  ledger: "Ledger · settlement unverified",
};
const labels = {
  artist_checkout: "Artist checkout",
  listener_checkout: "Premium checkout",
  artist_refund: "Artist refund",
  listener_hold: "Premium payment hold",
  commission: "Commission recovery",
  royalty_recovery: "Royalty recovery",
  withdrawal: "Withdrawal",
};
function plot(rows, mode, currency, e) {
  const data = rows.filter((r) => r.mode === mode);
  if (!data.length) return "";
  const maximum = data.reduce(
      (m, r) => (BigInt(r.gross_minor) > m ? BigInt(r.gross_minor) : m),
      1n,
    ),
    points = data
      .map(
        (r, i) =>
          (30 + (i * 840) / Math.max(1, data.length - 1)).toFixed(1) +
          "," +
          (
            205 -
            (Number((BigInt(r.gross_minor) * 10000n) / maximum) / 10000) * 165
          ).toFixed(1),
      )
      .join(" ");
  return `<section class="panel"><span class="eyebrow">${e(modes[mode] || mode)}</span><h3>Recorded gross receipts · ${e(currency)}</h3><svg class="activity-plot" viewBox="0 0 900 250" role="img" aria-label="${e(modes[mode] || mode)} gross receipts by UTC day"><title>Recorded receipts, not settled cash</title><line x1="30" x2="870" y1="205" y2="205" class="plot-axis"/><text x="30" y="25">${e(financialAmount(maximum, currency))}</text><polyline points="${points}" class="plot-line"/>${data.map((r, i) => `<circle cx="${(30 + (i * 840) / Math.max(1, data.length - 1)).toFixed(1)}" cy="${(205 - (Number((BigInt(r.gross_minor) * 10000n) / maximum) / 10000) * 165).toFixed(1)}" r="4" class="receipt-point"/>`).join("")}<text x="30" y="240">${e(data[0].day)}</text><text x="870" y="240" text-anchor="end">${e(data.at(-1).day)}</text></svg><details><summary>Read daily receipt amounts</summary>${data.map((r) => `<p>${e(r.day)} · ${e(financialAmount(r.gross_minor, currency))}</p>`).join("")}</details></section>`;
}
export async function reconciliationPage(view, intro, ctx, url) {
  const {
    api,
    e,
    table: renderTable,
    notice,
    bindForm,
    toast,
    keyFor,
    clearKey,
    navigate,
    date,
  } = ctx;
  const table = (rows, columns, label = "Financial records") =>
    renderTable(rows, columns).replace(
      /<div class="scroll"[^>]*>/,
      '<div class="scroll reconciliation-scroll" tabindex="0" role="region" aria-label="' +
        e(label) +
        '">',
    );
  const currency = ["USD", "NGN"].includes(url.searchParams.get("currency"))
      ? url.searchParams.get("currency")
      : "USD",
    mode = url.searchParams.get("mode") || "all",
    kind = url.searchParams.get("kind") || "all",
    search = url.searchParams.get("search") || "",
    params = new URLSearchParams({ currency, mode, kind, search });
  if (url.searchParams.has("cursor"))
    params.set("cursor", url.searchParams.get("cursor"));
  const ledgerDays = [1, 7, 30, 90].includes(
    Number(url.searchParams.get("ledger_days")),
  )
    ? Number(url.searchParams.get("ledger_days"))
    : 30;
  const base = "/api/platform/admin/reconciliation",
    [overview, queue, ledger] = await Promise.all([
      api(base + "?" + params),
      api(base + "/queue?" + params),
      api(
        base +
          "/ledger?" +
          new URLSearchParams({ currency, days: String(ledgerDays) }),
      ),
    ]);
  const selectedKind = url.searchParams.get("source_kind"),
    selectedId = url.searchParams.get("source_id"),
    detail =
      selectedKind && selectedId
        ? await api(
            base +
              "/source?" +
              new URLSearchParams({
                kind: selectedKind,
                source_id: selectedId,
              }),
          )
        : null;
  const link = (k, id) => {
    const u = new URL(url);
    u.searchParams.set("source_kind", k);
    u.searchParams.set("source_id", id);
    return u.pathname + u.search;
  };
  const count = overview.attention.reduce((n, r) => n + BigInt(r.count), 0n);
  const row = (r) =>
    `<article class="panel reconciliation-item"><div class="page-heading"><div><span class="eyebrow">${e(labels[r.kind])}</span><h3>${e(r.status.replaceAll("_", " "))}</h3><p>${e(r.reason)}</p></div><span class="badge">${e(modes[r.mode] || r.mode)}</span></div><p class="reconciliation-id">${e(r.reference)}</p><p><strong>${e(financialAmount(r.amount_minor, r.currency))}</strong>${r.charge_currency ? " · Original charge " + e(financialAmount(r.charge_minor, r.charge_currency)) : ""}</p><div class="row-actions"><span>${e(r.review_status === "resolved" ? "Needs new review" : r.review_status?.replaceAll("_", " ") || "Unclaimed")}</span><a class="button secondary small" data-nav href="${e(link(r.kind, r.source_id))}">Review ${e(labels[r.kind].toLowerCase())}</a></div></article>`;
  let detailHTML = "";
  if (detail) {
    const s = detail.source || detail.review.source_snapshot,
      review = detail.review,
      actions =
        !review || (review.status === "resolved" && detail.attention)
          ? [["claim", "Claim this review"]]
          : review.status === "resolved"
            ? [["note", "Add a note"]]
            : detail.attention
              ? [
                  ["note", "Add a note"],
                  ["claim", "Assign to me"],
                  ["wait", "Wait for external evidence"],
                ]
              : [
                  ["resolve", "Resolve this review"],
                  ["note", "Add a note"],
                ];
    detailHTML = `<section class="panel" id="reconciliation-detail"><span class="eyebrow">REVIEW WORKSPACE</span><h2>${e(labels[s.kind])} review</h2>${notice(detail.attention ? "The source still needs attention. Use its verification workflow; a review note cannot release a hold or send funds." : "The source no longer needs attention. You can resolve the operator review; this does not certify bank settlement.")}<p class="reconciliation-id">${e(s.reference)}</p><p>${e(financialAmount(s.amount_minor, s.currency))} · ${e(modes[s.mode] || s.mode)} · ${e(s.status)}</p>${s.charge_currency ? `<p>Original charge: ${e(financialAmount(s.charge_minor, s.charge_currency))}</p>` : ""}${!detail.source ? "<p>Showing the preserved source snapshot; no current source record was found.</p>" : ""}<p>Assigned to: <span class="reconciliation-id">${e(review?.assigned_actor || "Unclaimed")}</span> · Revision ${e(review?.revision || 0)}</p><a class="inline-link" data-nav href="${e(s.destination)}">Open source verification →</a>${["artist_checkout", "listener_checkout"].includes(s.kind) ? '<button type="button" class="button secondary" id="reconciliation-verify-source">Verify original provider record</button>' : ""}<form id="reconciliation-review"><label>Review action<select name="action" aria-label="Review action">${actions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><label>Review note<textarea name="note" minlength="10" maxlength="1000" required placeholder="Record the evidence checked, outstanding questions and next step. Never include credentials or card details."></textarea></label><button type="submit" class="button">Record review</button><p class="form-status" role="status"></p></form><h3>Permanent review history</h3>${detail.history.length ? detail.history.map((h) => `<article class="review-note"><p><span class="badge">${e(h.action)}</span> Revision ${e(h.revision)} · ${e(date(h.created_at))}</p><p>${e(h.note)}</p><p class="reconciliation-id">${e(h.actor)}</p></article>`).join("") : "<p>No review notes yet.</p>"}${detail.history_truncated ? "<p>Showing the latest 100 review events.</p>" : ""}</section>`;
  }
  const metrics = overview.totals
    .map(
      (t) =>
        `<div class="metric"><span>${e(t.product === "artist" ? "ARTIST PRODUCTS" : "PREMIUM LISTENER")} · ${e(modes[t.mode] || t.mode)}</span><strong>${e(financialAmount(t.gross_minor, t.currency))}</strong><small>${e(t.count)} recorded receipts · all time</small></div>`,
    )
    .join("");
  const next = () => {
    const u = new URL(url);
    u.searchParams.set("cursor", queue.next_cursor);
    u.searchParams.delete("source_kind");
    u.searchParams.delete("source_id");
    return u.pathname + u.search;
  };
  const recent = overview.recent_reviews || [];
  if (
    !view.set(
      intro +
        `<section class="profile-hero"><div><span class="eyebrow">FINANCIAL OPERATIONS</span><h2>Reconcile with confidence.</h2><p>Follow every unresolved record. Keep each currency, source and decision in view.</p><span class="badge">${e(count.toString())} ${count === 1n ? "record needs" : "records need"} attention</span></div></section>` +
        notice(overview.notice, true) +
        `<form id="reconciliation-filters" class="row-actions"><label>Accounting currency<select name="currency" aria-label="Accounting currency"><option value="USD" ${currency === "USD" ? "selected" : ""}>USD</option><option value="NGN" ${currency === "NGN" ? "selected" : ""}>Legacy NGN</option></select></label><label>Record type<select name="mode" aria-label="Record type">${[["all", "All record types"], ...Object.entries(modes)].map(([value, label]) => `<option value="${value}" ${mode === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Source category<select name="kind" aria-label="Source category"><option value="all">All sources</option>${Object.entries(
          labels,
        )
          .map(
            ([value, label]) =>
              `<option value="${value}" ${kind === value ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select></label><label>Find a reference<input name="search" maxlength="100" value="${e(search)}" placeholder="Reference or source ID"></label><button class="button secondary" type="submit">Filter records</button></form><div class="metrics">${metrics || '<div class="metric"><span>RECORDED RECEIPTS</span><strong>No matching records</strong></div>'}</div><div class="two-column">${["test", "live", "legacy"].map((m) => plot(overview.trend, m, currency, e)).join("")}</div>` +
        detailHTML +
        `<div class="page-heading"><div><span class="eyebrow">ATTENTION QUEUE</span><h2>The next records to review.</h2><p>Newest first. Claiming or annotating a record leaves its financial state unchanged.</p></div></div><div class="two-column">${queue.rows.map(row).join("") || '<section class="panel"><h3>No matching records need attention.</h3><p>Use another currency or record type to review its queue.</p></section>'}</div>${queue.next_cursor ? `<a class="button secondary" href="${e(next())}" data-nav>Next review page</a>` : ""}<section class="panel"><h2>Recent operator reviews</h2>${recent.length ? recent.map((r) => `<p><a class="inline-link" href="${e(link(r.source_kind, r.source_id))}" data-nav>${e(labels[r.source_kind])} · ${e(r.status.replaceAll("_", " "))}</a> · Revision ${e(r.revision)} · ${e(date(r.updated_at))}</p>`).join("") : "<p>No operator reviews for this selection.</p>"}</section><section class="panel"><h2>Finalized streaming obligations</h2><p>Allocated royalties and releases to earned ledgers remain distinct from bank payouts.</p>${table(
          overview.royalties || [],
          [
            ["mode", "Record type", (v) => modes[v] || v],
            ["statements", "Statements"],
            [
              "allocated_minor",
              "Allocated royalty",
              (v) => financialAmount(v, currency),
            ],
            [
              "released_ledger_minor",
              "Released to earned ledger",
              (v) => financialAmount(v, currency),
            ],
          ],
          "Finalized streaming obligations",
        )}</section><section class="panel"><div class="page-heading"><div><span class="eyebrow">AUDIT TRAIL · LAST ${ledgerDays} DAYS</span><h2>Balanced ledger movements.</h2><form id="reconciliation-ledger-period" class="row-actions"><label>Ledger period<select name="ledger_days" aria-label="Ledger period">${[1, 7, 30, 90].map((d) => `<option value="${d}" ${ledgerDays === d ? "selected" : ""}>Last ${d} ${d === 1 ? "day" : "days"}</option>`).join("")}</select></label><button type="submit" class="button secondary">Update ledger period</button></form><p>${e(ledger.notice)} Up to 1,000 rows per export; amounts are exact minor units.</p></div><a class="button secondary" href="${base}/ledger.csv?currency=${currency}&days=${ledgerDays}" download="lae-ledger-${currency}.csv">Export ${currency} ledger CSV</a></div>${table(
          ledger.rows.slice(0, 12),
          [
            ["reference", "Reference"],
            ["kind", "Movement"],
            ["amount_minor", "Amount", (v) => financialAmount(v, currency)],
            ["debit_account", "From"],
            ["credit_account", "To"],
            ["created_at", "Recorded", date],
          ],
          "Ledger movements",
        )}${ledger.rows.length > 12 ? "<p>Showing the newest 12 movements. Export for more records.</p>" : ""}${ledger.truncated ? '<p role="status">The export is limited to the newest 1,000 records. Choose a shorter period to review a smaller set of records.</p>' : ""}<h3>Account balances · all recorded ledger modes</h3>${table(
          overview.ledger_accounts,
          [
            ["account", "Ledger account"],
            ["balance_minor", "Balance", (v) => financialAmount(v, currency)],
          ],
          "Ledger account balances",
        )}${overview.ledger_accounts_truncated ? "<p>Showing the first 100 non-zero account balances.</p>" : ""}</section>`,
    )
  )
    return;
  bindForm(document.getElementById("reconciliation-filters"), async (b) => {
    const u = new URL(url);
    for (const [k, v] of Object.entries(b)) u.searchParams.set(k, v);
    for (const k of ["cursor", "source_kind", "source_id"])
      u.searchParams.delete(k);
    navigate(u.pathname + u.search);
  });
  bindForm(
    document.getElementById("reconciliation-ledger-period"),
    async (b) => {
      const u = new URL(url);
      u.searchParams.set("ledger_days", b.ledger_days);
      navigate(u.pathname + u.search);
    },
  );
  const verifyButton = document.getElementById("reconciliation-verify-source");
  if (verifyButton)
    verifyButton.onclick = async () => {
      verifyButton.disabled = true;
      try {
        await api(base + "/verify-source", "POST", {
          kind: selectedKind,
          source_id: selectedId,
        });
        toast("Provider lookup finished. Review the current source state.");
        ctx.route();
      } catch (error) {
        toast(error.message, true);
      } finally {
        verifyButton.disabled = false;
      }
    };
  if (detail)
    bindForm(document.getElementById("reconciliation-review"), async (b) => {
      const payload = {
          kind: selectedKind,
          source_id: selectedId,
          revision: Number(detail.review?.revision || 0),
          ...b,
        },
        scope = "reconciliation:" + selectedKind + ":" + selectedId;
      await api(base + "/review", "POST", payload, {
        headers: { "Idempotency-Key": keyFor(scope, payload) },
      });
      clearKey(scope);
      toast("Review recorded. Financial records unchanged.");
      ctx.route();
    });
}
