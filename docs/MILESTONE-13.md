# Milestone 13 — Premium Listener subscriptions and streaming royalties

**Development candidate 0.13.0-rc.13; no production merge or deployment.** This extends the existing website, account model, payment adapters, player and accounting services. Migration 013 is additive; migrations 001–012 and historical financial/package records are unchanged.

## Approved commercial policy

| Listener plan | NGN price | Exact duration |
| --- | ---: | --- |
| Daily | ₦100 | 24 hours |
| Weekly | ₦300 | 7 days |
| Monthly | ₦800 | 30 days |
| Two months | ₦1,600 | 60 days |
| Annual | ₦7,800 | 365 days |

Terms are elapsed durations, not calendar-month/year approximations. A verified renewal queues after the latest eligible paid term; it does not discard remaining time. No automatic renewal or recurring debit is authorized. International amounts are estimates from the existing dated FX snapshots; the configured listener charge and accounting currency remains NGN. Artist packages remain USD products.

The owner confirmed there are **no binding 60% streaming commitments**. New streaming royalties are universally 50% for every artist package. Existing Professional `royalty: 60` snapshots remain immutable historical product data, explicitly separate from streaming. Artist package prices, upload/generation limits, extra-generation prices and approved direct commissions remain unchanged. Gifts retain their separate 70%/30% split.

The owner approved ad-free playback without advertising interruptions, a Premium badge, subscription details/expiration, listening insights and support for artists through eligible royalty-generating streams. Existing free public streaming, discovery, favorites and playlists remain available. Premium does not confer public-performance or unrestricted commercial rights. The shared player has no advertising insertion system; playback still depends on the network/media source.

Listener product referrals alone use 10% direct and an additional 5% only for an actual, eligible indirect beneficiary. Missing beneficiaries earn nothing; registration/recruitment earns nothing. These percentages do not alter artist-package commissions. Commission records remain pending, currency/mode separated and nonwithdrawable until approved settlement/clearance is implemented.

## Connected implementation

- `/premium`: five plans, approved benefits, optional local display estimate, sign-in only for account actions, reviewable referral attribution, sandbox checkout and independently verified activation, queued/current/expired term history and exact local expiration timestamps.
- Existing listener sessions expose only their own current entitlement. The persistent audio player remains outside navigation; a separate accounting observer never controls or interrupts playback. Listening insights use the existing listener history/library.
- Artist workspace → Royalties: universal 50% policy, estimates, prior-month/lifetime finalized royalties, per-song allocations, total/free/eligible Premium counts, adjustments, actual ledger availability and withdrawal records. Estimates and finalized liabilities are visibly separate from available cash. Historic plays are not fabricated into dated/free/Premium accounting events.
- Partners: listener product link and distinct NGN direct/indirect commission history, alongside unchanged artist-product links and commissions.
- Administration → Royalties: original receipts, append-only cost/tax evidence revisions, monthly preview, eligibility exclusions, review note plus snapshot-hash finalization, finalized history, calculation audits and independent full-refund lookup. Finance/owner roles only; financial writes require fresh named-admin MFA. Unknown finance routes are denied.

## Payment and account safety

An immutable listener order owns one permanent provider attempt/reference across workers. Initializing commits before the external call. Ambiguous acceptance stays in review; retries cannot initialize a second charge or switch providers. Only authenticated provider notifications followed by independent lookup, or an owner-scoped lookup, can fulfill an order. Provider, merchant, test/live mode, payment ID, amount, currency, reference and quote are checked. Redirects and client success flags grant nothing. Lifecycle holds arriving before charge confirmation quarantine the attempt. Receipt, entitlement, commission journals and activation are atomic and duplicate-safe.

The Nigeria runtime reuses the reviewed staging-only Paystack/Flutterwave adapters and manifest. The committed manifest remains disabled, and no live-checkout environment switch exists. Actual merchant sandbox credentials/outcomes remain unverified. Listener full-refund lookup currently supports the verified Paystack adapter contract only; Flutterwave refund operations, partial-refund/dispute resolution and safe hold release remain unavailable.

## Qualifying stream rules

The authenticated listener must own an active, independently verified, unheld/unrefunded paid entitlement and play a published track. Same-email self-listening does not qualify. One accounting session per listener is active across tabs. Server-paced signals require at least 30 elapsed and credibly played seconds, ordered sequences, no seeking jumps, at most 15 seconds credit per heartbeat and a maximum 25-second heartbeat gap. The browser normally sends every 10 seconds. Retries acknowledge the same sequence rather than creating a second stream. The same listener/song is limited to one qualification per 30 minutes, with a 720-stream UTC daily cap. Expired/replaced sessions stop qualifying without stopping public playback.

