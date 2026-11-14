# Monnify payments — approved public checkout

Monnify is added alongside existing manual bank transfers and reviewed sandbox
Paystack/Flutterwave integrations. It reuses the current immutable USD product
prices, server-issued NGN conversion quotes, account ownership checks, membership
fulfilment, extra-generation credits, Premium durations and financial journals.
No package, allowance, royalty percentage or affiliate calculation is changed.

## Server configuration

The four existing Render variables are read on the server only:
`MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`,
`MONNIFY_BASE_URL`. Live requests require `https://api.monnify.com` exactly.
`PAYMENT_CALLBACK_ORIGIN`, if configured, must be the existing canonical HTTPS
origin; the Monnify runtime defaults to `https://lae-music.com`.

Credentials alone never open public checkout. The versioned
`config/monnify-payments.json` records the owner-approved public activation after
the real one-month Premium payment was independently verified with Monnify and
reconciled through the existing server verification API on 13 November 2026.
Public activation requires reviewed live-acceptance flags and an exact successful payment reference;
new public quotes/checkouts also require a corresponding verified live database
receipt for this Monnify contract. No environment-only bypass exists.

Migration 035 only expands provider/mode constraints. It preserves existing rows
and prior migration checksums. Reverting application behaviour should keep 035 in
the migration inventory; an older build that rejects newer migration versions is
not a safe rollback. Close the Monnify policy gate and retain receipt processing
for already started payments. Manual bank transfers remain available.

## Verification and security

- Basic-auth server login obtains a cached expiring bearer token.
- Server initiation sends the exact quoted NGN amount, account email, unique
  payment reference, contract, approved methods and order/quote metadata.
- Bank transfers and cards are requested; Monnify determines what the approved
  merchant account can actually accept. No unsupported method is promised.
- Webhooks use the exact raw request bytes and constant-time HMAC-SHA512
  `monnify-signature` verification. Configure the live Monnify webhook as
  `https://lae-music.com/api/platform/payments/webhooks/monnify`.
- Every successful notification or customer verification independently queries
  Monnify by the stored payment reference and then retrieves the v2 transaction.
  Browser redirects, status parameters and posted success flags have no authority.
- PAID, exact amount, NGN, merchant scope, reference, order and quote must match.
  Pending, failed, cancelled, partial and reversed statuses grant no service.
  Overpayments/mismatches and late or uncertain artist payments require review;
  this candidate does not invent automatic refund or overpayment-credit rules.
- Existing database locks, immutable receipts and idempotency keys prevent
  duplicate credits, subscriptions and journals. An uncertain initialization does
  not silently create a second payment. Check the original reference first.
- No payout API, refund API, recurring debit mandate or card-storage feature is
  added. This gateway integration does not mark provider receivables as settled cash.

## Live acceptance and customer activation

The real NGN 810.28 payment has a verified live receipt and active listener term.
No additional live charge is needed for this release. Both Premium and artist
checkout returns now verify the owned purchase automatically before displaying
active benefits. Artist checkout references also survive normal sign-in.

Authenticated webhook handling is implemented and tested with signed fixtures.
Delivery from the live Monnify dashboard has not been independently confirmed.
The merchant webhook setting must point to the URL above; no dashboard credential
or webhook-setting API is connected to this development environment. Customer
return verification works independently of webhook delivery. Manual bank
transfers remain available, and other reviewed sandbox integrations are retained.

## Controlled checks for future gateway changes

After an approved deployment with the public gate closed, sign into the existing
owner administrator and open `/admin/console?section=monnify`. Named owners must
have a recently verified administrator session. Other administrator roles and
ordinary customer accounts cannot start this test.

Select an existing account email, matching account type and an existing product.
The one-month Premium listening plan currently costs USD 0.60; its exact NGN
charge comes from the existing exchange-rate quote and is shown before payment.
The user must complete the real Monnify hosted checkout. This opens no automatic
debit and creates no paid benefits until independently verified. Use the same
request/reference on retry; do not pay a second time while verification is pending.

Use **Check payment**, confirm the receipt and the exact purchased benefit, and
confirm authenticated webhook delivery in Monnify. A customer redirect alone is
not live acceptance proof. Keep public Monnify closed until the merchant accepts
real money successfully, that payment is verified, and public activation is
approved. Account emails are not embedded in customer-facing source or this guide.

## Automated evidence

- `node tests/monnify.test.cjs`: adapter authentication, formatting, exact decimal
  parsing, raw signatures, status handling, host allowlists and public/owner gates.
- `node tests/monnify-postgres.cjs`: actual disposable database/migrations with
  mocked provider requests, owner checkout, concurrent retries, forged callbacks,
  wrong amount/currency/metadata, all listener terms, all artist plans, add-ons,
  duplicate fulfilment protection and verified-receipt activation gate.
- `node tests/monnify-browser.cjs`: actual owner interface at phone/desktop widths,
  exact amount, hosted checkout link, server verification and public hiding.
- `node tests/monnify-public-browser.cjs`: actual customer checkout on phone and
  desktop for listeners and artists, pending-payment protection and automatic
  server-verified activation on hosted return. Provider responses are fixtures.
- `node tests/offline-persistence-browser.cjs`: encrypted saving and native MP3
  playback, including three-track wraparound and two-track B → A → B continuation
  in the main app and after a fully offline reload.
- Existing checkout, Premium, administrator, request protection, manual payments,
  refund and financial-policy tests remain relevant shared regression checks.

Database/browser tests require `LAE_DB_TESTS=true` and a disposable local
`lae_music_ci` database. They reject production URLs. All Monnify network calls in
these tests are mocked. These results do **not** establish live API authentication,
merchant acceptance, webhook delivery or a successful real-money payment.

## Official references reviewed

- https://developers.monnify.com/docs/collections/quickstart
- https://developers.monnify.com/docs/collections/one-time-payments/checkout-api
- https://developers.monnify.com/docs/collections/manage-payments/verify-transactions
- https://developers.monnify.com/docs/webhooks/event-types
- https://developers.monnify.com/docs/live
- https://teamapt.atlassian.net/wiki/spaces/MON/pages/213909851

The current webhook security guidance specifies HMAC-SHA512. Do not weaken
verification to accept unsigned notifications or multiple guessed algorithms.
Real signed webhook compatibility remains part of the controlled acceptance test.
