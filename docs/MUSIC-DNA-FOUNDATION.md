# Music DNA — foundation batch

This batch extends the existing LAE-MUSIC studio and its authenticated lyrics handler.
It does not replace the working music engine, upload codes, provider configuration,
voice-training integration, quota rules, subscription packages or referral accounting.
Production is not deployed by this work.

## Catalogue approval boundary

`config/music-dna.json` records the owner's four approved departments and expected
43 research groups: Gospel 14, Secular/Afrobeats 14, Reggae/Caribbean 7,
Western/International 8. Instruction Packages 2–16 supply all fourteen Gospel groups,
**G1–G14**, with five selectable styles each: **70 supplied profiles**. G6 is inserted
between G5 and G7 in category and style order. Registry status is `approved` for these
supplied profiles; it does not certify audio quality or completion of the other departments.
Instruction Packages 17–21 additionally supply **S1 — Party Afrobeats & Dance Hits**,
**S2 — Smooth Afropop & Romantic**, **S3 — Street Pop & Street Anthems**,
**S4 — Afro-Fusion & Powerful Grooves** and **S5 — Fuji-Influenced Street Afrobeats**
under the separate Secular and Afrobeats department, adding twenty-five profiles for
**95 total**. The other 24 planned research groups
remain pending their approved specifications.
See [Gospel registration completeness](MUSIC-DNA-GOSPEL-COMPLETENESS.md).
The existing 66 gospel / 33 secular legacy presets remain available. See
[MUSIC-DNA-G1.md](MUSIC-DNA-G1.md), [MUSIC-DNA-G2.md](MUSIC-DNA-G2.md), [MUSIC-DNA-G3.md](MUSIC-DNA-G3.md), [MUSIC-DNA-G4.md](MUSIC-DNA-G4.md), [MUSIC-DNA-G5.md](MUSIC-DNA-G5.md), [MUSIC-DNA-G7.md](MUSIC-DNA-G7.md) [MUSIC-DNA-G8.md](MUSIC-DNA-G8.md) [MUSIC-DNA-G9.md](MUSIC-DNA-G9.md) [MUSIC-DNA-G10.md](MUSIC-DNA-G10.md) [MUSIC-DNA-G11.md](MUSIC-DNA-G11.md) [MUSIC-DNA-G12.md](MUSIC-DNA-G12.md) [MUSIC-DNA-G13.md](MUSIC-DNA-G13.md) [MUSIC-DNA-G14.md](MUSIC-DNA-G14.md) [MUSIC-DNA-S1.md](MUSIC-DNA-S1.md) [MUSIC-DNA-S2.md](MUSIC-DNA-S2.md) [MUSIC-DNA-S3.md](MUSIC-DNA-S3.md) [MUSIC-DNA-S4.md](MUSIC-DNA-S4.md) and [MUSIC-DNA-S5.md](MUSIC-DNA-S5.md).
Synthetic profiles in `tests/music-dna-fixture.cjs` are test fixtures only; they
are not published in the application catalogue.

`lib/music-dna.js` validates the same registry loaded by the studio. Run
`node scripts/check-music-dna.cjs` to validate it; this also runs in `npm test`.
A future approved catalogue change must use a new revision and be reviewed before
publication. Switching a file to `approved` is a release configuration change,
not proof of musical quality or permission to deploy.

Every approved style requires:

- Stable unique `id`, customer `name`, `department_id`, `category_id`; optional short `description` for the selector. Supplied G1 IDs retain their exact uppercase notation.
- Integer `tempo.min`/`tempo.max` and a distinct rhythmic description.
- `rhythm`, `drums_percussion`, `bass`, `instruments.keys`, `.guitar`, `.other`.
- `melody_harmony`, gender-independent `vocal_delivery`, `arrangement`.
- `lyrics.structure`, `lyrics.vocabulary`, fixed `mood`, fixed `energy`.
- `production_mix` and approved arrays under `variations`: `introductions`,
  `progressions`, `arrangements`, `melody`, `lyrical` (at least two distinct choices each).
