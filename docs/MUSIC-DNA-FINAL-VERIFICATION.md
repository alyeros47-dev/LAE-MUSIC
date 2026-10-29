# PR #10 — focused final verification, 29 October 2026

**Decision: VERIFICATION INCOMPLETE. Do not merge or deploy on this evidence.**

This follow-up preserves the completed 43-group/215-style audit. It does not rerun
its 666 tests or 9,675 voice/language cases. The follow-up changes only five public W7 descriptions and their exact-copy test.
Complete Music DNA instructions, application engines, commercial rules, production
settings and production records remain unchanged.

## Results

| Check | Status | Evidence and limit |
| --- | --- | --- |
| W7 interface acceptance | PASS | All five public descriptions match the owner’s 29 October approval exactly. Focused W7 UI, loading and mocked generation checks pass; full profile instructions are unchanged. |
| Music provider integration | NOT VERIFIED | Focused request/response, ownership, quota, error and download tests pass; actual production credentials pass a non-billable provider request. A real create/completed-task/media journey was not exercised. |
| Real generated audio playback | NOT VERIFIED | No new paid generation, account-owned completed audio download or audible playback was attempted. Mock media tests are not real playback evidence. |
| Production configuration | FAIL | Live read-only inspection succeeds, but the Music DNA provenance table is absent, payment secrets checked below are absent, and recovery/restore verification is incomplete. R2 credential presence does not verify storage permissions or media delivery. |

## W7 source and interface

The owner supplied the five final customer-facing descriptions on 29 October 2026.
They now replace the temporary Musical identity paragraph descriptions verbatim.
The exact approved copy is recorded in [the W7 specification](MUSIC-DNA-W7.md).

The focused test asserts all five labels/descriptions, the nonselectable category
heading and suppression of private research references. A structural comparison
against the preceding catalogue confirms that only W7-01 through W7-05's
`description` fields changed. All complete style instructions, other profile fields,
215-style inventory and category/department data remain unchanged. The prior W7
copy blocker is resolved.

## Provider inspection

Inspected `musicapi-sonic.js`, `lib/studio-output.js`, `lib/media-download.js`,
release storage/import paths and the existing handler fixtures.

- Bearer authorization uses server-only `MUSICAPI_API_KEY`; JSON requests go to
  `https://api.musicapi.ai/api/v1/sonic`. Create uses `custom_mode`, `mv`, `prompt`,
  `tags` and the existing create/persona task types. Owned ready custom-voice profiles
  supply provider persona identifiers; caller-supplied foreign personas are rejected.
