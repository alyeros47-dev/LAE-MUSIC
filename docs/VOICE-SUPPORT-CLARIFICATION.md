# MusicAPI voice support clarification

The owner relayed MusicAPI support's confirmation on November 16, 2026: create-voice accepts one public MP3/WAV audio_url. No separate phrase, verification ID or second recording is required. The error didnt_say_verification_phrase can represent rejected input, not a challenge to implement. Previous statements requiring a separate phrase are superseded.

Continue on draft PR #53. Do not merge or deploy until a real owned and consented recording creates a persona and produces music successfully. Preserve the original sample and historical audit when offering an explicitly selected replacement recording. Do not automatically resubmit the rejected audio.
