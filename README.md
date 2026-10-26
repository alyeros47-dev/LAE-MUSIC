# LAE-MUSIC

Music discovery, artist tools, an AI music studio, and **LAE-MUSIC Partners & Affiliate Network** on the existing Node.js HTTP server, PostgreSQL, and Cloudflare R2 architecture. This development branch adds a shared dark interface and persistent browser player; it does not replace the backend or Android app.

**Release status: draft candidate. Not launch-ready.** Live-money processing, bank payouts and automatic royalty/commission settlement remain unavailable. Reviewed staging accounts can use the prepared sandbox checkout; the committed merchant manifest is disabled. See [the audit](docs/AUDIT.md), [release status and evidence](docs/RELEASE.md), and [staging instructions](docs/DEPLOYMENT.md). The [feature/launch matrix](docs/FEATURE-STATUS.md) lists implemented behavior and remaining work.

Premium Listener subscriptions use the owner-approved USD base prices ($0.08 / $0.23 / $0.60 / $1.21 / $5.88), shared international currency conversion and approved universal 50% streaming revenue pool with immutable monthly accounting and separate cash-release safeguards. [Milestone 14](docs/MILESTONE-14.md) records pricing, qualifying-stream rules, refund behavior and the unconfigured live settlement verifier. Existing free listening remains available. [Milestone 15](docs/MILESTONE-15.md) adds Premium website offline listening with encrypted browser storage, expiring access and once-only synchronized eligible plays. Listener MP3 exports, paid song purchases and download commissions are not supported.

## Local development

Use Node.js 22 (supported runtime minimum: 20). Install dependencies and configure environment variables from `.env.example` in your shell or hosting configuration. The server does not load `.env` automatically.

```sh
npm ci
npm start
```

Open `http://localhost:3000`. Public pages render without a database and show an honest unavailable state for catalog data. Real public streaming requires published PostgreSQL tracks and working R2 objects. Authentication uses Secure cookies: use HTTPS when testing signed-in flows outside the test harness.

Routes: `/` and `/discover`, `/artists`, `/library`, `/offline`, `/premium`, `/workspace`, `/studio`, `/partners`, `/account`, `/join`, `/recover`, `/verify-email`, `/admin/console` and private operator enrollment at `/admin/enroll`. Existing entry points such as `/start`, `/dashboard`, `/earnings`, `/music-prompt-studio` and `/admin` open the shared interface. Existing backend APIs remain in place, with stricter financial idempotency and private earnings checks. Original page implementations can be inspected with `?legacy=1`; `/artist` retains advanced legacy upload support and `/admin/studio` retains the protected content studio.

The persistent audio element sits outside the page router. Player preferences retain track identifiers and position, never expiring R2 signed URLs or account secrets. Reloading requires an explicit play action to resume.

## Verification

```sh
npm test
npx playwright install --with-deps chromium firefox webkit
npm run test:browser:all
npm run test:http
npm run test:email
# Disposable local CI database only: npm run test:postgres and npm run test:upgrade
```

The default suite executes source checks, existing mocked Sonic tests, and behavioral tests of actual request handlers, player logic, transactions, permissions, uploads, referrals and migrations with controlled services. It does **not** establish real PostgreSQL, storage, payment or music-provider compatibility.

The same website and real PWA journeys run in Chromium, Firefox and WebKit. They execute service-worker installation, encrypted IndexedDB storage, offline reload and 31 seconds of native audio playback at desktop/mobile sizes, expiry, signature/cipher protections, exactly-once synchronization and unsupported-browser handling. The interface journeys cover desktop/tablet/mobile sizes, 33 axe scans per engine and dialog keyboard checks; the PWA adds two scans per engine (105 total). Financial/R2/session responses are isolated fixtures. Linux WebKit is not physical Safari/iOS certification. Use `npm run test:browser` for Chromium alone or `LAE_TEST_BROWSER=firefox` / `webkit` for one engine.

