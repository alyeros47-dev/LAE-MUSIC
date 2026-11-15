# Package referral and registration repair

## Customer behavior

- Shared Starter ($6/year), Growth ($10/year) and Premium artist ($20/year) links display that package first. Customers can choose to compare the other packages.
- Shared Premium Listening links display their exact duration, including Three-Month Premium at $1.80. The partner dashboard supplies links for all six existing listener durations and all three artist packages.
- The selected package and referring affiliate survive sign-up, sign-in, role connection and checkout. A tab-scoped, 24-hour pending journey also survives navigation and refresh; signing out clears it. This browser context never authorizes payment or commission.
- Registration automatically records a valid link's referrer. Without a referral link, registration and Premium checkout retain an optional referral-code field.
- The dashboard displays the existing affiliate ID as a copyable referral code. Both links and code have copy confirmation and clipboard fallback.

## Server protection and scope

Migration 036 adds nullable, indexed listener registration attribution. It does not rewrite existing accounts, passwords, receipts, balances or commissions. Artist registration keeps its existing attribution field.

Established verified-payment attribution takes priority over registration attribution; registration attribution takes priority over a later supplied referral. Explicitly linked roles inherit the same attribution when a new role is created. Same-owner/self referrals and unknown codes are rejected. No customer endpoint can edit the stored registration relationship.

Prices, package allowances, Monnify verification, financial allocation rules and payout availability are unchanged. New artist commissions remain held under the existing approved policy. Pending purchase records create no commissions. The free artist promotion retains its separate entry rather than forcing checkout.

## Focused verification

`tests/referral-journey-browser.cjs` uses the actual UI, server, authentication and disposable PostgreSQL database. Only external Monnify HTTP and its hosted page are fixtures. It verifies:

- Three separate artist buyers complete the exact linked package, registration and payment callback; correct original-affiliate snapshots and unchanged prices/held commissions.
- A separate listener follows the $1.80 link, registers, completes independently verified fixture payment, receives Premium and records the existing 36-cent direct commission.
- Callback replay cannot activate the purchase twice; pending purchases earn nothing.
- All six listener links select the correct plan; existing-account sign-in keeps the plan.
- Registration and verified referral attribution resist replacement, including during role connection; invalid/self referrals fail; optional manual codes work.

A separate 40-check checkout/refund regression suite preserves historical contract handling. Additional focused suites cover purchase-context expiry, social return destinations, authentication and role ownership, migration preservation, existing 20% direct / 10% quarterly team calculations, refunds, link/code copying, accessibility, package comparison and Monnify-only customer entry at mobile and desktop widths.

Hosted checks: `.github/workflows/referral-journey-tests.yml`. No production data or settings are changed by these tests. No actual purchase, music-generation request or customer credit is consumed. Fixture payment success is not evidence of a new live payment.

## Release

The repair requires a normal application release with additive migration 036. Keep the existing Monnify configuration. No new credential or business-rule approval is required. Production remains unchanged until merge/deployment is explicitly authorized. A fresh live customer purchase has not been performed for this repair.
