# Gospel Studio Phase 1

Status: development review; not deployed. No new environment variables or schema migrations.

## Implementation

The public studio catalogue is a launch projection containing only Gospel G1–G14 (14 groups, five styles each). All 43 groups / 215 approved profiles remain unchanged in `config/music-dna.json` for future activation. Hidden style IDs are rejected before provider requests. The existing legacy studio metadata endpoint omits secular profiles. The general streaming catalogue is unchanged.

Two creation methods share the existing music engine:

- **AI Creates My Song:** existing lyrics/model/voice/language/duration workflow, approved Gospel DNA, four bounded mood choices, generated lyrics and production instructions, then the existing audio stage.
- **I Have My Own Lyrics:** dedicated supplied-lyrics field and explicit rights confirmation; select a Gospel DNA group/style or write custom rhythm/instrument/tempo/vocal instructions. Voice/language/mood remain independent. The server compiles approved DNA instructions within the MusicAPI 1,000-character style limit without another lyrics request or lyrics-credit deduction. Existing music allowances, request idempotency and ambiguous-provider protections remain in force. Drafts survive navigation in the same browser.

## Publishing authorization

New lyrics completions preserve their history/provenance and credit treatment but return `uploadCode: null`. Historical records/codes are not deleted. Legacy lyrics codes cannot authorize new song uploads.

After a song completes, **Get upload code** verifies the signed-in artist owns the successful provider task and selected clip. It reads the existing generated audio through the existing trusted-host/size/signature checks, fingerprints its exact bytes, and transactionally issues a cryptographically random, account-bound code. The existing durable request store ensures retries return the same code; there is no generation request or generation charge for obtaining it. Failure preserves the song; the user can retry code preparation without generating again.

Upload start locks the artist, verifies a paid, current, unheld artist plan and available annual entitlement, checks code ownership/title and rejects already used or previously published songs. Upload completion compares the uploaded recording to the generated-audio fingerprint before the existing short publication transaction rechecks plan/allowance. Private-release publication uses the same plan gate and consumes any corresponding authorization. Codes and direct release publishing cannot publish the same generated song twice. Original generated audio must be uploaded unchanged; transcoded/edited recordings will not match this code.

Authorizations use existing `generation_records` and `platform_requests` tables. No database reset, copied production data, provider changes, new API keys or production environment edits are required.

## Focused verification

- `node --test tests/gospel-launch.test.cjs tests/services.test.cjs tests/studio-profiles.test.cjs tests/studio-workflow.test.cjs tests/lyrics-library.test.cjs tests/music-dna-mood.test.cjs tests/media-release.test.cjs tests/studio-output.test.cjs tests/music-dna.test.cjs tests/music-dna-g1.test.cjs tests/music-dna-g14.test.cjs tests/music-dna-smoke.test.cjs`: 92 passed, zero failures/skips.
- Own-lyrics production compilation: all 70 Gospel styles × four moods; bounded tempo, voice/language preservation and provider length limits.
- `tests/gospel-launch-postgres.cjs`: 13 checks on explicitly guarded disposable local PostgreSQL 16. Existing initialization and all 23 migrations; concurrent code issuance, ownership, audio fingerprint, plan denial, refund hold, successful entitled publication and quota rejection. Synthetic records/provider/audio only.
- `tests/gospel-launch-browser.cjs`: actual application interface in Chromium at desktop 1440px and mobile 390px, all 14 group selectors, both own-lyrics methods, rights gate, code display/copy control, draft restoration, no page errors, no horizontal overflow, zero axe violations.
- Existing 31 mocked Sonic handler checks and 31 Sonic static invariants pass; unified-engine/referral integrity checks and module syntax/whitespace checks pass.
- No paid lyrics/audio generation, R2 writes, production data access or production configuration changes.

## Outstanding requirements / release limitations

1. **Approved 17 lyrics types:** the deployed source has nine legacy genre options, 66 legacy Gospel presets and the 14 approved Gospel DNA groups; it does not contain a separately identifiable approved 17-type lyrics registry. The owner has been asked for those 17 names/specifications. No categories were invented or falsely declared tested. Existing lyrics controls/engine remain preserved. This requirement is pending.
2. Real musical/audio acceptance of the new own-lyrics DNA compilation has not been tested with a paid provider request. Local/CI mocks establish request handling, not musical quality or voice fidelity.
3. A new authorized release needs exact candidate CI, fresh backup/recovery verification and updated release-candidate/PR pins. The previous PR #11 deployment receipt is not approval for this phase. Do not merge or deploy this work without new explicit approval.
4. Unrelated full-platform payment, payout and operational acceptance gates remain as previously documented; this studio batch does not certify overall commercial launch readiness.
