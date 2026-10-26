# Milestone 17 — Shared request protection and security operations

Candidate **0.17.0-rc.17**, development branch `codex/premium-platform-release`, [draft PR #6](https://github.com/alyeros47-dev/LAE-MUSIC/pull/6). This continues the existing website. No production merge, Render deployment, Android change or production-record reset.

## Connected protection

The prior account-attempt limiter lived in a process-local map and keyed the TCP socket address. It could reset on restart or differ between instances, and a reverse proxy could group unrelated clients into the same identity. Production/staging now use PostgreSQL-backed technical request budgets with atomic increments, server-clock expiration and one private cluster fingerprint seed. Different application instances and restarted processes share the same limits.

Network checks run before administrator/session lookup and password work. Applicable account checks run after identity verification and follow the actual artist/listener/operator across sessions and addresses. Cookie text, user-agent values, request body owner IDs and arbitrary path identifiers cannot create an account identity or an unlimited budget namespace. Existing role, ownership, MFA, origin, provider-proof, generation-credit and financial transaction checks remain authoritative.

The policy table in `lib/request-policy.js` groups fixed operation types. Normal public reads have generous network budgets and require no registration. The existing per-path 20-attempt sign-in/registration limit is preserved. Other groups cover recovery, comments/reports, studio/releases, uploads, offline synchronization, listener collections and administrative/financial operations. Verified-account and network limits are separate technical controls, not subscription allowances or new commercial quotas. No package price, upload/generation entitlement, commission or royalty percentage changes.

Responses expose `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and, on denial, HTTP 429 with `Retry-After` and a useful message. The tighter applicable budget remains visible when network and account checks both apply. A shared-store failure refuses protected execution with an unavailable response rather than silently resetting a quota or pretending a provider operation succeeded. Active memory budgets are never evicted to create a reset bypass.

The two exact payment webhook endpoints retain their original raw-body size/time limits, signature checking, independent provider lookup and receipt deduplication. They are exempt from these new request budgets so normal delivery retries are not confused with user action bursts. Exemption does not authorize a payment or bypass provider verification. Existing public streaming and already-playing audio remain independent of registration or administrative screens.

## Proxy trust and privacy

`TRUSTED_PROXY_CIDRS` accepts at most 32 explicit numeric IPs/CIDRs. Empty means socket-only; malformed configuration disables header trust, and universal `/0` trust is rejected. `X-Forwarded-For` is considered only when the actual TCP peer is trusted. The resolver walks from the peer toward the nearest untrusted hop, ignores forged values farther left, and bounds/validates the entire chain. IPv4-mapped IPv6 variants normalize consistently. Other client-address headers do not override identity. Ambiguous, invalid or all-trusted chains fall back conservatively to the socket address.

**Configuration is not proof of a real hosting path.** Verify the actual Render/proxy peer ranges and forwarding behavior in controlled staging before rollout. Never add a wildcard, blindly trust the leftmost header, or assume private networks contain only proxies. No actual Render proxy path was verified here.

Request buckets contain keyed HMAC identifiers, rule, scope, count and expiry, without raw IPs, session tokens or account IDs. The private fingerprint seed is automatically created once in PostgreSQL with race-safe initialization, retained across restarts and protected against mutation. It is used only for technical identifiers, not authentication or payment signing; it is never returned by reports or logged. Keep the database and backups private. There is no HTTP reset/seed-replacement endpoint.

## Operator workspace and retention

Admin → **Protection** is read-only for owner/support operators. Finance/content users and ordinary accounts cannot access it. It shows storage mode, proxy configuration state, applicable policy windows, aggregate network/account counts and UTC hourly pressure. Counts describe budget checks, not unique listeners, successful authenticated actions or proof of fraud. Database queries return bounded hourly series and grouped totals rather than per-client identifiers. The chart handles blocked-heavy series and has a text alternative; tables support keyboard scrolling. Periods are 1/7/30 days.

Development/test uses bounded process memory and labels that scope explicitly; it is not shared protection. Production/staging with a database use the shared store. Missing database/account services retain their existing honest unavailable behavior. A configured database is required for commercial/account functionality independently of this milestone.

Five-minute maintenance removes expired technical buckets after a 24-hour grace and aggregate metrics older than 31 days, at most 1,000 rows/table per batch. Cleanup can lag under load; these are scheduled retention targets, not an instantaneous deletion guarantee. Memory history is bounded and reports truncation. Existing financial journals, accounts, security audits, music, licenses and review history are not deleted or reset. The permanent audit trail is distinct from these disposable operational counters.

## Database and configuration

Additive migration **017-request-protection.sql** creates private seed settings, volatile budget rows and aggregate metrics with expiry/retention indexes. Migrations 001–016 and original records are unchanged. No new payment flag or external provider credential is added. Configure `NODE_ENV=production` for production and `NODE_ENV=staging` for a separately approved staging environment. Set verified proxy ranges through the host configuration; `.env.example` documents the setting without assuming deployment-specific addresses.

The read-only preflight reports the selected protection store, redacted proxy configuration and whether the private seed has initialized, without reading it into report output. Production clone/migration, actual peer-path validation and load/failover review are still required. Retain the additive tables/private seed through compatible rollback and recovery; do not reset live budgets or financial records to make a release check pass. An older process-local limiter does not provide the new shared protection.

## Executed verification

Local application suite: **165 pass**, plus existing 25 mocked Sonic cases / 31 source invariants. Real PostgreSQL 16 suite: **160 pass**, including migrations 001–017, concurrent admissions across separate limiter instances, restart persistence, expiration, verified identity across 240 requests using two actual listener sessions and changing forwarded addresses, rollback on aggregate failure, private reports and bounded cleanup. Existing financial records stay unchanged in protection journeys.

A native HTTP child-server journey verifies trusted proxy-chain handling, forged leftmost headers, the 20-attempt boundary, process restart, independent clients, public currency access and safe unconfigured webhook handling. The separate socket HTTP suite passes one check and actual-library loopback SMTP/TLS passes four. No external gateway, email, storage or music account was used.

Chromium desktop/tablet/mobile journeys cover the new dashboard, period controls, blocked-heavy chart bounds, private aggregate rendering, keyboard table focus and accessibility. Existing listener/artist/studio/affiliate/financial operations and actual desktop/mobile offline PWA journeys remain in the browser command. **35 axe scans pass with zero automated violations**; incomplete/manual checks remain. Frontend data, payment and media responses are fixtures; database transactions, native HTTP, browser rendering/service workers/Web Crypto/audio and local SMTP/TLS executions are real. Condensed evidence is `artifacts/request-protection-test-results.txt`; published-head CI is linked on PR #6.

## Remaining boundaries

This is application-level request protection, not a complete DDoS defense or proof that a person listened. Real traffic/NAT behavior, Render proxy paths, edge/WAF controls, production load, failover, backup/recovery and manual/physical-device accessibility still need verification. Do not enable proxy trust from a guessed range.

Authorized provider credentials/account permissions, actual R2/studio/email verification, approved ad creative/offline signing-key configuration, live settlement/commission clearance/payouts, Flutterwave refunds and remaining financial policies/corrections are still outstanding. Premium remains **$0.08 / $0.23 / $0.60 / $1.21 / $5.88 USD**, with the existing 50% recognized-net royalty pool and included in-app offline saves. No permanent listener MP3 exports, paid song purchases or download commissions are introduced. **The complete website is not deployment-ready.**
