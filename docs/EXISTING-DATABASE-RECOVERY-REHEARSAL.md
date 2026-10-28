# Existing database backup and upgrade rehearsal

The owner supplied Neon management access for the existing LAE-MUSIC production project. The read-only inspection verified its database binding, six-hour history setting and absence of saved snapshots. This procedure uses private Neon branches as a bounded recovery copy; it is not a production restore or a replacement website/database.

## Explicitly dispatched procedure

Run the existing verification workflow on `codex/premium-platform-release` with `existing_service_recovery_rehearsal=true`. It is opt-in, repository/branch guarded, serialized and limited to 20 minutes. Unit guards run before management writes. There are no Render mutations, production SQL writes, production branch resets, snapshot restore/finalize calls, billing-plan changes, generation requests, email or R2 operations.

The runner identifies the existing Render service, reads its configuration in memory, and matches the existing database host to the known Neon production project/branch. It creates a private child named `lae-release-<run>-backup` with a requested seven-day expiration. A 0.25-CU bounded endpoint reads an internal SHA-256 fingerprint of the existing public application tables, then is removed. The backup remains without a compute endpoint. This uses current-plan resources; it does not upgrade the plan or promise that all provider usage is free.

Neon rejected the attempted second cloud child during the first actual run (HTTP 400). The backup itself was created and read successfully; production was unchanged. The revised path uses no additional Neon branch. It can reopen the specifically identified owned backup using both its branch ID and original workflow run ID, with name, parent, project, expiry and host checks.

A PostgreSQL client of the source major version streams `pg_dump` directly into `pg_restore` in a private, disposable PostgreSQL container on the isolated CI runner. No dump file or database artifact is published. The container binds only to loopback, uses a random temporary password and serves no website. Actual restored record fingerprints must match the backup. Only this local test copy receives the 21 application migrations; original columns/records are compared again and a second migration run must be a no-op. The container and data are destroyed afterward. The private backup is retained until its requested expiry, without active compute after cleanup.

This is an authorized private recovery test, not a sanitized public review database. Real private records pass through the trusted CI runner and its disposable local database, never the public sandbox, logs, source repository or uploaded artifacts. API keys remain in process memory; only the backup database credential reaches the dump client through its process environment. The recovery job publishes no artifacts. SQL fingerprints and raw records are not printed; reports contain aggregate preservation counts and owned branch metadata. TLS verification remains enabled for Neon.

An interrupted job can leave an owned backup endpoint until idle suspension; inspect the logged owned branch ID before retrying. The local runner/database are disposable. There are no billing-plan upgrades or additional public services. This uses current-plan resources and does not promise every provider operation is free.

## Evidence boundary

The local PostgreSQL test verifies the fingerprint function against actual application tables, preserves original fields through migration and detects a changed fixture record. Management unit tests cover source/host/lineage guards, secret omission, read-only fingerprint transactions and cleanup after comparison/migration failure. Provider interactions in those tests are mocked.

Actual execution must independently return `recovery_verified=true`, `restore_tested=true`, record-preservation counts, successful migration replay and private-container cleanup before this gate is marked passed. A successful workflow with missing credentials, merely configured history retention, or an unexpired backup name is insufficient. The backup is a point-in-time recovery copy, not ongoing synchronization; recreate a fresh copy before a later approved production migration if it is stale or expired.

The official Neon snapshot-restore API can default to its source branch. This procedure deliberately never uses it, never finalizes a restore, and never moves production compute. Restoring production in an actual incident is a separate reviewed operation. Do not point the public sandbox at either private recovery branch.
