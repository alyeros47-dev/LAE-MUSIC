# Milestone 2 — Studio releases and listener collections

This work extends PR #6 on the existing development branch. No production deployment, merge, account change or live provider request is authorized by this document.

## Integrated implementation

Completed generations can become recoverable private release drafts. The server accepts a task/clip identity and artist metadata, never a client-supplied media URL. It verifies the artist owns a completed task and the clip occurs in that provider response. A durable job copies bounded MP3/M4A audio and optional JPEG/PNG/WebP artwork into the existing R2 architecture. Stored bytes are checked through PUT, HEAD and Range reads; the audio checksum is recorded.

Exact operator-configured provider-media hosts are required. HTTPS, credentials, ports, redirect destinations and resolved addresses are checked before fetching. Requests do not forward user cookies, authorization or referrers. No host list is guessed or enabled by default. The default fetch transport relies on the trusted provider DNS boundary; a separately vetted CDN/egress policy is still required in live verification. No arbitrary user-controlled download endpoint is exposed.

Jobs use transactionally claimed leases and unique media keys per attempt. A stale worker cannot overwrite a newer draft. Interrupted jobs can be reclaimed; failed imports can be retried without submitting a new music generation or deducting another generation allowance. Media is not deleted after an uncertain database result, since it might already back a committed draft. Orphan-object retention/cleanup and real bucket lifecycle verification remain operational gates.

Artists can review and edit a draft, preview/download their saved audio, and explicitly publish it. Publication requires current verified artist membership, rights confirmation and a remaining annual upload slot. It shares the creator lock with legacy uploads, creates one catalog entry per release, and writes an in-app notification event atomically. Listener notifications are delivered from a durable outbox with duplicate protection. Network push is best-effort.

The listener can create, rename, reorder, remove songs from and delete playlists. Existing 30-playlist and 500-song limits are retained and enforced inside owner/playlist locks. Reordering validates the complete song set and current revision so stale tabs cannot silently overwrite another edit. Removing a playlist does not modify catalog audio or the current player queue.

Discovery uses stable continuation cursors, preserves microsecond timestamp ordering, binds cursors to the current search/genre/sort, treats wildcard characters in search literally, and supports the full result set beyond the first page.

## Compatibility and commercial terms

`002-studio-releases.sql` is a new additive migration. Applied `001-platform.sql` is unchanged. No historical rows or balances are reset. Package definitions now have a shared module, preserving all prices, royalties, generation and total-upload allowances. External-upload and legacy lyrics-code contradictions remain documented; this milestone does not silently resolve them.

A stored studio draft does not activate a subscription or create cash earnings. Publishing uses one current annual upload slot, not another studio generation. Public streaming remains open. Payment checkout, royalties from unverified revenue, and bank payouts remain unavailable.

## Configuration and verification

Provide existing R2/MusicAPI credentials and set `GENERATED_MEDIA_ALLOWED_HOSTS` only after checking real completed-task media responses against provider documentation and ownership. Leave it empty until then. `STUDIO_RELEASE_WORKER_ENABLED=false` disables automatic copying and new imports for maintenance. Existing private drafts and published songs are retained.

Local `npm test` passes 62 behavioral/contract cases plus the existing Sonic/integrity suites. The expanded browser and real PostgreSQL journeys are being run in CI. They use isolated media/provider/storage fixtures, never production accounts or live generation charges. Coverage includes byte-preserving storage, failed/retried copies, lease recovery, duplicate publishing, quota races shared with legacy uploads, private access, playlist edits/concurrency and equal-timestamp discovery pages.

Live provider capability checks, real R2 credentials/bucket testing, sanitized production-schema migration tests, dependency review at release time, physical-device/accessibility checks and payment/accounting decisions are still required before launch.
