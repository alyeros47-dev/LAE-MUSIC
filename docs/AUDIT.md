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

The owner confirmed Nigeria. Milestone 5 adds a sandbox-only checkout coordinator, persistent cross-provider attempt binding, exact original-currency verification, independent reference lookup and immutable presentment evidence. The reviewed-account manifest remains disabled/empty; production mode and live keys cannot enable this runtime. Account KYC/currency approval and real sandbox evidence are still missing, and definitive cancellation/refunds/disputes/settlement/payout operations remain pre-live gates.


## Account-security follow-through

Milestone 7 adds atomic registration/session issuance, transactional password changes and outstanding-link invalidation, account-row locking against stale-password login, account-scoped session revocation, encrypted recovery email envelopes, purpose/identity-bound single-use links and private delivery-health reporting. The actual Nodemailer library passes local TLS fixture checks; no external SMTP account or sender is verified. The delivery manifest remains disabled. Separate artist/listener identities, including the same email in both roles, have PostgreSQL/browser coverage. Named admin identities, live email setup and production abuse/load verification remain gates.

## Integrated follow-through through candidate 0.12.0-rc.12

The development branch now adds dated, durable engagement/Insights and CSV, revisioned editorial/promotional content, named administrator MFA/scopes/revocation, verified remote TLS with explicit Render private transport, durable artist notifications/reminders, guest-inclusive moderation and a read-only release preflight. The moderation audit confirmed that inner joins omitted guest comments and that artist approval could bypass platform holds. Those paths now use owned, transactional, revisioned reviews and retained report history.

The combined code candidate passed CI run 40227539676: 130 application cases, 111 actual PostgreSQL checks, HTTP, four SMTP/TLS checks and desktop/tablet/mobile browser journeys. These extend earlier milestones; they do not verify outside gateway/media/email accounts or production-schema compatibility. See RELEASE.md and artifacts/ci-milestones-8-12.txt. Named administration is implemented; actual owner enrollment/key custody/recovery is still a staging gate. Remote certificate checks no longer use rejectUnauthorized:false.

The owner supplied standing authorization for continued development, commits and draft-PR maintenance, while prohibiting production merge/deployment. That boundary remains in force. FEATURE-STATUS.md lists unfinished paid-download, royalty funding, live settlement/payout and provider-dependent work. Default preflight correctly reports blocked. No production-ready declaration is justified.

## Premium Listener follow-through — candidate 0.13.0-rc.13

The owner approved the supplied Premium Listener pricing/revenue policy and confirmed there are no binding 60% streaming commitments. Historical Professional product snapshots remain 60%; new streaming policy and product UI universally use 50%. Premium Listener benefits preserve existing free listening. Migration 013 adds owned paid terms, separate NGN verified-sale commissions, auditable stream signals, recognized revenue and immutable monthly statements rather than monetizing legacy play counters. See MILESTONE-13.md for recognition, rounding, fraud controls and refund recovery rules.

The integrated local candidate passed 136 application / 122 actual PostgreSQL tests, socket HTTP, four SMTP/TLS checks and three browser viewport journeys. New provider and settlement evidence is simulated; database concurrency and Chromium rendering are real local executions. A provider-neutral cash-release contract is implemented, but no actual provider-specific live settlement verifier is configured. Pending affiliate commissions, bank payouts, paid downloads, partial/dispute resolution and generic post-finalization corrections remain incomplete. Outside credentials and production-schema verification remain absent. This supersedes older notes that the streaming business formula itself is unapproved; it does not establish launch readiness.

## International currency correction — candidate 0.14.0-rc.14

The owner clarified that NGN listener figures were reference prices and explicitly approved USD 0.08 / 0.23 / 0.60 / 1.21 / 5.88 after a validated, dated public exchange-rate conversion. The workspace connection recovered with uncommitted work intact. M14 reuses the existing rate cache, country selector and quote table, preserves original local charge/refund and once-normalized cost evidence, separates legacy NGN books and blocks unsupported treasury conversion. No earlier migration or production record was reset. Historical NGN-only policy notes above are superseded by MILESTONE-14.md.

