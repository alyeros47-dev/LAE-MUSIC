export function securityTotals(rows) {
  return rows.reduce(
    (n, r) => ({
      allowed: n.allowed + BigInt(r.allowed),
      blocked: n.blocked + BigInt(r.blocked),
    }),
    { allowed: 0n, blocked: 0n },
  );
}
function plot(rows, e) {
  const byHour = new Map();
  for (const r of rows) {
    const hour = new Date(r.hour).toISOString(),
      n = byHour.get(hour) || { hour, allowed: 0n, blocked: 0n };
    n.allowed += BigInt(r.allowed);
    n.blocked += BigInt(r.blocked);
    byHour.set(hour, n);
  }
  const data = [...byHour.values()].sort((a, b) =>
    a.hour.localeCompare(b.hour),
  );
  if (!data.length)
    return "<p>No budget checks are recorded for this period.</p>";
  const maximum = data.reduce((m, r) => {
      const largest = r.allowed > r.blocked ? r.allowed : r.blocked;
      return largest > m ? largest : m;
    }, 1n),
    point = (r, i, key) =>
      (30 + (i * 840) / Math.max(1, data.length - 1)).toFixed(1) +
      "," +
      (205 - (Number((r[key] * 10000n) / maximum) / 10000) * 165).toFixed(1);
  return `<svg class="activity-plot" viewBox="0 0 900 250" role="img" aria-label="Admitted and limited budget checks by UTC hour"><title>Budget pressure by UTC hour</title><line x1="30" x2="870" y1="205" y2="205" class="plot-axis"/><text x="30" y="25">${e(maximum.toLocaleString())} checks</text><polyline points="${data.map((r, i) => point(r, i, "allowed")).join(" ")}" class="plot-line"/><polyline points="${data.map((r, i) => point(r, i, "blocked")).join(" ")}" class="plot-line plot-limited"/>${data
    .map((r, i) => {
      const [x, y] = point(r, i, "allowed").split(",");
      const [, blockedY] = point(r, i, "blocked").split(",");
      return `<circle cx="${x}" cy="${y}" r="4" class="budget-admitted"/><circle cx="${x}" cy="${blockedY}" r="4" class="budget-limited"/>`;
    })
    .join(
      "",
    )}<text x="30" y="240">${e(data[0].hour.slice(5, 16).replace("T", " "))} UTC</text><text x="870" y="240" text-anchor="end">${e(data.at(-1).hour.slice(5, 16).replace("T", " "))} UTC</text></svg><p><span class="badge">Lime · admitted</span> <span class="badge">Lavender · limited</span></p><details><summary>Read hourly budget counts</summary>${data.map((r) => `<p>${e(new Date(r.hour).toLocaleString())} · ${e(r.allowed.toLocaleString())} admitted · ${e(r.blocked.toLocaleString())} limited</p>`).join("")}</details>`;
}
export async function requestSecurityPage(view, intro, ctx, url) {
  const { api, e, notice, bindForm, navigate } = ctx,
    days = [1, 7, 30].includes(Number(url.searchParams.get("days")))
      ? Number(url.searchParams.get("days"))
      : 1;
  const report = await api("/api/platform/admin/request-security?days=" + days),
    totals = securityTotals(report.groups),
    names = new Map(report.policies.map((p) => [p.id, p.label]));
  const table = (rows, columns, label) =>
    ctx
      .table(rows, columns)
      .replace(
        /<div class="scroll"[^>]*>/,
        '<div class="scroll" tabindex="0" role="region" aria-label="' +
          e(label) +
          '">',
      );
  const proxyText =
    report.proxy.state === "configured"
      ? "Trusted proxy ranges configured"
      : report.proxy.state === "invalid"
        ? "Proxy configuration needs correction"
        : "Socket addresses only";
  const bySource = report.groups.reduce((sum, r) => {
    sum[r.client_source] =
      (sum[r.client_source] || 0n) + BigInt(r.allowed) + BigInt(r.blocked);
    return sum;
  }, {});
  if (
    !view.set(
      intro +
        `<section class="profile-hero"><div><span class="eyebrow">REQUEST SECURITY</span><h2>Protection, in view.</h2><p>Watch technical request pressure across accounts and public access without storing raw client addresses in these counters.</p><span class="badge">${e(report.shared_across_instances ? "Shared database limits" : "Development · process memory")}</span></div></section>` +
        notice(report.notice) +
        `${report.proxy.state !== "configured" ? notice(report.proxy.state === "invalid" ? "Correct TRUSTED_PROXY_CIDRS before relying on forwarded addresses. Client headers remain untrusted." : "Forwarded addresses are ignored until exact trusted hosting proxy ranges are configured. Verify the real hosting path before production.", true) : ""}${report.storage_degraded ? notice("The request-budget store needs operational review. Protected requests may be temporarily unavailable.", true) : ""}${report.aggregate_history_truncated ? notice("Development aggregate history is bounded; older entries were omitted.", true) : ""}<form id="request-security-period" class="row-actions"><label>Security period<select name="days" aria-label="Security period">${[1, 7, 30].map((d) => `<option value="${d}" ${d === days ? "selected" : ""}>Last ${d} ${d === 1 ? "day" : "days"}</option>`).join("")}</select></label><button type="submit" class="button secondary">Refresh protection report</button></form><div class="metrics"><div class="metric"><span>ADMITTED BUDGET CHECKS</span><strong>${e(totals.allowed.toLocaleString())}</strong></div><div class="metric"><span>LIMITED BUDGET CHECKS</span><strong>${e(totals.blocked.toLocaleString())}</strong></div><div class="metric"><span>CLIENT ADDRESS HANDLING</span><strong>${e(report.proxy.state === "configured" ? "Configured" : report.proxy.state === "invalid" ? "Review setup" : "Socket only")}</strong><small>${e(proxyText)} · ${e(report.proxy.trusted_proxy_ranges)} ranges · other client headers ignored</small></div><div class="metric"><span>ACCOUNT ACCESS</span><strong>Enforced</strong><small>Existing role and ownership checks apply. Account budgets follow verified identities across sessions.</small></div></div><div class="two-column"><section class="panel"><h2>Budget pressure over time</h2>${plot(report.windows, e)}</section><section class="panel"><h2>Client address sources</h2>${table(
          Object.entries(bySource).map(([source, count]) => ({
            source,
            count: count.toString(),
          })),
          [
            ["source", "Address source"],
            ["count", "Budget checks"],
          ],
          "Client address source totals",
        )}<p>Network and verified account checks are separate. Counts are not unique listeners or proof of fraud.</p><h3>Free listening stays public.</h3><p>Playing music does not require registration. Provider webhooks keep their signature, size and independent-verification checks without these request-budget limits.</p></section></div><section class="panel"><h2>Limits by operation</h2><p>Technical limits protect the service; they do not replace subscription allowances, studio credits or financial checks.</p>${table(
          report.policies,
          [
            ["label", "Operation"],
            ["network_limit", "Network budget"],
            [
              "account_limit",
              "Verified account budget",
              (v) => v || "Existing controls",
            ],
            ["window_seconds", "Window in seconds"],
          ],
          "Technical request policies",
        )}</section><section class="panel"><h2>Observed budget checks</h2>${table(
          report.groups,
          [
            ["rule", "Operation", (v) => names.get(v) || v],
            ["subject_kind", "Scope"],
            ["client_source", "Identity source"],
            ["allowed", "Admitted"],
            ["blocked", "Limited"],
          ],
          "Observed request budget groups",
        )}<p>Raw addresses and session tokens are not returned. Expired budget records are removed in bounded cleanup batches after a 24-hour grace period; aggregate counters retain ${e(report.retention.metric_days)} days. Financial records and permanent security audits are untouched.</p></section>`,
    )
  )
    return;
  bindForm(
    document.getElementById("request-security-period"),
    async (values) => {
      const target = new URL(url);
      target.searchParams.set("days", values.days);
      navigate(target.pathname + target.search);
    },
  );
}
