# Restore the existing studio's musical direction

The redesigned studio was calling the original `/api/music/lyrics-generate` route but sent only a broad genre and `tradition: custom`. It omitted `gospelProfile`, `secularProfile`, beat, chosen mood, vocals and duration. This bypassed the existing detailed profiles and weakened the creative brief.

The redesigned interface now reads the selection metadata directly from the existing `music-prompt-studio.html` through `/api/platform/studio/catalog`. It exposes all 66 gospel and 33 secular profiles by country, including Organic Afro-Fusion, Deep-Bass Afro-Fusion, Afrobeats–Amapiano Fusion and the original gospel styles. There is no independently maintained replacement preset registry. The detailed prompts remain in the unchanged original lyrics handler in `server.js`.

Only the selected musical family is submitted. Country changes filter the correct profiles; family changes clear the other family and select a matching broad genre. Mood, lead vocals, target duration, optional percussion, exact native-language text and additional-language guidance use the existing request fields. Style/country selections persist with the artist's local draft. Generated lyrics and their arrangement continue into the existing MusicAPI workflow. The arrangement field now accepts the engine's full 950-character output, correcting the frontend's previous 900-character limit.

The configured `OPENAI_LYRICS_MODEL` stays authoritative. No model, prompt, API credential, wallet, entitlement, provider adapter, database, quota, price or production configuration is changed. Descriptive profile names and original songwriting instructions are preserved; this does not promise imitation of a performer's voice or songs.

## Verification

- Source comparison: both complete backend profile dictionaries exactly match the previously audited production-main source snapshot (`24718b32df138711a73426fb4fd5042767b74f74`). This is source parity, not a read of the deployed service's private environment.
- Four focused tests cover complete catalog-to-handler correspondence, public metadata routing, mutually exclusive family payloads and the actual original handler's outgoing OpenAI system/user instructions with mocked responses and credit reservation/completion assertions.
- The browser journey selects Nigeria → Organic Afro-Fusion, changes mood/vocals/duration/percussion, reloads the saved draft and checks the submitted profile and settings. Existing music retry-key and owned-voice checks remain.
- New provider calls, output quality and physical-phone confirmation are separate from mocked verification. Do not claim a freshly verified real generation from these tests.
- R2 upload and voice training remain owner-deferred. This work requires neither and never contacts the live bucket.

This correction is intended for PR #6 and the existing Review Sandbox. It does not authorize production deployment.

## Review image correction

The first published code passed source-based tests and CI, but the real sandbox catalog returned HTTP 500: its Docker recipe copied root JavaScript but omitted `music-prompt-studio.html`. The review image now explicitly includes that original file. The shared read-only readiness probe checks all 99 profiles, so the actual-container smoke test and public readiness checks catch this packaging failure. A green source test alone does not certify the deployed studio.

The owner is considering a later invited-artist trial of one or two music generations. No trial quantity, sponsored account activation, public paywall removal or production deployment is enabled by this correction. The current paid-entitlement requirement remains until a separate audited sponsored allowance is implemented and the owner chooses the offer. Lyrics credits and music generations are separate.
