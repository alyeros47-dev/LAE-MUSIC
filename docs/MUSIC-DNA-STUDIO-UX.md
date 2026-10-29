# Studio navigation and customer Mood & Energy

This change reorganizes the existing studio. It does not replace the working lyrics,
audio, custom-voice, upload-code, account or credit engines. It is on development
branch `codex/studio-navigation-mood`; no production merge or Render deployment is
authorized by this instruction package.

## Public navigation and workflow

The existing department IDs and approved catalogue remain unchanged. Customer labels:

| Department | Groups | Individual styles |
| --- | ---: | ---: |
| Gospel & Christian Music | 14 | 70 |
| Afrobeats & African Music | 14 | 70 |
| Reggae & Caribbean Music | 7 | 35 |
| Western & International Music | 8 | 40 |

Department → group → individual style uses separate native selects. Initially no
style list is loaded. A chosen group exposes only its five individual styles, with
an empty selection prompt. Group headings cannot be submitted as generation styles.
Each group explains its approved musical family with a clearly marked example from
its existing approved style description; the selected individual style shows its
own exact approved description. No new profile descriptions or research claims are
invented. Existing R7 Reggae Gospel retains its approved Reggae registration and
35-style department count; Gospel provides an explicit cross-link to that group.

Changing departments/groups clears incompatible style selections. Existing voice,
language and mood preferences remain independent. Partial selections are invalid
for form submission; they do not silently fall back to another style. Saved complete
and partial selections restore within the published catalogue. Native controls,
associated descriptions and stacked mobile layout support keyboard and screen-reader
use without a custom menu implementation.

The main lyrics form presents musical identity first, followed by voice, languages,
mood, optional title and a plain-language song description. A title is no longer
required to generate lyrics. The existing model choice remains explicit. Target
song duration stays visible; custom musical direction and extra language notes are
optional expandable sections. Existing custom/neutral musical direction remains
available without a DNA selection. Saved legacy selections reopen their section.
If an approved DNA catalogue is unavailable, the existing voice selector is retained.
Generated lyrics/style copy buttons, transfer into Music Studio, voice recording,
profile use, consent, generated-song code and publication flow remain intact.

## Mood policy (new owner instruction supersedes the former fixed-mood UI rule)

| Choice | Requested production direction | Bounded region of approved tempo range |
| --- | --- | --- |
| Calm & Relaxing | Gentle delivery, softer percussion, relaxed rhythmic movement | Lower 0–30% |
| Smooth & Groovy | Balanced energy, flowing rhythm, moderate instrumental intensity | 25–60% |
| Energetic & Danceable | Stronger drums, lively percussion, upbeat rhythmic movement | 55–85% |
| High-Energy Celebration | Maximum appropriate excitement, driving rhythm, powerful percussion and festive atmosphere | Upper 75–100% |

Integer tempo selection remains within the approved minimum/maximum, including very
narrow ranges. The new `musicDnaMood` enum is validated server-side before any credit
reservation. It influences the model's effective mood, energy, tempo, dynamics,
percussion intensity and arrangement. The provider receives effective mood/energy
in both authoritative instructions and user context, rather than competing fixed
profile defaults. Explicit mood overrides default intensity suggestions, not the
style's core rhythm, instruments, vocal tradition or production exclusions. A prayer
chant's strongest appropriate treatment must remain a prayer chant rather than
becoming party music. This is intentionally not unrestricted genre/tempo replacement.

Generated output must confirm effective mood/energy and chosen tempo; its actual
production paragraph must include the selected BPM and concrete mood directions.
A mood label alone is insufficient. That production paragraph is passed unchanged
through the existing audio-generation adapter. The API does not gain an invented
provider mood/seed flag or a promise that every output will sound ideal.

The complete approved profile is not rewritten. Immutable provenance keeps that
profile plus the separate selected-mood context. No schema change is required.
Older clients that omit `musicDnaMood` keep the existing profile-driven behaviour.
The obsolete legacy `mood` field cannot override DNA instructions. New UI requests
require a mood after choosing a style; invalid enum values fail before spending.

