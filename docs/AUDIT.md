# LAE-MUSIC development audit

Source reviewed: `main` at `24718b32df138711a73426fb4fd5042767b74f74` (25 October 2026). Website only; Android remains unchanged. No production database, storage account, payment gateway or generation credentials are attached to this workspace. Direct shell networking fails at the configured proxy; repository files were obtained through the connected GitHub API.

## Architecture and baseline

The running application is Node's built-in HTTP server, not Express as the old README claims. `server.js` contains PostgreSQL initialization, account/session handling, R2 signing/upload proxies, listener APIs, embedded gzip assets and legacy dashboards. `listener.html` is the current homepage; `music-prompt-studio.html`, `musicapi-sonic.js`, and `artist-voice.js` implement studio flows. Production dependencies are `pg` and `web-push`. There is no lockfile, migration runner or browser test suite. Existing tests combine source-string assertions and a mocked Sonic handler. The baseline `npm test` fails at the obsolete “invalid task ID” assertion; the handler intentionally retains ambiguous reservations instead of refunding them.

## Findings and implementation priorities

| Area | Existing implementation / defect | Release work |
| --- | --- | --- |
| Presentation | Multiple incompatible inline styles, crowded navigation, embedded and standalone UIs, actions that scroll automatically | Add an accessible shared dark design system and connected application shell, retaining legacy routes and backend |
| Playback | Public R2 streaming, seeking and expanded view exist; full navigations recreate audio; no reliable queue/shuffle/repeat | One audio instance outside the page router; queue, shuffle, repeat, volume, seek, media-session controls, safe resume and stream error recovery |
| Listener | Separate listener identity; favorites, likes, playlists, history, comments, follows and release notifications exist | Connect APIs to new discovery, artist/song detail, library, account and notification screens; preserve public streaming |
| Artist | Creator identity doubles as free affiliate account; paid annual subscriptions, upload quotas, generation allowance exist | Unified dashboard, metadata editing, uploads using R2 proxy, profile, subscription and analytics screens |
| Studio | Owned task status and WAV checks; artist lock and quota reservation; ambiguous provider acceptance blocks retries | Preserve safety; add durable client idempotency, task history/progress and explicit reconciliation states; do not promise languages/voice/two outputs without provider evidence |
| Lyrics | Wallet debit and ledger insert are separate statements; history persistence and final ledger update separate | Make debit+ledger reservation transactional; protect retries; use configured model rather than invented model availability |
| Finance | Provider not connected, most earning screens return unavailable; gifts debit atomically but retries can debit twice | Add balanced transfer ledger, provider event and withdrawal state structures, immutable references, payload replay checks and 3% fee; do not invent settlement or streaming royalty rate |
| Affiliates | Active direct product commissions are Starter 15%, Growth/Professional 25%; dormant paid enrollment and recruitment milestones conflict with free signup | Disable recruitment/enrollment rewards, retain historical data, expose verified-product earnings and team statistics; document disputed quarterly terms |
| Security | Secure HttpOnly cookies, scrypt passwords, parameterized SQL and many origin checks; missing central mutation checks/rate limits; public gift API exposes total income | Central origin/body/rate guards and security headers; protect earnings, validate active subscriptions and own-track updates |
| Database | Inline additive DDL, no migration versions; credits granted on startup; no real PostgreSQL test service here | Versioned additive migration under advisory lock; no destructive reset or automatic historical money conversion |
| Administration | Shared secret cookie; limited catalogs/accounts/finance reporting, demo withdrawal controls alongside real data | Protected operations UI, separate actual ledger requests, account/catalog/subscription/generation reporting and durable audit trail |

## Commercial terms and contradictions

Preserve annual Starter $6 / 50% / 2 generations / 7 upload quota / $3 extra generation / 15% direct sale commission; Growth $10 / 50% / 3 generations / 6 upload quota / $2.50 extra / 25%; Professional $20 / 60% / 6 generations / 12 upload quota / $2 extra / 25%. Existing external upload limits are 3/0/0. Quota of seven Starter uploads includes more than four intended generated tracks plus three external songs; Growth/Professional align with intended two outputs per generation. These are preserved, not reinterpreted.

`tracksPerGeneration:2` is a commercial intention; repository code is not provider documentation. Provider can return a variable number of clips. No guaranteed two-output claim is made in the new UI. `artist-voice.js` requests provider persona functionality; live support has not been verified.

Legacy `affiliateAllocation`, `recordVerifiedAffiliateEnrollment` and milestone tables describe a minimum $5 enrollment fee and recruitment rewards (20%/10%/5% reserve). These contradict this assignment and must not be activated. Historical tables/rows are retained. A quarterly team-sale 10% reward is also represented as potential earnings in the existing dashboard but has no verified settlement implementation or approved specification. Retain historical sales/statistics; do not mint or promise this reward. Product-specific direct sale percentages remain unchanged.

Existing gifts allocate 70% to artist and 30% platform in NGN; preserve this separately from USD package royalties. Streaming has play counters but no verified per-stream funding/rate. Never convert plays to cash. Withdrawal fee is 3%, rounded to integer minor units, with gross, fee and net stored separately.

## Integrated work packages

1. Shared UI and persistent real-source player; discovery, artists, song detail, library and identity flows.
2. Artist/studio/partners/admin screens connected to existing endpoints plus narrowly scoped reporting/profile/catalog APIs.
3. Additive versioned finance/security/idempotency data and transactional services; freeze unsupported payments and contradictory recruitment rewards.
4. Execute original tests, new behavioral service/API/player tests and browser journeys at mobile/desktop sizes. Record mocked versus real evidence. Prepare draft PR, migration/release/rollback steps and unresolved dependencies. No Render deployment or main-branch merge.

## Launch gates

Real PostgreSQL migration replay/concurrency tests; verified R2 credentials, CORS and actual audio/upload tests; documented MusicAPI capability and credential tests; payment-provider selection, webhook signature/replay and bank payout verification; approved refund/chargeback/royalty policies; quarterly affiliate decision; production-like full end-to-end and accessibility review. This audit is source evidence, not a declaration of launch readiness.

## Verification follow-up

The new real PostgreSQL CI job confirmed a fresh-install ordering defect: notification/gift/comment-extension DDL ran before its music/comment parent tables. Initialization was reordered without deleting data. Real concurrency testing also required a stable, owner-scoped mapping from provisional studio references to accepted provider task IDs. These fixes, fresh initialization/replay, concurrent money/credit operations and restart preservation passed in CI run 40184247862. Browser and actual HTTP tests also passed there after local sandbox execution was blocked.


## Accounting milestone follow-through

Purchase/entitlement, media-copy/publication and collection changes are documented in `docs/MILESTONE-2.md` and `docs/MILESTONE-3.md`; current test evidence is in `docs/RELEASE.md`. The audit also confirmed that legacy initialization and two GET reports could mint new demo referral rows solely from active-account status. Those accruals have been removed. Demo activation, withdrawal submission and demo admin review are permanently disabled even if old environment switches are set. Historical demo tables and reports remain readable, with zero available cash in the demo wallet. No historical rows were reset or imported into verified balances. These disabled simulations are not approved product commissions or live purchases.

The owner selected Flutterwave and Paystack, with USD as standard currency and local display conversion by country. Milestone 4 adds documented gateway contracts, currency selection/estimates and immutable presentment-quote preparation. Merchant registered country, actual account currency approval and live credentials remain unverified. Country currency support is not proof that either gateway can charge it. See `docs/MILESTONE-4.md` for the exact activation boundary.
