# Get the existing website into review

The development code is on `codex/premium-platform-release`, PR #6. It is not deployed on the existing production URL. A review environment is the immediate priority; it does not require enabling live money or completing every launch gate.

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
