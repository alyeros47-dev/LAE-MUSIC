# Staging and release procedure

This document prepares a reviewable release; it does not authorize a deployment or merge.

## Before staging

1. Review the source diff and `docs/RELEASE.md`. Verify the development branch still descends from the intended main revision and resolve any new upstream changes on the development branch.
2. Create a disposable PostgreSQL database and a sanitized clone of the production schema/data. Do not point automated tests at production and do not drop production tables. Take and verify a backup before an approved production migration.
3. Use Node 22 and `npm ci` with the committed dependency lockfile. It was captured from the successful CI installation, not guessed. That installation reported zero known vulnerabilities; repeat the advisory review before an approved release.
4. Supply `DATABASE_URL`, a strong `ADMIN_KEY`, R2 account/bucket credentials, `MUSICAPI_API_KEY` and `OPENAI_API_KEY` only through the staging secret manager. `OPENAI_LYRICS_MODEL` must be an allowed model for that project. Remote PostgreSQL now requires verified TLS. Configure the reviewed CA chain, or explicitly select the exact Render private hostname as described below; verify actual staging connectivity before upgrading.
5. Legacy demo activation/payment variables no longer enable mutation routes; remove any stale values from hosting configuration. No supported environment toggle in this candidate can activate real checkout, settlement or payouts.

