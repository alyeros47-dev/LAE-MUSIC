# Fresh-account testing without the Neon/R2 setup

The owner paused existing-account restoration and authorized fresh artist accounts to test audio uploads and the studio without buying a package. The failed Neon export is therefore disabled by `LAE_IMPORT_NEON_ARTISTS=0`; its stored secret is preserved but is not used for an export. It no longer blocks the sandbox release.

## Temporary access

Only the isolated review Docker image sets `LAE_REVIEW_TEST_ACCESS=1`. The backend additionally requires staging mode, the exact review marker and the actual loopback review PostgreSQL identity before initializing test tables. Production's existing Node service, database, users, package prices, payment checks and R2 configuration are unchanged.

Fresh authenticated artist accounts have a 24-hour sandbox test window. They can upload **five songs**, each MP3/M4A up to 30 MB, with optional JPEG/PNG/WebP artwork up to 3 MB. The whole sandbox has a 200 MB reserved-media cap. These are temporary test limits, not revisions to approved commercial quotas.

Files stay in `/tmp/lae-review-media` in the sandbox container. No live bucket, R2 keys, source SQL or separate storage service is used. Metadata preparation locks the artist/capacity, validates permission acknowledgement and reserves sizes; upload ownership, declared MIME/length, actual signatures and completed file sizes are checked. File names are generated and path-validated. Partial failed files are removed, and the UI attempts cancellation of failed pending uploads. Publishing is repeat-safe. Public playback uses the same player with real same-origin media, Range/HEAD support and artwork. New files/accounts/test activity can reset during a sandbox restart or deployment.

## Studio testing

An artist may reserve **one complimentary review music generation** using a separate once-only trial table, with existing task ownership, request-key replay, concurrency protection, failure decisions and uncertain-acceptance holds. No paid subscription, receipt, wallet credit or commission is fabricated. Confirmed provider rejection/failure releases the trial once; uncertain acceptance remains reserved. Existing paid-artist behavior is retained outside this explicit sandbox mode.

The existing shared provider safety cap stays at **one charged MusicAPI request and two charged OpenAI requests per temporary instance**. The studio shows shared music-test capacity and disables submission when it is exhausted. This temporary test allowance does not decide the future public artist promotion or change any permanent package. Saved voices/new voice uploads and R2-backed private-release imports remain pending their existing integration requirements.

The automated fresh-account verifier does not consume the shared music test. A real music result is not claimed from mocked provider tests or from merely enabling the button. The owner can make the first actual studio submission with a genuine brief and inspect its result.

## Phone test path

Open `/join?role=artist&mode=register` on the existing sandbox, create a fresh Artist account, then choose **Artist workspace → Upload music**. Upload your own MP3/M4A, optionally add artwork, confirm rights and publish. Find it under **Your songs**, open **View public profile**, then play it. Open **AI music studio** to use the separate lyrics credits and see the complimentary/shared music allowance.

Do not use a live account password as a sandbox test password. No account copy, Neon compute activation, new bucket, API-key transfer, payment or production deployment is needed for this path.

## Verification boundaries

Unit tests cover mode/database isolation, traversal/ranges, rights/format validation, provider cap state, once-only trial reservation and the actual Sonic handler with mocked success, replay, definite failure and uncertain acceptance. Original paid-artist Sonic and financial tests remain.

The actual 512 MB Node 22/PostgreSQL 16 container verifies fresh signup/session, free upload/publish/replay, anonymous MP3 range delivery and the absence of a paid subscription. Additional real desktop/mobile Chromium journeys register through the actual backend, upload original encoded MP3/PNG fixtures, publish, check artist ownership/navigation, decode/play audio, display artwork and enter the trial studio. The mobile fixture omits MIME metadata to test filename fallback followed by server-side signature verification. No provider or R2 call is made by these journeys.

`verify-review-fresh.cjs` is separately opted in and pinned to the hosted sandbox. It creates only a synthetic test account/media, verifies HTTPS registration/relogin, upload, full file bytes, artwork, seek range and owned catalog, then unpublishes its test audio and signs out. It never calls a paid provider or production mutation endpoint. Hosted results and CI must be reported separately from local/mocked evidence. This batch does not make the complete platform production-ready.

## Hosted verification

The sandbox is deployed on application revision `289b41b1107e36872e41f7fc13552aecf4a2ffbe`. Configuration run 40475851289 built the actual container, passed free-upload/import fixtures and deployed only the review service, with unchanged production configuration/deployment and no key updates. The actual importer is paused/null; R2 bootstrap/probes are null and no R2 write test was performed.

The real HTTPS fresh-account verifier passed registration, free access, actual MP3/PNG upload and full-byte integrity, Range streaming, logout/relogin and owned catalog. It unpublished its synthetic QA audio afterward. The shared music test remained available (1), and the verifier made zero charged provider requests. Real MusicAPI audio output has not been certified. The existing 7 songs and 4 public profiles passed their separate read-only regression checks too.

The 265-case application/Chromium job, PostgreSQL job and WebKit job passed CI 40475858606; Firefox was still running when this evidence was recorded. Local real-container desktop/mobile browser journeys passed, including codec playback and mobile MIME fallback; physical device testing remains distinct.
