# Get the existing website into review

The development code is on `codex/premium-platform-release`, PR #6. It is not deployed on the existing production URL. A review environment is the immediate priority; it does not require enabling live money or completing every launch gate.

## Automated temporary preview through GitHub Actions

The owner configured `RENDER_API_KEY` as a repository Actions secret and requested that Codex create the separate test site. `.github/workflows/review-site.yml` runs only on the development branch in the exact repository when its provisioning files change. It uses that secret inside the GitHub runner; secret values are never copied into chat, artifacts, application containers or the repository.

The automated route creates only **lae-music-review-sandbox**, a free Docker web service with automatic deploys disabled. The existing application runs with its own loopback PostgreSQL 16 inside this disposable review container. It requires no second managed-database plan and refuses an external `DATABASE_URL`. A prominent site notice explains that test accounts/data can reset when the service restarts or redeploys. This preview is for interface, registration and connected review; it is not durable staging or a production-clone rehearsal.

Only the review service is created. The workflow never patches, deletes, redeploys or reads database contents from production. It stops for invalid credentials, ambiguous workspaces, unexpected existing configuration or a paid-plan requirement. Build minutes/bandwidth remain subject to the owner's Render workspace limits; no paid compute fallback is allowed. The existing manual managed-database Blueprint below remains an alternative and is not automatically applied.

The actual server-returned URL and 12-probe result appear in the workflow summary after successful startup. Real studio/storage/email/payment credentials and valid test entitlements are still required for those integrations. Do not enter real payment details or rely on temporary accounts/data being retained.

## One separate Render Blueprint

In your Render dashboard choose **New → Blueprint**, connect `alyeros47-dev/LAE-MUSIC`, select branch **codex/premium-platform-release**, and use root **render.yaml**. Review the resources before confirming creation. This is the owner action that starts deployment; Codex has not performed it.

The Blueprint creates **lae-music-review** and a new, empty **lae-music-review-db**. Leave production services/databases alone. Automatic deploys are off. Use unique names if these names already exist; update both database references together. Free plans are requested; review Render's current availability, costs, sleep and database-expiration limits. Do not approve a paid upgrade unintentionally. This preview uses Render private networking with the exact generated database host, rather than disabling public TLS verification.

After Render reports the service healthy, open its assigned HTTPS URL. Share that **non-secret URL** so the HTTP smoke check and real user journeys can target it. The URL cannot be known until Render creates the service. Never share environment values, admin keys or production database access.

## What you can test immediately

Home/discovery, mobile navigation, account registration/sign-in, listener collections, artist onboarding/profile, Premium prices and the studio screens. The new database starts empty: supply your own authorized test catalog through the existing upload workflow after configuring the separate R2 bucket. No invented songs, paid packages, transactions or generated music are seeded. An empty catalog is not evidence of successful audio streaming.

The generated staging `ADMIN_KEY` is visible only in your Render service environment settings; use it privately for the administrator sign-in. Named administrator enrollment still requires a separate valid `ADMIN_MFA_KEY` and authenticator setup. Do not reuse production keys.

## Real lyrics and music generation

The provider integrations still need actual verification. In **this staging service only**, configure authorized `OPENAI_API_KEY`, `OPENAI_LYRICS_MODEL`, `MUSICAPI_API_KEY`, and the separate R2 bucket settings described in [secure setup](SECURE-STAGING-SETUP.md). Provider music requests can consume credit. Use an approved test allowance. Verify exact provider media hosts before enabling durable imports. A paid package/test entitlement must come from the existing independently verified sandbox purchase flow; do not mark a real payment successful or bypass quotas to test.

The Blueprint deliberately does not provide these credentials, activate artist paid benefits, enable sandbox merchant manifests, deliver email, or activate real payments/payouts. Until configured and verified, the affected actions remain unavailable. Interface tests and simulated provider tests do not prove real lyrics/song generation.

## Quick URL verification

From the repository with dependencies installed:

```sh
node scripts/check-preview.cjs https://YOUR-REVIEW-SITE.onrender.com
```

This performs read-only HTTP probes of pages, assets, health, the catalog, anonymous admin denial and the approved USD prices/seven-day policy. A missing database/catalog API fails the check. Passing means the site is available for review, never production-ready. Actual registration, authorized uploads, lyrics, music generation, playback and offline tests remain separate real journeys.

No production merge or deployment is authorized by this setup file. Existing migrations and all approved prices/policies remain unchanged.
