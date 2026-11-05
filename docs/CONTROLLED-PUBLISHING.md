# Initial-launch business and publishing policy

LAE-MUSIC is an AI-powered music creation, streaming and creator monetization platform. Independent creators generate original music in LAE-MUSIC Studio, publish completed songs on LAE-MUSIC and may earn from eligible streaming activity. Listeners discover and stream those songs. The initial launch is not an open marketplace for conventional recordings or externally generated music.

## Customer-facing changes

- Approved copy is centralized in `config/publishing-policy.json` and exposed through `/api/platform/business`, `/api/site` and `/api/plans`.
- About, How It Works, Publishing Policy and FAQ pages are linked from the public footer. Homepage, artist onboarding, package cards and upload instructions explain the same Studio-only model.
- Public package names/prices are **Starter $6, Growth $10 and Premium $20**. The existing `professional` identifier still represents Premium in stored purchases, checkout, subscriptions and referrals; no identifiers or financial records are renamed.
- Public package descriptions no longer promise external uploads, song quantities, generation quantities or additional-generation prices. Revised allowances remain under review. Existing granted account benefits and internal fulfillment/credit rules are retained pending the separate economics instruction.
- Own original lyrics and musical production instructions remain supported in the existing Gospel Studio. Its profiles, generation configuration and audio engine are unchanged.
- Copyright/licensing responsibilities, rights declarations, moderation, complaint review and takedown procedures remain applicable. AI-generated music is not automatically copyright-free. Streaming earnings are not guaranteed.

## Enforced publication boundary

1. Native upload preparation requires an account-owned completed-audio code and an explicit rights declaration, even for an active paid package. A client-supplied `generated`, plan, source or policy flag cannot authorize publication.
2. Codes resolve through the existing durable `platform_requests` permit and `generation_records` ownership, then a successfully completed `sonic_test_tasks` record. Lyrics-only codes and another artist's codes do not qualify.
3. Proxy audio uploads and final publication verify the SHA-256 fingerprint of the original provider-confirmed Studio recording. A valid code cannot authorize a substituted external recording. Artwork remains customer-supplied, subject to existing validation and permissions.
4. Final publication rechecks provenance, rights and existing paid/refund-hold/quota eligibility inside the creator transaction. Interrupted generated uploads remain resumable with the original code and files; published replay does not create another release.
5. Direct saved-Studio publication registers and consumes the same account-linked generation record in its publication transaction. A failed generation cannot be published merely because a saved draft says `ready`.
6. Temporary review-file uploads also require an owned completed-audio permit and matching original bytes. Disposable CI fixtures now seed synthetic completed Studio generations rather than relying on the retired external-upload path.

External-upload architecture remains in the repository for a future reviewed policy change. There is no new browser flag, environment override or production setting that enables it. Existing published external recordings are grandfathered: they remain readable and streamable. Pending external drafts and all files/records are preserved, but cannot newly publish under this launch policy.

## Database, credentials and rollout

No schema migration, database copy, credential change, production write, song deletion or file deletion is required. The implementation uses existing generation, rights and publication fields. Existing records are not backfilled or rewritten.

The change is isolated on `codex/controlled-publishing`. Independent affiliate and voice-repair work remains separate. Merge and production deployment require the owner's explicit approval. Before deployment, verify required GitHub checks for the exact candidate. After an approved deployment, check the public policy/package pages and one owned saved Studio release; a new paid generation is not needed to exercise publishing policy.

Rollback is a code rollback to the previous approved production revision; no reverse data migration is needed. Rolling back the policy would reopen the former external-upload behavior and should be an explicit operational decision.

## Verification

All new generation/storage calls use fixtures or local disposable PostgreSQL; no paid provider credits, live buckets or customer data are used.

- Focused policy, upload, package, Gospel and shared service tests.
- Actual database API tests for forged/missing/foreign/lyrics-only codes, rights declaration, substituted audio, valid resumable upload, direct saved-release provenance, release notifications and existing-catalog preservation.
- Existing PostgreSQL application journeys covering publication locks, refund holds, authentication, payments, credits, account roles and persistence.
- Existing Gospel generation-code and interrupted-upload database checks.
- Chromium at 390px and 1440px: public copy, accessibility, package names/prices, no unapproved quantity promises, and required-code upload controls.

Detailed executed results and any outstanding CI checks are recorded in the pull request. New package economics and owner approval remain separate from this policy implementation.
