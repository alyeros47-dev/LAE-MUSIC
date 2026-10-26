# Independent sandbox integrations

The owner authorized using existing OpenAI/MusicAPI integrations on **LAE-MUSIC Review Sandbox** while preserving the live website, its uploads, keys, voice profiles and generation services. This authorizes sandbox configuration/testing only, never production deployment.

## Separation

The integration workflow identifies the live service by its exact repository, owner and `https://lae-music.onrender.com` origin. It pins the sandbox to service `srv-dbfmk5ss728c73ded300`, the development branch, isolated review marker and its distinct HTTPS origin. It reads source configuration privately in the GitHub runner and fills only missing sandbox values for `OPENAI_API_KEY`, `OPENAI_LYRICS_MODEL`, `MUSICAPI_API_KEY` and verified generated-media host instructions. Existing dedicated sandbox values are preserved.

The live service receives **no PUT, PATCH, DELETE, deploy, key rotation or environment-group change**. The workflow fingerprints its source environment and checks its deployment metadata before/after. Original values are neither moved nor removed. Keys are not printed, returned in reports, saved in source files or exposed to clients. Sandbox values are separately stored on the sandbox service, with no shared Render environment group.

Copies of the same provider key still share the provider account's billing, credits and rate limits. They are not separate provider accounts. The temporary review image limits charging calls to two OpenAI requests and one MusicAPI request per temporary instance, persisted across Node process restarts while its temporary filesystem remains. Read-only authentication/polling does not use that allowance. Production has no such new limit. New account keys with separate budgets are preferable for long-term staging.

## Storage protection

Production R2 write credentials/bucket are **not copied** to the public sandbox. This protects existing uploads, artwork and voice samples. Supply a complete separately scoped set as repository Actions secrets when available:

- `SANDBOX_R2_ACCOUNT_ID`
- `SANDBOX_R2_ACCESS_KEY_ID`
- `SANDBOX_R2_SECRET_ACCESS_KEY`
- `SANDBOX_R2_BUCKET`, with value `lae-music-review-sandbox`

The sandbox bucket must differ from production, and its access key/secret must be different and restricted to that bucket. Both the workflow and review image reject a production/unrelated bucket. Missing storage settings leave uploads, voice training and durable generated-song imports unavailable; no success is simulated. Existing live uploads and voice profiles are not copied, rewritten or deleted. Each sandbox artist gets a separate new voice-profile record.

No production database, admin/session/MFA keys, payment secrets, email credentials, offline signing key or paid entitlement is copied. Temporary sandbox accounts/data can reset on deployment. Real money remains disabled.

## Verification

The workflow verifies the pinned sandbox image, applies individual sandbox-only environment updates and deploys only that sandbox at the exact development commit. It checks OpenAI model access and the documented MusicAPI read-only credit endpoint without printing balances, secrets or raw provider payloads. Configuration presence alone does not establish a successful generation.

After configuration, `LAE_REVIEW_LYRICS_TEST=1 node scripts/verify-review-lyrics.cjs` explicitly performs one real original lyrics request through the sandbox using an existing welcome credit, checks its owned history, and replays the same request key to prove a second credit is not spent. It does not buy a package, change subscription status, grant fake paid benefits or train a voice. A failed/ambiguous generation must be reconciled before issuing another request.

Music generation and voice training require separate verified executions and eligible entitlements/authorized voice samples. Neither is declared successful from a key-presence flag or a balance lookup. Payment/email and provider billing/account changes remain separate work. Sources: [Render environment API](https://api-docs.render.com/reference/update-env-var), [sandbox deploy API](https://api-docs.render.com/reference/create-deploy), [MusicAPI read-only credits](https://docs.musicapi.ai/get-credits).
