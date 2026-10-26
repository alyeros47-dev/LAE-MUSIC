# M18 — Browser compatibility and populated upgrade verification

Candidate `0.18.0-rc.18`, development branch `codex/premium-platform-release`, draft PR #6. **Not production-ready; no production merge, Render deployment or production-data access.** The owner asked to continue credential-independent work and prepare financial policy choices. The managed runtime is connected; provider/staging credentials and a sanitized production clone remain unconfigured.

## Changes

- Website and actual offline PWA runners share an explicit Chromium/Firefox/WebKit selector. Engine-specific evidence filenames avoid overwrites while preserving existing Chromium names. The same journeys/assertions run in each engine; no engine skips, fake playback, weakened application security or autoplay exemptions were added.
- CI adds Firefox and WebKit jobs, each including the full desktop/tablet/mobile website journeys and real offline desktop/mobile journeys, plus the production-dependency advisory check and populated upgrade rehearsal.
- The migration runner validates the complete stored history under its existing transaction/advisory lock. Unknown future migrations, checksum changes and gaps fail before pending migration SQL executes. Earlier SQL files/checksums and the existing server bootstrap remain intact. This does not make a database downgrade safe.
- The shared database-test guard rejects non-PostgreSQL protocols, non-loopback/non-CI targets, query options and fragments before connecting. This closes a verified driver behavior where a URL query `host` can override a seemingly local hostname. Both existing PostgreSQL journeys and upgrade rehearsals use the same guard.
- A separately guarded upgrade suite creates uniquely named databases **only** from the disposable local `lae_music_ci` fixture connection. It runs the preserved server bootstrap without providers/workers/listeners, applies historical migration prefixes, seeds representative records and concurrently upgrades them. Only databases created by this suite are dropped afterward. It does not accept a production or remote clone target.
- Representative checkpoints are legacy bootstrap (0), 7, 13 and 17. Checks preserve exact credential hashes, sessions, catalog/likes/comments, wallets/credits, paid artist terms, historical Professional 60% product snapshots, legacy NGN Premium records and separate USD/NGN transfers. Password verification remains functional. Replays and an injected actual PostgreSQL SQL failure verify idempotence and transaction rollback; corrupt/future/incomplete histories are rejected.
- `verify:fx` is an opt-in read-only real public FX probe, separate from deterministic CI. It checks approved USD prices and shared cached country conversion for NG/NGN, GH/GHS, KE/KES, LR/LRD and US/USD. No database, customer purchase, permanent repricing, gateway or treasury conversion is performed.
- [Secure staging setup](SECURE-STAGING-SETUP.md) lists exactly what must be configured privately. [Financial policy options](FINANCIAL-POLICY-OPTIONS.md) provides reviewable refund/dispute/correction proposals. These are inactive proposals, not approved commercial terms.

The first published CI run passed application/Chromium, Firefox and PostgreSQL, but its WebKit job failed at an intercepted CSV attachment. The follow-up fixture uses a real loopback HTTP response for report exports in every engine and checks actual downloaded CSV contents as well as filenames. No export assertion or engine is skipped. All CSV data remains synthetic and separate from protected production records.

## Evidence and limits

Executed results are recorded in `artifacts/launch-verification-test-results.txt` and the published-head CI results on PR #6. Linux browser-engine automation is not certification of physical iOS/Android devices, branded Safari, background playback, private storage, browser eviction, production R2 or real merchant behavior. Mocked media is a real native WAV played through browser audio APIs; actual outside financial/music/storage/email accounts were not used.

Populated historical fixtures establish preservation for those representative records, not every existing production schema/data variant, query plan, traffic level, migration lock duration or backup/recovery operation. A sanitized production clone remains required. Read-only preflight must stay blocked while launch requirements remain unresolved.

## Outstanding launch work

Live-money checkout, provider-specific independent settlement/payout verification and commission clearance; verified Flutterwave refund protocol and partial/dispute outcomes; approved consumed-service/refund/correction policies and their implementation; authorized real gateway/R2/music/lyrics/email verification; an approved ad creative; dedicated production key custody; sanitized-clone migrations, load and backup/recovery; real Render trust/proxy behavior; and manual physical-device/accessibility review remain open. Approved USD Premium base prices, included website-only offline listening, 50% streaming royalties and other existing commercial rules are preserved.
