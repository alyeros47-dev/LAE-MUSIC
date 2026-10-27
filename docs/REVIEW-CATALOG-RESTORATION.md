# Existing music in the Review Sandbox

The owner requested existing songs and artist accounts in the redesigned Review Sandbox. The current independent review database is temporary; it is not connected to production.

## What this batch restores

A public-metadata snapshot currently contains **7 published songs and 4 public artist profiles** from the live `/api/music/tracks` and `/api/music/artists` endpoints. `scripts/snapshot-review-catalog.cjs` fetches only these two public GET endpoints, strips all unapproved fields and rejects a potentially truncated response. `data/review-public-catalog.json` contains no emails, passwords, sessions, object keys, signed media URLs, payment data or API keys.

On startup, only the exact staging review mode can seed the exact loopback `lae_music_review` database on port 55432. The importer additionally queries the actual connected database's name, host and port before any write. A transaction and advisory lock protect the import. Source IDs map to separately allocated review IDs; no existing test accounts or songs are deleted or overwritten. Repeated startup does not duplicate rows or overwrite subsequent test edits. A fresh ephemeral database can rebuild the same public catalog from the packaged snapshot.

Imported profiles use reserved `.invalid` addresses and random unusable credentials. They receive no paid subscription, balance, lyrics grant or generation entitlement. They are public-profile copies, **not restored private artist logins**. This distinction is disclosed in the review notice and status endpoint.

Discovery, search, artist pages, song details, artwork and the existing music player use the normal upgraded backend routes and local IDs. The review-only media adapter maps those IDs to the original public media GET endpoints. It never forwards cookies/authorization and never issues POST, PUT or DELETE requests to production. Original public playback URLs must use HTTPS Cloudflare R2 hosts; errors are sanitized. Artwork is bounded to 3 MB and validated as an image. Existing files remain in their existing bucket, with no live R2 credential placed in the sandbox and no upload/deletion testing.

Playback events and test interactions stay in the review database. No production play-count or royalty endpoint is called. Public-metadata play counts are snapshots, not new verified earnings. Premium offline media tests for this imported catalog remain pending storage integration; this change does not certify them.

## Navigation verification

The route audit opens every static sidebar/header/footer page link plus the existing artist, listener, music and admin aliases. The previously missed `/music-prompt-studio.html` and `/admin/studio` addresses now reach the redesigned studio and authorized admin interface respectively. Existing mobile/desktop browser journeys cover menu interactions, account recognition, studio, libraries, player persistence and related dashboard actions. A reachable page is not proof of configured payment, provider or upload operations.

The actual review-container smoke test checks restored song/profile counts, discovery and each imported artist's song listing. The shared readiness probe checks all 99 original studio profiles. Real public-source checks obtained valid stream references and HTTP 206 responses for the first 64 audio bytes of each of the 7 songs. This verifies media availability, not full playback to the end or a browser listening-quality assessment.

## Still required for complete account restoration

Public APIs cannot enumerate private/unpublished tracks, artists with no published music, contact details, subscriptions, private generation history or account ownership. No such records have been claimed as restored.

Authenticated testing of those accounts requires an isolated, sanitized database copy supplied through secure development settings, or a separately authorized read-only export process. Keep it out of chat, public Git commits and public Actions logs. Exclude production password hashes, live sessions, recovery/MFA tokens, bank/payout details, secrets and real settlement credentials. Use separately issued sandbox login credentials; never reset a live password to make a sandbox login work. Do not point the running review service at the production database. This outstanding access/data-preparation step does not require moving the production database, bucket or API keys.

Production deployment later uses the existing production database and real accounts directly with safe migrations; this temporary public snapshot is disabled outside review mode and is not a production migration.

## Candidate test evidence

246 application cases pass, including nine catalog isolation/error cases and the static navigation audit. The actual HTTP suite passes. Chromium desktop/tablet/mobile journeys pass with 39 website accessibility audits across those sizes per browser engine; real desktop/mobile offline suites and two additional accessibility audits pass. The local 512 MB Node 22/PostgreSQL 16 review container, loaded with candidate files, passes restoration counts, artist song listings, studio metadata, registrations and session checks. This local reuse test is distinct from the fresh Docker recipe build in CI. Public sandbox rollout and real review-media checks are reported separately.

## Review release queue correction

A fresh CI Docker build already passed the real restoration smoke test. The subsequent provisioning job found the existing service and waited for the new readiness checks, but that service has auto-deploy disabled and the actual integration-deploy job shared the same concurrency group behind it. Provisioning now validates the existing service and isolation marker, returns `awaiting_configured_deployment` immediately, and releases the queue. It does not claim readiness or mutate/recreate the service. A regression test rejects any waiting, extra API calls or readiness claims in that handoff. The separate configured-deployment workflow retains source configuration/deployment fingerprints and sandbox-only mutations.

## Verified sandbox rollout

Application revision `1dd0270db4f6cebefbc76fb22435783cfb688b7a` passed every job in CI run 40451291033: 246 application tests, 175 native PostgreSQL cases, 8 populated upgrades, HTTP and SMTP, Chromium, Firefox and WebKit. Each engine runs 39 website audits across desktop/tablet/mobile and two offline audits (123 total across engines). Earlier per-viewport audit wording was overstated and is corrected here.

Configuration run 40451285656 built the actual image, passed restoration smoke checks, deployed only the review service and verified unchanged production configuration and deployment, no key updates, disabled storage and null R2 bootstrap/probes. The real HTTPS verification script subsequently passed all 4 public profile lookups, 7 published songs, all 7 actual 64-byte audio range reads and 8 shared navigation shells. These are real media-availability checks; physical phone listening and complete-track decoding remain distinct.

Private artist logins and unpublished songs remain pending a secure, isolated account/data copy. No passwords, live sessions or private account records were restored by this public-catalog batch.