## Generation and financial protection

The existing music/lyrics ownership, ready-custom-voice checks, upload-code creation,
provider handling, once-only completion/refund and ambiguous-result holds are kept.
Selected mood and an optional supplied title enter the existing reservation payload,
so reuse of a request key cannot silently swap those inputs. Retry variation is stable
for the same request/mood and independent of voice/language; fresh requests still vary
within approved style choices. No user-facing research references are introduced.

Optional titles are checked before reservation. The chosen/generated title follows
the normal code/publication workflow. Supplied titles also go through the existing
DNA reference/privacy checks; no post-validation title replacement bypasses them.
The duration/lyrics/style-size limits remain unchanged. No payment, subscription,
commission, royalty, storage credential or environmental setting is changed.

## Executed verification

- 690 shared DNA/studio checks passed, zero failed/skipped: existing group/profile
  contracts, shared engine, the new mood/title cases, existing workflow/voice WAV,
  provider idempotency, lyrics-model/library checks. An earlier outdated UI-label
  assertion failed and was updated to the new explicitly requested labels before
  the final passing run. The full 9,675-case voice/language audit was not repeated.
- New mood coverage exercises all 215 profiles × four moods (860 style/mood contexts),
  bounded tempo, unchanged profile data, retry stability, independent voice/languages,
  invalid inputs, real handler formatting, one reservation/completion per success,
  once-only failed-output restoration and actual mocked music-adapter handoff.
- Actual local component/adapter/handler browser harness: all 215 styles selected
  at desktop 1440×1000 and mobile 390×844; four complete mocked generation flows per
  viewport; all four moods, draft restore, required partial selection, group counts,
  Gospel→Reggae Gospel discovery, zero accessibility violations/overflow/page errors.
- Existing full-page Chromium journeys passed on desktop/tablet/mobile, including
  voice recording/profile creation, custom direction, draft restoration and transfer;
  53 automated accessibility audits passed. Old long-list tests were adapted to
  exercise the new navigation and the separate five-style views instead.
- The before/after catalogue JSON comparison is identical: 43 groups / 215 complete
  approved profiles preserved. Server and client module syntax checks and diff
  whitespace checks pass.

All external lyrics, audio, storage and payment services in these tests are mocked.
No paid provider calls, production writes, R2 operations or real payment operations
were performed. These checks do not replace physical-device, live-provider musical
quality or listening acceptance. Additional CI evidence belongs on the new PR.

## Review and deployment boundary

This studio change is ready for review after its relevant CI passes. It is not on
the main site. Owner approval is required before any production merge/deployment.
The previous release pins refer to PR #10; do not reuse those pins unchanged for this
new PR. Existing unrelated financial/offline release limitations are not certified
or activated by this UI work.

## Subsequent owner-authorized deployment preparation

The owner subsequently instructed deployment of PR #11. Release guards are repinned
from PR #10 to PR #11 / `codex/studio-navigation-mood`, against deployed production
base `d8c41d0ca789ea633d01935465621ef95870dd8d`. No CI/merge-tree/environment/payment
safeguard is removed. Seven release guard tests pass; full exact-candidate CI is
required again before the approved merge.

[Fresh recovery rehearsal 40963275791](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40963275791)
passed against the latest production-data snapshot: 142 tables and 599 rows
preserved; all 23 existing migrations replayed without change, legacy initialization
verified, private recovery database removed, production untouched. Owned backup
`br-frosty-brook-b4kmnzhw` expires November 5, 2026 at 2:06 p.m. Pacific Standard Time.
Recheck its binding/expiry immediately before deployment. This code change needs no
new schema migration.

The live-verification script now also checks four exact studio assets on both
existing site origins and the public catalogue's 215 styles / 43 groups / four moods.
These are read-only checks; no paid lyrics or music request is introduced. Existing
registration/login, complimentary allowance and original audio Range checks remain.
The actual merge/deployment outcome will be recorded on PR #11 after execution.
