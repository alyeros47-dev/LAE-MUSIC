# WhatsApp advertising invitation pages

This change adds only community invitation pages, owner settings and campaign measurement. It does not change Studio, player, customer accounts, packages, payments or financial calculations.

## Pages and setup

| Campaign | Public route | Required group invitation |
| --- | --- | --- |
| Creator Support Network | `/join/creator-network` | Creator Support Network WhatsApp group |
| LAE-MUSIC Official | `/join/gospel-creators` | LAE-MUSIC Official WhatsApp group |

An owner signs in normally, then opens **Admin → WhatsApp communities** (`/admin/console?section=campaigns`). Paste each real `https://chat.whatsapp.com/…` invitation into its own field and save. No imaginary invitation is preconfigured. An optional Meta Pixel ID is configured separately per community. Blank invitation links disable the join button and show a short unavailable message to visitors; the owner sees an explicit configuration warning. Changing or clearing a group link needs no restart. Other application instances refresh their settings cache within 60 seconds.

The pages use the existing LAE-MUSIC colours, typography and a compressed copy of the existing logo. They do not load the application shell, player, Studio, chat widget, registration or checkout. The existing site and its navigation are unchanged except for the new owner administration tab.

## Measurement

The owner report shows all-time page-load and button-click totals for each community, plus daily UTC breakdowns for the last 90 days (up to 5,000 rows, with an explicit truncation warning). Visits are **page loads, not unique people**. Reloading counts another visit. HEAD requests and recognized preview bots are excluded. A button click is **not a confirmed WhatsApp membership**, and no membership count is asserted.

`utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `utm_term` are retained as campaign labels. Allowed values are at most 80 letters, digits, spaces, periods, hyphens or underscores. Unknown parameters, including `fbclid`, are not stored. Do not put names, emails, phone numbers or other personal information into campaign labels. No account ID, IP address, user agent, email or advertising identifier is stored in these tables.

The first-party join endpoint verifies a short-lived, campaign-bound signed token, records one click per page-issued token using a unique database constraint, and redirects to that community's current configured invitation. Concurrent repeats do not inflate the click total. Expired tokens return to the invitation page for a fresh link. Measurement failure never activates a different group or blocks an otherwise configured WhatsApp redirect. Aggregate statistics are approximate because bot filtering, browser behaviour and connection failures affect measurement.

An optional `CAMPAIGN_TOKEN_KEY` can be supplied for signing. Otherwise the existing server-only administrator secret derives a separate signing key; it is never exposed. Without either setting, a random per-process signing key is used: a restart requires visitors to refresh. No credential change is required for the existing single-instance service.

Meta Pixel loads **only after an explicit ad-measurement opt-in**. Browser Do Not Track and Global Privacy Control prevent loading. It sends PageView and the custom `WhatsAppButtonClick` event, not a Lead, Purchase or confirmed join. There is no advanced matching, automatic event setup or personal data payload configured by this code. Consent is remembered locally; clearing browser site data resets that choice. Unknown page query parameters are removed before loading Meta. A configured ID alone does not verify ownership or prove Meta received events; the owner must verify their actual ID and Events Manager setup before using it in advertising.

## Database and release

Migration `041-community-campaigns.sql` adds three campaign-only tables: settings, aggregate daily counts, and expiring anonymous click-deduplication hashes. Expired deduplication rows are deleted when the owner opens campaign reporting. Daily totals remain intact. No existing data is deleted or migrated. Configuration saves write a metadata-only audit record without the invitation URL.

Additional campaigns can reuse the renderer and tracking routes by adding approved definitions to `config/community-campaigns.json`. Their invitation URLs must still be configured by the owner; there is no public settings endpoint.

Run:

```sh
npm run test:campaigns
npm run test:campaigns:browser
# Disposable local CI PostgreSQL only; never production:
LAE_DB_TESTS=true DATABASE_URL=postgres://lae_ci:local-test-only@127.0.0.1:5432/lae_music_ci npm run test:campaigns:postgres
```

The focused GitHub workflow supplies disposable PostgreSQL and Chromium and uploads layout screenshots. Synthetic group links in tests are intercepted fixtures, never published destinations or contacted WhatsApp groups.

Before deployment, provide both real invitations, review screenshots and pass the focused checks. Use the existing production deployment process; startup applies the additive migration. Then configure both links, open and refresh both public routes on mobile/desktop, check destinations and separated totals, and confirm the existing homepage/catalogue still work before starting advertising. Do not start advertisements while either configuration warning remains.

For rollback, retain the additive tables and statistics and revert the application code. Do not restore an older release without the new migration file: this repository intentionally refuses unknown migration history. No production deployment is performed as part of preparing these pages.
