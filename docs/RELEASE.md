# Release candidate: 0.8.0-rc.6

**Draft for review, not launch-ready.** No Render deployment or production merge has been performed. Existing production records were not accessed, modified, deleted or reset.

## Delivered on the development branch

- Shared dark design system, local brand artwork, responsive navigation and connected listener, artist, studio, partner, account and admin screens. No framework replacement, new hosting service or Android changes.
- One audio element outside the page router, real catalog stream URLs, race-safe track loading, seeking, duration, volume/mute, shuffle, repeat, editable queue, expanded/mobile views, media-session actions, useful failures and opt-in resume after reload. Notification navigation posts to the existing player document.
- Discovery search/genre/popularity filters, artist pages, song details, comments, guest likes, account favorites, playlists, history and release notifications using the existing APIs. Separate listener and artist/partner registration is preserved.
- Artist overview, real catalog/play/follower data, profile editing/photos, metadata editing, controlled R2 proxy uploads, subscription selection/status and earnings/withdrawal records. No per-stream revenue is invented.
- Studio title/lyrics/style/language-direction inputs, AI lyrics assistance using the configured server model, owned task progress/history/previews/WAV requests, and visible package/lyrics allowances. No claim of guaranteed African-language quality, voice support or exactly two provider outputs.
- Durable, owner-scoped idempotency for music generation, transactional lyrics debit/ledger/result persistence/refunds, and transactional gift debit/result recording. Ambiguous provider acceptance retains the reservation for reconciliation. An unresolved music request blocks another request even after fifteen minutes.
- Free partner enrollment, product-specific referral links, approved direct-sale percentages, verified-sales summaries/history and monthly sales charts. Dormant paid-enrollment/recruitment rewards cannot be activated by calling the legacy enrollment helper; historical tables remain intact.
- Additive, checksummed migrations with advisory locking; append-only balanced transfer history; currency-separated accounts; withdrawal requests with gross/3% fee/net, atomic reservations, rejection reversals, protected approval and audit records. Approval cannot mark money paid or send a bank transfer.
- Protected admin overview, artist/listener/catalog/subscription/affiliate/payment/gift/generation/withdrawal reports, catalog unpublishing, content/video controls and audit reporting. No arbitrary user-facing SQL or client “mark paid” endpoint.
- Central origin/fetch-metadata checks, account-attempt limiting, shell CSP, security headers, private gift-income access, serialized upload quota reservation, controlled upload endpoints and stored-file format-prefix validation before publication.
- Durable studio-release copying with trusted-host/public-address checks, leased workers, owner previews, explicit publication, shared annual upload quota locking and a durable follower-notification outbox. Playlist rename/reorder/remove/delete uses ownership, revision conflicts and capacity locks; discovery pagination preserves filters and timestamp precision.
- Immutable unpaid product records, purchase review/history/cancellation, active/upcoming renewal terms, provider-neutral verified settlement, pending product-sale commissions, purchased studio-credit reservations/refunds and administrative accounting reconciliation. The actual gateway remains unconfigured; no environment flag enables live checkout.

## Executed evidence

`npm test` passes in this workspace. The recorded output is in `artifacts/test-results.txt`:

| Suite | Result | What it establishes |
| --- | --- | --- |
| Existing integrity/onboarding checks | Pass | Existing source integration and legacy inline-script syntax |
| Existing Sonic static checks | 31 pass | Reservation/ownership source invariants; two obsolete assertions updated to the current reservation-preserving behavior |
| Existing Sonic handler suite | 25 mocked cases pass | Authentication, quota reservation, provider success/failure and refund handling |
| New platform suite | 107 cases pass | Transaction/fee/credit/gift services, actual account/server request handlers, admin signatures and authorization, migration replay/checksum, player queue/driver/request races/resume, R2 signing/upload ownership/forged-file rejection/quota races, approved commercial contracts, product commissions and safe notification navigation |
| Browser runner | **Pass in GitHub Actions** | Desktop/tablet/mobile fixtures exercise actual rendered UI and a real audio element using a test WAV. The local sandbox attempt remains recorded in `artifacts/browser-attempt.txt` |
| Socket-based HTTP test | **Pass in GitHub Actions** | Actual HTTP routing, public access and safe failure responses; local binding remains blocked |
| PostgreSQL 16 | **58 tests pass in GitHub Actions** | Fresh initialization, migrations 001–007, real concurrent gifts/credits/withdrawals/studio requests, media copy/publish, playlist/discovery constraints, signed-fixture settlement, renewals, pending commissions, purchased-credit refunds, immutable evidence, reconciliation and restart preservation; providers remain mocked |
| Live R2 / music / payment providers | **Not run** | No live credentials or services attached |