The populated upgrade suite creates and removes only its own uniquely named fixture databases, checks historical checkpoints 0/7/13/17, exact existing-record preservation, concurrent upgrades and SQL failure rollback. It refuses remote/production targets; a sanitized production clone still needs separate review. `LAE_PUBLIC_FX_TESTS=true npm run verify:fx` optionally contacts the real public FX service without database writes or permanent repricing. Current evidence and published-head CI are recorded in [release notes](docs/RELEASE.md) and [PR #6](https://github.com/alyeros47-dev/LAE-MUSIC/pull/6).

Before real integration testing, follow [secure staging setup](docs/SECURE-STAGING-SETUP.md). The owner-requested [financial policy options](docs/FINANCIAL-POLICY-OPTIONS.md) are inactive proposals requiring selection and subsequent implementation/testing.

## Layout

- `server.js`: preserved HTTP server, existing account/catalog integrations and legacy initialization.
- `lib/platform.js`: shared-interface routes, new protected APIs and centralized request guards.
- `lib/transactions.js`, `lib/finance.js`, `lib/credits.js`: transactional idempotency, balanced ledger transfers, withdrawals and lyrics-credit protection.
- `migrations/`: checksummed additive PostgreSQL migrations under a transaction advisory lock.
- `web/`: framework-free interface, design system, local brand assets and persistent player.
- `tests/`: explicitly mocked service, handler and browser coverage.
- `musicapi-sonic.js`, `artist-voice.js`: preserved provider integrations, with durable generation-request keys and ownership checks.

Do not merge into production or deploy to Render until the release gates are verified and deployment is approved. Existing production records must never be reset for testing.

The connected release-copying/listener collection milestone is described in [milestone 2](docs/MILESTONE-2.md). [Milestone 3](docs/MILESTONE-3.md) adds unpaid purchase review/history, verified-sale accounting contracts, future renewal terms and purchased studio credits. The production server still has no payment adapter; checkout and payouts remain disabled.

Flutterwave and Paystack are the selected gateways. USD remains the standard currency; the header control displays country-based local estimates with a manual override and clear USD fallback. See [milestone 4](docs/MILESTONE-4.md) for reference-rate coverage, gateway protocol contracts and the remaining merchant/checkout/settlement gates.

The merchant country is Nigeria. [Milestone 5](docs/MILESTONE-5.md) connects the guarded sandbox checkout, exact local-currency verification and original-charge accounting evidence. The committed merchant manifest disables checkout; adding environment keys does not activate production payments.

[Milestone 6](docs/MILESTONE-6.md) adds purchase refund requests, protected administrative review, Paystack sandbox refund verification, original-currency evidence, USD reversal journals and entitlement/commission holds. Flutterwave refunds, partial-refund policy, dispute resolution and live settlement remain release gates.

[Milestone 7](docs/MILESTONE-7.md) connects account session controls, transactional password changes and reset/verification flows with an encrypted email queue. Listener and artist identities remain separate. Email delivery stays disabled until the provider, sender and credentials are verified. The SMTP test requires OpenSSL and uses an isolated loopback TLS server; no outside email is sent.

## Current operations additions

Artist Insights provides dated engagement and private CSV exports. Editorial administration manages real catalog spotlights and scheduled homepage promotions. Named administrator accounts use authenticator/recovery codes, scoped permissions and versioned session revocation; shared-key mode ends only after owner enrollment. Artist notifications record account events and subscription reminders. Community moderation includes guest comments and preserves platform holds, review history and source records.

`npm run preflight` prints a redacted configuration/release report; `npm run --silent preflight -- --database` adds read-only schema/accounting checks against the explicitly configured database. Exit 2 currently means unresolved release gates. It does not apply migrations or authorize deployment.

Admin → Reconciliation connects unresolved checkouts, refunds, benefit/commission/royalty holds and withdrawals with currency-separated reports, exact ledger exports and revisioned operator review history. It cannot change financial outcomes or send money. See [Milestone 16](docs/MILESTONE-16.md) for verification and boundaries.

Admin → Protection monitors shared production/staging request budgets and redacted aggregate pressure. Explicit trusted proxy ranges control forwarded client addresses; verified account limits survive session/address changes. No commercial quotas change. See [Milestone 17](docs/MILESTONE-17.md) for configuration, verification and hosting limits.
