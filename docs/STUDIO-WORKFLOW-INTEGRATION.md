# Restore the original studio workflow in the redesigned interface

The owner reported that the long studio screen looked like a lyrics-only tool. This change keeps the original engine and makes the entire workflow discoverable: **idea and cultural directions → complete lyrics and upload code → standard/saved/own voice → complete MusicAPI song → previews and private release**.

## Integrated changes

- Three persistent, keyboard-accessible step shortcuts expose the existing music submit action and the voice section on phones and laptops. The song idea now precedes style selection. Existing 66 gospel and 33 secular profiles continue to select the original server instructions, with no replacement registry or celebrity-voice imitation claims.
- Optional browser speech dictation appends to the idea. Its speech service may process audio online; the user explicitly starts it. Unsupported browsers retain text/keyboard dictation. Recognition stops on navigation.
- Successful lyrics responses now display their existing, artist-owned 36-character upload code. Copy, same-browser draft persistence, and transfer to the upload form work without another generation charge. The upload form calls the existing authenticated code checker before upload and forwards the code to the original upload handler. Reopening a different historical lyrics draft clears the previous code; private history deliberately does not expose code hashes or recover secret codes.
- The original music engine accepts 6,000 lyric characters; the redesigned input now matches that limit instead of its former 4,900. The 950-character limit is for the arrangement, not lyrics or words. Existing target durations include five and six minutes; actual delivered duration remains provider-dependent.
- The configured API lyrics model is displayed accurately. The old HTML listed GPT-6 Astra/Sol testing labels, but the actual server ignores that selector and uses `OPENAI_LYRICS_MODEL` (default `gpt-4.1-mini`). Those labels are **not evidence of API capability**. Additional selectable model routes remain pending real provider/account verification; no unsupported model IDs or prices are invented.
- The voice section supports an explicit local MP3/WAV selection/preview and up to 60 seconds of mono PCM WAV microphone capture (at least 15 seconds). Preview stays local until explicit save; permission failure and unsupported recording are handled. Device tracks, recognition, audio contexts and blob URLs are cleaned up on navigation or clearing. Ready, artist-owned saved profiles still flow through the original `useVoice` handler. Status refresh uses the original voice API.

## Deliberate integration limits

The R2-dependent upload/training controls remain disabled unless the server explicitly reports verified voice upload capability. The current server does not report that capability. This preserves the owner's postponement of safe R2 tests and avoids writing to the live bucket or silently initiating billed training. Local recording/preview is independent of storage; it does not certify MusicAPI voice training or voice quality.

A lyrics code proves an owned lyrics-generation record and existing one-use/title checks; it **cannot prove that a selected MP3 contains that generated song**. The older backend also permits paid external-upload slots, while the owner now wants a generated-only publishing policy. This change restores the missing code integration but does not silently remove purchased upload entitlements or claim audio auditing. A complete generated-only enforcement must link a verified completed MusicAPI task/output to publication and explicitly handle historical external-upload allowances. Temporary sandbox uploads without codes remain available under the earlier free-testing authorization.

Original production users/passwords have not been imported into the sandbox; browser-saved old emails are not evidence of a copied account. Continue with the fresh sandbox artist account. Production credentials, service, storage, database and music-provider configuration are unchanged.

## Verification scope

Application tests exercise original cultural prompts and handlers, code ownership/idempotency, PCM WAV encoding and actual static delivery. Browser journeys exercise all step controls, mocked speech recognition, local real WAV preview/clear, code display/persistence, six-minute availability, saved voice selection, original music request retries, and disabled storage-dependent training at desktop/tablet/mobile sizes. External lyrics/music/payment providers remain fixtures in these browser tests. Physical-device dictation/microphone behavior, real voice training and actual generated audio quality remain pending separate verification. Do not claim production readiness.
