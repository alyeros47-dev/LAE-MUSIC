# Purchase-qualified affiliate access and one-year commissions

> Historical policy/testing record, superseded for new receipts by `AFFILIATE-REVENUE-FRAMEWORK.md` (2026-11-05). New individual commissions are held, qualification no longer expires with the subscription, and obsolete customer commission demos are hidden. Previously earned contracts remain preserved.

Status: implemented for review; not merged or deployed. No production database, environment setting, payment gateway or customer balance has been changed.

## Approved behavior

- A verified artist package from $6, or a qualifying Premium purchase of at least 90 days, opens affiliate access. The new Three-Month Premium product is $1.80 for 90 days. Existing Premium prices remain unchanged; the existing annual product also qualifies.
- The affiliate's own qualifying payment verification timestamp starts one calendar year of eligibility. This is separate from the product's listening/artist-service term. A one-month renewal does not extend the affiliate year; another verified qualifying purchase can open a new year from its own payment timestamp.
- During that year, actual eligible referred purchases and Premium renewals of any duration earn commissions. Registration, inviting someone, selecting an unpaid plan, trial credits and demo purchases do not qualify or create earnings.
- New Premium contracts: 20% direct; 10% quarterly team benefit at exactly two steps. Artist direct rates stay Starter 15%, Growth/Professional 25%. Extra studio generations retain zero direct commission and 10% eligible two-step team performance.
- Direct recipients and two-step leaders qualify independently at payment verification. A qualified leader's legitimate volume is not lost because the intervening direct referrer is unqualified.
- Premium renewals retain the original verified referral without needing another link click. The new partner identity created from a qualifying listener purchase inherits that verified sponsor, so its second-step lineage is retained. Previously prepared contracts retain their own immutable referral snapshot.
- Quarter boundaries remain Jan–Mar, Apr–Jun, Jul–Sep and Oct–December 20. December 21–31 carries into next Q1. Same-rate team volume is aggregated before rounding; allocations remain deterministic.
- Each affiliate's year can end without cancelling valid commissions already earned. Historical earnings APIs and the earnings/withdrawal-record page remain accessible. Quarterly finalization does not require the affiliate to buy again after earning the money. Settlement, reconciliation and payout protections remain in force.
- Verified refunds/disputes of a qualifying purchase block its future eligibility. Actual sale refunds reverse the originally booked direct commission/team reserve once, without rewriting historical receipts or silently deleting finalized obligations.

## Account and financial isolation

A qualifying Premium listener can activate affiliate access with the same email/password. Trusted role links connect purchases to a creator/partner identity; matching email alone never takes over an existing account. Premium qualification grants no artist package or production entitlement. Existing temporary artist studio testing remains unchanged and cannot qualify affiliates.

Test receipts qualify only in test/staging environments. Production eligibility requires live-mode receipts. Administrator access, settled cash and gateway activation are not granted by this change.

## Contracts and migration

- New revision: `purchase-year-premium20-team10-2026-11-02`.
- Historical quarterly revision: `owner-quarterly-premium5-2026-10-28` retains Premium 10% direct / 5% quarterly team.
- Earlier `legacy-premium-10-5` contracts retain 10% direct / 5% immediate indirect and cannot also acquire a quarterly bonus.
- Migration 027 adds the quarterly plan and versioned rate/reserve constraints. New Premium commissions must match the immutable 20% contract. It adds an append-only policy revision record and does not rewrite existing accounts, subscriptions, receipts, commissions, songs or storage references.
- Historical fixtures explicitly select historical policy revisions; new feature journeys exercise the default new policy.

## Verification

All payment, exchange-rate and refund responses in these checks are fixtures; no paid provider requests or customer credits are used.

```sh
npm run test:affiliate
LAE_DB_TESTS=true DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/lae_music_ci npm run test:affiliate:postgres
LAE_DB_TESTS=true DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/lae_music_ci npm run test:upgrade
npm run test:affiliate:browser
```

The database guard refuses external hosts, other database names, URL query options and fragments. Fixtures run in separately owned disposable schemas. Browser checks cover 390px and 1440px, activation, locked marketing links, the preserved earnings link, horizontal overflow and accessibility. Upgrade checks include the existing migration-26 schema and earlier populated versions, checksums, exact record preservation and replay.

## Remaining release requirements

- Review/approve this financial-policy change before merging or deploying. No approval is implied by earlier releases.
- The current gateway runtime supports reviewed staging test accounts only; live checkout and cash payouts remain disabled. Enabling the affiliate purchase gate on production before a usable qualifying checkout exists would lock unpaid affiliates out of marketing tools. Coordinate release with a working payment path or a separately approved transition; do not silently turn demo/trial access into paid qualification.
- $1.80 is below Paystack's existing $2 minimum for a USD charge. Keep the approved product price; use a supported local-currency quote/provider. The NGN fixture verifies the conversion and original-charge evidence. Actual merchant configuration still needs verification.
- Real charge/refund, settlement and cash-payout verification remain pending the relevant payment connections and authorization. Mock success does not prove a live payment or bank transfer.
- Keep a production backup and the existing release/recovery checks before any approved migration. Rolling back application code must not reverse migration 027, delete earned commissions or erase newly issued contracts; later financial repairs must be forward-only and reviewed.
