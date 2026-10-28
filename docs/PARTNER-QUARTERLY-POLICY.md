# Direct commissions and quarterly team bonuses

Owner-confirmed on 2026-10-28, corrected the same day to distinguish Premium 5% from artist services 10%. The earlier uniform-10% draft was never deployed. This supersedes immediate second-level commission
for newly prepared Premium Listener orders. It does not rewrite historical
orders, receipts or commissions.

## Approved business rules

- Registration is free; no reward is earned by registration or recruitment.
- Existing direct rates remain: Starter 15%; Growth 25%; Professional 25%;
  Premium Listener 10%. Additional studio generation has no approved direct
  commission, so its existing 0% direct rate remains unchanged.
- A leader's separate quarterly bonus is **10% for eligible artist packages and studio services**, and **5% for Premium Listener subscriptions**, on eligible verified USD product volume
  exactly two referral steps below them. Purchases directly referred by that
  leader are not counted again for their team bonus. No deeper levels qualify.
- Artist packages, eligible new Premium Listener contracts and additional studio
  services contribute verified two-step volume. Gifts, paid MP3 sales, signup
  events, practice records and self-referrals do not create qualifying volume.
- Artist and studio orders freeze their referral line when the order is prepared.
  An explicit eligible artist-product referral takes precedence; otherwise the
  registered referrer is retained, including renewals without another link click.
  Premium orders retain their original prepared product-referral snapshot.
- Each sale is attributed to its frozen referral line once; replays cannot add
  volume again. The direct recipient earns their product-specific commission;
  the second-step leader receives a quarterly obligation, not an immediate
  second-level commission.

Example: You refer Emmanuel and Lydia. Their own purchases earn you the
applicable direct commission. Prince buys through Emmanuel and Philip buys
through Lydia: Emmanuel/Lydia receive the applicable direct commissions. Your
eligible team volume includes Prince/Philip's verified purchases. $1,000 of
eligible net-of-refund artist-service volume yields a $100 quarterly calculation;
$1,000 of eligible Premium Listener volume yields $50. Mixed quarters calculate
these groups separately, so $1,000 in each group yields $150. Premium volume is never calculated at the artist-service rate.
Emmanuel/Lydia do not receive that same second-step bonus from those sales.

## Periods and Christmas rollover

Accounting uses UTC and half-open timestamp windows, so a sale is counted once:

| Bonus period | Included verified purchases |
| --- | --- |
| January–March | Previous December 21 through March 31 |
| April–June | April 1 through June 30 |
| July–September | July 1 through September 30 |
| October–Christmas cutoff | October 1 through December 20 |

December 20 is inclusive. December 21–31 belongs to the next January–March
bonus period. Original transaction dates, financial-year evidence, conversion
records and monthly streaming recognition remain unchanged. This is bonus-period
attribution, not backdating a December payment to January.

Calculations close at the end of each included final day. The Christmas window
therefore closes at December 21 00:00 UTC, the end of December 20. Actual payout
requires reconciled, settled funds and a verified payout provider; the software
must not promise a bank arrival before the period has closed or before verified
cash is available. No real payouts are activated by this change.

## Refunds, statements and royalties

- A request, provider notice or partial/uncertain refund places affected volume
  on hold. It is not treated as a completed monetary refund.
- Independently verified full refunds remove the original USD sale from eligible
  volume once. Original charges, currencies, quotes, rates and timestamps remain.
- Quarterly snapshots use the complete eligible source set, not a 100-row UI
  page. Reviewed, closed periods can be finalized once into immutable statements
  and *unsettled* accounting liabilities. No available balance or bank payout is
  created by finalizing a calculation.
- Concurrent finalizations use the same period lock and unique statement key.
  Financial operators review a snapshot hash; stale source/refund evidence blocks
  finalization. Buyer locks serialize the calculation with refund and dispute
  writers. Old statements and allocations cannot be overwritten or deleted.
- Later verified refunds affecting a finalized quarter create a review hold.
  They do not automatically debit legitimate cleared earnings or make the
  platform responsible for every loss. Cash release remains unavailable pending
  independent funding/payout and late-adjustment verification.
- New Premium team obligations reserve minor units conservatively so the 50%
  streaming artist pool is not overstated. At quarterly finalization, exact
  aggregate 5% Premium bonus is apportioned deterministically within its own rate group and any unused rounding reserve
  is returned. A Premium source with unresolved fractional-cent team allocation
  blocks affected royalty finalization rather than silently miscalculating it.
  This can delay an affected monthly statement until its quarterly allocation is
  reconciled; the existing seven-day month-end rule remains the earliest release
  boundary, subject to successful verification. No finalized royalty is rewritten.
- The artist streaming royalty remains 50%; the withdrawal service fee remains
  3%. Existing seven-day complaints, provider/legal exceptions and monthly royalty
  reconciliation rules remain in force.

## Migration and release

`022-quarterly-partner-policy.sql` is additive. It preserves legacy Premium
10%/5% order snapshots, records a new program cutover and adds immutable verified
team records, quarterly statements, allocations and review holds. Pre-cutover
team sales are not retroactively awarded by the new program. Existing direct
commissions remain visible. Test/live/historical records are isolated; local
charges are never summed with USD or converted twice.

The new report is at `/api/platform/partners/accounting`; financial staff can
preview/finalize calculations through `/admin/console?section=affiliates`.
The existing quarterly API uses the same refund-aware source. New live payment
checkout, cash release and bank payouts remain disabled. Configure and verify
Paystack/Flutterwave test access, settled-funds retrieval, payout handling and
reviewed late-adjustment execution before live financial activation. No new API
keys, database replacement, storage changes or production deployment are included.
