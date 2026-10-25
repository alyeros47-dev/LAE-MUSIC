# Staging and release procedure

This document prepares a reviewable release; it does not authorize a deployment or merge.

## Before staging

1. Review the source diff and `docs/RELEASE.md`. Verify the development branch still descends from the intended main revision and resolve any new upstream changes on the development branch.
2. Create a disposable PostgreSQL database and a sanitized clone of the production schema/data. Do not point automated tests at production and do not drop production tables. Take and verify a backup before an approved production migration.
3. Install dependencies under Node 22, generate/review the package lockfile, run an advisory review, and use `npm ci` after that lockfile is committed. Shell package installation was unavailable in the development sandbox; no lockfile has been guessed.
4. Supply `DATABASE_URL`, a strong `ADMIN_KEY`, R2 account/bucket credentials, `MUSICAPI_API_KEY` and `OPENAI_API_KEY` only through the staging secret manager. `OPENAI_LYRICS_MODEL` must be an allowed model for that project. Review PostgreSQL CA/TLS verification; the old server configuration disables remote certificate verification.
5. Leave legacy demo activation/payment variables unset. No supported environment toggle in this candidate can activate real checkout, settlement or payouts.

## Validation commands

```sh
npm install
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

Keep the existing Node service architecture. Build remains `npm install` until a reviewed lockfile is present, then `npm ci`; start remains `npm start`. Bind uses Render's `PORT`. Use a separately approved staging service/database/bucket, not an automatic production deploy from the development branch. Check `/health`, protected APIs, application logs, migration status and all real integration journeys. Review screenshots and test evidence, then request explicit owner approval for the production merge/deployment.

## Rollback

Prefer rolling application code back while retaining additive tables and data. Do not run destructive down migrations or clear request, financial, subscription, session or user records. Keep the failed candidate logs and reconciliation references. Review the old version's demo-credit startup routines before rollback, since this candidate stops automatically applying the legacy extra-credit campaign at startup. A database restore is a separate approved incident operation, not a normal rollback step.
