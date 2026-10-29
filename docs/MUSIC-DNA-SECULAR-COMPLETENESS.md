# Secular / Afrobeats registration completeness

The implemented configuration and actual rendered studio selector contain all
**S1–S14: 14 groups, five individually selectable styles each, 70 unique styles**.
Category headings are nonselectable optgroups, in numeric group order.

| Group | Category | Styles | Registered IDs |
| --- | --- | --- | --- |
| S1 | Party Afrobeats & Dance Hits | 5 | S1-01–S1-05 |
| S2 | Smooth Afropop & Romantic | 5 | S2-01–S2-05 |
| S3 | Street Pop & Street Anthems | 5 | S3-01–S3-05 |
| S4 | Afro-Fusion & Powerful Grooves | 5 | S4-01–S4-05 |
| S5 | Fuji-Influenced Street Afrobeats | 5 | S5-01–S5-05 |
| S6 | Amapiano & Afro-Dance | 5 | S6-01–S6-05 |
| S7 | Nigerian Highlife & Traditional Pop | 5 | S7-01–S7-05 |
| S8 | Yoruba Fuji & Juju | 5 | S8-01–S8-05 |
| S9 | African Soul & Alternative R&B | 5 | S9-01–S9-05 |
| S10 | Ghanaian Afrobeats & Hiplife | 5 | S10-01–S10-05 |
| S11 | Ghanaian Highlife | 5 | S11-01–S11-05 |
| S12 | Francophone African Dance | 5 | S12-01–S12-05 |
| S13 | Senegalese Mbalax & Afro-Pop | 5 | S13-01–S13-05 |
| S14 | East African Bongo Flava | 5 | S14-01–S14-05 |

Verification: the focused S14 suite loads the real catalogue and renders
`web/music-dna.js` controls, checking all 70 option IDs, each five-style category,
numeric ordering, department ownership and nonselectable headings. Previous groups'
full generation suites were not rerun: their profile objects remain unchanged.
The current S14 five-style generation checks use mocked, non-billable provider replies.
This report certifies registration/selection coverage, not real audio quality or full
platform end-to-end acceptance.

Together with G1–G14 (70 Gospel profiles), the catalogue now registers **140 styles
across 28 groups**. The remaining seven Reggae/Caribbean and eight Western/International
groups await approved specifications. Swahili and other unavailable language additions,
authorized provider/listening review and final integration testing remain pending.
No paid provider calls, merge or deployment were performed for this check.
