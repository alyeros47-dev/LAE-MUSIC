# Catalogue metadata review — 18 November 2026

Read-only review of all 19 publicly listed songs, using the existing paginated discovery API. No accounts, music, metadata or production database records were changed. Source values and track IDs are in `catalogue-metadata-review.json`; rerun `../scripts/audit-catalogue-metadata.py` to refresh.

| Existing genre | Songs | Android treatment |
|---|---:|---|
| Worship | 3 | Gospel / Worship |
| Reggae/Gospel | 1 | Gospel / Gospel Reggae |
| Praise | 1 | Gospel / Praise |
| Gospel praise | 1 | Gospel / Praise |
| Gospel & Worship | 7 | Gospel, subtype unspecified; All Gospel only |
| Secular | 1 | Secular |
| Afrobeats | 4 | Family needs review; Both only |
| Afrwn | 1 | Unclear label; Both only |

All 19 responses lack explicit `music_family` and `gospel_categories`. Instrument names, artist identity, language, song titles and descriptions are not reliable evidence of a religious category. Afrobeats and reggae can be Gospel or secular. The app does not inspect audio or infer beliefs. No songs were automatically relabelled Gospel.

## Required before claiming fully accurate catalogue classification

The owner/editor must confirm family and Gospel subcategories for existing songs, especially the five unclear records and seven broad Gospel labels. New publishing needs a deliberate family/category field; changing the Studio/publishing backend and production metadata requires separate authorization. This task only prepares Android to consume optional explicit fields; no database migration is applied.

Proposed contract for the existing catalogue response (not a second catalogue): `music_family` = `gospel` or `secular`; `gospel_categories` = array of approved `PRAISE`, `WORSHIP`, `GOSPEL_REGGAE`, `CHOIR`, `REVIVAL`, `AFRICAN_GOSPEL`. Support several categories. Empty categories means unspecified, not automatically every subtype. Keep musical genre separate (a Gospel song may also be Afrobeats). Reject unknown values and inconsistent secular/Gospel labels for editorial review. Backfill only after owner confirmation. The Android app already reads these optional fields and fails conservatively on conflicts.