- Official [Sonic instructions](https://docs.musicapi.ai/sonic-instructions) and
  [task response documentation](https://docs.musicapi.ai/get-sonic-music) were read
  successfully. They document the selected model family, 5,000-character custom
  lyrics limit, task endpoint, Bearer authentication and audio/image response fields.
  Documentation comparison and mocks do not prove a live create request succeeds.
- Existing idempotency, transactional reservations and ambiguous-result handling
  protect credits. Definitive failure and accepted/uncertain results remain distinct.
- Completed owned task/clip checks gate artist generated-work export. This is separate
  from listener listening: no paid MP3 purchases or permanent listener downloads were
  added. Attachments have bounded validated media and safe filenames.
- HTTPS exact-host allowlists, DNS/private-address checks, bounded redirects,
  content limits and media signatures protect server-side downloads. Durable import
  additionally requires `GENERATED_MEDIA_ALLOWED_HOSTS` and configured storage.
- No provider runtime defect requiring a code repair was demonstrated in this scope.

The read-only live check returned HTTP 200 for MusicAPI `get-credits` and OpenAI
`models`. Both configured lyrics model IDs, `gpt-6.1-sol` and `gpt-6-astra`, were
available. No balances, credentials or generated content were published. These GETs
made **zero billed generation requests**. No paid test is requested or authorized
by this report. Any later paid test must first specify its request and verified cost
for owner permission.

## Existing production inspection

Access was available through the existing GitHub Actions Render/Neon credentials,
without transferring keys or connecting the sandbox to production storage.

[Current-branch read-only audit](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40881998053)
passed its inspection job at code commit `ab180a7679f8a6e5a30aa5f93522bbac284f40f0`.
A successful inspection job means evidence collection succeeded; it does not mean
production readiness passed.

The existing service is LAE-MUSIC, Node, branch `main`, build `npm install`, start
`npm start`. Its reported deployed commit was
`4e749296bc7a51239684fabffdf00e2c984d113c`. The audit uniquely validated the repository
and service identity before reading its environment. Database inspection used
read-only SQL and never imported the application startup or ran migrations.

Findings:

- `DATABASE_URL`, `OPENAI_API_KEY`, `MUSICAPI_API_KEY`, `ADMIN_KEY` and all four R2
  credential variable names were present. Database connection and inventory reads
  succeeded. No environment values were printed.
- Required PR #10 table `music_dna_generations` is absent. Migration
  `023-music-dna-provenance.sql` supplies it. Database preflight stopped at that
  missing-table gate (`checks_complete: false`); it did **not** certify the remaining
  checksum, guard or accounting checks. Apply no migration until the approved
  deployment/recovery plan is ready.
- `PAYSTACK_SECRET_KEY` and `FLUTTERWAVE_SECRET_KEY` were absent in the identified
  service inventory. Live payment verification remains blocked; do not simulate
  payment success or activate unsupported financial operations.
- Neon database binding was verified, but branch protection was false, reported
  history retention was 21,600 seconds, no unexpired source snapshots were found,
  and recovery/restore remained unverified. This is not a claim that no other backup
  exists; a recoverable backup and restore rehearsal still require evidence.
- R2 presence was checked only. No upload, deletion or live object mutation was made.
  Actual bucket permissions, controlled custom-voice/media storage, Range/HEAD and
  playback still need authorized final integration evidence.
- Neither `GENERATED_MEDIA_ALLOWED_HOSTS`, offline-signing, SMTP delivery, proxy trust,
  MFA custody nor every runtime flag was certified by this presence-only audit.
  Existing `.env.example` and `scripts/preflight.cjs` describe their names/checks;
  the local preflight is not evidence of their production values.
- `render.yaml` is the isolated review blueprint. Do not apply it to replace the
  existing production service/database/storage. Retain the existing configurations
  and use reviewed additive migrations during an approved release.

Audit assertions: **production_writes: 0**, **environment_unchanged: true**,
**configuration_values_exposed: false**. Read-only Render, Neon and database access
is available through CI; local provider/database credentials are not attached.
Direct GitHub secret-name listing returned HTTP 403, so it was not used to infer
whether repository secrets exist.

## Focused tests executed

| Command | Result |
| --- | --- |
| `npm run test:dna -- --groups W7` (after approved copy) | Catalogue validation passed; 16 W7 tests and 8 CI-routing tests passed, zero failed |
| `node --test --test-name-pattern='W7 exact public' tests/music-dna-w7.test.cjs` (before correction) | 1 passed, zero failed against temporary copy |
| `node --test tests/sonic-idempotency.test.cjs tests/studio-output.test.cjs tests/media-release.test.cjs tests/preflight.test.cjs` | 17 passed, zero failed |
| `node --test --test-name-pattern='existing-service audit\|production audit\|existing-provider checks' tests/production-integration.test.cjs` | 3 passed, zero failed; repeated once after the workflow guard edit |
| `node scripts/test-sonic-handler.cjs` | 31 mocked HTTP/quota/reservation/provider/refund checks passed; no live DB/provider |
| `node scripts/check-sonic-workflow.cjs` | 31 static invariants passed; these are not integration tests |
| `node scripts/preflight.cjs` | Expected blocked exit 2 with no local credentials; not a production pass |
| Existing read-only service workflow, current PR branch | Inspection succeeded; readiness blockers above reported, zero production writes |

No failing automated test was ignored. Existing PR path filters started broad CI
again despite a workflow-only change; those redundant runs were canceled rather
than repeating the completed audit/unrelated platform tests. They are cancellations,
not passing evidence. Relevant read-only script tests were executed directly.

## Changes and remaining work

- `.github/workflows/existing-service-audit.yml`: permit the existing read-only audit
  on `codex/music-dna-foundation` as well as its original development branch. It
  remains manual, repository/branch guarded, contents-read-only, without deployment
  steps. The script, live target, provider behavior and credentials are unchanged.
- `config/music-dna.json`: the five approved public W7 descriptions only.
- `tests/music-dna-w7.test.cjs`: exact approved description assertions.
- `docs/MUSIC-DNA-W7.md`: approved interface copy and focused verification.
- `docs/MUSIC-DNA-INTEGRATION-AUDIT.md`: link the historical copy blocker to its resolution.
- `docs/MUSIC-DNA-FINAL-VERIFICATION.md`: this focused evidence and limitations.

The workflow change was published in the preceding verification batch. This W7
correction does not modify the workflow, provider integration or database code.
Production findings above refer to the linked read-only inspection; a description-only
change does not resolve those external prerequisites or require repeating the live audit.

Before readiness can be certified: verify a real
completed generation/audio journey (prefer an existing owned task without new paid
creation); establish recovery evidence and a reviewed migration 023 rollout; rerun
read-only schema checks after authorized migration; verify storage/media delivery
safely; configure/verify the selected payment providers and other required external
services. No merge, deployment, production migration or live setting change was made.
