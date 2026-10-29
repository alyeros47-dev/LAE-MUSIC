# S7 — Nigerian Highlife & Traditional Pop

Instruction Package 23 adds five selectable profiles beneath the nonselectable
**Secular and Afrobeats / Nigerian Highlife & Traditional Pop** heading, separately after
S1–S6. Exact supplied public names/descriptions are retained. The catalogue contains
105 styles: 70 Gospel and 35 Secular/Afrobeats across S1–S7.

| ID | Name | BPM | Defining identity |
| --- | --- | --- | --- |
| S7-01 | Eastern Highlife Celebration | 108–132 | Bright interlocking lead/picking guitars, melodic electric bass, lively ogene/udu/ekwe and festive brass |
| S7-02 | Brothers Heritage Highlife | 96–120 | Complementary traditional guitar parts, expressive walking electric bass, restrained keys and folk storytelling |
| S7-03 | Eastern Urban Highlife | 100–124 | Clean Highlife guitar riffs, electronic bass carefully layered with melodic electric bass, modern drums and Eastern percussion |
| S7-04 | Vintage Palmwine Groove | 96–118 | Organic analog-style live band, bright fingerpicked/interlocking guitars, round expressive bass, traditional flute and warm keys |
| S7-05 | Igbo Cultural Dance Festival | 112–138 | Fast cultural Highlife, ogene/ekwe-led percussion, lively interlocking guitar, fast bass runs and communal dance responses |

Profiles retain supplied rhythm, drums, bass, keyboards, guitar DNA, additional
instruments, mood, melody, song structure, lyrical themes and bounded variation. Guitar
DNA uses the existing `instruments.guitar` field and reaches the existing prompt compiler
without a schema/runtime change. Highlife guitar patterns and melodic electric bass
remain central rather than generic synth loops or ordinary Afrobeats with percussion
added. Ogene, ekwe, udu, shekere and flute have profile-specific roles; vintage/heritage
arrangements remain organic while the urban style explicitly balances modern bass layers.

Voice and supported languages remain independent; Eastern origin never forces Igbo.
English, Igbo, Nigerian Pidgin, Yoruba, Hausa, French and supported combinations are
respected. No lead gender or register is assigned. Eastern Urban Highlife permits spoken
or rap-like passages only when appropriate and customer-directed; it never forces rap.
Mood stays internal. Research references remain private and are excluded from public
metadata and provider instructions; original melodies and hooks are requested without
identifiable imitation.

`npm run test:dna -- --groups S7` passes 15 S7 tests and 7 CI-routing checks (22 total).
Coverage includes exact metadata/tempos, selection and nonselectable heading, private
references, five distinct guitar/bass/percussion cores, required electric-bass/guitar/
ogene terms, fixed mood, independent voices/languages, separate S1–S7 selector groups,
optional urban spoken delivery, bounded variation and stable retries. Actual existing
lyrics-handler tests use synthetic provider replies and verify one credit reservation/
completion per success. Production text stays within the 950-character limit.

All 100 earlier profiles remain unchanged. No shared runtime, provider, voice, billing,
financial or workflow code changed. Full earlier-group, unrelated platform, database and
browser suites were not repeated. No paid generation, real audio verification, merge or
deployment occurred. Audible Highlife authenticity, originality, mix quality and linguistic
fidelity remain for authorized provider/listening evaluation at final integration.
Next: S8 — Yoruba Fuji & Juju, pending its approved specification.
