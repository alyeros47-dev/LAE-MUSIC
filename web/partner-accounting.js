// A projection and review surface, never a client payment or earnings calculator.
export function partnerAccountingPanel(x, { e, money, table, notice, date }) {
  if (x.unavailable)
    return notice(
      "The reconciled sales report could not be loaded. Existing records remain preserved. Reload before relying on totals.",
      true,
    );
  const team = x.rollup.team,
    direct = x.rollup.direct;
  return `<section class="panel" aria-labelledby="partner-accounting-heading"><span class="eyebrow">RECEIPTS, REFUNDS & TEAM PERFORMANCE</span><h2 id="partner-accounting-heading">Your quarterly statement.</h2><form id="partner-accounting-filter" class="row-actions"><label>Accounting quarter<input name="quarter" aria-label="Accounting quarter" value="${e(x.period.code)}" pattern="20[0-9]{2}-Q[1-4]" placeholder="2026-Q4" required></label><label>Sales record mode<select name="records" aria-label="Sales record mode">${[
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
    )}</select></label><button class="button secondary" type="submit">Review this quarter</button></form><p>${e(x.period.code)} · ${e(x.mode)} records · USD accounting. ${x.mode === "test" ? "These are verified test-payment records, not real money." : x.mode === "legacy" ? "Historical records without the required mode/receipt evidence are excluded from eligible totals." : ""}</p><div class="metrics"><div class="metric"><span>ELIGIBLE DIRECT VOLUME</span><strong>${money(direct.eligible_minor)}</strong><small>Product-specific direct rates remain in their original records</small></div><div class="metric"><span>ELIGIBLE TEAM VOLUME</span><strong>${money(team.eligible_minor)}</strong><small>Verified purchases exactly two referral steps below you</small></div><div class="metric"><span>TEAM REFUNDS</span><strong>${money(team.refund_minor)}</strong><small>Excluded from the team projection</small></div><div class="metric"><span>TEAM VOLUME ON HOLD</span><strong>${money(team.held_minor)}</strong><small>Refund requests and disputes need review</small></div><div class="metric"><span>TEAM BONUS PROJECTION</span><strong>${money(x.team_projection_minor)}</strong><small>Quarterly earnings; bank payment is shown separately</small></div></div>${notice(x.notice)}${
    x.team_rate_breakdown?.length
      ? `<h3>Team bonus by product group</h3>${table(x.team_rate_breakdown, [
          [
            "product_group",
            "Products",
            (v) =>
              v === "historical_premium_listener"
                ? "Earlier Premium purchases"
                : v === "artist_studio_and_new_premium" ? "10% team purchases" : v === "premium_listener" ? "Premium Listener" : "Artist packages & studio",
          ],
          ["percent", "Team rate", (v) => e(v) + "%"],
          ["basis_minor", "Eligible USD", money],
          ["bonus_minor", "Projected USD", money],
        ])}`
      : ""
  }${
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


export function partnerDashboard({links,accounting,earnings,premiumReferrals,summary,awaitingAllocations},{e,money,table,notice,date,heading,metric}){
 const a=accounting.unavailable?null:accounting,plans={premium:'Three-Month Premium · $1.80',starter:'Starter artist package · $6/year',growth:'Growth artist package · $10/year',professional:'Premium artist package · $20/year'};
 const cards=Object.entries(plans).filter(([key])=>links.links[key]).map(([key,label])=>`<article class="panel"><h3>${label}</h3><label>${key==='premium'?'Premium referral link':'Artist referral link'}<input readonly value="${e(links.links[key])}" aria-label="${key==='premium'?'Premium referral link':e(label)+' referral link'}"></label><button type="button" class="button ${key==='premium'?'':'secondary'}" data-copy="${e(links.links[key])}">${key==='premium'?'Copy Premium link':'Copy artist link'}</button></article>`).join('');
 return heading('YOUR REFERRALS','Your referral links and earnings','Premium: 20% direct earnings and a 10% team bonus every three months.')+
 `<div class="metrics">${metric('DIRECT PURCHASES',a?a.rollup.direct.eligible_sales:'—','This quarter')}${metric('DIRECT EARNINGS',a?money(a.rollup.direct.recorded_commission_minor):'—','This quarter')}${metric('TEAM PURCHASES',a?a.rollup.team.eligible_sales:'—','People invited by your referrals')}${metric('TEAM BONUS BUILDING',a?money(a.team_projection_minor):'—','Counted at the end of the quarter')}</div>`+
 `<p><a class="button secondary" href="/partners?tab=finance" data-nav>Earnings &amp; withdrawals</a></p><section><h2>Your sharing links</h2><div class="draft-grid">${cards}</div><p>Artist-package commissions are still being reviewed.</p><p id="partner-copy-status" role="status" aria-live="polite"></p></section>`+
 (a?`<section class="panel"><h2>Your team's purchases</h2>${a.team_by_referrer.length?table(a.team_by_referrer,[['referrer_name','Invited by'],['eligible_sales','Purchases'],['eligible_minor','Sales',money]]):'<p>No team purchases yet.</p>'}<p>Refunded purchases do not earn a bonus. Payments sent to your bank are shown separately.</p></section>`:notice('Your sales could not be loaded. Please refresh.'))+
 `<details class="panel"><summary>Full statements and earlier records</summary>${partnerAccountingPanel(accounting,{e,money,table,notice,date})}<h2>Monthly sales</h2>${table(summary.monthly,[['month','Month',date],['sales','Sales']])}<h2>Earlier direct earnings</h2>${table(earnings.history,[['artist_name','Customer'],['plan','Package'],['amount_cents','Earnings',money],['status','Status'],['created_at','Date',date]])}<h2>Premium earnings</h2>${table(premiumReferrals.commissions,[['level','Referral level'],['amount_minor','Earnings',(v,row)=>money(v,row.currency)],['status','Status'],['created_at','Date',date]])}<h2>Artist purchases awaiting commission rules</h2>${table(awaitingAllocations.purchases,[['product_plan','Package'],['gross_minor','Purchase',money],['verified_at','Date',date]])}</details>`;
}
export function bindPartnerCopies(root,toast){
 root.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{
  let copied=false;try{await navigator.clipboard.writeText(button.dataset.copy);copied=true;}catch{const input=button.closest('article')?.querySelector('input');if(input){input.select();try{copied=document.execCommand('copy');}catch{}}}
  const text=copied?'Link copied.':'Select the link and copy it.';const status=root.querySelector('#partner-copy-status');if(status)status.textContent=text;toast(text,!copied);
 });
}
