# G13 — Western Gospel Choir & Praise

Instruction Package 14 adds five individually selectable profiles beneath the
nonselectable **Western Gospel Choir & Praise** heading, retaining exact public names
and descriptions. The catalogue now contains 60 styles across G1–G5 and G7–G13;
G6 remains pending its specification.

| ID | Name | BPM | Defining identity |
| --- | --- | --- | --- |
| G13-01 | Urban Gospel Celebration | 100–126 | Urban Gospel R&B, syncopated funk bass, Hammond/Rhodes keyboards, SATB layers, unison and rhythmic responses |
| G13-02 | Praise Fire Orchestra | 124–150 | Explosive Gospel funk, rapid tom fills, fast bass runs, brass, rhythmic breakdowns and dramatic choir accents |
| G13-03 | Soulful Kingdom Groove | 84–110 | Smooth Gospel soul/R&B pocket, prominent melodic funk bass, rich keyboards and expressive multi-part responses |
| G13-04 | Cathedral Choir Victory | 104–132 | Traditional Black American church choir, prominent Hammond organ, walking-style bass, evolving SATB refrains and Gospel vamp |
| G13-05 | Global Praise Fusion | 108–136 | Multicultural Gospel fusion, funk bass, Latin conga/timbale accents, energetic guitars and layered group responses |

All supplied drum, bass, keyboard, rhythm, mood, lyric and arrangement directions are
stored separately per profile. Choir DNA is carried by existing `melody_harmony`,
`instruments.other`, `vocal_delivery` and mixing instructions, so it reaches the existing
prompt compiler without a new schema or runtime change. Multi-part/SATB arrangement
remains independent of selected lead voice and does not assign a lead gender. Creative
variations preserve each style's approved identity while changing voicings, responses,
riffs, bass phrases and instrumental development. No separate mood selector is added.

Black American Gospel choir traditions and rhythmic interplay distinguish these profiles
from G12's contemporary worship arrangements. Praise Fire Orchestra explicitly avoids
slow worship pacing. Cathedral Choir Victory keeps its traditional vamp and evolving
harmonies; Global Praise Fusion retains distinct Latin percussion. Existing supported
languages and combinations remain independent; no style forces English. Research
references remain private and are excluded from public metadata and provider prompts.

`npm run test:dna -- --groups G13` passes 14 focused G13 tests and 7 CI-routing checks.
Tests cover exact metadata/tempos, individual selection and nonselectable heading,
private references, distinct rhythmic/bass/choir cores, fixed mood, independent voices
and languages, bounded variation and stable retries. Actual lyrics-handler tests use
synthetic provider replies and verify one credit reservation/completion per success.
Production text stays within the existing 950-character limit. All 55 earlier profiles
remain unchanged; no shared runtime, provider, voice, billing or financial code changed.
Broad earlier-group, unrelated platform, database and browser suites are not repeated.

No paid calls, real audio verification, merge or deployment occurred. Text contracts do
not certify audible differentiation, originality, choir performance or linguistic quality.
Authorized provider/listening evaluation remains for final integration. Next package:
G14 — Francophone African Gospel, pending its approved specification.
