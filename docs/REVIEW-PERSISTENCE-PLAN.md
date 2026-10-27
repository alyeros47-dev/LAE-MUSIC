# Stable sandbox accounts and test uploads

## Problem and proposed fix

The deployed free Review Sandbox keeps PostgreSQL and local test media inside its temporary container filesystem. Redeploying or replacing that instance can remove accounts, password hashes and uploaded test files. Signing out does not delete accounts. Disabling automatic deployments reduces avoidable resets but does not solve storage persistence.

The prepared option retains the **same review service and same local PostgreSQL backend**, using a dedicated Render disk. It does not copy or connect to the production database, transfer API keys, alter the live R2 bucket, or create a second permanent production platform.

Render documents that disks require a paid web service and only files under the mount persist: https://render.com/docs/disks . Its public pricing verified on 2026-10-27 lists the 512 MB service at USD 7/month and disks at USD 0.25/GB/month: https://render.com/pricing . Proposed sandbox-only cost: **approximately USD 7.25/month for the service plus one GB disk**, before applicable taxes/usage. Existing provider/API usage is separate and its safety limits are unchanged. No paid change has been authorized or made by this development work.

## Concrete configuration

- Existing review service: `srv-dbfmk5ss728c73ded300` / `lae-music-review-sandbox`.
- Service plan: `starter`; automatic deployments remain off.
- One dedicated disk: `lae-music-review-state`, 1 GB, mounted at `/var/lib/lae-review`.
- `LAE_REVIEW_PERSISTENT_STORAGE=1` enables persistent mode, only after the configuration script validates that exact attached disk and service.
- PostgreSQL data, its local database password, test media and provider-budget counters live on that disk. Existing `/tmp` application paths become controlled links to the dedicated paths. The database name/loopback port and existing anti-production SQL identity checks stay unchanged.

The entrypoint briefly prepares the volume as root and then drops to the postgres user for PostgreSQL/Node. Missing mounts, foreign markers, existing unrecognized/local data, symlink replacements, missing password files and incompatible database versions fail closed rather than initialize replacement data. The default unconfigured CI image remains ephemeral.

The account/session and upload screens distinguish verified configured persistent mode from temporary mode. Accounts remain subject to normal session expiration and separate test-access windows; an expired trial does not erase the account. Provider counters persist too, so a redeploy cannot silently grant more paid API capacity.

## Approval and activation

Recurring billing requires explicit owner approval. The existing manual `Configure isolated review integrations` workflow now has:

- `persistence_mode=plan`: read-only Render inventory/cost plan; no upgrade, disk creation, environment mutation or deployment.
- `persistence_mode=activate` **and** `approve_monthly_charge=true`: after mock and real-container checks, upgrade only the fixed review service and attach only the fixed disk, then enable and deploy the isolated review code through the existing guarded integration workflow.
- `persistence_mode=unchanged` (default): normal explicitly requested review deployment; no paid-resource preparation.

The activation script refuses other services, branches, disk names, sizes and mount paths. Repeated approved runs reuse the disk rather than create another. A partial infrastructure failure stops for reconciliation; no disk is deleted, replaced or automatically downgraded. Production environment/deployment fingerprints remain checked by the original rollout safeguards.

**The initial switch may require one final registration** because accounts already lost from the old temporary filesystem cannot be recovered from absent records. No current live sandbox change is performed until billing approval. After proper activation, verified accounts and test media should survive normal review deployments/restarts; deleting the disk would still delete its data.

## Verification

The local integration fixture uses two separate disposable containers and one named local Docker volume. It registers a genuine artist, uploads/publishes actual synthetic MP3 bytes, records a mocked provider-budget use, stops/removes the first container, creates the second, then verifies the same email/password/account ID, audio Range bytes, unchanged local DB password and retained provider counter. It fabricates no paid subscription and makes no real provider, Render or R2 operation. The test passed against the existing local PostgreSQL16/Node image with current candidate source copied into it.

The PR's new `review-persistence` CI job builds the actual new Dockerfile and runs that same replacement test without any service credentials. Unit tests cover production isolation, absent/foreign disks, preservation of existing files, secret and symlink failures, precise paid-plan validation, explicit cost approval and retry-safe resource creation. Actual Render durability is not certified until the approved disk is attached and a real restart/relogin has been verified.

Persistence is not a complete backup strategy. Render warns against recovering a custom database by restoring filesystem disk snapshots. Use verified PostgreSQL logical backups (`pg_dump`/restore) for database recovery; never describe a raw disk snapshot as a tested database backup. Production backup/restore and production deployment remain separate, owner-approved work.
