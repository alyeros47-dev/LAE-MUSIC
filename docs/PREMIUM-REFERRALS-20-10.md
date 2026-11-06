# Premium referrals: approved 20% direct and 10% quarterly team rewards

The owner approved the Premium split and confirmed that the Three-Month Premium price stays $1.80. This update applies prospectively to newly verified Premium purchases and renewals. Artist-package and extra-generation commission allocations remain held. Historical paid contracts and existing accounts, files, payments and earnings are preserved.

## Customer experience

The referral page shows four short totals, a clearly labelled Three-Month Premium sharing card, and Copy Premium link. Artist cards use their customer-facing names. Copying includes a real browser fallback. The Premium link retains the referrer and preselects the quarterly package. It leads into existing payment-before-registration checkout for new customers and existing-account checkout for registered customers.

Current earnings and team purchases appear first. Full statements and earlier records, including historical 5% Premium contracts, remain accessible in a closed section. Earnings & withdrawals remains linked. No Studio interface, song generation, paid package price, artist allowance or royalty percentage was changed.

## Earnings rules

- Free, voluntary participation still requires a verified qualifying artist or three-month-or-longer Premium purchase. Affiliate eligibility survives subscription expiry; Premium listening does not.
- A qualified, opted-in direct referrer earns 20% once a qualifying Premium payment is verified and the purchase activates. Renewals of any existing Premium duration preserve the original referrer.
- The qualified referrer exactly two steps above the purchaser builds a 10% quarterly team obligation. There is no extra team reward for the direct referrer on that same purchase, no third level and no registration-only reward.
- Verified linked-role purchases establish the original relationship. The second-step relationship is retained across renewals rather than being reassigned from a new link.
- Guest checkout preserves the bank-approval time for earning eligibility and the bonus quarter, independently of when account setup finishes. Approved guest deposits predating this policy retain their previous held policy; they are not silently repriced or backfilled.
- Existing refund, dispute, ownership, mode separation and idempotency protections remain. Reversed purchases do not contribute eligible volume. Unresolved reviews block quarter finalization.

For the owner's example: John's $1.80 purchase records $0.36 for his qualified referrer. Five $1.80 purchases referred by John record $1.80 in total direct earnings for John and accumulate $0.90 for the person who referred John. John receives no additional 10% on those same direct purchases.

## Quarter close and bank payments

Existing calendar-quarter windows are retained. December 20 is the cutoff; December 21–31 belongs to the following January–March period. A server worker checks on startup and hourly in production, closes completed eligible periods once, and leaves unresolved receipts for review. Multiple workers and retries use the existing advisory locks and immutable statement/allocation keys.

This automatically records the quarterly award. It does not pretend to send money to a bank or bypass existing settled-funds safeguards. Actual bank payout/withdrawal integration remains a separate existing limitation. The customer page distinguishes earnings being built from bank payments. No payout service or fabricated settlement verifier was introduced.

## Revenue accounting and migration

The 30% affiliate/team budget and equal split of the remaining 70% remain: a fee-free $1.80 purchase leaves $0.54 for referrals/team, $0.63 for the streaming royalty pool and $0.63 for LAE-MUSIC. Unassigned referral portions stay in their budget instead of becoming arbitrary earnings. Existing cost/tax checks, cumulative monthly recognition and smallest-unit rounding safeguards continue. Direct earnings and quarterly reserves are counted once when recognizing revenue. Historical held-policy and earlier awarded-policy ledgers retain their original calculations.

Migration 033 adds the new immutable Premium policy revision and narrowly extends the receipt overlay and team-reserve guards. It does not update old orders, receipts, memberships or earnings. The old hold remains enforced for artist commissions and for receipts belonging to the earlier held Premium policy. New Premium inserts must match the immutable direct beneficiary/20% amount and the exact second-step team beneficiary.

## Focused verification

Passed without real payments, customer credit use, paid providers or production writes:

- 21 focused policy, accounting, statement and framework unit checks; migration-history checks.
- 11 new PostgreSQL checks covering paid qualification, opt-in/opt-out, guest referral/approval date, the John/five-person example, once-only approval, renewals, no third level, expiry separation, 30/35/35 recognition, simulated refund/dispute records, early-close rejection, automatic quarter close/replay and wrong-beneficiary inserts.
- 11 existing historical purchase-year contract checks, 10 preserved held-framework checks, 9 guest-bank checks and 11 manual-bank checks.
- Both held-policy and new approved-policy royalty ledgers recognize and finalize balances correctly across subscription months, including low-cent annual rounding. Existing records remain immutable.
- Actual PostgreSQL upgrade/replay preserving original bank submissions and reviews through migrations 032/033.
- Real Chromium at 390px and 1440px: Premium link enabled with correct price/referrer/plan, native clipboard and blocked-clipboard fallback, simplified page, closed historical section, no overflow and zero targeted accessibility violations. Existing voluntary enrollment browser journeys also pass.
- Syntax/whitespace checks and comparison verifying the Studio implementation and approved price catalogue are unchanged.

No complete Music DNA audit or unrelated platform test suite was repeated. New checks are included in the existing focused affiliate test commands.

Status: implemented and locally verified for review. Not merged or deployed. Before production deployment, run required hosted checks and the normal guarded release/migration process. Bank payout integration is not declared complete by this update.
