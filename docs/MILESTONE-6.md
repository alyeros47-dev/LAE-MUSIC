# Milestone 6 — Payment care, refund evidence and benefit protection

Release candidate 0.8.0-rc.6, on the existing development branch and draft PR #6. No production deployment or merge is authorized. Live payments remain disabled by the reviewed merchant manifest and runtime guards.

## Implemented

Artists can request a full-refund review for their own verified checkout purchases. A request does not itself revoke benefits or promise a refund. The purchase history displays the case, review note and benefit hold. Administrators have a connected refund report, review form and independent provider lookup form.

Paystack sandbox submission claims a single durable attempt before external calls, retrieves and matches the original payment, checks for existing provider refunds, and requests the exact original charge amount and currency. A timeout, rejection, crash or unconfirmed response leaves a case for verification; there is no second submission, provider switch, reset or automatic retry. The operator can reconcile the refund ID from the provider dashboard. A POST response is never proof of a completed refund. Used purchased generations cannot be submitted without an approved consumed-service refund policy.

Independent Paystack GET verification checks refund ID, original numeric transaction ID, account mode, merchant-scoped API credentials, original order and quote, payment reference and ID, actual charge currency and amount. Only a `processed` refund for the full original charge amount produces a full reversal. This means provider processing is confirmed; it does not promise the recipient bank has credited the customer. Partial, failed, unknown and needs-attention refunds remain held for review. Pending and processing refunds retain a pending state.

Verified full refunds append a USD product-sale reversal journal, retain the immutable original USD receipt and NGN/USD presentment, mark the affected subscription refunded or exclude the purchased credit from future reservations, and reverse pending direct commissions. Existing generation usage, audio and published catalog records are preserved. Original orders remain paid historical facts; the reconciliation report shows gross sales and separate verified refunds. Renewal dates are not silently resequenced or prorated. Already-cleared or inconsistent commissions require reconciliation and block further USD withdrawal requests and approval of reserved requests for that partner.

Authenticated Paystack refund and dispute notifications create a review hold, with original-byte HMAC verification, reference matching, durable deduplication and audit evidence. Notifications do not create verified refund observations or financial reversals. Out-of-order notices quarantine unfulfilled checkout references and prevent later grant. Subscription use, ordinary uploads, new studio reservations, studio publishing and the final upload publication check, additional-generation eligibility and available purchased-credit counts honor holds. Replayed paid events cannot regrant a refunded product.

Migration 007 is additive: refund cases, immutable provider observations and bindings, one reversal per product, and subscription hold flags. Historical migrations and original paid evidence are unchanged. Holds cannot be manually cleared through the API; resolving ambiguous disputes requires a separately reviewed policy and verified outcome.

## Provider references and boundaries

- Paystack refund endpoints, subunit amounts and statuses: https://paystack.com/docs/api/refund/ and https://paystack.com/docs/payments/refunds/
- Paystack dispute notification and lifecycle vocabulary: https://paystack.com/docs/payments/manage-disputes/ and https://paystack.com/docs/api/dispute/
- Flutterwave's existing checkout uses v3. Current v4 refund examples cannot establish v3 account capability. Flutterwave refund submission, verification and lifecycle notifications are deliberately unavailable until v3 payloads and account behavior are independently verified. Existing Flutterwave sandbox checkout is preserved.

## Verification

Local `npm test`: 107 behavioral/contract tests plus the existing Sonic workflow and integrity checks. The refund adapter tests use HTTP response fixtures, not provider credentials or real money. The disposable PostgreSQL suite and Chromium journeys additionally exercise the real application routes, authentication, migration, financial records and responsive UI with provider fixtures; run 40211884076 passed all 58 PostgreSQL tests, the HTTP suite and desktop/tablet/mobile Chromium journeys. Gateway responses remain fixtures.

## Remaining release gates

Real provider sandbox account checks and credentials; reviewed Nigerian merchant IDs and NGN/USD permissions; Flutterwave v3 refund protocol; approved refund eligibility and consumed-service/partial-refund policy; independently verified dispute outcomes and a reviewed hold-release process; fees, actual settlement and FX accounting; payout integration and bank reconciliation. Checkout expiry alone still cannot safely release a reference that a provider may accept later. Production transactions, automatic refund retries, automatic dispute resolution and manual marking of payments/refunds as successful remain unavailable.
