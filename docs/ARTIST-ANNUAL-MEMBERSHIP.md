# Annual artist memberships — development implementation

Implemented on `codex/affiliate-purchase-year`, preserving its existing work and integrating the already-deployed publishing/playback fixes. Production is unchanged. The subsequent approved affiliate framework supersedes the earlier proposal: all new commission allocations are held, while historical earned records remain intact. See `AFFILIATE-REVENUE-FRAMEWORK.md`.

## Approved annual products

| Customer name | Existing internal ID | USD/year | Generations | Included track slots |
| --- | --- | ---: | ---: | ---: |
| Starter | starter | 6 | 3 | 6 |
| Growth | growth | 10 | 6 | 12 |
| Premium | professional | 20 | 15 | 30 |

One existing MusicAPI generation reservation still produces two independently identified tracks, each with a separate account-linked, one-use upload code. Provider acceptance, failure restoration, task recovery, original-audio fingerprints, voice and Gospel Music DNA are preserved. No real generation is part of these tests.

New purchases snapshot the annual quotas. Existing paid subscriptions and already-prepared orders keep their historical entitlements (including the old Starter seventh track slot) until the next new purchase/renewal. Unused purchased generations are not forfeited: renewal is required to use them after expiry. Newly purchased generations add two publication slots in the term of purchase or use. Included quotas reset with each annual term.

## Configurable additional-generation prices

`config/artist-membership.json` contains the proposed prices: Starter $2.00, Growth $1.80, Premium $1.50. `additional_generation_prices.approved` is **false**. They are shown as proposals, not applied to charges. Existing prices ($3.00/$2.50/$2.00) remain effective until approval. The same price function is used by product quotes, currency displays and demo product amounts. No discounts or additional charges were introduced.

## Renewal and consent

- `/workspace?tab=membership`: status, dates, history, creator agreement and royalty renewal.
- `/creator-agreement`: public, read-only agreement.
- The current agreement is stored in `config/music-creator-agreement.json`. Acceptance requires an unchecked explicit checkbox; the account, version, full-content hash, full document and timestamp are retained immutably. A new document/version requires fresh acceptance for new creation/publication. Acceptance alone never authorizes a payment.
- Royalty renewal requires a separate unchecked confirmation showing the exact USD price. Each renewal has an immutable, account-bound consent record and balanced ledger transfer, purchase receipt and audit entry. There is **no recurring or background deduction**.
- Only funded, available USD streaming royalties can be used. Pending/projected/test earnings, gifts, affiliate credits, held funds and withdrawal reservations are excluded. Other spending is deducted conservatively; no currency conversion or top-up is attempted.
- Renewal and withdrawal use the same creator lock. Repeated requests replay the same result; a failed transaction rolls back funds, entitlement and receipt together.
- Early renewal starts after the active paid term; expiry renewal starts on fulfillment. February 29 anniversaries clamp to February 28. A second future royalty-funded term is rejected.
- Internal royalty-funded receipts are excluded from external cash-collection reconciliation totals. They remain visible in purchase/accounting history. Existing commission snapshot/booking functions are reused; no rates, payout approvals or final distribution rules change. Existing affiliate-qualification rules are untouched.

## Expiry and reminders

Dashboard, catalog, analytics, saved draft previews/downloads, royalty records and earned funds remain available after expiry. Published tracks are neither removed nor deactivated by membership expiry. New generation and publication require an active paid membership and the current agreement; direct API requests cannot bypass this. Expired paid members cannot fall back to complimentary testing access.

The existing notification worker supplies deduplicated **in-app** 30-day, 7-day, 1-day and expired reminders and suppresses reminders when a contiguous renewal is scheduled. It does not send email or charge funds.

## Migration and release

`028-annual-artist-memberships.sql` is additive. It retains original orders, balances, songs, audio, accounts and prior migration checksums. A supplement snapshots historical order terms without modifying immutable purchase records. Agreement, order-term and deduction history have database immutability triggers and owner-linked foreign keys.

Run the migration first in isolated staging/recovery rehearsal before an approved release. A rollback build must retain the migration inventory and accept the added schema; the old migration runner deliberately rejects unknown later migrations. Do not drop these tables or downgrade the live schema to roll back code.

Production purchase gateways and independent live royalty-cash funding remain subject to their existing operational setup. This work does not connect a gateway or turn projected royalties into spendable funds. A zero eligible balance is expected until independent funding is available.

## Verification commands

- `npm run test:membership`
- `LAE_DB_TESTS=true DATABASE_URL=<disposable local lae_music_ci URL> npm run test:membership:postgres`
- `npm run test:membership:browser`
- Existing focused commerce/access/publishing/notifications/currency/reconciliation tests.
- `npm run test:upgrade` against the guarded disposable local database.

All provider/audio/payment interactions in membership tests are fixtures; no customer accounts, production data, paid credits or API secrets are used. Full catalogue research and voice/language audits are not repeated.

## Release status

Implementation is for review and staging. Before production: review the creator agreement and the pending branch scope, complete approved staging migration/payment/funded-royalty verification, and obtain explicit deployment approval. Proposed extra-generation price approval is separate; current prices remain until then. No merge or deployment is performed by this task.

## Completed local verification

- 73 focused unit checks: passed (membership, purchase quotes, agreement, renewal arithmetic, price approval, reconciliation, access, publishing, currency and reminders).
- New disposable PostgreSQL membership and migration suites: passed, including real reservation code for all 3/6/15 quotas, independent track codes, exact one-time deduction consent, signed-in HTTP renewal, concurrent retry/withdrawal protection and transaction rollback.
- Existing paid-access PostgreSQL checks (7), controlled publishing checks (7) and populated historical upgrade checks (11): passed.
- Chromium at 390px and 1440px: agreement and renewal workflow, package selection, expiry/dashboard access and publishing UI passed, with no accessibility violations in the membership screen.
- 31 mocked Sonic handler checks and 31 static reservation invariants: passed. Existing voice/storage handler regression checks passed with fixtures, without training a real voice.

Live merchant payments, live independent royalty funding and production migration have not been exercised. Those remain release/integration checks, not claimed as passed.

The existing core PostgreSQL compatibility suite also passed all 249 checks after the package-quota fixtures were updated. Held membership payments prevent royalty deductions until review is resolved.

Hosted checks also verified persistence across container replacement with the new agreement step: same account/password/audio, unchanged database secret, retained test budget and zero real provider calls. The current catalogue HTTP smoke check passes. General Chromium customer/admin journeys passed 53 accessibility audits at desktop, tablet and mobile sizes; social-sign-in and referral-demo fixtures were aligned with the existing catalogue and retained dashboard access, without changing product or commission rules.

## Payment and lyrics integration supplement — November 5, 2026

Authenticated manual transfers support all packages, renewals and currently priced extra generations. New customers may pay before registration through the same bank review system. Approved invoices activate only once for the matching registered email/role. Agreement acceptance remains a separate explicit step before Studio access. Each verified active annual purchase also funds 3/6/15 companion lyrics drafts; a verified extra generation funds one. These are attributed to the source purchase, respect holds/refunds and restore once on failed text requests. Historical balances remain recorded. Payment does not synthesize funded royalties or activate unapproved affiliate payouts.
