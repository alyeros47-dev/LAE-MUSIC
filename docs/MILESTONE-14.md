# Milestone 14 — Approved USD listener pricing and international checkout

**Candidate 0.14.0-rc.14; draft PR #6, no merge or Render deployment.** This continues the existing website and preserved working directory after the execution connection recovered. It supersedes Milestone 13's NGN-only listener price/checkout policy. Migrations 001–013 and historical records remain unchanged.

## Approved fixed prices

| Premium Listener plan | Official USD base price | Duration | Original NGN reference |
| --- | ---: | --- | ---: |
| Daily | $0.08 | 24 hours | ₦100 |
| Weekly | $0.23 | 7 days | ₦300 |
| Monthly | $0.60 | 30 days | ₦800 |
| Two months | $1.21 | 60 days | ₦1,600 |
| Annual | $5.88 | 365 days | ₦7,800 |

The owner explicitly approved these five USD prices in this conversation on October 25, 2026. The reference feed was retrieved over HTTPS and validated with the existing application's base/freshness/update-window checks: ExchangeRate-API, **₦1,325.718117 per USD**, snapshot October 24, 2026, 5:02:31 p.m. PDT (`2026-10-25T00:02:31Z`). Each reference was rounded once to the nearest USD cent, half up. The raw public response and SHA-256 are preserved in `data/premium-price-reference-2026-10-25.json` and `config/premium-listener-pricing.json`.

USD prices are now fixed commercial terms. Rate refreshes change local equivalents only; they never regenerate or silently reapprove base prices. A new price revision needs a separate explicit approval. The catalog validates approval evidence and stores its hash with each immutable order. A pending/malformed approval cannot create a purchase record. Artist prices, upload/generation quotas, extra-service prices, artist-package affiliate percentages, universal 50% streaming policy and 3% withdrawal fee remain unchanged.

## One currency and quote system

Premium is part of the existing `/api/platform/pricing` product catalog, using `lib/exchange-rates.js`, `lib/currency.js`, the shared `CurrencyDisplay`, country choices and persisted display preference. There is no second NGN cross-rate calculator. Browser regional defaults and the manual country/currency selector cover Nigeria/NGN, Ghana/GHS, Kenya/KES, Liberia/LRD and the other existing supported options.

The existing trusted daily USD feed retains its 36-hour maximum age, bounded responses, timeouts, update-window checks, single in-flight fetch, retry backoff and fresh-cache fallback. Missing/stale rates cannot produce a local quote; USD remains a supported alternative only where the reviewed merchant actually permits it. Zero-, two- and three-decimal currency rounding uses integer/rational arithmetic. A checkout amount must round-trip to the fixed USD order price, otherwise another supported payment currency is required.

Artist and listener purchases use the same `payment_checkout_quotes` table and `insertQuote` conversion function. Migration 014 adds a distinct listener-order foreign key with an exactly-one-product constraint; existing artist rows retain their original references and amounts. Listener quotes bind the approved USD order, provider, local amount, rate snapshot and five-minute expiry. The listener sees the exact final amount, USD base, rate timestamp and quote expiry **before** creating a payment reference.

Gateway options come from the reviewed merchant account and adapter, not the display-currency list. An unsupported preferred currency receives explicit alternatives. Display support does not promise charge support. Paystack's existing NGN/USD minimum rules are enforced; the smaller approved USD products fall below Paystack's $2 USD minimum and require another eligible currency/provider. No local-currency capability or minimum is assumed for an unverified account. The merchant is still the selected Nigerian merchant; customers and the website are international.

## Accounting and ownership

New listener orders, pending commissions and royalty recognition use USD. `premium_presentments` separately preserves the original amount/currency, fixed USD amount/equivalent, snapshot ID, exact rate, conversion timestamp and verification time. Deferred database checks require this evidence for a USD receipt. Immutable quote/attempt/owner bindings, independent provider retrieval, signature checks and one permanent attempt still prevent duplicate charges, wrong-currency fulfillment, provider failover after uncertain acceptance and cross-account access.

Actual local fees/taxes are normalized **once at the original quote's rate**, not at a later display rate. `premium_cost_conversions` retains raw amounts/currency plus normalized amounts and evidence. Foreign keys and triggers bind it to the immutable cost version, receipt currency and original presentment. Base-currency costs cannot be converted twice. Monthly recognition consumes these stored USD figures rather than applying FX during royalty allocation.

