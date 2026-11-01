# Link-based artist-package payment demo

This is an internal simulation using the existing website, database and approved artist-product pricing. It does not connect to payment, music, lyrics, voice, storage or payout providers. Real checkout remains disabled.

## Customer walkthrough

1. In a real free partner account, copy a Starter, Growth or Professional product referral link.
2. Open that link in another browser or a private window. Choose a package and select **Try demo payment**.
3. Review the referring partner and server-calculated price. Confirm the demo disclosure, then choose **Pay with demo funds**. A failed-payment option is also available.
4. After a successful simulation, enter a test alias and select **Create demo profile**. No email, password or real artist account is created.
5. The original partner can open **Partners → Demo referral sales** to see the attributed direct example. These numbers are separate from the real dashboard and wallet.
6. The demo profile has its own clearly marked demo product links. Share one to test the next referral step. Its buyer produces a direct example for that demo profile and a quarterly team projection for the ancestor exactly two steps above it. A third-step sale does not also reward the original partner.
7. **Simulate demo refund** reverses only that receipt's examples. It does not request a real refund or promise eligibility for one.

Demo browser sessions last up to 30 days and are stored in PostgreSQL, so redeploying does not reset them. **My demo profiles** reopens profiles in the original browser. These profiles cannot sign in through the real email/password form and cannot use paid artist tools. Referrers' demo history is separately retained in their owner-scoped report.

## Prices and allocation rules

The demo reads the existing artist package catalogue: Starter $6/15% direct, Growth $10/25% direct, Professional $20/25% direct. Artist-package team projections are 10%, exactly two referral steps up. There is no immediate indirect payout or registration reward. The existing UTC period rule is reused: December 20 remains Q4; December 21–31 rolls into next January–March. Each record displays its quarter, and projections do not release money.

This linked walkthrough currently covers artist packages. Existing Premium Listener calculation examples remain in the original demo calculator, including their separate 5% team rule. Premium checkout, gateways, offline entitlements and withdrawals are not verified by this demo.

## Separation and safeguards

Additive migration `026-link-referral-demo.sql` creates three dedicated tables: hashed browser sessions, demo receipt/profile flows and demo allocations. It does not change existing account, finance, subscription or credit rows, or earlier migration checksums. No demo result is consumed by real entitlement checks, commerce receipts, artist referral ledgers, settlement or withdrawals.

- Session cookies are host-only, HttpOnly, Secure and SameSite=Lax, scoped to the demo API. Tokens are stored hashed and never returned in JSON. A receipt UUID or public demo referral code alone cannot read or alter another browser's receipts.
- Public links resolve valid referrers on the server. Parent links must belong to the same chain. Clients cannot submit prices, commission percentages, parent IDs, paid flags, dates or recipient IDs.
- Only a successful simulated payment permits demo profile setup. Receipt locks and unique allocation keys prevent duplicate examples. Reusing a start key with changed product/referral details is rejected.
- Failed payments create no allocations. Refund retries reverse the same examples once, preserve history and never change production money.
- Existing origin checks cover mutations. A dedicated network budget, twenty starts per browser per day, a bounded root daily quota and a ten-profile demo-depth limit control abuse. This does not impose new limits on the real referral programme.
- Demo reports require the matching browser session or the real referring partner's authenticated account. There is no public financial report by artist ID. Totals exclude reversed examples and never include withdrawable money.

Deploying requires the normal owner-authorized release and safe migration verification. Historical-upgrade tests preserve populated account/catalog/currency records. Any rollback must account for the checked migration history; blindly starting older code against a newer schema is not a supported rollback.

## Verification

Focused unit and real PostgreSQL tests cover rates, exactly-two-step lineage, December cutoff, idempotency, ownership, origin rejection, malformed/forged claims, failed payment, expiry, limits, reversal and unchanged real financial tables. Actual frontend fixtures cover phone/laptop purchase, profile setup, copy/share context, refresh, failure, refund, reports and accessibility. An additional real-PostgreSQL browser walkthrough verifies the secure cookie and a second-browser purchase without mocked demo APIs.

Example local commands (only the explicitly named disposable `lae_music_ci` database is accepted):

```sh
node --test tests/referral-demo.test.cjs tests/artist-packages.test.cjs
LAE_DB_TESTS=true DATABASE_URL=... node --test tests/referral-demo-postgres.cjs
LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/referral-demo-browser.cjs
LAE_DB_TESTS=true DATABASE_URL=... LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/referral-demo-browser-postgres.cjs
```

Passing this demonstration verifies the simulated link/attribution/calculation experience. It is not evidence that Paystack/Flutterwave settlement, production payment fulfillment or bank payouts work. Those require separately verified provider test access and financial integration tests.
