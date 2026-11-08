# Public information and Google Search visibility

Status: implemented on `codex/public-information-search`. The owner approved merge and deployment; the guarded release verifies the final candidate and live pages. No Google submission was made.

## Inspection

The live About, How It Works, FAQs, Publishing Policy, artist-package and Premium routes responded successfully, and the platform already had approved package, publishing and financial rules. However, their first HTML response contained a generic title and loading placeholder, without page-specific descriptions, canonical tags or structured data. Content depended on JavaScript. `/robots.txt` and `/sitemap.xml` returned 404. The partner dashboard required an account; it was not a public affiliate guide. Existing How It Works copy incorrectly said all new commission allocations awaited approval.

Current approved sources were inspected before writing copy:

- `config/publishing-policy.json`, `lib/plans.js`, `config/artist-membership.json`, `lib/membership-terms.js`: annual Starter $6/3 generations/up to 6 tracks; Growth $10/6/up to 12; Premium $20/15/up to 30. Two separate tracks and account-linked publishing codes per generation. Extra-generation proposals were not published as approved prices.
- `config/affiliate-revenue-policy.json`, `lib/affiliate-access.js`, `lib/partner-policy.js`: free voluntary participation after a verified qualifying artist or at least 90-day/$1.80 Premium purchase; current eligibility does not expire with the purchased service. Premium direct 20%; quarterly two-step team 10%; December 20 cutoff and December 21–31 rollover. New artist-package and extra-generation commissions remain unapproved. Bank payouts remain disabled.
- `lib/streaming-royalties.js`, `config/financial-policy.json`: eligible Premium revenue recognition, refunds/fees/taxes/reconciliation, 30% affiliate/team reserve, half of the remaining 70% for the artist pool, eligible-stream allocations, month-end statements and seven full UTC reconciliation days. No fixed or guaranteed per-stream income.

## Public pages

| Canonical path | Purpose |
| --- | --- |
| `/` | Existing discovery homepage; platform/site identity metadata only |
| `/about` | What LAE-MUSIC does; distinguishes the platform from an artist, DJ or record label |
| `/how-it-works` | Artist registration, annual allowances, Studio creation, code-linked publication, renewal/expiry and royalty explanation |
| `/affiliate-program` | One new public guide: eligibility, opt-in, product links, original attribution/renewals, approved Premium commissions, quarterly review and payout limitations |
| `/start` | Existing package purchase entry, with public initial package information; interactive checkout remains unchanged |
| `/premium` | Existing subscription page, with public initial prices and benefits; account/checkout controls remain unchanged |
| `/publishing-policy` | Studio-only publication, rights, moderation and the complete existing refund text |
| `/faq` | Short answers with links to the relevant information |

Existing `/about-us` and `/business` aliases stay available and canonicalise to `/about`; `/get-started` canonicalises to `/start`. Aliases and tracking parameters are excluded from the sitemap. The artist package page links to the detailed guide instead of duplicating its full content. The global sidebar, footer navigation, CSS, logos and colours are unchanged; public information pages link to one another within their content.

## Implementation

`lib/public-information.js` supplies approved public copy, metadata, JSON-LD and the XML sitemap from existing read-only configuration. The platform serves useful information in the initial HTML to ordinary visitors and crawlers alike, without requiring login, JavaScript or a database. No user-agent-dependent content or fabricated ratings/contact details are used.

Each canonical page has a distinct title/description, canonical URL, robots metadata and sharing metadata. Organization, WebSite and page structured data describe the actual platform; there is no promise of a Google rich result. The preferred public origin is `https://lae-music.com`; the Render address points to that canonical origin.

The existing business JSON endpoint is unchanged without a query. An allowlisted `page` query supplies the same public content to in-app navigation. Initial public information survives unavailable account/configuration APIs. Client navigation updates titles/canonicals/schema and clears stale public metadata on private account routes. Public prices and royalty examples are inserted literally, preserving dollar amounts in initial HTML.

Robots guidance leaves required public rendering APIs and `/web/` assets crawlable; private administrator APIs are disallowed. JSON API responses receive `noindex`, while protected account/checkout pages receive noindex headers and client metadata. Robots directives do not replace authentication. Review/staging copies remain noindex. `/sitemap.xml` lists only the eight canonical public URLs, without invented last-modified dates, account identifiers or referral parameters.

