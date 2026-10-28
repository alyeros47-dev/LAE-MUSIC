# Voice saving and optional studio presets

The production studio incorrectly disabled voice saving by using the sandbox-only
`voice_upload_verified` capability as an availability switch. Availability now
uses the existing R2 configuration and MusicAPI key. Configuration does not claim
that a real production upload/training test has passed.

Recorded or selected samples use the original artist-owned voice handler. In
production the browser sends its sample to an authenticated same-origin endpoint;
the server signs the PUT to the existing R2 bucket. This avoids requiring browser
CORS changes to the live bucket. Samples require consent, MP3/WAV signatures and
size limits; recorded WAVs need at least ten seconds. Storage size is verified
before training. Account row locks serialize saving and training. A ready or
processing profile cannot be overwritten by another upload, and an uncertain
provider response remains reserved for review. No existing object is deleted.
Temporary sandbox voice transport remains isolated and unchanged.

All optional Lyrics Studio selectors start neutral, including family, country,
profile, genre, language, mood, vocals, percussion and duration. Choosing a family
or country does not silently select its first style or change the genre. Neutral
duration uses the existing three-minute writing budget; transferring to Music
Studio makes that duration explicit. Artists must choose one of the two approved
lyrics models. Blank model selection stops before any credit/provider request.

The original lyrics engine now keeps neutral creative fields empty and gives the
artist's description priority over conflicting preset suggestions. It receives
explicit country/family context without inferring a religious theme. Existing
99 detailed profiles, provider integrations, duration limits, credit reservation
and refund logic remain in place. Prior explicitly saved drafts remain preserved;
artists can clear their selectors to Neutral and save those choices.

No migration, API-key replacement, new bucket or environment-variable change is
required. No paid checkout, royalty percentage or commission rule changes.

Verification includes application tests, real Chromium studio journeys at desktop,
tablet and mobile sizes, one-minute synthetic microphone capture, consent and
save-button states, failed-upload recovery, once-only training and ready-profile
selection; actual PostgreSQL ownership/locking checks use mocked R2/MusicAPI.
The custom secular Igbo Ugene/Ogene brief is checked through the actual lyrics
handler with a mocked OpenAI response. Browser/provider quality is not guaranteed
by these fixtures. A new real user-owned production voice sample and provider
training remain a distinct hosted integration check.
