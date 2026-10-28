# Engagement analytics and editorial operations

This batch preserves the existing player, catalog, listener accounts, financial records and previous milestones. It adds migration 009; existing historical counters are not reset or reconstructed.

## Listening activity

The player keeps one request reference for a qualified playback signal and reuses it after a transient error. A transaction records the dated event, advances the per-account/browser duplicate gate, updates the lifetime counter and records integrated listener history together. Replayed references return the original acknowledgement. Different references for the same viewer and song are suppressed for 60 seconds using PostgreSQL rather than process-local IP state. Independent browsers behind the same proxy remain separate. Legacy clients without references remain accepted and retain their separate history API behavior.

The artist Insights page provides 7/30/90-day UTC activity, zero-filled daily charts, period/lifetime song statistics, guest/account breakdowns and a private CSV export. Spreadsheet formula-like titles are escaped. The old dashboard's aggregation of all listener history under the most recent play date is replaced with actual received-event dates. Earlier lifetime counters remain readable but have no invented daily history.

These are browser-reported engagement signals with duplicate protection, not proof that a unique human heard an entire recording. Guest identities can be changed; signed-in identities represent accounts. They are not an approved royalty funding source and do not credit earnings or commissions. Streaming royalty rules remain an essential business decision.

## Editorial content

Protected administration chooses and orders up to 12 real published songs and 12 artists with published catalog entries. Revision checks prevent competing editors from overwriting changes. Public queries filter publication status again, so unpublishing immediately removes featured entries without deleting their saved selection.

Homepage promotions support titles, supporting text, internal calls to action, display positions, start/end scheduling, artwork, metadata editing and archival. The homepage shows the first two currently active promotions. Administrators can preview scheduled artwork privately. Public artwork endpoints enforce the same visibility rules as the promotion. Uploads allow PNG/JPEG/WebP up to 700 KB with format-prefix checks; SVG and forged image types are rejected. Artwork is stored using the existing PostgreSQL media pattern, separately from catalog audio in R2. Revision changes protect edits and image uploads; archival preserves the record and image.

Promotion destinations cannot point to outside sites, executable schemes, API routes or administrator pages. Public responses omit private configuration and binary images. No external marketing service or automatic messages are involved.

## Verification and boundaries

Behavioral tests cover parsing, identity separation, CSV safety, scheduling and stable player retries. Disposable PostgreSQL journeys cover concurrent play retries, durable deduplication, history/counter rollback, UTC reporting, owner isolation, immutable events, curation conflicts, publication visibility, idempotent promotion creation, image validation and archival. Browser journeys exercise period changes/CSV downloads while audio continues, curation, artwork upload and the public campaign destination at desktop, tablet and mobile sizes. Final executed results are recorded in the release evidence after CI completes.

Real audio storage/provider verification, approved paid-download pricing, streaming revenue funding, real payment/settlement/payout credentials and production schema/load review remain required. This batch does not activate money processing or establish launch readiness.
