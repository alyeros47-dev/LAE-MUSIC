# Staging and release procedure

This document prepares a reviewable release; it does not authorize a deployment or merge.

## Before staging

1. Review the source diff and `docs/RELEASE.md`. Verify the development branch still descends from the intended main revision and resolve any new upstream changes on the development branch.
2. Create a disposable PostgreSQL database and a sanitized clone of the production schema/data. Do not point automated tests at production and do not drop production tables. Take and verify a backup before an approved production migration.
3. Use Node 22 and `npm ci` with the committed dependency lockfile. It was captured from the successful CI installation, not guessed. That installation reported zero known vulnerabilities; repeat the advisory review before an approved release.
4. Supply `DATABASE_URL`, a strong `ADMIN_KEY`, R2 account/bucket credentials, `MUSICAPI_API_KEY` and `OPENAI_API_KEY` only through the staging secret manager. `OPENAI_LYRICS_MODEL` must be an allowed model for that project. Review PostgreSQL CA/TLS verification; the old server configuration disables remote certificate verification.
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

Keep the existing Node service architecture. Build is `npm ci`; start remains `npm start`. Bind uses Render's `PORT`. Use a separately approved staging service/database/bucket, not an automatic production deploy from the development branch. Check `/health`, protected APIs, application logs, migration status and all real integration journeys. Review screenshots and test evidence, then request explicit owner approval for the production merge/deployment.

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
