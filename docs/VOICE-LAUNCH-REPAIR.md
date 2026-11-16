# Voice repair — current status, November 16, 2026

## MusicAPI support clarification supersedes the earlier diagnosis

The owner relayed MusicAPI support's confirmation: `/api/v1/sonic/create-voice` accepts a single `audio_url` and optional webhook. It does **not** require a separate verification phrase, ID or second recording. `didnt_say_verification_phrase` can mean the supplied audio was rejected. Earlier notes interpreting it as a missing challenge workflow are superseded.

## Prepared repair on Draft PR #53

- Explain the rejection without requesting an invented phrase. Existing immutable failure audits are normalized when read, without rewriting financial records or erasing historical evidence.
- Keep failed training non-retryable. A user can explicitly select/record and consent to a fresh replacement sample; that prepares a new upload, not an automatic retry. Existing ready/training/uncertain profiles remain protected.
- Preserve recordings in storage; replacement does not delete the old object. Preserve account ownership, same-origin upload and explicit boolean consent.
- Validate complete PCM WAV headers, data length, duration (>10 seconds and up to 240), byte rate, channels and the 12 MB limit. MP3 checks validate the file signature, not intelligibility or a complete codec decode.
- Before any paid training request, sign the original account-owned storage key for two hours and verify a bounded public GET of the exact URL, without login, cookies or an Authorization header. Require HTTPS, MP3/WAV pathname suffix, matching stored byte length and audio signature. Signed query parameters preserve private storage while allowing the provider to fetch the one sample.
- Failed URL checks return the reservation to uploading without calling MusicAPI. Uncertain provider responses stay reserved for reconciliation.
- Show clean solo recording instructions: no music, second voice or reverb. Acoustic quality, voice likeness and human ownership cannot be certified from a format check.

## Verification

The managed coding environment failed to start. Changes are made on the existing branch through GitHub; focused hosted checks cover voice handler/sample validation, legacy failure recovery, consent and ownership, fresh replacement, duplicate submission, temporary URL GETs, disposable PostgreSQL locks and desktop/Android Chrome emulation. Provider and microphone responses in those checks are fixtures.

The branch-only read-only diagnostic retrieves up to three existing failed provider task IDs for the owner's support request and probes a small prefix of failed samples using the same production signer. It never logs a signed audio URL, credentials or the recording; it does not create/train a profile, generate music, modify production data or consume provider credits.

Do **not** merge or deploy as fully repaired until the hosted checks pass and one specifically identified, owned and consented real recording creates a ready persona and successfully generates music. Real account/sample identity and consent have been requested; no other customer's sample is to be used as a substitute.

The earlier read-only evidence remains [run 43761911905](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/43761911905): credentials authenticated, storage settings present, four ready profiles, one failed profile, one uploading profile. This is historical evidence, not a newly successful training test. The failed task contained no separate phrase to display.

No current physical Android test, fresh successful real training or personal-voice generation has yet been demonstrated. No deployment or paid request is authorized automatically by a successful mock or read-only check. The owner's present instruction allows the controlled real test and subsequent deployment only after critical success; no new purchase or bulk paid tests are planned.
