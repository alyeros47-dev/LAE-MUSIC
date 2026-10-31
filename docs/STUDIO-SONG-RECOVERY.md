# Completed-song recovery after refresh

The existing history endpoint selected only paid `artist_studio_usage` records. Complimentary generations persist in `sonic_test_tasks` / `artist_test_generations` and therefore vanished from the history interface on refresh despite remaining recorded.

History now includes owned provider tasks that have no paid usage row, alongside existing paid and provisional records. The two sources remain deduplicated, owner-filtered and limited to 30 recent entries. Queries are read-only; there are no migrations, record resets, refunds or new generation requests.

The studio moves results and generation history above the workshop forms. It remembers the selected task per artist and reopens it after refresh. Existing previously hidden recorded tasks can reopen even without browser state. Stored references must match that artist’s server-returned history; the normal status and upload-code endpoints still enforce ownership. Starting a new generation opens an explicit `?create=new` workspace while keeping history intact.

Local verification: actual mobile/desktop refresh recovery, fallback from an invalid stored reference, new-workspace navigation, existing song-code retry/selection, file controls, zero additional create requests, accessibility and responsive layout. Existing upload and Gospel permission tests pass. Disposable PostgreSQL coverage checks unpaid task recovery, owner isolation, paid/task deduplication and provisional history retention. Provider and storage requests are mocked; no paid generation is run.