The complete code candidate passed its application tests, HTTP checks, all three Chromium journeys and 58 PostgreSQL 16 tests in [run 40211884076](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40211884076), at commit `d434f778a61b884daeb86560b705b45ac89e9195`. Condensed evidence is in `artifacts/ci-milestone-6.txt`, with screenshots in the run’s browser-evidence artifact. Desktop and mobile refund dashboards were visually inspected from run 40211525089; automated tablet checks and screenshots also passed. This does not replace physical-device or accessibility verification. The SQL adapters remain unit tests; the separate disposable PostgreSQL job verifies actual schema and locking behavior. Provider, FX, music and media transports are isolated fixtures. No real provider sandbox account, production integration or sanitized production-schema clone was verified.

## Remaining launch gates and decisions

1. **Visual/browser/accessibility review:** Desktop/tablet/mobile CI fixture screenshots have been inspected. Review physical-device sizes, complete keyboard and screen-reader review, verify touch seeking and real browser audio/autoplay policies. Current responsive CSS and DOM-level player tests are not visual verification.
2. **Database:** use the committed CI-resolved lockfile. Fresh PostgreSQL 16 initialization, migration replay, immutable history, real gift/studio/credit/withdrawal concurrency and restart preservation now pass. Run the same checks against a sanitized production-schema clone, repeat upload-reservation concurrency and examine query plans/migration lock duration. Existing legacy initialization still runs before the versioned additions. Review the existing remote TLS `rejectUnauthorized:false` setting and configure verified CA trust before launch.
3. **Storage:** supply R2 credentials and a test bucket, verify private reads, HEAD and Range requests, complete audio/artwork uploads and real playback. New song uploads use a same-origin proxy, so catalog upload no longer relies on exposing a reusable signed PUT URL. Advanced legacy voice uploads still require CORS verification. File-prefix checks are not a full audio decoder or malware scan.
4. **Music provider:** verify official Sonic model/task/voice/output/WAV capabilities and account permissions. Exercise actual success, rejection, timeout, malformed reference, concurrent polling and support reconciliation. Owned completed outputs now have durable copying to R2, leased retries, private previews and explicit artist publication into the catalog. These paths pass fixture-backed PostgreSQL/browser tests; actual provider CDN hosts, media compatibility, R2 lifecycle/cleanup and permissions still require live verification.
5. **Lyrics provider:** provide an authorized OpenAI project/key and confirm the configured model, billing and language behavior. Legacy Sol/Astra UI selections do not authorize arbitrary model names; the server uses `OPENAI_LYRICS_MODEL` (default `gpt-4.1-mini`). Ambiguous requests require reconciliation rather than a second debit/provider submission.
6. **Payments and settlement:** Flutterwave and Paystack are selected; Nigeria and USD base prices are confirmed. The closed-by-default staging runtime supports reviewed test accounts only. Sandbox checkout and original NGN/USD charge verification are connected. Paystack full refunds have one-attempt submission, independent verification, benefit holds and reversal journals. Signed lifecycle notices hold benefits and quarantine out-of-order references without claiming a completed refund. Verify real merchant accounts, permissions, credentials and provider outcomes; complete Flutterwave v3 refunds, approved partial/consumed-service policies, dispute outcome verification and hold release, actual fees/FX/settlement and bank payouts. Provider receivables and pending commissions remain non-withdrawable. Paid-download and coin checkout remain unavailable. See `docs/MILESTONE-5.md` and `docs/MILESTONE-6.md`.
7. **Accounting:** approve music download pricing, eligible revenue bases, streaming revenue funding/rates and reconciliation rules. Approved integer royalty allocation calculations are implemented and tested; automatic royalty funding and settlement are not implemented. Historical gift/commission balances are preserved and are not silently imported or made withdrawable in the new ledger. Real withdrawal disbursement is not implemented.
8. **Commercial contradictions:** obtain a decision on the legacy 10% quarterly team-sale proposal, external-upload limits (3/0/0 are declared but legacy enforcement uses total upload quotas), and the legacy generated-song upload-code entitlement. A code is currently issued after lyrics creation and permits an owned generated-song upload without a paid membership; this is not proof that the uploaded audio came from Sonic. That legacy path is retained for compatibility, not promoted as verified provider provenance. New UI records a rights declaration, but legacy audio-rights verification and catalog moderation need a complete launch review.
9. **Operational security:** perform dependency/advisory review, session-expiry cleanup, abuse/load tests and recovery exercises. Add verified email/password recovery and named administrator identities if multiple operators require individually attributable auditing. The preserved admin mechanism is a shared secret with a signed expiring cookie; new audit records identify that session class, not individual operators.

