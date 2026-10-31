# Four-minute voice recording and explicit saved-voice selection

## Confirmed regressions

The redesigned recorder in `web/studio-workflow.js` imposed a 60-second WAV duration check, sample-count cap and wall-clock stop timer. The earlier imported studio used manual recording/stop and a 16 kHz conversion, without this one-minute timer. The owner requests up to four minutes. The one-minute restriction was introduced with the redesigned recording workflow, not by the latest song-sharing/social-sign-in release.

Separately, the Music Studio draft saved title/lyrics/style/duration but did not save the explicit `useVoice` checkbox. Refreshing could therefore return the artist to standard-voice generation even when a ready profile existed. Having a saved profile has always been separate from explicitly requesting it for a song; the backend only uses the owned persona when `useVoice` is true.

## Changes

- Capture up to 240 seconds. The recording status displays elapsed audio time and a 4:00 maximum. Stopping earlier still works; the existing 15-second minimum remains.
- Request a native 24 kHz mono AudioContext. Browsers resample microphone input into that context without changing the declared playback rate. A full four-minute 16-bit WAV is 11,520,044 bytes, within the existing 12 MB upload ceiling. The encoder never silently truncates a longer sample or disguises its sample rate. A browser that cannot supply a compatible format fails clearly and offers the existing MP3/WAV file-upload alternative.
- Release recording resources/capture closure when capture stops. No automatic upload or training occurs; local preview, consent and explicit Save remain required.
- Save the explicit voice choice in the existing per-artist browser draft. Show the actual generation mode. An explicitly requested saved voice remains requested even when disabled form controls would be omitted by FormData; unavailable profiles stop generation before an API request. Switching to standard AI voice is an explicit action.
- Existing profiles, source recordings, accounts, quotas, financial records and MusicAPI endpoint/weights are not changed. The current protections against silently replacing a ready profile remain in place.

## Verification

15 focused waveform/workflow/voice/adapter tests passed. The complete four-minute WAV retains the final sample and its exact duration under the upload ceiling. The owned-voice adapter tests prove that a remembered custom-voice request cannot silently become a standard request. The existing Sonic handler's 31 mocked checks passed, including server-selected artist-owned persona IDs and rejection before reservation when a requested profile is unavailable.

The focused actual-studio browser test passed at 390px and 1440px with simulated PCM input and a real loopback HTTP upload of the complete 11.52 MB WAV. It verifies continued capture after 60 seconds, stopping at 240 seconds, explicit-only saving/training, remembered selection after reload, unavailable-profile messaging and an explicit standard-voice choice. No real microphone, R2 storage, training or paid generation was used. The existing broader browser fixture now expects the full four-minute recording rather than a one-minute sample.

## What remains unverified

A longer reference sample does not guarantee an exact singing-voice match. The reported song/account and whether custom voice was selected are needed to trace the incident. Physical microphone behavior on the owner's phone and provider output similarity need controlled manual verification. No paid credits are authorized by this repair; no training or generation call was made.

The current saved-profile protection means a ready profile is not automatically replaced by recording a longer sample. If the reported profile needs replacement, identify it and arrange an explicit, account-scoped replacement/reconciliation rather than delete profiles or retrain automatically.

Provider references reviewed:
- https://docs.musicapi.ai/create-voice — custom voice persona from MP3/WAV with clear single vocals; published training cost 5 credits.
- https://docs.musicapi.ai/sonic-instructions — persona_music with an owned persona; published music-generation cost 20 credits.
- https://docs.musicapi.ai/faq — warns that one-step create-voice personas can become unavailable. The alternative persona endpoint page currently says it is unavailable, so this repair does not silently switch routes or invent a supported provider capability.

A future test involving one replacement training and one persona generation would use a published total of 25 MusicAPI credits, subject to verifying the connected account's current terms and obtaining explicit permission. This has not been run or authorized.