- Optional `research_references` remain internal. They are excluded from public
  catalogue responses and provider instructions; profiles that repeat these names
  in public fields are rejected. Do not add named-artist imitation instructions.

Categories are `optgroup` headings, not selectable options. Department/category IDs
cannot be submitted as styles. Exact duplicate musical cores are rejected; meaningful
differences between neighboring styles still require review of the supplied catalogue.

## Existing workflow and independence

The separate mood selector is removed from both the redesigned and original HTML
studio. Stale API mood input never influences provider instructions. Its old raw
value remains only in legacy reservation hashes to preserve existing retry contracts.
Legacy free-text styles retain their existing guides and explicit voice/language
override instructions; they have not been misrepresented as approved DNA profiles.

For an approved DNA choice, the server builds authoritative instructions from its
validated profile. Legacy genre, percussion and mood selections cannot replace that
identity. The customer's topic supplies subject matter. Voice choices are neutral,
male, female, duet and an existing ready custom profile. Custom voice availability
uses the original artist-owned ready-profile check; saving/training still uses the
existing voice system and remains separate from lyrics generation.

DNA language codes initially include `en`, `pcm`, `yo`, `ig`, `ha`, `fr`. Up to four
may be combined. Add a language to the registry to extend options without changing
credit or payment logic. Existing optional supplied native-language text is retained.
Language declarations and prompt construction are validated; linguistic correctness
and cultural accuracy require listening/editorial checks, not a claim based on JSON.

The same existing verified GPT-6.1 Sol / GPT-6 Astra workflow produces lyrics and a
production style for the existing music integration. Output must echo the selected
style, variation, languages, mood, energy and tempo. DNA outputs over the existing
950-character production-prompt limit are rejected, rather than cutting core style
instructions. Existing lyric/duration budgets remain enforced. Gender and duet are
creative instructions; provider delivery quality must be assessed with approved styles.

## Variation, provenance and credits

The server derives a prompt variation identifier from catalogue revision, style,
artist and the existing request key. Retries keep their variation; a fresh request
or another artist has a different identifier. Only approved variation choices and
tempo ranges are sampled. Voice/language changes never choose a different instrumental
core. This does **not** add a provider seed parameter or promise unique audio.

`023-music-dna-provenance.sql` adds immutable DNA metadata linked to existing lyric
records. It also initializes the original lazily created `generation_records` contract
when absent on a fresh database; it does not replace or reset an existing table.
Profile snapshots omit internal research references. No old recordings or generated
lyrics are converted or backfilled.

DNA completion and provenance insertion occur inside the existing credit transaction.
A normalized lyric fingerprint, advisory lock and unique constraint prevent concurrent
DNA completions from storing the same lyric twice. A duplicate completion rolls back
and restores the reserved credit through the existing once-only refund path. There is
no automatic extra paid retry. Detection covers normalized lyrics in DNA history;
it is not audio/melody similarity analysis and does not certify uniqueness.

Uncertain provider acceptance retains the existing reconciliation hold. Successful
requests and idempotent replays preserve the same upload code and metadata.
`GET /api/platform/studio/dna/history` is artist-owned and read-only, excludes private
fingerprints/snapshots, and ignores another artist ID supplied as a query parameter.
The public `GET /api/platform/studio/dna/catalog` contains only selection metadata.

## Verification and remaining work

Validation covers profile/schema rejection, nonselectable categories, hidden research
references, voice/language independence, fixed mood/energy, stable retry variation,
original-output checks, provider response failures and credit holds. Disposable real
PostgreSQL tests exercise concurrent duplicate completion, atomic rollback, one-time
refunds, immutable provenance, ownership, replay and startup/migration compatibility.
Browser tests use synthetic approved metadata to exercise grouping, language/voice
selection, persistence and the existing recording/lyrics/music flows.

External model and audio responses in these tests are mocked. No paid generation,
production write, R2 mutation, new API key or deployment is required for this batch.
Musical quality/audio acceptance remains pending separately authorized, budgeted
provider tests. The seventy Gospel and twenty-five S1–S5 profiles are integrated; the other research
groups remain pending their approved specifications. The 43-group catalogue is
not represented as complete.
