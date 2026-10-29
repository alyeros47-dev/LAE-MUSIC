# G4 — High-Energy Gospel Dance & Praise

Instruction Package 5 adds five individually selectable profiles under a nonselectable
heading. G1–G3 definitions and all existing engine, voice, credit and payment logic
remain unchanged. The catalogue now contains 20 supplied styles across four groups;
remaining research groups await their approved packages.

| ID | Customer name | BPM | Defining character |
| --- | --- | --- | --- |
| G4-01 | Victory Explosion | 125–145 | Explosive live band, drum/brass introduction, syncopated punchy bass, organ stabs and choir responses |
| G4-02 | Praise Without Limits | 118–140 | Yoruba-influenced percussion, talking drum, shekere, bouncy bass, responsive keys and joyful audience hooks |
| G4-03 | Fire of Thanksgiving | 112–138 | Indigenous live percussion, warm repeated bass motifs, lively organ and evolving communal praise harmonies |
| G4-04 | Street Praise Carnival | 115–138 | Afrobeat kick, heavy rhythmic bass, synth hooks, crowd responses and modern street-pop textures with Gospel meaning |
| G4-05 | Glory Dance Anthem | 108–132 | Strong live backbeat, smooth melodic bass, layered organ/pads, powerful melody and expressive bridge |

Each profile stores its own fixed mood, energy, drums, bass, instruments, arrangement,
lyrical guidance, production mix and permitted variation choices. Voice and supported
languages are selected independently. Yoruba and indigenous instrumental influences
never force Yoruba or Igbo lyrics. Research performers remain internal and are excluded
from public metadata and provider prompts. G4 dance styles do not inherit G2 prayer
restrictions. Street Praise Carnival explicitly retains Gospel identity and clean language.

Run `npm run test:dna -- --groups G4`. Fourteen focused G4 tests cover exact selection,
loading, names, tempos, private references, fixed mood, distinct core instruments,
arrangements, variation/retry behavior, voice/language independence and the actual lyrics
handler with mocked provider replies and one credit reservation/completion per success.
Seven test-scope checks also verify CI routing. No shared engine or billing code changed,
so no full G1–G3, database, browser or unrelated platform tests are repeated here.

These are non-billable text/configuration tests. Real audio quality, cultural and
linguistic evaluation remain for final integration with authorized provider testing.
No paid API generation, merge or deployment is authorized by this package.
Next supplied package: G5 — Indigenous Yoruba Gospel (not implemented here).
