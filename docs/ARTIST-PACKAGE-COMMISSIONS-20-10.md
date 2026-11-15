# Artist direct commissions and creator milestones

Final approval: artist packages retain 20% direct commission. New artist indirect percentage rewards are replaced by creator milestones. Internal Premium artist plan ID remains `professional`.

| Annual artist package | Price | Direct commission |
| --- | --- | --- |
| Starter | $6 | $1.20 |
| Growth | $10 | $2.00 |
| Premium | $20 | $4.00 |

Only verified artist-package purchases under the new receipt policy qualify a creator, exactly once, for the eligible affiliate two referral steps above. Package changes and renewals do not add a person again. Explicitly linked listener and artist roles share the creator identity. Listener-only purchases never enter creator milestone progress.

| Milestone | Additional creators | Cumulative creators | Reward |
| --- | --- | --- | --- |
| 1 | 1,000 | 1,000 | $900 |
| 2 | 10,000 | 11,000 | $9,000 |
| 3 | 100,000 | 111,000 | $90,000 |

Consumed creator qualification records belong to one award only. Unique creator, stage and ledger references plus a transaction lock prevent duplicate counts and awards. Database guards verify purchase evidence, exact ancestry, reward amount, prior stages and distinct members. Refunded or disputed purchases cannot complete an award; a later dispute marks an existing award for review without rewriting earned history.

Rewards are recorded as pending obligations in separate live/test ledger accounts. They are not bank payments or automatically withdrawable funds. Existing verified-funding and payout controls remain in force. No automatic payout route is introduced.

Premium Listening remains 20% direct and 10% quarterly indirect with its current eligibility, calendar and December cutoff. Earlier artist team earnings, paid receipts, account balances, prices and allowances are preserved. Additional-generation commissions remain held.

Migrations 037 and 038 are additive. The active artist receipt policy is `artist-direct20-creator-milestones-2026-11-15`. Historical receipts are not backfilled or rewritten. Existing unpaid quote retries keep their original snapshots; a newly verified artist purchase receives the current policy.

Verification uses disposable PostgreSQL and provider fixtures. Scale tests exercise all 111,000 distinct creator qualifications, all three rewards, a mixed 6,000-listener/4,000-creator network, account-role deduplication, refunds and concurrent award attempts. Browser checks cover all artist packages and the existing partner dashboard. No paid music generation, real test payment or customer-credit consumption is required.
