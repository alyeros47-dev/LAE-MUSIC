# Task 1 — manual business-bank transfers

Implemented on the existing PR #27 development branch. Production has not been modified or deployed. This task does not approve the branch's earlier affiliate proposal or start Task 2.

## Coverage

The channel uses the existing authenticated purchase records and fulfills every currently priced product without new quantities or prices:

- Annual Starter $6 / 3 generations / 6 tracks, Growth $10 / 6 / 12, Premium $20 / 15 / 30. Two separately coded tracks per generation remain unchanged. Annual renewals preserve the existing contiguous-term behavior.
- Additional generations for each artist package at the existing effective prices. The proposed $2 / $1.80 / $1.50 prices remain configurable and inactive pending approval.
- All six approved Premium Listener durations, including the three-month $1.80 pass. Exact durations and the approved price-catalog revision are preserved.

There are 12 currently priced product/plan combinations. Gift/coin spending is unchanged; cash coin purchases have no approved cash-price catalogue or existing fulfillment contract, so this task does not invent one or open that disabled purchase route. Offline/Premium benefits continue to follow existing service capabilities and purchased entitlements.

The channel uses existing artist/listener sign-in and purchase ownership. It does not implement guest checkout or change the currently unfinished pay-before-signup flow. Existing signed-in artists can proceed from the public package page to their account to pay. Existing complimentary-testing configuration is unchanged; a pending bank payment itself never grants paid benefits.

## Customer process

Choose a package or an additional generation in the artist account, or a Premium pass on `/premium`. Review the product and refund conditions, then request bank instructions. The system records the official business account, exact charge currency/amount, immutable USD product price, exchange-rate snapshot when applicable, a unique LAE reference and a 24-hour transfer deadline. Invoice duration is configurable between 1 and 72 hours.

The customer submits sender name, bank transfer reference and actual transfer date/time, with an optional note and optional JPEG/PNG/WebP receipt up to 1 MB. Confirmation and the private image remain attached to the account-owned payment. No service activates on invoice creation or submission. Payment status and instructions survive page refresh and remain available in purchase history.

A reserved bank invoice prevents a second gateway checkout or royalty payment on that order. Original purchase terms remain unchanged even if an order's original 30-minute draft window passes while bank verification is pending. The administrator must verify a receipt within the bank invoice's transfer window; approval may happen later. A late, wrong-currency, underpaid or overpaid transfer requires reconciliation before activation. Do not send another payment while the first is unresolved.

A customer can cancel instructions only before submitting confirmation, explicitly indicating that they have not transferred. Cancellation/rejection never deletes the invoice, evidence or history. New instructions require a new purchase record; uncertain transfers must be reconciled first.

## Administrator process

Use the existing administrator login and **Bank transfers** at `/admin/console?section=manual-payments`. The default queue shows submitted confirmations; filters show awaiting-transfer, approved, rejected and cancelled history.

Compare the claim against the actual business bank account. To approve, enter the bank's unique transaction reference, exact cleared amount, bank receipt timestamp, explicit receipt-verification confirmation and a customer-visible review note. Customer screenshots and LAE invoice references are not bank verification. Reject with a clear note when no matching receipt exists.

Only the existing owner/finance roles can review. Named administrators require fresh MFA, consistent with existing financial operations. The existing shared-key owner login remains supported according to the platform's current authentication configuration. Receipt images are private to their owner and owner/finance administrators; executable documents and oversized/invalid encodings are rejected.

Approval, receipt, original-currency presentment, purchased entitlement/credit, existing commission booking and audit event commit in one transaction. A persistence failure rolls everything back. Concurrent/repeated approvals cannot double-grant; one bank transaction reference cannot pay another artist or Premium order, including after bank-display configuration changes. Reviewed evidence, decisions and invoice bindings are immutable.

Bank receipts use the existing commission functions and order-policy snapshots. No affiliate rates, qualification thresholds, quarterly rules or payouts are changed. Incoming bank approval does not release streaming royalties, invent USD cash from NGN receipts, verify treasury conversion, execute withdrawals or send automatic refunds. Existing complaint/refund-review mechanisms remain available; actual bank refunds and royalty funding still require their respective verified financial workflows.