These are fraud-reduction controls, **not proof that a human listened**. Bot/device/IP abuse detection, real-media duration checks and operational fraud review still need production validation. Administrators can exclude signals before finalization. Post-finalization generic fraud/cost corrections require a separate reconciliation workflow; full verified refunds already have an append-only adjustment path. Do not finalize a month before reviewing these limitations. Public free plays never enter the Premium denominator. New engagement events carry their audience classification; old history remains unclassified rather than backfilled with invented evidence.

## Revenue recognition and accounting

Each receipt's eligible basis is gross less actual full refunds, excluded taxes, verified processing costs and actually earned listener-product commissions. Missing cost/tax classification or unresolved payment review blocks finalization. Components and net basis are recognized by elapsed UTC milliseconds across the actual entitlement duration using cumulative integer floors. Annual payments are spread over 365 days, including partial days and leap-year boundaries. A separate rounding reconciliation records component differences; cumulative recognition telescopes to the original amounts.

The artist pool is floor(50% of recognized net minor units); the platform receives the remaining net, including an indivisible odd minor unit. Artist share follows eligible Premium stream proportions; song allocations follow each artist's qualifying song counts. Deterministic largest-remainder rounding conserves the pool. The displayed per-stream figure is a variable ratio for that month, never a guaranteed fixed payout. Existing single-owner tracks allocate to their recorded owner; no collaborator splits are invented.

Finalization is unique per UTC month/currency/mode, requires the reviewed preview hash, rejects open/future months and stores immutable input/output evidence. Period row fences serialize qualifying events, cost reviews, reversals and closes. Actual journals recognize deferred revenue, tax/fees/commissions, platform share and artist unsettled liabilities. No streams leaves an undistributed liability; it is not arbitrarily paid or rolled into a different month. No net eligible revenue produces no pool.

A later independently verified full refund keeps the original statement intact, adds one adjustment, reverses the corresponding unsettled liability and pending commission where possible, and records recovery holds where royalties were already cash-released. Available earnings are never silently made negative. Actual nonrefundable provider fees remain platform expense. Unresolved live recovery blocks new NGN withdrawal reservations/approvals. The existing withdrawal service fee stays 3% with the same minor-unit rounding.

## Cash-release boundary

`lib/royalty-settlement.js` provides a separately tested server-owned verifier contract. It requires independently retrieved live cash-settlement evidence matching each original payment and tracks cumulative source consumption before releasing finalized unsettled artist royalties into the available ledger. Unique source/release records prevent duplicate funding. Sandbox statements cannot be released, adjusted/held sources are blocked and a failed/insufficient proof rolls back the entire operation.

**No provider-specific live settlement verifier is configured.** The HTTP release operation returns unavailable. Fixture injection in PostgreSQL tests is not a verified outside settlement. There is no manual paid flag, fabricated cash, automatic affiliate clearance or actual bank payout. Implement and verify the selected provider's settlement/reconciliation API before enabling any of those operations; a successful charge is not proof of settlement.

## Executed verification and remaining gates

Local final verification: 136 application tests, existing 25 mocked Sonic cases and 31 source invariants, 122 actual PostgreSQL tests on an isolated disposable PostgreSQL 16 database, one socket HTTP test, four real Nodemailer/loopback-TLS tests and desktop/tablet/mobile Chromium journeys. PostgreSQL covers migration 013, exact durations/renewal/expiry, ownership, concurrent checkout/fulfillment, actual adapter verification with mocked provider transport, all referral paths, server-paced streams, free-stream exclusion, monthly/annual recognition, unique finalization, zero-stream carry, immutable history, refunds, mocked independent cash settlement and recovery/withdrawal blocking. Admin role and stale-MFA checks execute against the real database. A separate read-only preflight on the populated fixture found no missing/changed migrations or guards and zero financial integrity discrepancies; overall release remains blocked. Two player-observer regressions cover activating Premium during playback and retry/stale-track handling without controlling audio. Browser payment/audio/provider data are isolated fixtures; screenshots were inspected at mobile/desktop sizes.

Before deployment: complete provider-specific live settlement/payout and pending-commission clearance; approve/implement paid download terms; complete partial/dispute and post-finalization correction workflows; verify actual authorized gateway/media/email/FX integrations, production-schema clone migration/lock/query-plan behavior, Render TLS, backups/recovery, operational abuse controls and physical-device/accessibility testing. Existing master-assignment requirements outside this batch remain listed in FEATURE-STATUS.md. This milestone does not justify a deployment-ready announcement.
