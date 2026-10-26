"use strict";
const assert = require("node:assert/strict"),
  { POLICIES } = require("../lib/request-policy");
exports.requestSecurityBrowserFixture = async (p, url, send) => {
  if (p !== "/api/platform/admin/request-security") return false;
  assert([1, 7, 30].includes(Number(url.searchParams.get("days"))));
  const hour = new Date(
    Math.floor(Date.now() / 3600000) * 3600000,
  ).toISOString();
  await send({
    mode: "shared_database",
    shared_across_instances: true,
    storage_degraded: false,
    aggregate_history_truncated: false,
    proxy: {
      state: "configured",
      trusted_proxy_ranges: 1,
      other_client_headers_ignored: true,
    },
    policies: Object.values(POLICIES).map((p) => ({
      id: p.id,
      label: p.label,
      network_limit: p.client_max,
      account_limit: p.actor_max,
      window_seconds: p.seconds,
    })),
    retention: { expired_bucket_grace_hours: 24, metric_days: 31 },
    days: Number(url.searchParams.get("days")),
    groups: [
      {
        rule: "artist_login",
        subject_kind: "network",
        client_source: "trusted_forwarded",
        allowed: "20",
        blocked: "1000",
      },
      {
        rule: "studio_write",
        subject_kind: "account",
        client_source: "account",
        allowed: "30",
        blocked: "2",
      },
    ],
    windows: [
      {
        hour: new Date(Date.parse(hour) - 3600000).toISOString(),
        subject_kind: "network",
        allowed: "20",
        blocked: "0",
      },
      { hour, subject_kind: "network", allowed: "0", blocked: "1000" },
      { hour, subject_kind: "account", allowed: "30", blocked: "2" },
    ],
    notice:
      "Isolated budget-check fixtures. Network and account checks are separate; these counts are not people or proof of fraud.",
  });
  return true;
};
exports.verifyRequestSecurityBrowser = async ({
  page,
  label,
  auditAccessibility,
}) => {
  await page.getByRole("link", { name: "Protection", exact: true }).click();
  await page
    .getByRole("heading", { name: "Protection, in view.", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Free listening stays public.", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator("#page")
      .getByText(/198\.51\.100\./)
      .count(),
    0,
  );
  const points = await page.locator(".plot-limited").getAttribute("points");
  for (const point of points.split(" ")) {
    const [x, y] = point.split(",").map(Number);
    assert(
      x >= 0 && x <= 900 && y >= 0 && y <= 250,
      "a blocked-heavy series must stay inside the plot",
    );
  }
  await page
    .getByRole("region", { name: "Technical request policies", exact: true })
    .focus();
  assert(
    await page.evaluate(
      () =>
        document.activeElement.getAttribute("aria-label") ===
        "Technical request policies",
    ),
  );
  await page.getByLabel("Security period", { exact: true }).selectOption("7");
  await page
    .getByRole("button", { name: "Refresh protection report", exact: true })
    .click();
  await page.waitForURL(/days=7/);
  await page
    .getByRole("heading", { name: "Protection, in view.", exact: true })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await auditAccessibility(page, label + "-request-protection");
  await page.screenshot({
    path: "artifacts/" + label + "-request-protection.png",
    fullPage: true,
  });
};