## Validation commands

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run test:http
npm start
```

Default tests use mocks and execute the actual server callback without opening ports. The browser runner mocks external APIs at an isolated test origin and produces screenshots/evidence in `artifacts/`. The HTTP test binds only the loopback interface. Neither replaces a real staging journey.

## Database upgrade

On server startup the existing initialization runs first, followed by `lib/migrations.js`. The new runner holds a transaction-scoped advisory lock, validates checksums and applies unapplied files from `migrations/` in order. Do not edit a migration after it is applied; add a new migration instead.

`001-platform.sql` adds profile metadata, indexes, request-key registries, finance/audit tables and append-only triggers. It does not reset records, backfill imaginary revenue or convert historic balances. Test first startup and a second startup on fresh and sanitized existing schemas. Check legacy BIGINT conversions and foreign-key compatibility before release. For large existing tables, measure index creation and schedule an approved maintenance window or have a DBA pre-create matching indexes concurrently before the startup migration.

`002-studio-releases.sql` adds private release jobs, catalog provenance, notification outbox, playlist revisions/ordering and discovery indexes. `003-commerce.sql` adds immutable purchase snapshots, verified receipt/event evidence and purchased-generation ownership links. `004-commerce-integrity.sql` adds journal uniqueness, subscription ownership and deferred purchased-credit receipt constraints. `005-currency-quotes.sql` adds immutable reference snapshots and local checkout quotes bound to USD order prices. Review the selected provider/FX boundaries in `docs/MILESTONE-4.md`. `006-checkout-attempts.sql` adds immutable checkout bindings, original-charge evidence and explicit verification-source details. `docs/MILESTONE-5.md` describes the closed-by-default Nigeria staging runtime and required real-provider verification. Reconcile any conflicting rows before retrying; never delete history to force a migration through. No historic balances are imported. Review `docs/MILESTONE-2.md` and `docs/MILESTONE-3.md` for operational gates.

Inspect `platform_migrations` and compare its recorded checksum to the reviewed file. Exercise the trigger protections and verify rejection of updates/deletes to new financial history. Verify actual PostgreSQL concurrency with multiple application connections; serialized JavaScript test doubles do not establish that behavior.

## Real integration journeys

- Register listener and artist/partner accounts over HTTPS. Verify password changes, sessions, sign-out, ordinary-user denial on admin APIs and cross-origin mutation rejection.
- Publish owned test audio/artwork with a verified staging subscription. Test pending-upload ownership, actual quota races, invalid MIME/length/signatures, repeated finish, cancellation/removal and expired plans. Verify playback/seek/range requests, artwork, queue, full/minimized player and navigation on real phones.
- Generate lyrics and music with a capped provider budget. Verify quota usage, duplicate-key replay, payload conflict, failed-task refund exactly once, stale pending locks, previews and owned WAV downloads. Confirm official supported features before enabling or advertising custom voices or guaranteed output counts.
- Create referrals and independently verified staging product purchases only after implementing/reviewing the payment adapter. Verify commission amounts, references, currency/price matching and replay behavior. Registration alone must create no commission.
- Reconcile historical balances using an approved source-of-funds policy before any ledger credit. Exercise withdrawal reservations, 3% rounding, insufficient funds, duplicate submission, administrative approval and rejection/reversal. An approved record is not a bank payout. Do not manually mark a withdrawal paid without a verified provider result and a reviewed settlement implementation.
- Exercise protected reports, catalog removal, content/video changes and audit recording. Recheck homepage content, real media performance, keyboard operation and reduced-motion preferences.

## Reconciliation of uncertain generations

An ambiguous network/provider response leaves the original artist-owned request and quota reservation in place. Capture the request/reference, owner, timestamp and provider evidence through the protected support workflow. Verify acceptance and task ownership directly with the provider before mapping a known provider task or releasing a reservation. Perform any approved repair with an artist row lock and a single database transaction that updates the task, usage and request-key mapping together and writes an audit entry. Preserve terminal states. Never resolve uncertainty by granting credits, deleting arbitrary tasks or resubmitting the provider request without evidence.

Lyrics reservations with an interrupted provider response also remain pending. There is no automated reconciliation UI or provider callback adapter in this candidate. A support procedure and real provider test are release gates.

## Render candidate and approval

Keep the existing Node service architecture. Build is `npm ci`; start remains `npm start`. Bind uses Render's `PORT`. Use a separately approved staging service/database/bucket, not an automatic production deploy from the development branch. Check `/health`, protected APIs, application logs, migration status and all real integration journeys. Review screenshots and test evidence. The user will handle final production merge/deployment after the documented gates are resolved; do not trigger either from the development branch.

## Rollback

After migration 008, retain the shared account lock, session revalidation and recovery-token protections in any rollback. Older password handlers can race a reset or recreate sessions with stale credentials. Pause authenticated account mutations while preparing a compatible rollback. Do not delete user accounts or reset passwords as a deployment shortcut.

After migration 007 and any refund hold or reversal, do not roll application code back to a version that ignores subscription holds or refunded purchased credits. Keep the compatible entitlement checks, or pause authenticated publishing, generation and financial mutations while preparing a compatible rollback. Public streaming can remain available. Do not clear holds or delete refund records to make an older version run.

Prefer rolling application code back while retaining additive tables and data. Do not run destructive down migrations or clear request, financial, subscription, session or user records. Keep the failed candidate logs and reconciliation references. Review the old version's demo-credit startup routines before rollback, since this candidate stops automatically applying the legacy extra-credit campaign at startup. A database restore is a separate approved incident operation, not a normal rollback step.

## Sandbox refund and dispute operations

Use the same reviewed Nigeria staging manifest and test credentials as sandbox checkout. Live refunds are unsupported. Artists can request a review from Purchases; operators review it in Admin → Refunds. Review notes are visible to the artist. Paystack submission checks the original payment and existing provider refunds, then submits the full original NGN/USD charge amount once. A consumed studio service needs an approved refund policy before submission. Flutterwave refund operations remain disabled pending verified v3 account evidence.

Keep an uncertain case and its original reference. Inspect the provider dashboard for the refund ID and use Check provider refund; this only retrieves evidence. Never retry a POST or change providers after a timeout. `processed` means Paystack reports processing complete, not proof of bank receipt. A full independently verified refund reverses the USD product sale and pending direct commission while preserving the original charge and order. Partial refunds and unresolved disputes hold the affected benefit for review. There is no manual mark-success or hold-release endpoint.

Authenticated lifecycle notifications delivered before charge confirmation quarantine the checkout reference and block a later charge event from granting benefits. Review unfulfilled notices in Audit and the original Checkout report; no receipt or refund success is fabricated. Late payments, unmatched notices, ambiguous bank outcomes and hold release need independently verified evidence and a separately reviewed support decision.

If a commission was already cleared or its pending balance is inconsistent, its status becomes `reconciliation_required`; new USD withdrawals and approvals of reserved USD withdrawals are blocked for that partner. Rejection can still release a reserved withdrawal. Approval never sends funds. Resolve the underlying accounting evidence before adding any payout integration.

## Recorded CI evidence

[Run 40184247862](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40184247862) passed application checks, browser journeys at 1440×1000 and 390×844, local HTTP routing, and nine PostgreSQL integration checks (one parent journey plus eight subtests) against a fresh disposable PostgreSQL 16 service. The PostgreSQL run uses an explicitly named loopback CI database and fixture credentials; it cannot be pointed at production by merely changing DATABASE_URL. Live R2, music and payment providers are still unverified.

## Account email staging and key custody

Keep `config/account-email.json` disabled until a transactional email provider and sender are approved. The prepared SMTP integration requires a verified hostname, port 465/TLS or 587/STARTTLS, sender address and canonical HTTPS public origin in that reviewed manifest. Set `SMTP_USER`, `SMTP_PASSWORD` and a dedicated 32-byte `ACCOUNT_EMAIL_KEY` encoded as 64 lowercase hex characters through the hosting secret manager. Do not reuse payment or session secrets. Run `npm ci` with the committed lockfile. Configure domain SPF/DKIM/DMARC with the selected provider and verify actual delivery to controlled staging recipients. This candidate has not performed that external verification or sent real mail.

Reset requests enqueue encrypted envelopes and return a neutral response. Inspect Admin → Security for queued, sent, uncertain and skipped counts; no recovery URL is exposed there. A sent status means SMTP accepted the recipient, not that the inbox received the message. Interrupted sends become uncertain after two minutes and are not automatically retried. The user can request a new link within the rate limit; previous links for that account and purpose stop working.

Retain the encryption key while queued messages exist. Rotation requires draining the queue or deliberately invalidating pending action tokens and skipping their outbox jobs in one approved, audited transaction before switching the key. Do not interpret decryption failure as permission to reveal ciphertext, print tokens or send an unverified replacement link. Expired temporary tokens and their encrypted envelopes are removed after a seven-day retention window by bounded maintenance; account and financial records are preserved.

Verify both account roles, same-email dual identities, sign-out of other devices, password-change/reset races, single-use and expired links, rejected SMTP recipients, untrusted certificates, and worker interruption before enabling account emails. `npm run test:email` uses an isolated loopback TLS server and fixture credentials; it is not proof of an external SMTP account or inbox delivery.

## Named administration and PostgreSQL transport (migration 010)

Read [MILESTONE-9.md](MILESTONE-9.md) before upgrading. Remote PostgreSQL now requires verified TLS; validate `PG_CA_CERT` and the external database certificate chain, or explicitly configure the exact Render internal hostname with `DATABASE_SSL_MODE=private` and `DATABASE_PRIVATE_HOST`. No hostname/password substring disables TLS. CI loopback tests do not verify Render connectivity.

Set a dedicated `ADMIN_MFA_KEY` (64 lowercase hex characters) and retain a private backup. Apply migration 010 through normal startup. Existing shared-key access remains until an owner completes password/authenticator enrollment under Access & security; completion disables shared-key cookies/sign-in. Save recovery codes and verify access before inviting staff. Do not reset production settings or operator records to recover access. Invite links are manually shared, never automatically emailed.

## Artist account notifications (migration 011)

Migration 011 creates the inbox and atomic event triggers; do not edit already-applied migration files. It preserves existing listener notifications and historical data. Production/staging schedules subscription reminder scans every 15 minutes; `ARTIST_NOTIFICATION_WORKER_ENABLED=false` pauses the global scan. Artist inbox access still checks that artist's due reminders. Verify continuous paid renewal suppression, due windows and aggregate Security operations health in staging. No notification sends email/push, renews a package, creates available funds or executes a payout. See [MILESTONE-10.md](MILESTONE-10.md).

## Community moderation (migration 012)

Migration 012 retains comments/reports and adds revisioned review state. Existing held comments become explicit platform holds. Artists cannot restore platform-held comments; owners/content operators review them under Moderation. Legacy approve/hide routes are preserved; permanent comment deletion is unavailable and database history guards block destructive cascades. Verify guest comment visibility, report threshold, operator roles and catalog unpublishing in staging. Original report text and resolved decisions remain available; do not reset report tables. See [MILESTONE-11.md](MILESTONE-11.md).

## Read-only preflight and launch checklist

Run `npm run --silent preflight` for configuration presence and outstanding gates. Add `-- --database` to inspect the configured sanitized staging/schema clone using a read-only snapshot, bounded query/lock timeouts and the application's verified transport policy. Exit 2 is expected while this candidate remains blocked; a database-only pass is not proof of provider readiness. The command never applies migrations, changes financial records or sends external requests other than the explicitly requested database connection. Review [MILESTONE-12.md](MILESTONE-12.md) and [FEATURE-STATUS.md](FEATURE-STATUS.md).

## Compatible rollback after administrator and moderation upgrades

After migration 010/owner enrollment, retain named-mode checks, session/version revocation, MFA and key custody. Do not deploy older shared-key-only authentication against an enabled named-operator database. After migration 012, retain platform-hold enforcement and revisioned review handlers; older artist handlers can bypass platform review. Keep a compatible revision or pause affected authenticated mutations while preparing recovery. Preserve all history/checksums and do not use destructive down migrations. The user performs the final production rollout.

## Premium Listener migration and reconciliation (013)

Review [MILESTONE-13.md](MILESTONE-13.md) before applying migration 013. It adds listener orders/attempts/receipts/entitlements, immutable commission/cost/reversal records, playback accounting/audience classifications, period fences, monthly statements/allocations/adjustments/recovery holds and independently backed cash-release records. It preserves old accounts, package snapshots and all prior migrations. No Premium history or revenue is invented for existing listeners. Inspect migration timing/index creation on a sanitized production clone before an approved deployment; startup applies it through the existing checksum/advisory-lock runner.

There are no new secret environment variables or activation flags in this milestone. Listener checkout uses the existing Nigeria staging merchant review/configuration and approved NGN test credentials; the committed manifest remains disabled. The NGN listener price is authoritative; international currency estimates do not create additional charge currencies. Keep test and live accounting separate. Historical Professional 60% product fields remain preserved; new streaming allocations universally use 50% as approved by the owner.

Verify actual fee/tax evidence, eligible-stream fraud review, recognition periods, statement hash, refund source and available-cash reconciliation before closing a month. Keep no-stream pools as liabilities until an approved resolution exists. The cash-release endpoint is unavailable until a provider-specific server-owned independent settlement verifier is implemented and tested. Do not inject a fixture verifier, mark pending commissions paid or treat a charge success as settled cash. Bank payouts remain unavailable. Partial/dispute outcomes and generic corrections after finalization require additional reconciliation workflows.

After applying 013, any code rollback must retain listener benefit holds, immutable royalty statements/refund adjustments, cash-source uniqueness and recovery-aware withdrawal guards. Pause authenticated financial/accounting mutations if the compatible revision is uncertain. Never remove history, migration checksums, holds or existing data as a rollback shortcut.

## International USD Premium Listener migration (014)

Apply 014 through the existing checksummed startup migration runner after 013. Do not edit or re-run earlier migrations. It adds immutable approved price catalogs, a USD order revision binding, a listener foreign key on the shared quote table, original local presentments/refund evidence and one-time cost-conversion evidence. Existing artist quote rows keep their owner/price; exactly one artist or listener order is required for new quotes. Historic NGN listener records and in-flight references remain valid and separate. Validate the migration first on a sanitized production clone; automated tests use only our disposable fixture.

The approved fixed USD catalog and dated reference/approval evidence are in `config/premium-listener-pricing.json`. Do not derive new base prices from each rate refresh, change an already-recorded revision in place, or use an environment variable to imply price approval. Use a new reviewed revision for future price changes. Local display rates use the existing source/cache; see MILESTONE-14.md for precision, account-currency alternatives and Paystack minimum limitations.

There are no new required secret variables. Existing reviewed staging merchant credentials/configuration and a valid callback origin remain necessary; live checkout is still unavailable. A local-currency receipt is not proof of USD cash settlement. Cross-currency cash release remains blocked until independent treasury conversion verification is implemented and tested. Do not substitute the quote/display rate as bank evidence.

A rollback after 014 must understand USD listener orders and nullable artist order references in shared quote rows, preserve original presentments/cost/refund evidence, enforce separate currency books and retain currency-specific recovery guards. Older M13-only listener code is incompatible with USD receipts. Pause financial mutations while preparing a compatible rollback; never delete data, holds or checksums to make older code run.

## Website offline listening (migration 015)

Follow [MILESTONE-15.md](MILESTONE-15.md). Preserve the existing 001–014 checksums and apply additive 015 through the normal startup migrator on an approved sanitized clone first. No records are reset. It adds device identities, single-use challenges/media tickets, signed grants, append-only sync/event/revocation history and offline source bindings to existing eligible streams. Month finalization now waits until 48 hours after UTC month-end. Review late/rejected signals in Admin → Royalties and the read-only preflight.

Create a dedicated P-256 signing key outside the repository with `node scripts/create-offline-key.cjs --output /secure/path/offline-key.txt`; the file is exclusively created with mode 0600. Put its content in `OFFLINE_LICENSE_PRIVATE_KEY` via the host secret manager. Do not print or commit it. All instances must share the same key; protect backups. Rotation causes cached grants to require online revalidation; cached trusted old grants can remain usable only until their existing maximum 24-hour expiry. This is not an instant offline revocation mechanism. Missing/invalid key or missing R2 leaves offline saving safely unavailable. HTTPS is mandatory outside loopback. Preserve `/service-worker.js` at root and same-origin `/offline` and static assets; do not CDN-cache private APIs or media tickets.

Approve a real audio creative, upload under `platform/ads/` in the trusted R2 bucket and review `config/listening-ads.json` (`enabled`, creative `reviewed`, `id`, `sponsor`, `audio_key`). Source validation checks audio MIME, object size and the owned bucket; signed URLs last five minutes. Free-listener breaks run after three completed tracks, use the current volume and respect explicit pause, with bounded failure handling. Premium listeners receive no ads. The committed ad manifest is disabled because no creative is supplied; current streaming continues. No advertising income or impressions are fabricated.

On controlled staging desktop and actual phones: log in to verified Premium, save a real published song, open `/offline`, disconnect, reload, play/pause/seek/queue and reconnect for one synchronized eligible play. Check expiry, refund/review holds, device limits/revocation, storage eviction/quota, clock changes, account switching/sign-out, multiple tabs, and server restart with the same signing key. Save counts/bytes have limits; metadata and cipher storage are separate. Changing browsers/origins or installing a separate Safari PWA can create a different library. Private modes/unsupported Web Crypto key persistence may disable saving. Browser storage is not hardware DRM; malicious local code/devtools or external recording cannot be prevented by a normal PWA. Do not claim otherwise.

Rollback must retain checks for expiring licenses, rejected/held streams, immutable event deduplication, financial currency evidence and the 48-hour finalization grace. Do not delete offline evidence, reset device sequences, rewrite royalty history or roll back to listener paid-download offerings. Purge only versioned public shell caches through a compatible worker update. Do not clear another app's caches.

## Reconciliation operations (migration 016)

Read [MILESTONE-16.md](MILESTONE-16.md). No new environment secret or live-payment activation flag is introduced. Apply additive 016 through the normal migrator on an approved sanitized clone before release. Preserve earlier checksums and production records; measure attention/journal-date index creation on actual data sizes. Admin → Reconciliation requires owner/finance scope, with recent MFA and transactional authorization fences on named review writes.

Verify USD/legacy NGN and test/live/legacy/ledger separation, original charge evidence, bounded search/paging, literal wildcard handling, exact integer exports and operator histories. Make two operators claim/update the same revision; exactly one conflicting edit should succeed. A review cannot resolve while the underlying source still needs attention. Use the existing source verification or withdrawal-review workflow; annotations must never release a benefit hold, credit a balance, clear a commission, send a payout or mark money paid.

The read-only preflight now checks case revisions against immutable matching history. Investigate a mismatch; do not delete notes or fabricate financial evidence. Export responses are private/no-store and neutralize spreadsheet formulas, but operator exports remain confidential financial records requiring appropriate custody. CSV rows are exact minor units. A truncated export is not a complete archive; choose a shorter supported ledger period and preserve its review context. Source histories and financial records are not deleted on resolution.
