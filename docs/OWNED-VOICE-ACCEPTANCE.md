# Controlled owned-voice acceptance test

The owner-selected saved recording passed read-only account matching, complete PCM WAV validation, temporary URL access and basic waveform checks. These checks do not prove clear solo singing, absence of reverb, voice likeness or successful provider training.

The prepared test allows one private sample upload, one 5-credit training request and, only if ready, one 20-credit personal-voice generation. A durable dated claim and strict operation guards prevent automatic paid retries. Production SQL remains read-only; application writes use a disposable loopback schema and synthetic entitlement. Customer credits and financial balances are unchanged. Original samples cannot be overwritten or deleted by the test.

This repository is public. Do not publish the account identity, recording fingerprint, waveform details, reusable persona IDs, recordings or signed URLs. Account selection uses a digest of the public artist name. The recording fingerprint and private selection state remain encrypted on the runner. Reconciliation journals are encrypted with AES-256-GCM before artifact upload; the existing provider key never appears in logs or artifacts.

Automatic approval review initially rejected dispatch because explicit consent to send the selected recording to MusicAPI was not established. The owner then explicitly authorized sending it for this test. The manual workflow still requires its consent input and a dated one-use budget claim. Do not run bulk tests or bypass a rejection.

## Real acceptance result: provider rejection; deployment blocked

The first execution stopped before reserving the budget because the hosted runner lacked an audio decoder. The decoder was installed, the absence of a previous budget claim was verified, and one controlled execution proceeded. The real account-owned upload and unsigned-header access check passed. MusicAPI accepted one create-voice task but subsequently rejected it with `didnt_say_verification_phrase`, `reason_code: invalid_input`, `retriable: false`, and no persona. The provider response reports `refund_processed: true`.

Evidence: https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/43917390522 . Exactly one training submission reserved 5 provider credits; no music generation was submitted, and the 20-credit music stage was skipped. Customer generation credits were not consumed. Production database writes were zero. One new private test sample was uploaded, and the original sample remains intact. Reusable identifiers and the reconciliation journal remain encrypted; the owner's failed task references are supplied privately for support.

Do not rerun this claimed budget or deploy PR #53 as a functioning personal-voice repair. MusicAPI must explain why an owner-provided recording with verified transport and supported format receives this rejection, or identify the precise recording-quality issue. Basic format/waveform checks do not certify intelligibility, solo singing or absence of reverb. No bypass or invented verification phrase is permitted.

Keep PR #53 in draft and production unchanged until the authorized real voice-profile and generation test succeeds and essential checks pass. Free tests and URL access are not evidence of real voice cloning success.
