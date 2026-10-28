# Verify existing database recovery access

The verified application candidate passed full Chromium, Firefox, WebKit, PostgreSQL/upgrade and persistence CI at [40605283819](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40605283819). The existing live database still needs a verified recovery path before its migration. Application tests and a provider retention setting are not proof of an executed restore.

The read-only existing-service workflow can use an optional `NEON_API_KEY` repository Actions secret. It first matches the existing Render `DATABASE_URL` host to the known Neon production project and branch through the management API. It refuses another database, branch or project. It reports retention settings and unexpired source snapshot metadata only; credentials, connection strings, snapshot names and user rows are never printed. It cannot create, restore, reset or delete a branch/snapshot, change billing, or deploy production. Missing access and failures remain explicit, and `restore_tested`/`recovery_verified` remain false.

## One-time owner setup if the check reports missing management access

1. Open [Neon](https://console.neon.tech). Use the account/profile menu to find **Account settings → API keys**, or your organization's API-key controls. Create a key that can read the `lae-music-db` project's metadata; use project-scoped permissions if available. This is management access, not the database password or OpenAI/MusicAPI/R2 credentials.
2. Open [LAE-MUSIC → Settings → Secrets and variables → Actions → New repository secret](https://github.com/alyeros47-dev/LAE-MUSIC/settings/secrets/actions/new). Set **Name** to `NEON_API_KEY`, paste the new management key into **Secret**, and save. Do not paste it into chat, source code or a screenshot. Do not replace any current live environment variable or secret.
3. Confirm that the secret is saved. The prepared existing-service audit can then be rerun without changing production. An API key alone does not certify backup restoration or authorize resetting the production branch.

The owner must perform the sign-in/key creation step: the development environment has no Neon identity and cannot grant itself account permissions. An existing permitted management key on the live service can also be reused in memory by the audit, without moving or replacing that key.

## Recovery evidence still required

Identify a current recovery point bound to the verified production branch, then rehearse recovery into an isolated target and verify preserved accounts/catalog/credits before any destructive operation. No production restore/reset is part of this audit. A replacement production database, temporary review records or a copied password list are not substitutes for a recovery plan.

API fields and paths were checked against the [official Neon v2 specification](https://neon.com/api_spec/release/v2.json): project `history_retention_seconds`, endpoint host/branch binding and snapshot `source_branch_id`, creation and expiry metadata. Access to a management API or an unexpired snapshot is not reported as a successfully tested backup.
