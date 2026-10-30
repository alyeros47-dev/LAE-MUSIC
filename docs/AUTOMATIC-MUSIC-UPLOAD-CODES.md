# Music credit and automatic upload-code workflow — PR #12

Customers can choose **I Have My Own Lyrics → Describe my own Gospel musical style**, paste their own lyrics and production instructions, and submit directly to the existing Music Studio. No AI lyrics request is necessary. The established Gospel-only scope, consent, length, language, voice and duration controls remain.

## Existing service charges preserved

Every music-generation request uses the same server-enforced music allowance regardless of whether its words/style were supplied by the artist or prepared with LAE-MUSIC's lyrics tools. A paid package/included allowance, verified extra generation or previously approved complimentary allowance must be available before provider submission. The reservation is made before the external call, idempotent retries cannot consume a second unit, and verified provider failures/ambiguous results retain their existing restoration/reconciliation rules.

One music-generation request remains one allowance unit, with the existing intended two-song provider output. This change does not silently charge per returned clip or change package prices, quotas or trial rules. Using the separate AI lyrics tool retains its existing lyrics-request charge; bringing original lyrics does not make that request or spend that lyrics credit. Code preparation, copying, reopening and retries do not request music generation, consume another generation or invoke paid format conversion.

## Automatic codes after successful audio

- Lyrics completion continues returning `uploadCode: null`; it creates no new publishing authorization. The old code panel is hidden and retained beside the music form only for existing draft/binding compatibility. Generating another set of lyrics no longer clears a previously selected audio upload authorization.
- When a completed generation is opened, the actual interface automatically calls the existing authenticated code-issuance endpoint for each returned song. There is no initial “Get upload code” click. While the owned completed recording is fetched and fingerprinted, a preparation notice appears beside that song.
- Each ready recording displays its cryptographically random one-use code, a copy control and **Upload this song**. Multiple songs keep their own distinct authorizations. Automatic preparation does not overwrite an existing upload draft or arbitrarily choose the last completed clip. Clicking a song's upload link explicitly saves that song's code/title into the upload draft.
- Temporary code-preparation failure does not discard audio, repeat music generation or hide another song's successful code. **Retry upload code** appears only for the affected recording. Repeated requests return the same existing durable authorization.
- Navigation or reopening another task prevents stale asynchronous results from updating the current display. Reopening the original completed task recovers its durable authorization.

The backend still verifies the account owns the successful task and that the clip belongs to it, hashes the original audio, binds the code to the artist/title/recording and enforces one-use consumption and duplicate-publication protection. Existing active artist-plan/upload-quota checks remain: a generation allowance and a publishing entitlement are distinct approved services. Neither a lyrics receipt nor an unrelated external audio file can satisfy this generated-recording authorization.

## Free verification

Focused tests exercise the actual music handler with AI-produced and self-supplied words/style, confirming one music reservation, no lyrics-wallet debit and unchanged provider payload words. Existing mocked Sonic checks cover missing/exhausted allowance, duplicate requests, confirmed failures and unresolved acceptance. Existing code checks cover successful ownership, secure hashes, exact replay and one-use publication rules.

Actual mobile/desktop studio tests verify automatic code appearance without clicking, two-result handling, a partial code failure, a code-only retry, correct per-song upload selection and preservation of an existing draft. No music generation, payment, real media upload or paid provider request is performed by the browser fixtures. Real provider/audio/storage acceptance still requires separately authorized integration testing.

Production was not merged or deployed by this work. No migrations, billing policy, credentials or existing records were changed.
