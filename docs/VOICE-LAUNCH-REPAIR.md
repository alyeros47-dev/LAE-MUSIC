# Voice launch repair — November 15, 2026

## Decision: blocked; do not merge or deploy as a working voice repair

The confirmed code defect is misleading feedback: finishing a new microphone recording replaced an existing non-retryable provider failure with a message telling the artist to confirm consent and save. Save correctly remained locked against repeating the rejected paid training request. The same local-preview message also hid processing, uncertain submission and missing-configuration explanations.

This branch preserves those explanations after microphone capture and file selection. It also recognizes HTTP-200 `forbidden`/explicit `reason_code` task failures instead of leaving them indefinitely in training. It does not remove provider verification, charge another training request, replace a saved sample, change existing ready profiles or alter music/credit rules.

The current artist account has not yet been identified, so the read-only evidence below establishes a real blocked path, not a confirmed account-specific diagnosis for the latest report.

## Live evidence

[Read-only diagnostic run](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/43761911905) succeeded. Render service identity was checked before configuration access. Only configuration-presence flags and redacted task metadata were reported; no secrets, owner emails, task IDs or sample URLs were printed.

- The configured MusicAPI key authenticates against its read-only credits endpoint; credits are available.
- All required R2 settings are present. This does not certify a fresh real upload.
- Production has four ready profiles, one failed profile and one uploading profile. Existing ready-task lookups returned personas; no new profile was trained.
- The existing failed task still returns `didnt_say_verification_phrase`, without a persona. Its saved audit has `retry_allowed: false`.
- Zero production writes, sample downloads, new training requests or music-generation requests were made. No paid provider or customer credits were spent.

## Provider capability and blocker

The actual integration uses **MusicAPI.ai**, at `api.musicapi.ai`.

- [Create voice](https://docs.musicapi.ai/create-voice) supports an owned MP3/WAV via `POST /api/v1/sonic/create-voice`, then task polling for `persona_id`. Published training cost is 5 credits. Voice samples must be clear solo vocals, over ten seconds, with the documented supported duration/format bounds.
- [Music instructions](https://docs.musicapi.ai/sonic-instructions) and the existing adapter use `persona_music` and the artist-owned ready `persona_id`. A generation costs 20 credits and returns two songs. The backend refuses a requested unavailable personal voice rather than silently generating a standard voice.
- [FAQ](https://docs.musicapi.ai/faq) distinguishes own-audio voice creation from personas based on provider-generated song clips. The latter is not a substitute for a customer's recording. It also warns that own-audio personas may become unavailable.
- The [API changelog](https://docs.musicapi.ai/doc-9411955) recognizes `didnt_say_verification_phrase` as a rejected input. The published create-voice contract does not document obtaining a challenge phrase or submitting a separate verification recording.

**Required next step:** MusicAPI must supply/enable its supported voice-ownership verification workflow, or resolve the rejection on this route. The support request in [VOICE-VERIFICATION-FAILURE.md](VOICE-VERIFICATION-FAILURE.md) can be forwarded without credentials or a recording. No support message was sent automatically. Do not invent a phrase, bypass verification or reuse another provider's API contract. If MusicAPI cannot support the workflow, selecting another voice service and integrating its documented verification would be separate work.

Once the supported contract is available, complete one explicitly consented, owned-sample training and personal-voice generation. Current published estimate: **25 provider credits** (5 training + 20 for two tracks), subject to account terms. This test has not been run because repeating the known rejection cannot establish success.

## Focused checks

- `node --test tests/voice-production.test.cjs tests/voice-diagnostic.test.cjs tests/voice-launch-inspection.test.cjs tests/studio-workflow.test.cjs`: four test files passed, covering consent, authorization, formats/size bounds, four-minute WAV integrity, storage failure, profile ownership, once-only training, terminal/uncertain failures and diagnostic redaction.
- `LAE_DB_TESTS=true DATABASE_URL=<disposable-local-database> node tests/voice-failure-postgres.cjs`: five checks passed, including real row locks, concurrent polling, durable failure records, retained samples/ready profiles and unchanged song credits.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/voice-recorder-browser.cjs`: desktop and Android Chrome emulation passed. Simulated PCM input produced a complete four-minute 11.52 MB WAV and used the loopback upload fixture. New-recording and file-selection failure-message regressions passed, with no duplicate training requests or page errors.
- `node scripts/test-sonic-handler.cjs`: 31 mocked adapter checks passed, including server-selected owned personas, unavailable personal-voice rejection, quotas/reservations and refunds.
- `git diff --check`: passed.

Provider training/generation and microphone input in automated tests are fixtures. Physical Android microphone behavior, a fresh real R2 upload, current end-to-end profile creation, successful personal-voice music generation and human voice likeness remain **not verified**. API authentication and older ready profiles do not prove the failing workflow is repaired.

Production remains unchanged. Keep this work in a draft PR until the provider blocker is resolved and the real workflow passes.