## Official account setup — still pending

`config/manual-bank-payments.json` is deliberately disabled with `account: null`. No bank details were invented. Supply the official bank name, business account name, account number, account currency and country. The current platform merchant scope supports Nigerian business accounts in NGN or USD. Other account currencies remain unavailable until explicitly implemented and reviewed.

Owner-provided settings may be stored in that configuration or supplied through the host's secure `MANUAL_BANK_PAYMENTS_JSON` environment setting. The document has `enabled`, `invoice_hours` and `account` fields. The account object requires `bank_name`, `account_name`, `account_number`, `currency` and `country`. Do not put bank login credentials, PINs or authentication tokens in it. Incomplete/invalid settings keep collection disabled and hide the customer payment buttons.

Local and hosted fixtures use clearly labelled fictional bank data; these are never the shipped configuration. `NODE_ENV=test` and `staging` isolate receipts in test books; production receipts require actual admin bank verification. Turning this channel on does not enable Paystack/Flutterwave live checkout or remove their guards. Monnify onboarding and existing gateway integrations remain intact; no new Monnify credentials or gateway purchase is required for this task.

NGN instructions require a fresh snapshot from the existing exchange-rate service. The immutable quote fixes the amount; no ad hoc rate, discount or surcharge is introduced. USD bank instructions need no FX service.

## Migration and rollback

`029-manual-bank-payments.sql` is additive and preserves historical rows and prior migration checksums. It adds the manual channel to existing quote/attempt constraints while preserving the prohibition on gateway live mode in this candidate. Submission/review records are immutable; invoice bindings and final decisions cannot be rewritten or deleted.

Rehearse the migration on an isolated recovery/staging copy before any approved production release. To stop new instructions, disable the manual channel; existing submitted payments remain reviewable with their original bank-account snapshot. Do not remove later migrations or drop payment history to roll back UI code. A rollback build must retain the migration inventory and matching schema compatibility.

## Verification

- `npm run test:manual-bank`: configuration stays closed without official details, receipt validation and owner/finance/MFA policy.
- `LAE_DB_TESTS=true DATABASE_URL=<guarded local lae_music_ci URL> npm run test:manual-bank:postgres`: all 12 products, exact quoted amounts, no early activation, ownership/CSRF protection, wrong amounts/currency, duplicate evidence, concurrent retries, immutable history, rejection, atomic rollback, unchanged commission calculation and isolated live-book compatibility.
- With the same guarded database and installed Chromium, `npm run test:manual-bank:browser`: real mobile 390px and desktop 1440px customer and admin screens, receipt upload, private image link, bank approval, $1.80 Premium activation, retained history and accessibility. External provider fetch is forbidden.
- Existing application unit checks, membership/migration/funded-renewal checks and the 249-check PostgreSQL compatibility suite passed. The shared gateway flow retains its original presentment-before-team-booking sequence.

Local results: 1,127 application unit checks passed with one existing optional skip; 249 core PostgreSQL compatibility checks passed; 9 manual-payment database tests passed; historical membership migration, 15 membership database checks and 6 composed funding/renewal checks passed. The manual customer/admin browser journeys passed at both 390px and 1440px, including four targeted accessibility audits.

No paid music/text API calls, customer credits or real payments were used. The first local compatibility attempts encountered reused test data and exhausted workspace storage; the final run used a clean disposable fixture and passed. No production data was involved.

## Readiness

Task 1 code is ready for review and isolated integration testing. **Real bank collection is not ready to enable until the official account details are supplied, the configured flow is inspected and release/migration requirements are met.** Guest checkout remains outside this authenticated manual-payment implementation. The complete PR also retains its previously reported affiliate-scope decision and production verification requirements. Keep it draft; do not merge or deploy before Task 2 is completed, both tasks are evaluated and the owner explicitly approves deployment.
