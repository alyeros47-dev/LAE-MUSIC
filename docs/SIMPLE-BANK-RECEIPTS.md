# Receipt-only manual bank payment review

This update follows the payment UI release in PR #31. It changes only manual-bank receipt submission/review and the guest-payment fulfillment identity needed by the new review format.

Customers see the payment amount, beneficiary, LAE reference and payment deadline. Copy buttons sit with the displayed values; their short visible label is Copy, with field-specific accessible labels. The only submission fields are the sender's bank account name and a required JPEG/PNG/WebP payment receipt (existing 1 MB limit).

The administrator's Bank transfers page opens on submitted receipts, shows a pending count, and displays the sender's bank account name, customer, product/amount, reference, deadline and private receipt link. After independently checking the matching deposit in the official bank account, the administrator clicks Approve payment. No code, amount, bank timestamp, checkbox or written note is required. Reject remains available, with an optional reason.

## Financial behavior

A screenshot is evidence for review, not automated proof of bank settlement. Submission does not grant benefits. The approval button explicitly sends the existing bank-verification assertion; only an authorized owner/finance session with the existing fresh-MFA rules may approve. The administrator must check the sender, exact amount, reference and deadline in the bank before clicking. Image alteration or a different image of the same bank transaction still requires this independent check; image comparison cannot establish that two receipts represent different real transfers.

The server takes the expected amount and currency from the original immutable invoice. It does not claim to read the receipt, invent a bank transaction number, or record upload time as transfer time. A purpose-specific internal payment identity preserves once-only fulfillment for artist membership, additional generations and Premium listening; the same identity is used for an approved guest payment when the matching account is created.

Exact duplicate receipt bytes are rejected at approval, including concurrent approvals and images attached to historical approvals. Old detailed-review API requests retain their reference/amount/date checks. Previously submitted confirmations without an image remain reviewable after independent bank verification. Existing final decisions, consent, financial records and referral attribution remain unchanged. All new unapproved individual commission allocations remain held.

## Migration and compatibility

`032-simple-bank-receipts.sql` permits receipt evidence without fabricated customer bank-reference/time fields, adds an explicit verification method and unique approved-receipt hash, and preserves historical detailed-review fields and immutable-history triggers. Historical rows retain their original values. No older migration was edited.

Deployment must apply migration 032 before accepting new receipt submissions (normal application startup runs checksummed migrations). A rollback after new-format approvals must retain migration 032 and the guest verified-payment identity fallback. Do not delete customer receipts or financial history or deploy a pre-032 binary that rejects the newer migration inventory.

## Focused verification

Passed:

- 14 focused manual-payment, copy/status and financial-policy unit checks.
- 2 migration-history unit checks.
- 1 PostgreSQL upgrade/replay check preserving historical submissions, approvals and immutability.
- 11 manual-bank PostgreSQL checks, including receipt-only submission; required receipt/name validation; private receipt ownership; no early activation; administrator-only approval; exact invoice values; atomic concurrent approval/rollback; duplicate-image approval races; old pending submissions; all existing artist/Premium products; held allocations.
- 9 guest-bank PostgreSQL checks, including the new receipt-reviewed Premium fulfillment identity and matching-account activation.
- Real Chromium at 390px and 1440px: account/reference copying, blocked-clipboard fallback, receipt-only artist/Premium submission, private proof, pending count, sender visibility and one-click approval without editable bank fields. Accessibility checks passed.
- Guest bank checkout to administrator approval, registration, explicit creator agreement and paid Studio access at both widths. No real audio/lyrics calls were made.
- Syntax/whitespace checks and comparison proving Studio, package prices/allowances, fulfillment calculations, royalty/commission configuration and production settings unchanged.

No real transfers, customer credits, paid provider requests or production writes were used. Full Music DNA and unrelated platform audits were not repeated.

Status: implemented and locally verified for review. Production has not been modified by this follow-up.