Full verified refunds reverse the original USD basis and preserve the actual refunded local currency/amount and original rate in `premium_refund_presentments`. The statement/refund adjustments remain append-only; pending commissions reverse once. For low-cent products, commission minor units follow existing rounding, zero amounts do not create fictional payouts and the combined direct/indirect total is capped at 15%. For example, an eight-cent Daily pass records a one-cent direct commission and a zero-cent indirect amount. No missing beneficiary or registration earns money.

Historical NGN receipts, old in-flight quoted references, entitlements, statement hashes and ledger identifiers are preserved. They remain a separate legacy NGN book, explicitly selectable in artist/admin reports. New purchases cannot create another NGN base contract. USD and legacy NGN revenue, streams, adjustments and withdrawal recovery guards are kept separate; no history is repriced or relabeled. Reporting and read-only preflight include conversion integrity.

## Cash and deployment boundary

Price approval does **not** enable live payments. The existing staging-only Paystack/Flutterwave runtime and reviewed merchant manifest are retained; the committed manifest is disabled. No production checkout toggle, verified provider settlement adapter, actual affiliate clearance or bank payout is activated.

The cash-release service requires matching independently verified settlement in the statement currency. An original local charge cannot become USD cash through its display/booking rate: cross-currency cash release is rejected until independently verified treasury conversion evidence and a reviewed implementation exist. This prevents a successful charge or estimated conversion from creating spendable cash. Same-currency settlement/recovery retains its existing isolated test coverage. Partial/dispute outcomes and generic post-finalization corrections still need reconciliation workflows.

## Executed verification

- **140 application tests**, plus 25 mocked Sonic cases and 31 source invariants.
- **133 actual PostgreSQL 16 checks** on our disposable loopback fixture. New journeys cover approval/price snapshots, shared quotes and ownership, actual Paystack and Flutterwave adapters with simulated remote responses, NGN/GHS/KES charges, LRD alternatives, expiry, original-currency receipts/costs/refunds, low-cent commissions, legacy NGN preservation, separate monthly pools, recovery and rejection of unsupported treasury conversion.
- **One socket HTTP and four actual Nodemailer/loopback-TLS checks** pass. Desktop/tablet/mobile Chromium journeys cover country/currency selection, pending approval/closed gateway states, final-amount review, original payment verification and the existing connected website/player journeys.
- A read-only preflight on the populated test database found no missing/drifted migrations or guards and zero commerce, ledger, receipt, FX-conversion, royalty-statement or cash-release discrepancies. Overall deployment status correctly remains blocked.
- A separate real public-feed call through the application's shared pricing service passed for NG/GH/KE/LR. At that dated rate, the $0.60 monthly product displayed NGN 795.43, GHS 7.00, KES 77.90 and LRD 102.37. These are dated estimates, not additional fixed prices. Managed-environment fetch used its inherited proxy/trust configuration.

Payment, storage, music, treasury and browser fixtures are simulated; PostgreSQL execution, Chromium rendering, socket HTTP, local SMTP/TLS and the separately identified public FX fetch are real executions. No live merchant, bank, production clone, production Render trust, physical device or complete assistive-technology review is claimed. The currency integration commit `eb3a4cbcd53f778635578cc54e1cf60bba338339` passed [CI run 40245909162](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40245909162), including 140 application / 133 PostgreSQL checks and all browser sizes. Condensed evidence is in `artifacts/ci-international-currency.txt`; final-head follow-up CI is recorded on PR #6.

## Remaining website work

Paid-download USD pricing/revenue split needs an owner decision before checkout/earnings can be completed. Provider-specific live settlement/payout and commission clearance, partial/dispute reconciliation, generic finalized corrections, outside media/email/music integration, production-schema upgrade/load/recovery and accessibility/device verification remain tracked in FEATURE-STATUS.md. No deployment-ready announcement is justified.

## Accessibility follow-through

A pinned development-only axe/Playwright dependency now runs 27 automated accessibility audits in the existing three-viewport browser journeys. It found duplicate unnamed navigation landmarks, unnamed dialogs and skipped heading levels in purchase/empty states. The shared navigation now has distinct names; player/currency/payment dialogs have accessible names; changing modal contents updates the heading reference; purchase and empty-state headings retain a valid hierarchy and their visual style. Keyboard checks verify Escape/focus return and the current final-payment dialog name.

All 27 local scans pass with zero automated violations across nine surfaces in each viewport: discovery, unavailable/active Premium, country/final-payment dialogs, artist/admin royalties, queue and expanded player. Results are in `artifacts/accessibility-local-results.txt`; full JSON reports are included in CI browser artifacts. Axe reports incomplete color-contrast checks for manual review. Physical-device and full assistive-technology/keyboard review remain deployment gates. These audits cannot certify the entire site or audio accessibility.
