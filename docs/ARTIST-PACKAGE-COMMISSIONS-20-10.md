# Artist-package referral commissions

Approval: 20% direct and 10% quarterly team commission for Starter, Growth and Premium artist memberships. Internal Premium plan ID remains `professional`.

| Annual package | Price | Direct (20%) | Team (10%) |
| --- | --- | --- | --- |
| Starter | $6 | $1.20 | $0.60 |
| Growth | $10 | $2.00 | $1.00 |
| Premium | $20 | $4.00 | $2.00 |

The direct referrer earns after a verified qualifying payment. Team commission belongs only to the eligible referrer exactly two steps above the buyer, calculated quarterly using the existing calendar and December 20 cutoff. It is not an immediate second-level commission or automatic bank payout. Existing qualification, voluntary participation, refund and funding controls remain in force.

Verified renewals retain original attribution, including funded royalty-balance renewals. Earlier paid receipts and earned commissions are preserved; this change does not backfill previously held purchases. An unpaid older quote keeps its original snapshot, while a newly verified artist purchase receives the approved receipt policy.

Premium Listening retains its existing rules. Additional-generation commissions remain held. Prices, annual allowances, royalties, Studio, payment verification and account access are unchanged.

Migration: `037-approved-artist-package-referrals.sql`. Product-specific receipt policy: `artist-packages-direct20-team10-2026-11-15`.

Verification uses disposable PostgreSQL, synthetic payment receipts and a local browser. No production financial records, paid music calls or customer credits are used. The focused CI workflow covers all three products, exact-once fulfillment, original referral attribution, quarterly statements, old records and the existing Premium policy.

Deployment requires owner approval. These changes have not been merged or deployed.