Local verification passed 140 application and 133 actual PostgreSQL tests, HTTP, SMTP/TLS and three browser sizes. A separate real public FX fetch through the pricing service succeeded; financial/provider responses remain fixtures. Populated read-only schema/accounting/FX integrity checks passed; overall launch remains blocked. New database protections cover approved prices, immutable quote/owner bindings, exact conversion provenance, low-cent commission caps and currency-specific recovery. Pending download commercial terms, live settlement/commission clearance/payouts, partial/dispute handling, generic finalized corrections and outside-provider/production/accessibility checks remain unfinished.

## Approved offline-listening correction — candidate 0.15.0-rc.15

The owner's current instruction supersedes all historical paid-download requirements and pricing questions above. There are no listener MP3 exports, permanent song purchases or separate download commissions. Premium saves live in the website browser library at no extra cost. The approved USD base prices and artist-package affiliate structure are unchanged. A signed, encrypted PWA offline implementation feeds only validated once-only signals into the existing 50% streaming pool, with expiry, periodic verification, abuse checks and a 48-hour period-close grace. See MILESTONE-15.md for tests, threat limits and real-service dependencies. The free-ad adapter is integrated but actual creative is missing/disabled; the app does not invent an advertisement or revenue. Real offline key/R2 staging and production-schema compatibility are not verified. The website remains a development candidate.

## Reconciliation operations — candidate 0.16.0-rc.16

A unified owner/finance workspace now derives unresolved sources from existing checkout, refund, Premium review, commission recovery, royalty recovery and withdrawal records. Operational case revisions and append-only notes are distinct from financial state and cannot resolve an active source. Gross receipts, ledger balances and finalized liabilities remain currency/mode-separated; legacy evidence cannot be promoted to live cash. Exact minor-unit strings and formula-safe private CSV protect audit exports. Migration 016 is additive with deferred matching review history, and preflight checks annotation consistency. Actual provider/treasury proof, settlement, payouts, production-clone compatibility/load and other release gates remain unverified. No prices, commissions, offline policy or production records were changed. See MILESTONE-16.md and RELEASE.md for evidence.

## Shared request protection — candidate 0.17.0-rc.17

The process-local/socket-keyed auth counter is replaced by production/staging PostgreSQL budgets and explicitly configured proxy-chain trust. Network checks precede authentication work; applicable account budgets use real verified identities across sessions. A private database seed pseudonymizes technical identifiers, while the owner/support dashboard receives only bounded aggregate pressure and policy/configuration metadata. Store failure cannot reset budgets or produce a fake provider success. Provider webhook verification is preserved outside the new user-action budgets. Migrations 001–016, commercial quotas, prices, ledger histories and Premium offline rules remain unchanged. Local application/PostgreSQL suites pass 165/160 plus HTTP, SMTP/TLS and browser/offline journeys; 35 axe scans pass. Actual Render peer paths, traffic/load/edge controls, outside providers and other release gates remain unverified. See MILESTONE-17.md and the PR-linked CI evidence.


## M18 launch verification update (2026-10-26)

The current managed environment is connected and supports outbound networking, unlike the initial baseline snapshot above. No provider/staging secrets or sanitized production clone are configured. Cross-browser website/PWA journeys now cover Chromium, Firefox and WebKit with 105 axe scans; populated historical upgrade fixtures, failure rollback and future/gapped-history rejection pass. The real public FX display/cache probe passed for five countries without repricing approved USD products. See M18 evidence and feature-status documentation for precise scopes. These checks do not complete the outstanding financial workflows, live integrations or production operational verification. The owner requested written policy options; the proposed rules remain inactive pending selection.


## M19 approved financial protection update

The owner replaced the proration proposal with explicit company-protective refund/royalty rules. New checkout acknowledgement, immutable policy/decision records, database-derived artist refund facts, once-only verified failure handling with persistent usable-output evidence, and protected finalized liabilities are implemented in the development candidate. Platform loss expenses are not treasury deposits or cash-release authorization. Independent live funding, complete support/dispute/correction workflows and actual outside-account verification remain launch gates. Migration 018 is additive; prior records and migration checksums remain intact.
