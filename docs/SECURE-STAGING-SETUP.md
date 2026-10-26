# Secure setup needed for real integration verification

The development runtime is connected, but the observed environment currently has **no configured provider secrets, runtime variables or outbound identities**. The owner has not confirmed a separate staging service or sanitized database clone. Production is on Render. Development tests must not use production customer data, real merchant credentials or production storage writes.

Do not paste secrets into chat, GitHub issues/PRs, committed files, screenshots or test artifacts. Add them through the secure environment settings of a separate test runtime or an isolated Render staging service. This document contains names and procedures only. The server does not automatically load `.env` files.

## 1. Isolated service and database

- Keep production and PR #6 unchanged until reviewed. Create an independently named, non-production service/database with its own URL, credentials and storage bucket. Disable automatic deployments and background workers until the manifests/keys are reviewed. Do not point this development branch at the production database.
- Arrange an access-controlled, sanitized clone through your database/hosting administration workflow. Remove or replace personal information, passwords/session tokens, recovery/email/MFA secrets and provider credentials. Preserve relevant schema, constraints, migration history and representative financial relationships/amounts without identifying customers. Restored production sessions must never authenticate in staging. A clone needs a sanitization review before granting development access.
- Set `NODE_ENV=staging`, the staging `DATABASE_URL` and an isolated `PORT`. Use verified database TLS (`DATABASE_SSL_MODE=verify-full`, reviewed `PG_CA_CERT` if needed). Render private transport requires `DATABASE_SSL_MODE=private` and the exact approved `DATABASE_PRIVATE_HOST`; do not disable verification for an unreviewed public host.
- Back up the sanitized clone before upgrade rehearsal. Run read-only preflight first, retain immutable migration checksums, then rehearse the upgrade and restore on that clone. The fixture-only `test:postgres` and `test:upgrade` commands deliberately refuse a remote database; do not change their guard to run against a clone or production. Use a separately reviewed operational procedure for the clone.
- Inspect actual Render proxy peers before setting `TRUSTED_PROXY_CIDRS`. Do not guess a range. Measure real staging load, locking, pool usage, two-instance behavior and backup restore time.

## 2. Test payment accounts

| Secure setting             | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`      | Authorized Paystack **test** secret (`sk_test_...`)               |
| `FLUTTERWAVE_SECRET_KEY`   | Authorized Flutterwave **v3 test** secret (`FLWSECK_TEST-...`)    |
| `FLUTTERWAVE_WEBHOOK_HASH` | Dedicated random v3 shared webhook secret, at least 32 characters |
| `PAYMENT_CALLBACK_ORIGIN`  | The reviewed staging HTTPS origin, never a production redirect    |

Provide non-secret merchant account IDs, merchant-approved settlement/charge currencies and reviewed API version information. Review `config/payment-merchant.json` in a development commit; keep USD as base and Nigeria as the merchant jurisdiction, not the audience boundary. A reviewed sandbox manifest and `NODE_ENV=staging` are both required. Keys alone cannot open checkout. The committed manifest remains disabled. Register the actual staging webhook routes with the providers after review; verify signatures and independently retrieve payments using the original merchant account.

Test success, failure, cancellation, duplicate/reordered callbacks, local-currency quoting, minimum gateway amounts, refunds and ambiguous outcomes with provider-supported test instruments. Do not use a real card or represent a sandbox receipt as real revenue. **Live checkout, independent live settlement, payouts and commission clearance remain unfinished; adding production keys cannot enable them.** Refund/dispute/correction policy options are in [FINANCIAL-POLICY-OPTIONS.md](FINANCIAL-POLICY-OPTIONS.md).

## 3. Storage, studio and offline playback

- Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` for an isolated test bucket with least-privilege access. Review CORS against the exact staging origin, range requests, content-type/length validation, upload/download signing and cleanup permissions. Never provide production-wide write/delete credentials.
- Configure authorized test `MUSICAPI_API_KEY`, `OPENAI_API_KEY`, and the reviewed `OPENAI_LYRICS_MODEL`. Test generation may consume provider credit: use an approved test allowance and clearly labeled test jobs. Supply verified provider media hostnames in `GENERATED_MEDIA_ALLOWED_HOSTS`; no wildcards, arbitrary URLs or guessed CDN domains. Leave `STUDIO_RELEASE_WORKER_ENABLED=false` until reviewed.
- Configure a dedicated staging P-256 `OFFLINE_LICENSE_PRIVATE_KEY` using the supplied key-generation script and a secure file/secret manager. Keep the backup private; do not print the key. Use a different production key later with a documented rotation/expiry plan.
- Verify real media upload/import/streaming and offline browser playback, lease expiry, revocation and once-only synchronization on staging. Browser storage can be cleared/evicted and is not DRM. No listener MP3 export or separate song purchase may be added.
- Supply a rights-approved audio advertisement in the staging bucket. Review `config/listening-ads.json` and its creative before enabling real free-listener ad playback. Current disabled configuration must not be described as working monetized advertisements.

## 4. Email and administrative keys

- Configure a staging-only verified sender/SMTP account, `SMTP_USER`, `SMTP_PASSWORD` and dedicated 64-lowercase-hex-character `ACCOUNT_EMAIL_KEY`. Review `config/account-email.json` (provider, HTTPS public origin, sender, SMTP host and port 465/TLS or 587/mandatory STARTTLS). Use an isolated recipient allowlist or provider sandbox. The manifest remains disabled until reviewed.
- Configure a long random staging `ADMIN_KEY` and a separate dedicated 64-lowercase-hex-character `ADMIN_MFA_KEY`. Back up keys securely, enroll the named owner, confirm authenticator/recovery access and scoped-role behavior. Do not reuse production MFA keys or production recovery codes.
- Verify actual delivery and one-time recovery/verification links without logging their tokens. Local SMTP fixtures establish transport behavior, not inbox deliverability, sender authentication or production reputation.

## 5. What to report back without secrets

Confirm which isolated service/database/bucket and test accounts are ready, where the approved manifests/policies are recorded, the non-secret staging origin and the authorized provider-test budget. Share no credential values. Development can then verify the real integrations without touching production. A completed staging setup does not authorize a production merge or deployment.