Exact hashes authorise only the trusted embedded data blocks under the existing Content Security Policy; no `unsafe-inline` or extra external script access was added. Service-worker public shell v22 refreshes resources without resetting encrypted songs or device keys. Live-release verification now compares the correctly rendered homepage rather than the original unrendered template.

## Clear earnings examples

The affiliate guide explains $0.36 direct and $0.18 two-step team amounts on a fully eligible $1.80 Premium purchase; five such two-step purchases give a $0.90 team illustration. It clearly states eligibility, verification, refunds/holds and disabled bank payouts. No artist-package or extra-generation commission percentage is advertised.

The guide also shows the approved $1.80 revenue illustration: $0.54 affiliate/team budget, $0.63 artist pool and $0.63 LAE-MUSIC, before applicable deductions/rounding and recognised across the subscription term. A separate artist example uses a hypothetical $100 verified monthly pool and 10% of eligible streams to illustrate a $10 allocation. Neither example promises income or a fixed payment per play.

## Focused verification

- `node --test tests/platform.test.cjs tests/public-information.test.cjs tests/controlled-publishing.test.cjs`: 27 passed. Covers anonymous initial content/HEAD responses, accurate approved facts, complete refund text, literal dollar amounts, alias/query canonicalisation, no user-input reflection, same customer/Googlebot HTML, sitemap/robots, private/review noindex, structured data/CSP hashes and unchanged sidebar/footer/business JSON.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/public-information-browser.cjs`: passed at 393/1440px. Seven information/pricing pages readable without JavaScript; public in-app links and metadata/schema updates; unavailable-account fallback; no overflow; ten focused accessibility audits; correct metadata cleanup when entering the partner account page; no writes.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/controlled-publishing-browser.cjs`: passed at 390/1440px. Public copy and accessibility, existing three package cards, referral parameter preservation and the unchanged code-required upload form.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/offline-browser.cjs`: public-shell upgrade and encrypted offline-library retention/expiry/sync checks. No paid providers or customer credits used.
- Final release checks also cover the existing package-first referral browser journey, full policy route/API parity and the 12 guarded release tests. Browser security assertions run before screenshots because WebKit’s screenshot tool injects its own animation-sync CSS; no customer CSP violation is ignored and the application CSP is unchanged. Exact public HTML, sitemap and robots checks run on both live domains after deployment.
- New public-information tests are registered with the existing unit/browser CI runners. JavaScript syntax and `git diff --check` passed. No broad Music DNA audit or paid generation tests were repeated.

Preview images are local artifacts, not a changed live website: `artifacts/public-information-393.png`, `artifacts/public-information-1440.png`, `artifacts/public-affiliate-393.png`, `artifacts/public-affiliate-1440.png`.

## Search Console: owner action after approved deployment

No Search Console account/API connection is available. The live HTML did not expose a verification meta tag, and a public DNS TXT lookup did not find a Google verification record; these observations do not establish whether an existing Google account already owns a verified property by another method. Property ownership, indexing state and previous submissions therefore remain NOT VERIFIED.

1. Open https://search.google.com/search-console and use the existing `lae-music.com` property if present. Otherwise add the domain and complete Google's DNS TXT verification at the domain provider. Use only the actual record Google supplies.
2. After this release is approved and deployed, submit `https://lae-music.com/sitemap.xml` in Sitemaps.
3. Use URL Inspection to test `/about`, `/how-it-works`, `/affiliate-program`, `/start` and `/premium`, check Google's chosen canonicals, then request indexing where available.
4. If HTML-tag verification is preferred, provide the public verification tag or complete it yourself; no Google password or secret is needed in chat.

Preparing a sitemap and readable pages helps discovery; Google controls crawling, indexing, rankings and rich-result display. No indexing or ranking guarantee is made.

References: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics ; https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls ; https://developers.google.com/search/docs/appearance/structured-data/organization .

## Scope retained

No Studio, audio player, authentication, database schema, payment activation, membership benefits, financial calculations, affiliate attribution/rates or payout rules were changed. Outstanding business decisions remain outstanding; this work only explains their current status. Production remains unchanged until owner approval.
