# Voice training: confirmed verification-phrase rejection

## Confirmed production evidence

The read-only voice diagnostic matched the owner-reported artist and inspected the existing failed MusicAPI task. The provider returned HTTP 200 with `type: failed` and `error: didnt_say_verification_phrase`; nested `data.type` was `api_error`, with the same message. It returned no persona. The source was a WAV file. This establishes a verification rejection, not a demonstrated four-minute recording limit.

Diagnostic run: https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/41827144187

The diagnostic performed SELECTs in a read-only transaction and GETs to the fixed Render service and the existing MusicAPI task. It did not initialize the application, migrate data, modify a profile, retrieve the recording, change storage/environment settings, submit training or generate music. Logs contain only a hashed artist lookup/task reference and allowlisted, redacted status fields; no credentials, signed URLs, email addresses or recordings.

## Provider contract gap — voice creation is NOT verified working

As checked on November 4, 2026:

- https://docs.musicapi.ai/create-voice.md documents a single `audio_url`, plus optional webhook fields, and a cost of 5 credits. It documents no challenge phrase, phrase ID or verification-recording parameter/endpoint.
- The actual connected task rejects the sample for a missing verification phrase.
- https://docs.musicapi.ai/create-persona.md explicitly marks the alternative `/sonic/persona` operation unavailable. Do not switch routes to bypass the verification requirement or invent a fixed phrase.

MusicAPI must supply a supported verification contract (or confirm a provider-side repair) before LAE-MUSIC can complete the verification step. Obtain the official challenge-fetch endpoint and response schema, phrase ID/text/language/expiry binding, verification-recording submission format and ownership requirements, completion/polling contract, account capability and credit/refund rules. A phrase copied from an unrelated provider or an old fixed phrase is not sufficient evidence.

Suggested support request (no customer recording or credentials):

> Our `POST /api/v1/sonic/create-voice` call with an artist-owned MP3/WAV URL is accepted, but its existing task fails with `didnt_say_verification_phrase`. Your current OpenAPI documents only `audio_url` and webhook fields. Please provide the supported verification-phrase and recording API workflow, including phrase ID/expiry and the required training fields, or confirm the fix for this route. Can the existing stored singing sample be reused with the separate legitimate verification recording? Please also confirm failed-task credit/refund semantics.

No support message was sent automatically.

## Prepared application repair

- Parse failed/pending/ready task results, including nested failures. A stale persona field cannot override an explicit failed result.
- Store a safe, account-owned failure explanation in the existing append-only audit log. Never expose raw provider response text or private sample URLs in the customer interface.
- Previously failed profiles can recover their reason by reading their existing task; this is not another training submission.
- Explain that the provider requires spoken verification. Block repeated save/training requests for a confirmed non-retryable verification failure, including direct API calls. Preserve the original R2 object key and task; no deletion or forced re-recording.
- Retain the explanation after reload, file selection and status checks. Stop automatic polling on a terminal failure. Keep explicit standard-voice selection and existing ready profiles unchanged.
- Serialize terminal updates with the artist row lock and recheck the task ID. An old poll cannot overwrite a newer profile/sample.
- Keep the complete four-minute 24 kHz mono WAV recorder and existing music/credit flows intact.
- No new database migration or provider account is required for this failure-handling repair.

## Focused verification

- Voice/workflow/diagnostic units: 17 passed, including the actual rejection shape, legacy failed-profile lookup, once-only training, blocked retries, stale polls, immediate rejection, outages, valid ready profiles and unchanged four-minute WAV bounds.
- Disposable PostgreSQL: 5 passed, including concurrent polling, one durable failure record, preservation of samples and ready profiles, no repeated provider submission and no song-credit changes.
- Chromium at 390px and 1440px: full four-minute capture/upload fixtures, explicit saved-voice choice, failure explanation on reload/file selection, disabled retry and unchanged provider submission counts passed.

All generation/training responses in automated tests were mocked. The investigation used zero paid provider requests and consumed no customer credits.

## Release status

The application repair is prepared for review, not deployed. Production, its R2 bucket/keys, current profiles, songs, affiliate work and other platform features remain unchanged. Voice creation is **NOT READY for a successful end-to-end claim** until the supported provider verification workflow is connected and a specifically authorized controlled real training test succeeds. Published training price is 5 credits per new attempt; no such attempt was run or newly authorized here.
