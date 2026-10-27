# Two independent studios in one workshop

The owner clarified that lyrics composition and music production are separate tools, similar to writing in a lyrics service and then pasting into a music service. The redesigned page now preserves that distinction without replacing either existing backend.

## Lyrics Studio

The title and song idea come first, followed by the original music family/country/profile, musical direction, language, mood, vocals, duration, percussion and custom language controls. Both GPT-6.1 Sol and GPT-6 Astra are explicit choices. Submit generates lyrics and a separate music style/arrangement result. Each result has a visible Copy button with a manual-selection fallback. The existing artist-owned generation/upload code follows those two results.

The optional “Use lyrics & style in Music Studio” action transfers the title and both results only when clicked. It confirms replacement if the destination has different content. It makes no generation request and spends no credit. Copy/paste remains fully supported.

## Music Studio

A separate form has its own title, pasted lyrics and style inputs, then the local singing-voice recorder/file preview, ready saved-profile selection and music-generation action. It uses the original MusicAPI request, quota, idempotency and status/preview handlers. The two forms have separate local drafts. Editing lyrics results does not silently replace the music-production draft. Historical lyrics restore into Lyrics Studio only.

Browser permissions allow same-origin microphone use with explicit browser permission; cameras, geolocation and third-party microphone access remain blocked. The prior blanket microphone-denial header prevented real recording even though controls were visible. Physical-device behavior still needs verification. New R2 voice upload/training remains owner-deferred and disabled, as before.

## Actual model selection and safety

Previously the backend ignored the old model selector and always used `OPENAI_LYRICS_MODEL`; the sandbox reports `gpt-4.1-mini` for that legacy setting. The new form sends the chosen approved ID (`gpt-6.1-sol` or `gpt-6-astra`). The backend checks the exact model through an authenticated, read-only OpenAI model lookup **before** reserving a lyrics credit. Concurrent lookups are deduplicated; positive checks cache for 15 minutes, failures for one minute, isolated by credential and model. Unknown selections, missing access and mismatched lookup responses fail without fallback or credit deduction. Selected models are included in the idempotency payload and sent to the existing Responses request path; original cultural prompt instructions are unchanged.

A successful model catalog lookup is not a completed generation or quality test. If the current service cannot provide these exact IDs, the form must not pretend they are connected or silently substitute GPT-4.1 mini. A secure read-only Actions diagnostic can verify both against the existing sandbox key without displaying keys, generating paid output, copying credentials or deploying. Actual diagnostic results are recorded in the PR; no availability is claimed before the check.

Legacy clients that omit a model retain the existing environment-configured default for compatibility. The new studio always submits one of the two explicit choices. No production or sandbox API environment variable is changed by this code package.

## Testing and delivery

Tests cover both selected models reaching the actual handler, original prompt/profile preservation, model inclusion in request protection, unavailable-model rejection, lookup caching and no substitution. Browser journeys cover two separate forms/drafts, explicit transfer without extra provider requests, copy buttons, independent editing, local voice preview, preserved song-generation retry keys and accessibility on desktop/tablet/mobile. External generation is mocked in these browser tests.

The owner explicitly requested the sandbox update. Application revision `df95fe8729590933c8bd59e21a5345cc0f10f48f` was deployed successfully by review-only Actions run 40536346433 on 2026-10-27. Hosted JavaScript/CSS hashes match the tested source; both model choices and all 99 cultural profiles are present. Actual mobile-sized browser checks against the hosted backend passed fresh registration, two logout/re-login cycles for each role, independent studio forms, explicit transfer and independent editing. No billed generation or voice upload was performed. The workflow verified production environment/deployment fingerprints unchanged. Automatic review deployments remain disabled; this was an explicitly requested release. Temporary test data may reset on an instance replacement or future release. This is not a production-ready announcement.
