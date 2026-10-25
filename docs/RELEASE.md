# Release candidate: 0.8.0-rc.1

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

## Executed evidence

`npm test` passes in this workspace. The recorded output is in `artifacts/test-results.txt`:

| Suite | Result | What it establishes |
| --- | --- | --- |
| Existing integrity/onboarding checks | Pass | Existing source integration and legacy inline-script syntax |
| Existing Sonic static checks | 31 pass | Reservation/ownership source invariants; two obsolete assertions updated to the current reservation-preserving behavior |
| Existing Sonic handler suite | 25 mocked cases pass | Authentication, quota reservation, provider success/failure and refund handling |
| New platform suite | 52 cases pass | Transaction/fee/credit/gift services, actual account/server request handlers, admin signatures and authorization, migration replay/checksum, player queue/driver/request races/resume, R2 signing/upload ownership/forged-file rejection/quota races, approved commercial contracts, product commissions and safe notification navigation |
| Browser runner | **Blocked, not passed** | Chromium exits at sandbox socket/process setup before any page runs. `artifacts/browser-attempt.txt` records the attempt |
| Socket-based HTTP test | **Blocked locally** | Local bind fails with `EPERM`; actual request handlers are exercised in-process instead |
| Real PostgreSQL / R2 / music / payment providers | **Not run** | No credentials or services attached. SQL adapters and provider responses in automated tests are controlled mocks |

The browser runner and GitHub Actions job are included for desktop/mobile journeys, screenshots, audio-element navigation continuity, registration, playlists, ambiguous studio retries, partners, admin sign-in and overflow checks. They must pass in a permitted environment. No screenshot or browser pass is fabricated. The in-memory SQL adapters serialize test transactions; they do not prove PostgreSQL locking, query validity or migration behavior against an actual database.

## Remaining launch gates and decisions

1. **Visual/browser/accessibility review:** run the browser suite, inspect screenshots at desktop/tablet/mobile sizes, complete keyboard and screen-reader review, verify touch seeking and real browser audio/autoplay policies. Current responsive CSS and DOM-level player tests are not visual verification.
2. **Database:** install pinned dependencies and commit a reviewed lockfile; run fresh initialization and repeated migrations against a disposable PostgreSQL service and a sanitized production-schema clone. Test actual concurrent gift/studio/upload/withdrawal requests, append-only triggers, query plans and migration lock duration. Existing legacy initialization still runs before the versioned additions. Review the existing remote TLS `rejectUnauthorized:false` setting and configure verified CA trust before launch.
3. **Storage:** supply R2 credentials and a test bucket, verify private reads, HEAD and Range requests, complete audio/artwork uploads and real playback. New song uploads use a same-origin proxy, so catalog upload no longer relies on exposing a reusable signed PUT URL. Advanced legacy voice uploads still require CORS verification. File-prefix checks are not a full audio decoder or malware scan.
4. **Music provider:** verify official Sonic model/task/voice/output/WAV capabilities and account permissions. Exercise actual success, rejection, timeout, malformed reference, concurrent polling and support reconciliation. Current status history stores task references; durable hosting/copying of generated previews and automatic publication into the catalog are not completed.
5. **Lyrics provider:** provide an authorized OpenAI project/key and confirm the configured model, billing and language behavior. Legacy Sol/Astra UI selections do not authorize arbitrary model names; the server uses `OPENAI_LYRICS_MODEL` (default `gpt-4.1-mini`). Ambiguous requests require reconciliation rather than a second debit/provider submission.
6. **Payments and settlement:** choose and verify the gateway, credentials, signed webhook/event normalization, order/amount/currency matching, refunds/chargebacks and bank payouts. The candidate contains safe ledger/withdrawal structures, not a completed gateway adapter. No provider event is fabricated. Subscription, studio, paid-download and coin checkout remain unavailable. No incoming-funds path currently credits the new ledger automatically.
7. **Accounting:** approve music download pricing, eligible revenue bases, streaming revenue funding/rates and reconciliation rules. Plan royalty percentages are preserved, but automatic royalty settlement is not implemented. Historical gift/commission balances are preserved and are not silently imported or made withdrawable in the new ledger. Real withdrawal disbursement is not implemented.
8. **Commercial contradictions:** obtain a decision on the legacy 10% quarterly team-sale proposal, external-upload limits (3/0/0 are declared but legacy enforcement uses total upload quotas), and the legacy generated-song upload-code entitlement. A code is currently issued after lyrics creation and permits an owned generated-song upload without a paid membership; this is not proof that the uploaded audio came from Sonic. That legacy path is retained for compatibility, not promoted as verified provider provenance. New UI records a rights declaration, but legacy audio-rights verification and catalog moderation need a complete launch review.
9. **Operational security:** perform dependency/advisory review, session-expiry cleanup, abuse/load tests and recovery exercises. Add verified email/password recovery and named administrator identities if multiple operators require individually attributable auditing. The preserved admin mechanism is a shared secret with a signed expiring cookie; new audit records identify that session class, not individual operators.

## Explicitly unavailable commercial actions

Payment checkout and webhook endpoints return unavailable. Coin purchases do not simulate receipt. Artist plan selection does not activate a subscription. Music-generation extras cannot be bought without a verified purchase integration. Public streaming stays open; an account is requested for personal or paid actions. Recruitment and registration themselves earn no new reward.

Review `docs/AUDIT.md` for the baseline and preserved pricing. Follow `docs/DEPLOYMENT.md` for staging and rollback preparation. Production deployment and merge require owner approval after these gates are assessed.
