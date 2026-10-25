# LAE-MUSIC release candidate 0.12.0-rc.12

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
- Additive checksummed migrations 001–012, verified remote TLS with explicit Render private-host configuration, origin/security guards, upload validation and read-only schema/accounting preflight.

## Preserved commercial contracts

| Package | Annual USD | Royalty | Generations | Upload quota | External uploads | Extra generation USD | Direct commission |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | $6 | 50% | 2 | 7 | 3 | $3 | 15% |
| Growth | $10 | 50% | 3 | 6 | 0 | $2.50 | 25% |
| Professional | $20 | 60% | 6 | 12 | 0 | $2 | 25% |

Two outputs per generation remains an intention, not a verified API guarantee. External limits, the legacy generated-song upload-code entitlement and quarterly team-sale proposal remain documented contradictions. No per-stream funding/rate was invented. Fees use rounded minor units; a one-minor-unit withdrawal can have a zero rounded fee. No new $1 minimum was introduced.

## Executed evidence

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
2. Approve paid-download pricing/eligible royalty revenue, streaming funding/rates/allocation, refund policies and commercial contradictions. Paid-download checkout/entitlements, automatic royalty funding, Flutterwave v3 refunds, final dispute handling and actual bank payouts still require implementation/verification. They are not launch-complete.
3. Run migration/preflight on a sanitized production-schema clone; review bootstrap DDL, compatibility, lock duration, indexes/query plans, load, reconciliation, backups/recovery and actual Render TLS/private-network trust.
4. Configure dedicated `ADMIN_MFA_KEY`, verify owner enrollment/recovery-code custody and clock synchronization. Configure the approved SMTP sender/transport and `ACCOUNT_EMAIL_KEY`, and verify staging delivery before enabling email recovery.
5. Complete physical-device, keyboard/screen-reader, touch seeking, real browser audio/autoplay and operational abuse-control review.

No live-money runtime is enabled or implemented. No environment flag alone activates it. Current merchant/email manifests are disabled. Coin purchases and paid downloads cannot simulate receipt; package selection grants nothing by itself. Provider receivables and pending commissions are not spendable artist cash.

Use Node.js 22, the committed lockfile and `.env.example`. Preserve migration checksums and history. There are no destructive down migrations. Do not roll back to code that ignores payment holds, named administrator mode/revocation or platform moderation holds; use a compatible revision and reviewed recovery procedure. Only the user will perform the final production deployment after all gates are resolved.
