# Listener music preferences

Discovery now offers a first-visit “Which music suits you best?” dialog. Visitors can choose multiple music families without registering. Gospel offers All Gospel, Worship, Praise, or both. Other families can be narrowed to matching genre labels in the published catalogue. “Other sounds” covers genre labels outside the named families. Category headings are organizational; selection uses explicit checkboxes and All/category controls.

The selection applies to discovery songs, search, genre counts, artist recommendations, pagination and the discovery playback list. The server filters before limiting results and binds continuation cursors to the normalized preferences. Genre refinements intersect with preferences; they never silently broaden the selection. General editorial promotions and featured items are omitted while a preference is active. Direct song links, artist catalogues, saved libraries and an already chosen playback queue remain available independently.

“Choose your music” reopens the dialog. “Explore all music” explicitly clears filtering and records that choice, so it does not keep asking. Escape dismisses the first prompt as Explore all, or preserves an existing choice when editing. Versioned preferences are saved on this browser, not synced between devices or accounts. If browser storage is blocked, they last for the current page session; clearing site storage resets them.

## Classification limits

Filtering uses published genre metadata, not guesses from titles, private lyrics or audio. Gospel is recognized from Gospel, Worship, Praise or Christian genre labels. Worship/Praise filters require those words in the genre. The legacy ambiguous label “Gospel & Worship” is intentionally available under All Gospel only. Generic Gospel songs are not automatically recategorized. Clear Gospel Worship, Gospel Praise and Gospel Worship & Praise choices have been added to the existing upload genre suggestions; artists may still enter their own genre.

Fused secular genres can appear in more than one relevant family, but Gospel-labelled tracks are excluded from secular families. No songs or accounts are migrated or rewritten. Empty results explain that matching published metadata is required and invite preference changes. Accurate existing song categorization remains a catalogue-maintenance task, not a reason to show unrelated music.

## Verification

- `node --test tests/listening-preferences.test.cjs tests/discovery-playlists.test.cjs`: taxonomy, input rejection, cursor binding; disposable PostgreSQL checks run when the existing explicit `LAE_DB_TESTS=true`/local `lae_music_ci` guard is satisfied.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/listening-preferences-browser.cjs`: actual application UI at 390px and 1440px with intercepted APIs; welcome, category changes, persistence, editorial isolation, automated accessibility and overflow checks.
- Existing platform/router/navigation checks and existing Chromium application journey cover shared frontend regressions.
- The new tests are registered in existing application, PostgreSQL and browser CI runners.

No production settings, database content, storage objects, financial rules, studio instructions or paid API credits are changed. Production deployment requires separate approval.

Local result: 8 focused discovery/preference checks passed, including the disposable PostgreSQL case; 24 existing platform/router/navigation checks passed; the new welcome UI passed at mobile and desktop with zero automated accessibility violations; the existing Chromium journey passed at desktop/tablet/mobile with 53 accessibility audits. No paid services were called.
