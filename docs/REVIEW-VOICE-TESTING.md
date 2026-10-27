# Integrated sandbox voice testing

The review environment can record or upload an artist-owned MP3/WAV, create a MusicAPI voice profile and select that profile for music generation. It uses the existing `/api/voice/*` engine and `persona_music` song-generation path. Production R2 credentials and objects are never used by the new temporary transport.

`lib/review-voice.js` is active only with the isolated staging marker and open-testing flag. Its actual database identity must be loopback PostgreSQL on port 55432, database `lae_music_review`. Files stay under the existing temporary review media directory. Upload links expire in 15 minutes; provider-read links expire after two hours. Links are random capabilities whose hashes are stored in PostgreSQL. They expose only the submitted sample, not an account or catalog. Reads support ranges. Consent, declared size, MP3/WAV signatures, WAV duration, file ownership and local capacity are checked. These temporary files can disappear on a service restart/update.

Voice creation follows the documented MusicAPI `POST /api/v1/sonic/create-voice` and task polling contract: https://docs.musicapi.ai/create-voice . The provider requires a URL ending in MP3/WAV and clear solo vocals longer than ten seconds. The recorder requires 15–60 seconds. Provider documentation warns that these personas can become unavailable; the application must not promise permanent availability or exact vocal similarity.

Each review artist can reserve two free voice-training tests, separately from the two lyrics/two audio allowances. Artist-row locks prevent concurrent duplicate training. The provider request journal accepts only a server-reserved voice request and prevents replay. Confirmed rejection/failure releases the voice test once; an interrupted or ambiguous provider response stays reserved for reconciliation. Read-only status checks cannot create a second training charge. No production commercial rules or pricing change.

The save control is enabled by the actual review storage capability, not a permanent placeholder. Training progress checks automatically; only a confirmed ready, artist-owned profile enables “Use my saved voice profile.” Existing standard-voice generation remains available.

Automated verification covers isolated PostgreSQL/files/HTTP upload and signed-link expiry, ranges, consent, concurrent training, account separation, confirmed rejection versus uncertain acceptance, and unchanged R2 access (zero calls). Provider responses in that integration test are mocked. Real sandbox training and persona-based audio results must be reported separately; a synthetic QA voice establishes transport/provider compatibility, not resemblance to a human artist's voice. Physical microphone permission and likeness still require testing with the artist's own device and recording.

No paid hosting/storage changes, production deployment or database reset are part of this work.
