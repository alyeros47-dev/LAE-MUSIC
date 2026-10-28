# Existing database backup and upgrade rehearsal

The owner supplied Neon management access for the existing LAE-MUSIC production project. The read-only inspection verified its database binding, six-hour history setting and absence of saved snapshots. This procedure uses private Neon branches as a bounded recovery copy; it is not a production restore or a replacement website/database.

## Explicitly dispatched procedure

Run the existing verification workflow on `codex/premium-platform-release` with `existing_service_recovery_rehearsal=true`. It is opt-in, repository/branch guarded, serialized and limited to 20 minutes. Unit guards run before management writes. There are no Render mutations, production SQL writes, production branch resets, snapshot restore/finalize calls, billing-plan changes, generation requests, email or R2 operations.

The runner identifies the existing Render service, reads its configuration in memory, and matches the existing database host to the known Neon production project/branch. It creates a private child named `lae-release-<run>-backup` with a requested seven-day expiration. A 0.25-CU bounded endpoint reads an internal SHA-256 fingerprint of the existing public application tables, then is removed. The backup remains without a compute endpoint. This uses current-plan resources; it does not upgrade the plan or promise that all provider usage is free.

A second child of that backup, named `lae-release-<run>-rehearsal`, has a requested one-day expiration and 0.25-CU bounded compute. Its original table schemas/record fingerprints must match the backup. Only this test child receives the 21 additive application migrations. Its original columns and records are compared again, and a second migration run must be a no-op. The test child and its compute are removed in cleanup; the backup is retained until its expiry. An interrupted job can leave owned temporary resources until their expiry/idle suspension; inspect the logged branch IDs before retrying. The runner refuses to reuse an existing run name.

Production credentials are not copied into logs, artifacts or the public sandbox. Private production records remain in the private Neon project. The restore rehearsal serves no web app and does not authenticate as an existing user. Fingerprints and raw records are never printed; only aggregate preservation counts and owned branch metadata are reported. TLS verification remains enabled.

## Evidence boundary

The local PostgreSQL test verifies the fingerprint function against actual application tables, preserves original fields through migration and detects a changed fixture record. Management unit tests cover source/host/lineage guards, secret omission, read-only fingerprint transactions and cleanup after comparison/migration failure. Provider interactions in those tests are mocked.

Actual management execution must independently return `recovery_verified=true`, `restore_tested=true`, record-preservation counts, successful migration replay and test-branch cleanup before this gate is marked passed. A successful workflow with missing credentials, merely configured history retention, or an unexpired backup name is insufficient. The backup is a point-in-time recovery copy, not ongoing synchronization; recreate a fresh copy before a later approved production migration if it is stale or expired.

The official Neon snapshot-restore API can default to its source branch. This procedure deliberately never uses it, never finalizes a restore, and never moves production compute. Restoring production in an actual incident is a separate reviewed operation. Do not point the public sandbox at either private recovery branch.
