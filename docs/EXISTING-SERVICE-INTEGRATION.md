# Upgrade the existing LAE-MUSIC service

Owner direction, October 27, 2026: pause sandbox development/deployments and integrate the redesigned platform into the existing LAE-MUSIC service. The sandbox is not the final product. Preserve the current production database, R2 bucket, API configuration, users, music and working engine.

## Integrated candidate

The integration reconciles production `4339f6ec38ab88fd0afa6ca6b55b63056aa246ee` with development `6362de15016e347d0c120a5e642d2feced3cd2d4`. Production includes 13 newer repairs. Keep its affiliate access/navigation changes, but retain the upgraded password/session handlers and verified-sale-only accounting. Do not restore the legacy automatic demo-referral-credit routine or old login code while resolving conflicts.

Existing affiliate registration/login/dashboard URLs now resolve to the shared redesigned frontend and the same account backend. Artist and listener records are not copied into a new platform. The production runtime remains Node with `npm start`; do not promote the review Docker container, its temporary PostgreSQL database or its `LAE_REVIEW_*` variables.

## Commission practice without a gateway payment

`/partners?mode=demo` provides an explicitly labelled practice form for an authenticated partner. It uses the approved artist product prices and direct commission percentages, with a unique per-account demo reference and duplicate protection. Examples persist in the separate `partner_practice_sales` table introduced by additive migration `020-partner-practice.sql`.

Practice examples never create commerce receipts, real commissions, financial transfers, paid packages, studio credits or withdrawable funds. The normal dashboard continues to count only verified real product sales. This is an accounting demonstration, not proof of a successful gateway integration. Demo examples cannot be converted into real payments by changing a status.

## Read-only production compatibility inspection

`scripts/audit-existing-service.cjs` identifies only the existing LAE-MUSIC Render web service by repository, name and canonical Render origin. It issues GET requests only, keeps credential values in process memory, and reports configuration presence plus the deployed commit/build/start commands. It never imports `server.js`, starts the app, applies migrations, updates Render settings or deploys code.

Database inspection uses read-only transactions with query timeouts. It reports migration compatibility, table counts and legacy column metadata, never passwords, sessions, bank details, account names or API credentials. Environment fingerprints before/after establish that the inspection did not change configuration. The dedicated Actions workflow uses the existing authorized Render secret; no key transfer or recreation is required.

## Release sequence

1. Finish the read-only report against the existing production schema and resolve actual incompatibilities. A missing migration table in an older database indicates an upgrade is needed; it does not authorize resetting the database.
2. Verify a restorable backup or provider recovery point before a production schema upgrade. Do not assume the temporary sandbox is a production backup.
3. Re-run application, database, historical-schema upgrade and browser tests on the integrated commit. Confirm existing authentication and R2 object keys remain compatible.
4. Review the migration inventory and retained environment configuration. Add only genuinely required settings; never replace the environment with a template.
5. Switch the existing service to the verified application code in one reviewed release. Never replace the live service with the review Blueprint, temporary accounts or synthetic financial data.
6. Validate the real service's login, existing songs, artwork, studio, artist exports and partner dashboards. Keep real financial operations disabled until actual provider verification is complete.

No production migration, environment modification, merge or deployment is performed by the read-only workflow. This document does not claim the remaining production checks have passed.
