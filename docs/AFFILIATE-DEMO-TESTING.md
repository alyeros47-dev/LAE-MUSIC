# Affiliate demo testing on the existing website

The original frontend hid all partner practice tools unless `review_tools` was enabled. The existing backend practice service already stores isolated examples, never real payments or commissions. A dedicated `affiliate_demo` capability now exposes those tools to signed-in artist/partner accounts when a database is attached, without enabling other review tools or live finance.

## Scope and limits

`/partners?mode=demo` is an internal walkthrough with fictional referral positions. It uses the existing approved product prices and server-side commission policy: artist package-specific direct rates; Premium 10% direct; existing studio direct rate unchanged; exactly-two-step quarterly bonuses of 10% artist/studio and 5% Premium. There is no immediate indirect payment or signup reward. Verified, unpaid, disputed/held and assumed-approved full-refund examples show eligibility effects. Multiple example purchases use aggregate quarterly rounding and the shared December 20/21 cutoff.

`POST /api/platform/partners/practice/preview` requires an artist session and same-origin protection. It accepts only approved product IDs, a bounded purchase count, a referral position, a hypothetical payment outcome and a sale date. It rejects client prices, rates or extra parameters. It performs no database writes, provider calls, wallet transfers, credit grants, package activation or real financial operations.

The existing saved direct-sale examples remain at `/partners?mode=demo&tab=records`; their original owner isolation, once-only references and 20-per-day limit are preserved. They use the existing dedicated practice table. No migration or environment change is required.

This demo does **not** verify real referral attribution, Paystack/Flutterwave callbacks, settlement, actual account-to-account commission distribution, bank withdrawals, refund-provider execution or legally permitted post-settlement adjustments. Those need separate integration tests with verified provider test access and safe test data. Simulation output never appears as real earnings and never promises an actual refund or payout.

## Owner inspection

After approved deployment, sign in to an artist/partner account, open Partners and choose **Test referrals with demo payments**.

- Select Professional, one step, verified: your direct example is $5; your team projection is $0.
- Select Professional, two steps, verified: Demo Partner B gets a $5 direct example; your quarterly team projection is $2.
- Select Monthly Premium, two steps: B gets $0.06 direct; your team projection is $0.03.
- Select three steps: your own direct and team values are both $0; the nearer demo partners are the recipients.
- Unpaid/registration, disputed/held and full-refund cases show no eligible earnings.
- December 20 stays in Q4; December 21 rolls into next Q1. Twenty-five daily Premium examples project $0.10 in aggregate team bonus, avoiding per-sale quarterly rounding loss.
- Open saved direct-sale examples to test persistent, separately labelled records and duplicate-reference protection.

## Validation

Local focused policy, visibility and isolation tests: 23 passed. Actual mobile/desktop application checks cover access with review tools and real checkout disabled, product/depth/outcome selections, refund display, saved-record navigation, accessibility and no horizontal overflow. PostgreSQL tests additionally verify authenticated access, method/price-override rejection, holiday-period output and unchanged real commission, transfer and package tables. GitHub results belong to the candidate PR; do not treat unexecuted external gateway or bank tests as passed.
