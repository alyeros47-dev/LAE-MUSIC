# Premium payment confirmation recovery

The incident was a paid Monnify checkout that remained `ready` in LAE-MUSIC. Its correct referrer was already attached, but no verified receipt, Premium entitlement or referral commission existed. An independently retrieved Monnify payment confirmed the exact original order and quoted amount. Reconciliation through the existing payment-verification service activated that existing purchase once and recorded the approved 20% direct commission. No new charge was made. The dashboard accounting query confirmed the recorded purchase and commission.

Webhooks and browser returns remain the normal confirmation paths. The application now also checks a bounded set of outstanding live Monnify Premium attempts every minute. This covers a closed browser or missed notification without requiring the customer to pay again.

The fallback selects at most five unheld, unfulfilled `ready` attempts from the preceding 48 hours, gives unchecked/oldest-checked attempts priority, and avoids attempts looked up in the previous minute. It uses the existing server-to-server verification and transactional fulfillment services. It never initializes a payment, changes a quote, bypasses holds or mixes test and live records. Existing receipt, ownership, merchant, amount, currency, quote and idempotency guards remain authoritative. Older or explicitly held attempts retain their existing review/check-payment paths.

It runs only when live Monnify is already approved/configured, outside development/test/staging. It starts and stops with the existing application; no new service, secret or environment setting is needed. Already fulfilled attempts cause no further gateway lookups.

Focused tests use a disposable local PostgreSQL database and mocked Monnify HTTP. They prove that a paid checkout with no webhook and no browser return activates Premium and the correct affiliate's earnings once, and that the actual dashboard query displays them. They also cover pending/mismatched payments, excluded held/old/test-book attempts, retry fairness, timer cleanup and existing Monnify fulfillment/security regressions. No new real payment or paid music-generation test is required.

Package prices, allowances, eligibility, 20% direct / 10% quarterly Premium rules, other commission holds, streaming and Studio behavior are unchanged. No schema migration is required. Code rollback does not reverse valid receipts or earned commissions.
