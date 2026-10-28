"use strict";
const assert = require("node:assert/strict");
exports.createBrowserReconciliationFixture = () => {
  let review = null;
  let lookups = 0;
  const history = [],
    base = "/api/platform/admin/reconciliation",
    at = new Date().toISOString();
  const source = (currency) => ({
    kind: "withdrawal",
    source_id: currency === "NGN" ? "501" : "500",
    status: "pending",
    provider: "unconfigured",
    mode: "ledger",
    currency,
    amount_minor: currency === "NGN" ? "20000" : "1234",
    charge_currency: null,
    charge_minor: null,
    reference: "fixture-withdrawal-" + currency,
    issue_at: at,
    attention: true,
    reason: "Independent settlement evidence is outstanding.",
    destination: "/admin/console?section=withdrawals",
  });
  return {
    async handle(p, request, data, url, send, route) {
      if (p !== base && !p.startsWith(base + "/")) return false;
      if (p.endsWith("/verify-source")) {
        assert.equal(data.kind, "artist_checkout");
        assert.equal(data.source_id, "f0000000-0000-4000-8000-000000000002");
        assert(!("owner_id" in data));
        lookups++;
        await send({ another_charge_requested: false });
        return true;
      }
      if (
        p.endsWith("/source") &&
        url.searchParams.get("kind") === "artist_checkout"
      ) {
        await send({
          source: {
            ...source("USD"),
            kind: "artist_checkout",
            source_id: "f0000000-0000-4000-8000-000000000002",
            status: "review",
            provider: "paystack",
            mode: "test",
            reference: "fixture-original-checkout",
            destination: "/admin/console?section=checkouts",
          },
          review: null,
          history: [],
          attention: true,
        });
        return true;
      }

      const currency = url.searchParams.get("currency") || "USD";
      if (p === base)
        await send({
          currency,
          mode: url.searchParams.get("mode") || "all",
          totals:
            currency === "USD"
              ? [
                  {
                    product: "listener",
                    mode: "test",
                    currency: "USD",
                    count: "2",
                    gross_minor: "120",
                  },
                  {
                    product: "listener",
                    mode: "live",
                    currency: "USD",
                    count: "1",
                    gross_minor: "60",
                  },
                ]
              : [],
          trend:
            currency === "USD"
              ? [
                  { day: "2026-10-24", mode: "test", gross_minor: "60" },
                  { day: "2026-10-25", mode: "test", gross_minor: "60" },
                  { day: "2026-10-25", mode: "live", gross_minor: "60" },
                ]
              : [],
          attention: [
            {
              kind: "withdrawal",
              mode: "ledger",
              currency,
              count: "1",
              amount_minor: source(currency).amount_minor,
            },
          ],
          ledger_accounts: [
            {
              account: "artist:7:held:" + currency,
              currency,
              balance_minor: source(currency).amount_minor,
            },
          ],
          recent_reviews: review ? [review] : [],
          live_payments_enabled: false,
          payouts_enabled: false,
          notice:
            "Isolated browser records. Gross receipts and reserved ledger balances are not proof of bank settlement.",
        });
      else if (p.endsWith("/queue"))
        await send({
          currency,
          mode: "all",
          rows: [{ ...source(currency), review_status: review?.status }],
          next_cursor: null,
        });
      else if (p.endsWith("/source"))
        await send({
          source: source("USD"),
          review,
          history: [...history].reverse(),
          attention: true,
        });
      else if (p.endsWith("/ledger.csv"))
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              'attachment; filename="lae-ledger-' + currency + '.csv"',
          },
          body: '"currency","amount_minor"\r\n"' + currency + '","1234"\r\n',
        });
      else if (p.endsWith("/ledger"))
        await send({
          currency,
          days: 30,
          rows: [
            {
              id: "1",
              reference: "fixture-reserve-" + currency,
              kind: "withdrawal_reserve",
              currency,
              amount_minor: source(currency).amount_minor,
              debit_account: "artist:7:earned:" + currency,
              credit_account: "artist:7:held:" + currency,
              created_at: at,
            },
          ],
          truncated: false,
          notice:
            "Fixture ledger records only. No bank settlement is inferred.",
        });
      else if (p.endsWith("/review")) {
        assert.equal(data.kind, "withdrawal");
        assert.equal(data.source_id, "500");
        assert.equal(data.revision, review?.revision || 0);
        assert(["claim", "note", "wait"].includes(data.action));
        assert(data.note.length >= 10);
        assert(request.headers()["idempotency-key"]);
        assert(!("amount_minor" in data));
        review = {
          id: "f0000000-0000-4000-8000-000000000001",
          source_kind: data.kind,
          source_id: data.source_id,
          status: data.action === "wait" ? "waiting_external" : "in_review",
          assigned_actor: "operator:b0000000-0000-4000-8000-000000000001",
          revision: data.revision + 1,
          updated_at: at,
        };
        history.push({
          ...review,
          action: data.action,
          actor: review.assigned_actor,
          note: data.note,
          created_at: at,
        });
        await send({ review, financial_records_changed: false });
      } else await send({ error: "Unknown reconciliation fixture" }, 405);
      return true;
    },
    lookupCount: () => lookups,
  };
};
exports.verifyBrowserReconciliation = async ({
  page,
  label,
  auditAccessibility,
}) => {
  await page.getByRole("link", { name: "Reconciliation", exact: true }).click();
  await page
    .getByRole("heading", { name: "Reconcile with confidence.", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Review withdrawal", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Withdrawal review", exact: true })
    .waitFor();
  const panel = page.locator("#reconciliation-detail");
  await panel
    .getByLabel("Review note", { exact: true })
    .fill(
      "Checked the immutable reserve. <img src=x onerror=alert(1)> External evidence remains missing.",
    );
  await panel
    .getByRole("button", { name: "Record review", exact: true })
    .click();
  await page.locator("#reconciliation-detail .review-note").waitFor();
  await panel.getByText("Permanent review history", { exact: true }).waitFor();
  await panel
    .getByText(
      "Checked the immutable reserve. <img src=x onerror=alert(1)> External evidence remains missing.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await panel.locator("img").count(), 0);
  await panel.getByLabel("Review action", { exact: true }).selectOption("wait");
  await panel
    .getByLabel("Review note", { exact: true })
    .fill("Waiting for the approved independent provider settlement evidence.");
  await panel
    .getByRole("button", { name: "Record review", exact: true })
    .click();
  await panel
    .getByText(
      "Waiting for the approved independent provider settlement evidence.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await panel
      .getByRole("option", { name: "Resolve this review", exact: true })
      .count(),
    0,
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await auditAccessibility(page, label + "-reconciliation");
  await page.screenshot({
    path: "artifacts/" + label + "-reconciliation.png",
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Export USD ledger CSV", exact: true })
    .click();
  const reportDownload = await download;
  assert.equal(reportDownload.suggestedFilename(), "lae-ledger-USD.csv");
  assert(
    (
      await require("./browser-export-server.cjs").downloadText(reportDownload)
    ).includes('"USD","1234"'),
  );
  const form = page.locator("#reconciliation-filters");
  await form
    .getByLabel("Accounting currency", { exact: true })
    .selectOption("NGN");
  await form
    .getByRole("button", { name: "Filter records", exact: true })
    .click();
  await page.getByText("fixture-withdrawal-NGN", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("fixture-withdrawal-USD", { exact: true }).count(),
    0,
  );
  await page.goto(
    new URL(
      "/admin/console?section=reconciliation&source_kind=artist_checkout&source_id=f0000000-0000-4000-8000-000000000002",
      page.url(),
    ).href,
  );
  await page
    .getByRole("heading", { name: "Artist checkout review", exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Verify original provider record",
      exact: true,
    })
    .click();
  await page
    .getByText("Provider lookup finished. Review the current source state.", {
      exact: true,
    })
    .waitFor();
};
