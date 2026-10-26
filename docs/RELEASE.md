# LAE-MUSIC release candidate 0.16.0-rc.16

**Draft candidate; not ready for production deployment.** Development branch: `codex/premium-platform-release`. [Draft PR #6](https://github.com/alyeros47-dev/LAE-MUSIC/pull/6). No production merge, Render deployment, production data reset or Android changes were performed.

See [FEATURE-STATUS.md](FEATURE-STATUS.md) for the complete implemented/remaining-work matrix and [DEPLOYMENT.md](DEPLOYMENT.md) for environment, migration, staging and rollback instructions.

## Integrated development

- Shared premium dark interface and connected public, listener, artist, studio, partner, account and administrator screens on the existing native Node.js/PostgreSQL/R2 architecture.
- Persistent real-source music player, queue/shuffle/repeat/seeking/volume, expanded/mobile controls, media-session integration, explicit resume and useful playback errors. Slow editorial requests cannot block catalog playback.
- Discovery/search/genres/pagination, artist/song pages, public streaming and guest comments, likes/follows, favorites, revisioned playlists, history and listener release notifications.
- Artist onboarding/profile/photos, metadata and quota-safe uploads, annual subscriptions/renewals, studio allowances and earnings records. Dated UTC Insights includes period filters, charts and private CSV; engagement does not create payable royalties.
- Owned AI studio requests/history/progress/previews, duplicate-safe music/lyrics reservations, ambiguous-result protection, trusted-origin durable media copying, private drafts/editing and explicit publication. Voice/language/WAV capabilities and exactly two outputs still require provider evidence.
- Free LAE-MUSIC Partners & Affiliate Network, product referral attribution, team sales/statistics, approved direct verified-sale commissions, pending journals and history. No recruitment/enrollment rewards or unapproved quarterly payments.
- Immutable USD orders/benefits, prepaid renewals, extra studio credits, original NGN/USD charge evidence, independent gateway verification and one permanent attempt per order. Nigeria Paystack/Flutterwave staging checkout is prepared; the committed manifest is disabled.
- Paystack full-refund review/submission/independent lookup, immutable evidence, benefit holds and sale/commission reversals. Partial/disputed/consumed-service cases retain review states. Flutterwave v3 refund operations remain unavailable.
- Currency-separated balanced accounting, duplicate-safe gifts with the approved 70% artist / 30% platform split, withdrawal reservations, 3% fees, protected approval/rejection and audit. Approval cannot send funds or mark money paid.
- Atomic signup/password/session controls, stale-login fencing, identity-bound single-use recovery/verification, encrypted delivery outbox and mandatory-TLS SMTP structure. Real email delivery remains unconfigured.
- Named administrators with authenticator/recovery codes, scoped roles, recent verification, versioned access/session revocation and actor attribution. Shared-key mode ends only after confirmed owner enrollment.
- Editorial curation/promotions/artwork, durable artist notifications and renewal reminders, unread/filter/pagination controls and private operational health. Guest-inclusive moderation preserves platform holds, review notes/revisions/idempotency, reports and source records.
- Additive checksummed migrations 001–016, verified remote TLS with explicit Render private-host configuration, origin/security guards, upload validation and read-only schema/accounting preflight.

## Premium Listener and streaming policy

[Milestone 14](MILESTONE-14.md) implements the explicitly approved **USD** Premium Listener base prices: **$0.08 / $0.23 / $0.60 / $1.21 / $5.88** for 1/7/30/60/365 days. It replaces M13's NGN-only pricing with the same country selector, daily rate cache and immutable quote system used by artist products. Local payments use reviewed account currencies and a final-amount confirmation. Original local charge/refund evidence and USD equivalent/rate/timestamp are preserved; costs normalize once at the original snapshot. Historical NGN contracts remain in a separate legacy book.

The universal 50% recognized-net streaming pool, eligible Premium streams, annual deferral, no-stream liabilities, immutable finalization/refund recovery and free listening remain intact. Low-cent commission rounding cannot exceed the 15% listener-product cap. Cross-currency cash release remains blocked without independently verified treasury conversion. Live settlement/payout adapters remain unconfigured; sandbox liabilities are never cash.

## Premium website offline listening

[Milestone 15](MILESTONE-15.md) supersedes every earlier paid-download proposal. Premium saves are included at no extra cost, inside the website's controlled browser library. There is no listener MP3 export, separate song purchase or download commission. Actual service workers/IndexedDB/Web Crypto/native audio are tested with an isolated R2/gateway fixture. Dedicated signing-key and real R2 staging verification remain required. Free ad infrastructure is integrated, but the reviewed creative manifest is disabled until actual approved media is supplied. No synthetic ad or paid impression is claimed.

Signed access ends at the earlier of 24 hours or Premium expiry; reconnection checks holds, ownership, publication and device revocation. Valid pre-expiry plays may sync within 48 hours, once per signed event/sequence, into the existing 50% recognized-net model. Royalty finalization waits 48 hours after UTC month-end. Browser storage is not DRM and cannot prove a human listened; physical-device/Safari/Firefox testing and operational fraud review remain gates.

## Preserved historical package fields

| Package | Annual USD | Legacy royalty snapshot | Generations | Upload quota | External uploads | Extra generation USD | Direct commission |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | $6 | 50% | 2 | 7 | 3 | $3 | 15% |
| Growth | $10 | 50% | 3 | 6 | 0 | $2.50 | 25% |
| Professional | $20 | 60% | 6 | 12 | 0 | $2 | 25% |

Two outputs per generation remains an intention, not a verified API guarantee. External limits, the legacy generated-song upload-code entitlement and quarterly team-sale proposal remain documented contradictions. Historical package royalty fields are preserved; the new streaming rate is 50% for all packages. The owner confirmed no binding 60% streaming commitments. No fixed per-stream payout was invented. Fees use rounded minor units; a one-minor-unit withdrawal can have a zero rounded fee. No new $1 minimum was introduced.

## Current local evidence

[Milestone 16](MILESTONE-16.md) adds a unified owner/finance reconciliation workspace with separate currency/mode reporting, exact ledger exports, independently verified checkout lookup through existing coordinators and revisioned operator annotations. Notes cannot change money, holds or benefits; resolving an active source is refused. Additive migration 016 protects identity/history and the read-only preflight checks annotation consistency. Local application and actual PostgreSQL suites pass **153 / 152 checks**; HTTP and real-library SMTP/TLS pass **1 / 4**. The full Chromium command passes existing desktop/tablet/mobile journeys, reconciliation claim/wait/filter/CSV/original-provider-lookup controls, both actual offline PWA journeys and **32 axe scans with zero automated violations**. All nine populated read-only preflight discrepancy counts are zero. Published-head CI evidence is recorded on PR #6 and in `artifacts/reconciliation-test-results.txt`. All outside financial/media services remain fixtures or unconfigured. This does not establish production readiness.

## Previous M15 evidence

Candidate 0.15.0-rc.15 passes **146 application tests, 141 actual PostgreSQL 16 checks, one socket HTTP check and four real-library SMTP/TLS checks**. The database suite includes migrations 001–015, concurrent offline retry/deduplication, interval overlap, malformed-batch rollback, expiry/grace, payment holds and append-only protection. Real Chromium PWA desktop/mobile runs verify encrypted/nonextractable-key storage, corrupt-cipher rejection, actual offline reload/playback, clock/expiry guards, once-only sync and cross-tab/account cleanup. The full combined browser command passes existing desktop/tablet/mobile journeys, both real PWA desktop/mobile journeys, unsupported-browser handling and **29 axe scans with zero automated violations**. Final evidence is recorded in `artifacts/offline-test-results.txt` and PR #6. A populated read-only fixture preflight passes with zero discrepancies in all eight schema/accounting/FX/offline-stream integrity counts, while overall deployment status stays blocked. Media/gateway/account services remain fixtures. See [MILESTONE-15.md](MILESTONE-15.md).

## Previous M14 evidence

Candidate 0.14.0-rc.14 passed **140 application tests, 133 actual PostgreSQL 16 checks, one socket HTTP test, four real-library SMTP/TLS tests and three Chromium viewport journeys**. Existing Sonic 25 mocked cases / 31 source invariants pass. Populated-database read-only preflight reported zero financial/FX discrepancies, while overall deployment remains blocked. A separate real public-feed check through the shared pricing service verified current NGN/GHS/KES/LRD estimates. New gateway/treasury/media responses are otherwise fixtures. See [MILESTONE-14.md](MILESTONE-14.md). The published currency code passed [CI run 40245909162](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40245909162), commit `eb3a4cbcd53f778635578cc54e1cf60bba338339`; see `artifacts/ci-international-currency.txt`. The accessibility follow-up adds 27 passing local axe/Chromium scans, current dialog naming and keyboard focus checks, with incomplete contrast checks explicitly retained for manual review. Final-head follow-up CI is recorded on PR #6.

## Previous M13 evidence

Candidate 0.13.0-rc.13 passed 136 application tests, 122 actual PostgreSQL 16 checks (migrations 001–013), one socket HTTP test, four SMTP/TLS tests and three Chromium viewport journeys. Existing 25 mocked Sonic cases and 31 source invariants pass. All financial/provider transports in the new journeys use controlled fixtures; live-book accounting fixtures do not establish real cash receipt. No outside gateway/media/email account or production-schema clone was tested. The integrated candidate also passed [GitHub Actions run 40241567230](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40241567230), code commit `ff3138841859ffae40d8c24d31a77e81805881f4`, with the same application/PostgreSQL/HTTP/SMTP/browser results. Condensed evidence: `artifacts/ci-premium-listeners.txt`. A final money-input hardening follow-up rejects arrays/objects and normalizes canonical integer strings; its application and PostgreSQL suites pass locally, with final-head CI recorded on PR #6.

## Previous executed CI evidence

The integrated code candidate passed [run 40227539676](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40227539676), commit `c37a3eb8d439b6edbaad34af0b29f51f806e18f6`.

| Verification | Result | Scope |
| --- | --- | --- |
| Application suite | **130 pass**, locally and in CI | Native handlers/services, transactions, player, uploads, commercial terms, payments/refunds, account/admin security, editorial, notifications, moderation and preflight |
| Existing Sonic checks | **25 mocked cases and 31 source invariants pass** | Reservation, ownership and failure behavior; no external music account |
| PostgreSQL 16 | **111 pass** | Actual migrations 001–012, concurrency/rollback/restart, fixture-verified fulfillment/refunds, accounts/MFA, analytics/editorial, inbox/moderation, read-only schema inspection and coordinated staging-worker startup |
| Socket HTTP | **1 pass** | Actual HTTP routing, public access, security headers and safe errors |
| SMTP library/TLS | **4 pass** | Real pinned Nodemailer 10.2.1 with local TLS, MIME, recipient rejection and untrusted-CA rejection |
| Chromium journeys | **Desktop, tablet and mobile pass** | Rendered UI and real audio element with isolated WAV; connected user journeys and playback-preserving navigation |
| Dependency installation | `npm ci`; zero known vulnerabilities reported | Advisory result at the recorded installation, not a permanent guarantee |
| Real providers / production-schema clone | **Not run** | Required R2, music/lyrics, gateway, email and clone credentials/services are not attached |

Local output: `artifacts/test-results.txt`. Condensed CI evidence: `artifacts/ci-milestones-8-12.txt`. Browser screenshots/journey records: the linked run's browser-evidence artifact. Desktop/mobile Insights, editorial discovery, operator security, notifications and moderation were visually inspected, as was the corrected mobile homepage. Tablet behavior/screenshots pass automated journeys. Screenshots and a WAV fixture do not establish physical-device, screen-reader or real-media verification.

Earlier passing runs: engagement/editorial [40223334896](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40223334896) (121 application / 83 PostgreSQL); named administration [40225506642](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40225506642) (125 / 94); notifications [40226041256](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40226041256) (126 / 101); moderation [40226808349](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40226808349) (127 / 109). Each also passed HTTP, SMTP and three viewport journeys. Details remain in the milestone documents.

The local default preflight returned exit 2 (`blocked`), with database inspection `not_run`; its redacted report is `artifacts/preflight-report.json`. CI's database preflight uses a fresh disposable schema, not a production clone or actual Render connection. Payment, FX, media and account-delivery responses otherwise use isolated fixtures; SMTP specifically uses the real library with loopback TLS.

## Remaining deployment gates

1. Supply authorized test R2, music/lyrics, Paystack/Flutterwave and email credentials securely. Verify real outcomes, account/currency permissions, trusted media origins, sender identity, Range/HEAD and actual audio. Never place secrets in chat, Git or PR artifacts.
2. Configure the dedicated offline signing key, verify real R2 offline playback and supply reviewed free-listener ad creative. Resolve remaining partial/dispute policies and commercial contradictions. The streaming model is now approved and implemented. Provider-specific live royalty funding, commission clearance, generic post-finalization corrections, Flutterwave v3 refunds, final dispute handling and actual bank payouts still require implementation/verification. They are not launch-complete.
3. Run migration/preflight on a sanitized production-schema clone; review bootstrap DDL, compatibility, lock duration, indexes/query plans, load, reconciliation, backups/recovery and actual Render TLS/private-network trust.
4. Configure dedicated `ADMIN_MFA_KEY`, verify owner enrollment/recovery-code custody and clock synchronization. Configure the approved SMTP sender/transport and `ACCOUNT_EMAIL_KEY`, and verify staging delivery before enabling email recovery.
5. Complete physical-device, keyboard/screen-reader, touch seeking, real browser audio/autoplay and operational abuse-control review.

No live-money checkout or provider-specific settlement/payout runtime is enabled. The new cash-release contract is tested with mocked independent evidence only. No environment flag alone activates it. Current merchant/email manifests are disabled. Coin purchases cannot simulate receipt; paid listener song purchases and MP3 exports are prohibited; package selection grants nothing by itself. Provider receivables and pending commissions are not spendable artist cash.

Use Node.js 22, the committed lockfile and `.env.example`. Preserve migration checksums and history. There are no destructive down migrations. Do not roll back to code that ignores payment holds, named administrator mode/revocation or platform moderation holds; use a compatible revision and reviewed recovery procedure. Only the user will perform the final production deployment after all gates are resolved.
