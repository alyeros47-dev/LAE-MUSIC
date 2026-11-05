# Task 2 — Affiliate eligibility and revenue framework

## Approved decisions implemented

Affiliate registration is free, voluntary and separate from paid services. An unchecked opt-in asks customers to join; a purchase never enrolls them automatically. Customers can register before buying, but sharing the protected product referral links requires participation plus a verified qualifying purchase. Listeners use their securely linked partner profile; no email-only account takeover or artist-tool grant is introduced.

A verified artist package from $6, or a Premium listening purchase of at least 90 days and $1.80, qualifies. Monthly purchases alone do not qualify. Qualification has no subscription-expiry or one-year limit under this revision. Expired listening still loses Premium playback, and expired annual membership still loses generation/publishing privileges. Refunds, disputed/held payments, fake receipts and wrong-book purchases do not establish valid qualification. Opting out does not erase purchase or historical earnings records.

Original referral attribution is retained through verified renewals of other durations and explicitly linked listener/artist roles. A later referral link cannot replace an established verified referrer. Manually approved bank transfers participate in the same receipt, attribution and eligibility flow. Genuine funded-royalty membership renewal is recognized as an internal purchase, never new external cash.

Policy revision: `affiliate-opt-in-premium30-2026-11-05`.

## New allocations are held

The owner explicitly instructed: **hold all new commission allocations until the rules are finalized**. This includes new artist packages, extra generations and Premium purchases/renewals. Individual rates, team qualifications and artist/extra commission rules remain null. No new individual commission or team reward is assigned or made withdrawable.

Verified purchases and the referrer's qualification/participation at purchase time are recorded in immutable pending-purchase history. The history is not a promise of retroactive earnings or a commission amount. A future approved policy must decide how to reconcile these records.

Older unpaid orders approved after the update also use the pending framework. A per-receipt policy overlay leaves their original quoted price, allowance and referral snapshot unchanged while preventing old commission rules from running at new approval. Previously verified receipts, commissions, statements and obligations retain their original versioned rules. Existing historical statement/refund processing remains available. Earlier one-year and 20%/10% rules are historical contracts, not this release's new policy.

Database guards reject individual commission inserts for pending-policy receipts. Production endpoints cannot select a legacy calculation policy. The legacy constructor option is used only by isolated historical fixtures.

## Premium subscription revenue

After the existing verified refund, fee and tax adjustments establish eligible revenue:

1. Reserve 30% as an **unallocated affiliate/team budget**.
2. Split the remaining 70% equally between the artist streaming pool and LAE-MUSIC.

For $1.80 eligible revenue, this is exactly $0.54 reserved / $0.63 artist pool / $0.63 LAE-MUSIC. The 30% is not assigned between direct affiliates and teams. Artist packages and extra generations do not adopt this Premium revenue split.

The existing integer-cent percentage rounding is retained. An indivisible final cent in the equal remaining split goes to LAE-MUSIC. Term totals are calculated first, then recognized cumulatively over the purchased listening period, avoiding repeated monthly rounding loss. Different policy versions coexist in a statement without rewriting historical terms.

Only eligible listening activity allocates the artist pool. Months without eligible streams carry an undistributed liability; they do not create an artist payment. An existing argument-order defect in that carry journal was corrected and covered with a real PostgreSQL ledger assertion. The new reserved budget has its own unallocated ledger account, never an affiliate's pending/available balance.

Statement recognition is not cash settlement. Independent funding evidence, treasury conversion where relevant, and existing payout checks still apply. This task does not enable withdrawals or claim a provider receivable is funded cash.

## Changes and preservation

- `config/affiliate-revenue-policy.json`, `lib/affiliate-framework.js`: approved framework, exact-cent allocation, retained attribution and immutable pending-purchase history.
- `migrations/030-affiliate-participation-revenue.sql`: additive participation, pending purchases, receipt policy overlays and allocation guards. Existing migrations/checksums and earned records stay intact.
- Affiliate access, commerce, manual/shared receipt fulfillment, Premium, funded annual renewals and statements use the new policy while preserving historical versions.
- Customer affiliate screens explain voluntary joining and pending allocations. Obsolete commission demos/rate promises are hidden; internal historical fixtures remain clearly labelled.
- The Task 1 bank-transfer workflow is preserved. Manual collection remains disabled until official account details are supplied.
- No package price, generation allowance, paid listening duration, Music DNA, Gospel configuration, studio provider, voice feature, song file or player behavior is changed.

## Verification

All tests use disposable local PostgreSQL schemas, mock/intercepted payment transports and fictional bank receipts. No paid music/text API calls, customer credits, actual payments or production records are used.

Focused commands:

- `npm run test:affiliate:framework` — free/optional/lasting policy, exact $1.80 split, cent conservation and historical version isolation.
- `npm run test:affiliate:framework:postgres` — real HTTP opt-in, approved bank receipts, lasting eligibility, expired-service denial, original referrer across roles/renewals, all allocations held, older pending-order cutover, SQL guards and finalized ledger conservation.
- `npm run test:affiliate:postgres` — also retains the explicit historical purchase-year/refund/quarterly regression fixtures; automatically runs the new framework and ledger checks in hosted CI.
- `npm run test:affiliate:browser` — Chromium customer journeys at 390px/1440px with accessibility checks, unchecked opt-in, qualifying purchase distinction, same-email access and pending allocation copy.
- Existing manual-bank, membership/funded-renewal, migration/upgrade and relevant core compatibility suites protect the shared payment/royalty paths.

Local results: 1,131 application checks passed (one existing optional skip), 249 core PostgreSQL compatibility checks passed, 11 historical affiliate-year checks plus the retained historical regression suite passed, 10 current-framework database checks and one finalized-ledger test passed, 9 manual-bank database checks passed, historical membership migration plus 15 membership and 6 composed funding/renewal checks passed, and 11 upgrade checks passed. Both affiliate and actual manual-bank browser journeys passed at 390px/1440px with accessibility checks. Hosted CI status is recorded in the PR completion report. The complete Music DNA and voice/language audits are not manually repeated for this financial change.

## Readiness and pending decisions

This is a reviewable implementation of the approved framework with allocations deliberately inactive. To enable new commissions, the owner must approve the individual percentages within 30%, detailed team eligibility/settlement rules, artist-package/extra-generation rules, and treatment of purchases recorded during the hold.

Incoming manual payment activation does not require completing Monnify onboarding. It does require official business bank details, the existing fresh FX service for NGN instructions, an authorized bank reviewer, and approved release/configuration/migration verification. Guest pay-before-signup checkout is not included in Task 1's authenticated payment implementation. Independent royalty cash-funding verification and payouts remain separate dependencies.

Production is unchanged. Keep PR #27 draft; do not merge/deploy without explicit owner approval. Rehearse the exact additive candidate against an isolated recovery copy before a production release. Disable new bank instructions to stop collection; preserve submitted invoices and all financial history. A compatible rollback must retain the migration inventory and stop new fulfillment rather than re-enable superseded commission rules.
