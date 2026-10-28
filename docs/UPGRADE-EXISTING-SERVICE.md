# Upgrade the existing LAE-MUSIC service

Owner direction, October 26, 2026: the completed and approved code will update the existing production Render service. Preserve its PostgreSQL database, users, songs, R2 bucket/object keys and all environment values. The Review Sandbox is for development/testing only. This document is preparation, not approval to merge, deploy, access production records or change configuration.

## What stays in place

- The existing live Render service, origin and provider bindings.
- The existing PostgreSQL database and its historical application/financial records.
- The existing R2 bucket, uploaded audio/artwork/voice objects and credentials.
- Existing OpenAI, MusicAPI, gateway, email and other environment values. No key transfer, rotation or recreation is required merely to deploy updated code. If a verified compatibility/security issue needs a change or a genuinely new setting is required, document it separately for owner review; never replace an entire environment inventory with a template.

`render.yaml`, the review Docker image, review marker, temporary database, restricted review credentials and provider test budgets are **sandbox-only**. Do not use that Blueprint to recreate the production service or database. Do not transfer review users, unpaid purchase fixtures, test balances or review-only settings into production.

## Prepared sequence, only after approval

1. Finish required feature/provider verification and review the exact candidate and changes since its tested commit. Keep unresolved checks visible. An all-green automated workflow alone is not launch approval.
2. Arrange an authorized backup and restore rehearsal for the existing database. Rehearse additive migrations on a sanitized copy of the actual production schema/data; this is a test copy, not a replacement database. Current populated-upgrade fixtures do not certify compatibility with an unseen production schema.
3. Privately inventory configuration names and source bindings without publishing secret values. Confirm the production service remains linked to the same database and bucket. Report mismatches and required new settings before an approved rollout; preserve existing values by default.
4. Review migration history/checksums and expected locks/index duration. Keep applied SQL files unchanged. The migration runner serializes pending upgrades and rejects changed/unknown/gapped history. Never drop/reset tables, delete history, reseed users, fabricate balances or run disposable-CI scripts against production.
5. Complete the owner-approved safe final R2 upload/voice test before declaring required integration complete. Until then, these checks stay pending. Do not attach the public sandbox to live storage for upload/delete tests. Readiness must not be inferred from existing bucket/key presence.
6. After explicit owner approval, deploy the reviewed code to the **existing** Render service using its current database and storage configuration. Use normal startup/migrations; do not deploy the review container or its temporary PostgreSQL to production. This step remains unperformed.
7. Perform the separately authorized post-upgrade health, sign-in, catalog/playback and migration checks against the existing service. Confirm pre-existing identities, records and object references remain available. Keep payment/settlement/payout activation separate from code deployment and limited to verified, approved operations.
8. If rollback is needed, use a reviewed application version compatible with the migrated additive schema and security/accounting guards. Retain data, journals and migration history. Restoring a database or reversing financial history is a separate approved incident action, not a routine rollback.

## Work that continues now

Studio/lyrics/credit safety, artist dashboards, guest streaming and payment/accounting regression checks continue without R2 upload tests. Real provider responses must remain distinguished from mocks. Temporary sandbox failures must never be solved by mutating the production database, changing its credentials or writing/deleting live objects.