## Explicitly unavailable commercial actions

Payment checkout and webhook endpoints return unavailable. Coin purchases do not simulate receipt. Artist plan selection does not activate a subscription. Music-generation extras cannot be bought without a verified purchase integration. Public streaming stays open; an account is requested for personal or paid actions. Recruitment and registration themselves earn no new reward.

Review `docs/AUDIT.md` for the baseline and preserved pricing. Follow `docs/DEPLOYMENT.md` for staging and rollback preparation. Production deployment and merge require owner approval after these gates are assessed.

## Defects confirmed by the real integration run

Fresh initialization originally referenced music/comment tables before creating them; their DDL now runs before notification/gift foreign keys and comment alterations. Concurrent music retries could receive a provisional reference that became invalid after provider acceptance; an owner-scoped stable reservation mapping now resolves it to the canonical provider task. Both paths are covered by the passing PostgreSQL journey.

The interface preserves the existing guest-comment path and does not introduce a new $1 withdrawal minimum. Fees are rounded to currency minor units; a one-minor-unit request has a zero rounded fee. Provider-specific payout limits must be approved with the eventual payout integration.

## Currency and selected gateway expansion

`docs/MILESTONE-4.md` records the chosen providers, USD accounting policy, country/display conversion, immutable FX quotes, documented Paystack/Flutterwave protocol differences and remaining local-currency checkout/settlement work. Local tests pass 89 cases; the expanded provider/currency PostgreSQL and browser journeys pass in the linked CI run. No gateway, bank payout or local-currency charge is enabled by this expansion.

## Nigeria checkout coordination

The owner confirmed Nigeria. `docs/MILESTONE-5.md` records the durable checkout coordinator, exact local-charge/quote verification, independent reference lookup, original-charge evidence, review/status screens and closed-by-default staging runtime. Live checkout, refunds/disputes, bank settlement and payouts remain disabled or unfinished. The milestone-5 coordinator/runtime/UI run passed 101 local cases and 44 PostgreSQL tests and all three viewport journeys. Gateway/FX/media transport responses remain isolated fixtures.


## Refund recovery and benefit protection

`docs/MILESTONE-6.md` records purchase refund requests and protected administrative review, Paystack sandbox submission and independently verified full refunds, original-currency observations, USD product-sale reversals, pending commission reversals, durable benefit holds and safe withdrawal approval guards. Upload publication rechecks benefits under the refund lock after storage verification. Lifecycle notifications arriving before charge confirmation quarantine the checkout instead of permitting a later grant. Partial refunds, already-cleared commissions, consumed services and unresolved disputes retain explicit review states. Migration 007 and the updated rollback instructions preserve history and prevent older code from reusing held benefits. Flutterwave refund operations and live payments remain disabled.
