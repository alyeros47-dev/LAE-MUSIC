# LAE-MUSIC affiliate sales and quarterly team rewards

## Approved business policy
- Joining as an affiliate is free. No affiliate enrollment payment, activation, or artist package purchase is required to be eligible for referral sales.
- A verified, attributed artist package purchase pays **only** its selling affiliate the existing direct rate: Starter 15%, Growth 25%, Professional 25%.
- Each verified purchase also contributes its eligible sale amount to the **immediate recruiter of the selling affiliate**, if any, for the calendar-quarter team performance calculation. No grandparent or deeper upline gets anything from that sale.
- After a calendar quarter closes, the immediate team leader's **10% quarterly performance bonus** is calculated from the qualifying, non-refunded sales made by their personally recruited affiliates. Free signups and recruitment itself do not earn a bonus.
- The team reward is **not** a second instant commission and is not withdrawable merely because it appears in reporting.
- Existing paid affiliate enrollment records are historical; they do not determine eligibility for new free affiliates. The legacy enrollment implementation is retained pending migration review and must not be reactivated.

## Data and reporting
- `affiliate_subscription_commissions`: direct package commission, pending after verified subscription.
- `affiliate_team_sales`: one sale per subscription, attributed to the selling affiliate's direct recruiter, with a calendar-quarter date.
- `affiliate_quarterly_rewards`: reconciled quarterly bonus ledger; pending until separately approved by financial controls.
- `GET /api/affiliate/team-quarterly`: quarterly estimates, reconciliation history and current-quarter direct-team member breakdown.
- `POST /api/admin/affiliate/reconcile-quarter`: authorized, same-origin admin request with JSON `{"quarter_start":"YYYY-MM-01"}` for a *closed* calendar quarter beginning January, April, July or October. Transactional and repeatable while pending. Cannot overwrite approved/paid quarter rewards. This route **does not pay anyone**.

## Deployment prerequisites
1. Run `npm test` and verify all existing studio, playback, listener, registration and affiliate tests pass.
2. Verify actual production payment provider callbacks: this repository currently reports `payments_enabled:false` and does not by itself establish real payment settlement. Never fabricate or manually mark a purchase paid.
3. Test an end-to-end paid transaction with direct attribution, direct recruit's sale, deeper downline sale, self-referral rejection, duplicate payment reference, refunds and quarterly reconciliation on an isolated database.
4. Confirm finance approval, payout/withdrawal controls and reconciliation of later refunds before enabling real withdrawals.
5. Check and retire any old paid-enrollment purchase entry points after auditing the active production routes and legacy records.
6. Keep the separate premium UI/mobile-app candidate PR #6 unmerged. Review this PR separately before production merge.

## Example
A recruits B, B recruits C. When B sells a qualifying package, B gets its direct commission and A gets a 10% quarterly sales-volume allocation. When C sells, C gets direct commission and B gets the quarterly allocation; A gets nothing from C's sale.
