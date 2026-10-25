# LAE-MUSIC

Music discovery, artist tools, an AI music studio, and **LAE-MUSIC Partners & Affiliate Network** on the existing Node.js HTTP server, PostgreSQL, and Cloudflare R2 architecture. This development branch adds a shared dark interface and persistent browser player; it does not replace the backend or Android app.

**Release status: draft candidate. Not launch-ready.** Payment checkout, provider webhooks, bank payouts, and automatic royalty/commission settlement remain disabled. See [the audit](docs/AUDIT.md), [release status and evidence](docs/RELEASE.md), and [staging instructions](docs/DEPLOYMENT.md).

## Local development

Use Node.js 22 (supported runtime minimum: 20). Install dependencies and configure environment variables from `.env.example` in your shell or hosting configuration. The server does not load `.env` automatically.

```sh
npm ci
npm start
```

Open `http://localhost:3000`. Public pages render without a database and show an honest unavailable state for catalog data. Real public streaming requires published PostgreSQL tracks and working R2 objects. Authentication uses Secure cookies: use HTTPS when testing signed-in flows outside the test harness.

Routes: `/` and `/discover`, `/artists`, `/library`, `/workspace`, `/studio`, `/partners`, `/account`, `/join`, `/admin/console`. Existing entry points such as `/start`, `/dashboard`, `/earnings`, `/music-prompt-studio` and `/admin` open the shared interface. Existing backend APIs remain in place, with stricter financial idempotency and private earnings checks. Original page implementations can be inspected with `?legacy=1`; `/artist` retains advanced legacy upload support and `/admin/studio` retains the protected content studio.

The persistent audio element sits outside the page router. Player preferences retain track identifiers and position, never expiring R2 signed URLs or account secrets. Reloading requires an explicit play action to resume.

## Verification

```sh
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run test:http
# Disposable CI database only: npm run test:postgres
```

The default suite executes source checks, existing mocked Sonic tests, and behavioral tests of actual request handlers, player logic, transactions, permissions, uploads, referrals and migrations with controlled services. It does **not** establish real PostgreSQL, storage, payment or music-provider compatibility.

The browser runner uses isolated test fixtures at three viewport sizes (desktop, tablet and mobile) and produces `artifacts/` screenshots and evidence. It requires a sandbox that permits Chromium processes. The optional socket-based HTTP test requires local networking. GitHub Actions includes both application and browser checks; the application, browser, HTTP and isolated PostgreSQL jobs passed in [CI run 40193499188](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40193499188).

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
