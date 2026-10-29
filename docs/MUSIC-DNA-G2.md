# G2 — Revival Prayer & Prophetic Chants

Instruction Package 3 supplies five additional profiles on the existing Music DNA
branch and PR. G1 remains intact. There are now ten supplied styles across two
research groups; the expected 43-group programme remains incomplete. G3 content
has not been supplied or invented.

| ID | Supplied customer name | Tempo | Core identity |
| --- | --- | --- | --- |
| G2-01 | Upper Room Prayer | 55–72 BPM; optional free-time introduction | Pads, soft piano, ambient drones, gentle bass, subtle strings, minimal percussion and deliberate silence |
| G2-02 | Revival Fire Chant | 76–105 BPM | Rhythmic keys, deep bass, live drums, toms and hand percussion; evolving original chant and controlled builds |
| G2-03 | River of Worship | 68–90 BPM | Expressive piano, pads, melodic bass, live drums, electric guitar, strings and choir; flowing melodic worship |
| G2-04 | Prophetic Declaration | 65–92 BPM | Atmospheric pads, rhythmic piano, cinematic strings, low bass and restrained toms; original spoken declarations alternating with sung refrains |
| G2-05 | Sacred Prayer Symphony | 58–80 BPM | Grand piano, strings, pads, warm bass, restrained orchestral percussion and ambient guitar; cinematic interlude and peaceful resolution |

The supplied mood, rhythm, arrangement, lyrical themes and variation boundaries
are structured in `config/music-dna.json`. Voice remains independently selected;
profiles do not assign gender. Existing language combinations, custom-voice ownership,
credit reservation/refund/replay, upload-code and music/audio-export flows are retained.
Research names are private. The two broad musical-tradition research notes are
private context rather than banned performer names; no internal context is sent
in provider prompts or customer selection metadata.

## Textual quality checks

The existing core-instrument checks apply to all five G2 prompts. New optional
per-profile rules reject positive nightclub, party-dance, club-ready and similar
unrelated production treatments. Explicit avoidance instructions such as “no
nightclub production” remain valid; obvious contrast clauses are evaluated separately.
These checks inspect English production prompts, independently of lyric language.

A bounded quality rule rejects more than **four identical consecutive sung lines
within a section**, after normalizing punctuation/case/spacing. Section boundaries
and developing verse/chorus returns remain allowed. This is a technical safeguard
against stagnant loops, not a change to any paid credit entitlement. The model is
also instructed to develop chants naturally and avoid excessive repetition overall.

G2-04 additionally requests original spoken passages, no copied sermons or recorded
prayers, and no unsupported personal prophecies or guaranteed individual outcomes.
English text checks reject explicit first-person personal predictions and guaranteed
healing/wealth/outcome promises while permitting ordinary faith, hope and explicit
refusals to promise an outcome. These are bounded lexical safeguards: they are not
universal semantic checks across all languages or evidence of audio originality.

An invalid output follows the existing once-only credit-restoration path. Ambiguous
provider acceptance still remains on reconciliation hold. There are no automatic
paid retries, payment changes, credit-price changes or new MusicAPI parameters.

## Reused verification

`tests/music-dna-group-contract.cjs` is shared by G1/G2 and exercises every supplied
style through the actual lyrics handler with mocked approved GPT responses, plus
voice/language independence, variation bounds and retry stability. G2 tests add
prayer-production, repetition, declaration and malformed-rule checks. Real PostgreSQL
coverage reserves/completes/replays five requests for each group and checks owned
immutable provenance and upload codes. Browser checks cover both real optgroups,
all names/descriptions, independent voices/languages and saved selections.

No paid audio tests are performed. Real musical/linguistic quality, recognizable
recording/melody similarity and production readiness are not established by these
text/metadata tests; they require authorized provider and listening evaluation.
