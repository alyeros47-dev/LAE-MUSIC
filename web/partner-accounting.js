// A projection and review surface, never a client payment or earnings calculator.
export function partnerAccountingPanel(x, { e, money, table, notice, date }) {
  if (x.unavailable)
    return notice(
      "The reconciled sales report could not be loaded. Existing records remain preserved. Reload before relying on totals.",
      true,
    );
  const team = x.rollup.team,
    direct = x.rollup.direct;
  return `<section class="panel" aria-labelledby="partner-accounting-heading"><span class="eyebrow">RECEIPTS, REFUNDS & TEAM PERFORMANCE</span><h2 id="partner-accounting-heading">Your reconciled quarter.</h2><form id="partner-accounting-filter" class="row-actions"><label>Accounting quarter<input name="quarter" aria-label="Accounting quarter" value="${e(x.period.code)}" pattern="20[0-9]{2}-Q[1-4]" placeholder="2026-Q4" required></label><label>Sales record mode<select name="records" aria-label="Sales record mode">${[
    ["live", "Live receipts"],
    ["test", "Test payments · no real money"],
    ["legacy", "Historical records · unverified mode"],
  ]
    .map(
      ([v, label]) =>
        `<option value="${v}" ${v === x.mode ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><button class="button secondary" type="submit">Review this quarter</button></form><p>${e(x.period.code)} · ${e(x.mode)} records · USD accounting. ${x.mode === "test" ? "These are verified test-payment records, not real money." : x.mode === "legacy" ? "Historical records without the required mode/receipt evidence are excluded from eligible totals." : ""}</p><div class="metrics"><div class="metric"><span>ELIGIBLE DIRECT VOLUME</span><strong>${money(direct.eligible_minor)}</strong><small>Product-specific direct rates remain in their original records</small></div><div class="metric"><span>ELIGIBLE TEAM VOLUME</span><strong>${money(team.eligible_minor)}</strong><small>Verified purchases exactly two referral steps below you</small></div><div class="metric"><span>TEAM REFUNDS</span><strong>${money(team.refund_minor)}</strong><small>Excluded from the team projection</small></div><div class="metric"><span>TEAM VOLUME ON HOLD</span><strong>${money(team.held_minor)}</strong><small>Refund requests and disputes need review</small></div><div class="metric"><span>10% TEAM PROJECTION</span><strong>${money(x.team_projection_minor)}</strong><small>Projection only · not an award or available balance</small></div></div>${notice(x.notice)}${
    x.statements?.length
      ? `<h3>Finalized calculations · no bank payout</h3>${table(x.statements, [
          ["period", "Bonus period"],
          ["bonus_minor", "Finalized USD", money],
          [
            "review_hold",
            "Release status",
            (v) => (v ? "Review hold" : "Awaiting verified settlement"),
          ],
          ["created_at", "Calculated", date],
        ])}`
      : ""
  }<h3>Team performance by direct referrer</h3>${table(x.team_by_referrer, [
    ["referrer_name", "Direct referrer"],
    ["eligible_sales", "Eligible sales"],
    ["eligible_minor", "Eligible USD", money],
    ["refund_minor", "Refunded USD", money],
    ["held_minor", "Held USD", money],
  ])}${x.team_referrers_truncated ? "<p>Showing the first 100 referrers; totals include all matching sales.</p>" : ""}<h3>Receipt and reversal details</h3>${table(
    x.activity,
    [
      ["relation", "Attribution"],
      ["buyer_name", "Customer"],
      ["plan", "Product"],
      ["gross_minor", "Original USD", money],
      ["refund_minor", "Refunded USD", money],
      ["eligible_minor", "Eligible USD", money],
      [
        "charge_minor",
        "Original charge",
        (v, r) =>
          r.charge_currency
            ? money(v, r.charge_currency)
            : "No verified presentment",
      ],
      [
        "evidence_valid",
        "Receipt evidence",
        (v) => (v ? "Matched" : "Unverified · excluded"),
      ],
      ["held", "Review", (v) => (v ? "On hold" : "No active hold")],
      ["verified_at", "Payment verified", date],
    ],
  )}${x.activity_truncated ? "<p>Showing the latest 100 sales; totals include all matching sales.</p>" : ""}<p>December 21–31 purchases carry into the next January–March bonus period; original purchase dates remain unchanged. Original exchange-rate and conversion timestamps remain attached to each verified receipt. The report reuses the recorded USD amount; it does not convert the local charge again. Registering people or recording practice transactions creates no eligible volume.</p></section>`;
}
export function bindPartnerAccounting({ navigate }) {
  const form = document.getElementById("partner-accounting-filter");
  if (!form) return;
  form.onsubmit = (event) => {
    event.preventDefault();
    const q = new URLSearchParams({
      quarter: form.elements.quarter.value,
      records: form.elements.records.value,
    });
    navigate("/partners?" + q);
  };
}
export async function adminPartnerAccounting(
  view,
  intro,
  { url, api, e, money, table, notice, date, bindForm, navigate, toast },
) {
  const policy = await api("/api/platform/partners/policy"),
    owner = url.searchParams.get("partner") || "",
    quarter = url.searchParams.get("quarter") || policy.current_period,
    mode = url.searchParams.get("records") || "live";
  const data = owner
    ? await api(
        "/api/platform/admin/partners/accounting?artist_id=" +
          encodeURIComponent(owner) +
          "&quarter=" +
          encodeURIComponent(quarter) +
          "&mode=" +
          encodeURIComponent(mode),
      )
    : null;
  const filter = `<section class="panel"><h2>Review a partner’s quarter</h2><form id="admin-partner-filter" class="row-actions"><label>Partner account ID<input name="partner" value="${e(owner)}" inputmode="numeric" pattern="[1-9][0-9]{0,15}" required></label><label>Bonus period<input name="quarter" value="${e(quarter)}" pattern="20[0-9]{2}-Q[1-4]" required></label><label>Statement records<select name="records" aria-label="Statement records"><option value="live" ${mode === "live" ? "selected" : ""}>Live receipts</option><option value="test" ${mode === "test" ? "selected" : ""}>Test payments · no real cash</option></select></label><button class="button secondary">Review receipts</button></form></section>`;
  const finalize = data
    ? `<section class="panel"><h3>Finalize the quarterly calculation</h3><p>Finalize only a closed period with matched receipts and no unresolved reviews. This records an immutable statement and an unsettled liability. It does not send money or create withdrawable funds.</p><form id="partner-finalize"><label>Review note<textarea name="note" minlength="10" maxlength="1000" required></textarea></label><button class="button" ${data.can_finalize ? "" : "disabled"}>Finalize calculation · no payout</button><p class="form-status" role="status"></p></form>${data.statement_issues.length ? notice(data.statement_issues.length + " receipt or refund issues need reconciliation.", true) : ""}</section>`
    : "";
  if (
    !view.set(
      intro +
        filter +
        (data
          ? partnerAccountingPanel(data, { e, money, table, notice, date }) +
            finalize
          : notice(
              "Choose a partner to inspect their verified sales, refunds and two-step performance.",
            )),
    )
  )
    return;
  const go = (form) => {
    const q = new URLSearchParams({
      section: "affiliates",
      partner: form.elements.partner.value,
      quarter: form.elements.quarter.value,
      records: form.elements.records.value,
    });
    navigate("/admin/console?" + q);
  };
  document.getElementById("admin-partner-filter").onsubmit = (event) => {
    event.preventDefault();
    go(event.currentTarget);
  };
  if (data) {
    document.getElementById("partner-accounting-filter").onsubmit = (event) => {
      event.preventDefault();
      navigate(
        "/admin/console?" +
          new URLSearchParams({
            section: "affiliates",
            partner: owner,
            quarter: event.currentTarget.elements.quarter.value,
            records: event.currentTarget.elements.records.value,
          }),
      );
    };
    bindForm(document.getElementById("partner-finalize"), async (b) => {
      await api("/api/platform/admin/partners/accounting/finalize", "POST", {
        artist_id: owner,
        quarter,
        mode,
        snapshot_hash: data.statement_snapshot_hash,
        note: b.note,
      });
      toast("Quarterly statement recorded. No funds were sent.");
      navigate(
        "/admin/console?" +
          new URLSearchParams({
            section: "affiliates",
            partner: owner,
            quarter,
            records: mode,
          }),
      );
    });
  }
}
