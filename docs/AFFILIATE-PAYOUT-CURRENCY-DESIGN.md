# Affiliate payouts: transaction-time currency design

Status: proposed for owner review, 17 November 2026. **Not approved for production.**

The owner approved a $4 minimum and retained the existing 3% withdrawal charge. The owner did **not** approve converting USD commissions at the exchange rate on withdrawal day, and requires approval of the final design before financial deployment. No payout schedule has been approved.

## Recommended rule for future purchase commissions

At the existing server-verified payment event, keep the actual payment currency and charge amount, the original USD product price, the immutable checkout conversion evidence and the existing referral/policy snapshot.

Create a commission obligation in the actual received currency. For Monnify today that is NGN. Apply the existing 20% direct and Premium-only 10% quarterly team rates to the verified gross purchase amount in that currency, before gateway fees. Do not change gateway-fee allocation. Use integer minor units and the existing rounding approach. A commission is not paid or withdrawable merely because this record exists.

Illustration, not a current exchange quote:

- Three-Month Premium has a USD base price of $1.80.
- A checkout confirms an NGN charge of ₦2,700 using its original purchase conversion.
- Direct commission: ₦540. The second-level Premium team amount: ₦270, subject to the existing quarter and rounding rules.
- Those Naira amounts remain fixed even if exchange rates change later. No second USD cash entitlement is created.
- At a later withdrawal, apply the existing 3% withdrawal charge to the selected gross Naira amount. ₦6,000 gross gives a ₦180 charge and ₦5,820 to the recipient. No additional customer fee is introduced.

This avoids a new USD-to-NGN conversion obligation for these future NGN commissions. It cannot guarantee that their value in USD or another foreign currency stays constant, or eliminate ordinary provider costs.

The USD commission amount remains a clearly labelled reference for the original product and policy, not an additional spendable USD wallet balance. Never credit both currencies as separate earnings.

## Rate and network rules remain unchanged

- Premium listening: 20% direct; 10% to the eligible affiliate exactly two levels above, accumulated by the existing quarterly calendar.
- Artist packages: 20% direct; no new percentage-based indirect artist commission.
- Creator milestones: 1,000 distinct qualifying second-level paying creators → $900; next 10,000 additional creators → $9,000; next 100,000 additional creators → $90,000.
- Only verified purchases qualify. Referral identity and policy snapshots stay immutable. Renewals do not count a creator again.
- December 21–31 still rolls into the following January–March team period. No monthly or immediate team-payment rule is introduced.
- Additional-generation commissions remain unapproved.

The quarterly calculator must group each source currency and policy version separately. Keep original per-sale currency evidence; reconcile the final quarter's cent rounding in that same currency. Do not combine NGN, USD and any future currency into one payout total.

## Existing USD balances: no automatic migration

1. Preserve all existing ledger rows, balances, policy versions and previously earned obligations.
2. Produce a read-only reconciliation proposal per original commission. Link it to its verified receipt, original charge currency, saved checkout rate and any refund or dispute.
3. Use the **recorded historical commission**, including its historical rate and original rounding. Do not recalculate an older 15% or 25% contract as today's 20%.
4. Where reliable original conversion evidence exists, show a proposed original-rate NGN amount and any rounding difference for review. This proposal does not silently replace a USD obligation.
5. Only after explicit approval of the migration and any required customer agreement: append a linked conversion/reclassification journal. Debit the exact approved USD obligation and credit the fixed NGN obligation once. Keep both entries and the evidence permanently. A unique source-conversion key prevents both old and new amounts being withdrawn.
6. If evidence is missing, conflicting, refunded, disputed or already consumed, leave the USD record unchanged and mark it for review. Do not invent an exchange rate, erase the balance, or automatically apply today's rate.
7. Reversals must follow the same original currency and conversion journal. A refund must not create a new exchange gain/loss calculation or a second refund of the same commission.

Historical USD liabilities retain their USD identity until that process is approved. This proposal does not claim that a new accounting label alone settles them.

## The $4 minimum needs a currency interpretation

The approved amount is $4, but the new payable balance would be NGN. Two rules are possible; neither should be silently selected:

- **Recommended for review:** assess the $4 threshold using each commission's original-purchase USD reference, while paying only its fixed NGN amount. Consumed references follow the original commission lots through partial withdrawals. Explain clearly that this is an original-rate threshold, not a promise that the payout is worth $4 at today's market rate.
- Alternatively, approve a fixed NGN minimum for the NGN wallet. The owner must supply that amount.

The current live code still has only a technical minimum of one minor unit ($0.01 or ₦0.01). The development draft records the owner's $4 decision, but it is not activated. No new minimum has been applied to existing live requests.

## Fixed-dollar creator rewards

The $900 / $9,000 / $90,000 milestones are fixed-dollar rewards, not percentages of one payment. They cannot inherit one purchase's exchange rate automatically because each award contains many creators and payment dates.

Preserve the promised USD reward and keep it pending until a separately approved, verified funding and currency-lock rule exists. One possible future rule would fix a recipient-currency amount when the award is earned, but the owner must approve that rule and funding source before implementation. Do not reduce a milestone or silently convert it using an arbitrary rate.

## Nigerian and international affiliates

- Commission currency follows the verified payment, not the affiliate's nationality. A Monnify NGN purchase creates an NGN commission under the proposed rule.
- A recipient using a supported Nigerian bank account can use the future NGN disbursement route after name verification and the required funding/review checks.
- Monnify's current integration does not provide USD or foreign-bank disbursement. International affiliates without an eligible Nigerian account must retain separate balances until an appropriate international payout route and its terms are approved.
- If another gateway later genuinely receives USD or another currency, retain that original currency in a separate wallet. Do not assume it can be sent through Monnify's NGN transfer API.
- Do not promise international bank withdrawals or stable foreign-currency value before the route exists.

## When a balance becomes withdrawable

Required checks, not an invented waiting period:

1. Purchase and attribution were independently verified, and the recipient qualified when the commission was earned.
2. The correct amount/currency/policy was recorded once.
3. The relevant cash settlement and funding allocation are independently verified. A successful charge, dashboard balance, webhook claim or wallet total alone does not establish that an individual commission is settled and unencumbered.
4. Refund, dispute, reversal and recovery holds are resolved. An already-paid commission affected later must create a documented recovery/review record, never a negative unreviewed available balance.
5. Premium team earnings have a closed, finalized quarter. Milestones have verified qualification and their separately approved funding rule.
6. The approved minimum and payment schedule are satisfied.

Keep pending, reviewed, funded-available, reserved-for-withdrawal and confirmed-paid states separate. Initial implementation should retain the existing administrator review of **withdrawals**, not add approval to customer subscription purchases. Customer access after verified payment remains automatic.

The existing withdrawal charge is 3%. A fee allocation, minimum rule or schedule must not be changed indirectly through the payout implementation.

## Transfer lifecycle after the currency design is approved

- Verify the recipient account with Monnify's v2 name enquiry. Have the customer confirm the returned name; encrypt private account details and scope them to that owner.
- In one database transaction, lock the affiliate wallet, allocate only funded original-currency earning lots, create one withdrawal/reference and reserve the exact amount. Retries use the same request key. Concurrent requests cannot consume the same funds.
- After financial review, persist submission intent before calling Monnify. A timeout leaves the request uncertain and reserved; re-query the same reference rather than initiating another transfer.
- Pending and OTP-required are not success. An administrator handles the merchant OTP through the protected financial workflow; never expose it in logs or ask an affiliate to supply the merchant OTP.
- Authenticate webhook bytes, identify the owned payout and independently retrieve status. Verify reference, merchant context, recipient, amount and currency before recording a bank payment.
- Confirmed success consumes reserved funds once. Confirmed failure releases them once. A confirmed later reversal records a reversing journal once. Contradictory provider evidence requires review, not another transfer.
- A disabled send switch must still permit read-only confirmation of already-submitted transfers and handling of their legitimate reversals.

These steps describe the required service/database integration. The adapter alone does not implement or prove the complete withdrawal lifecycle.

## Merchant checks actually performed

Read-only GitHub workflow runs [44144558381](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/44144558381) and [44145470654](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/44145470654):

- Existing live credentials authenticate successfully.
- Authenticated transfer-history retrieval succeeds.
- An existing payment's settlement-detail endpoint is readable. Its response has transaction and beneficiary settlement fields. No customer information, secret or account number was printed.
- Application payout source wallet is **not configured** under the inspected payout wallet variables.
- Dedicated sandbox credentials/wallet are **not configured**.
- No merchant setting was changed, no production record was updated, and no transfer, refund or authorization request was sent.
- Transfer-history access does **not** prove merchant disbursement approval, live IP authorization, wallet funding or ability to send.

The account's Monnify dashboard must confirm approval of third-party disbursements. The payout wallet, approved server IPs and merchant OTP/authorization process must be verified. Store wallet and sandbox values in Render; never paste keys in chat. Proposed names: `MONNIFY_DISBURSEMENT_SOURCE_ACCOUNT`, and `MONNIFY_SANDBOX_API_KEY`, `MONNIFY_SANDBOX_SECRET_KEY`, `MONNIFY_SANDBOX_CONTRACT_CODE`, `MONNIFY_SANDBOX_DISBURSEMENT_SOURCE_ACCOUNT`.

## What exists in development

- A separate, default-disabled Monnify disbursement adapter supports bank listing/name enquiry, wallet balance, transfer initiation, OTP authorization, status retrieval and signed payout-event identification. It does not alter the collection adapter.
- **19 mocked adapter tests passed**; **9 existing Monnify collection tests passed**. These are not real sandbox payout proof.
- The initial USD/current-rate schema and funding drafts were removed from the executable migrations/source paths and preserved outside the repository. They will not be applied during startup or deployment. The replacement original-currency ledger design must be approved and tested first.
- No payout endpoint, funded-balance release or live-send switch has been activated. No financial deployment occurred.

## Decisions still needed

1. Approve the future transaction-currency obligation design and its integer rounding behavior.
2. Approve how the $4 minimum is interpreted for fixed NGN balances, or supply a fixed NGN minimum.
3. Confirm payout schedule. Keep administrator review unless an automatic schedule is separately approved.
4. Approve the historical USD migration process before any conversion, and a funding/currency rule for fixed-dollar creator milestones.
5. Confirm Monnify disbursement activation and provide the missing wallet/sandbox configuration securely.

**Real affiliate payouts are not ready.** No migration, transfer or deployment should be represented as approved while these decisions and real sandbox verification remain outstanding.

## Official provider references

- [Monnify single transfers](https://developers.monnify.com/docs/disbursements/single-transfers): separate activation, static IP authorization, OTP behavior, recipient-name verification, pending/success/failed/reversed states. Transfers are intended to be real-time, but pending authorization and banking-network delays require status checks; there is no universal guaranteed arrival time.
- [Going live](https://developers.monnify.com/docs/live): the separate disbursement, settlement and webhook setup.
- [Official Monnify SDK disbursement service](https://github.com/Monnify/monnify-laravel/blob/main/src/Services/DisbursementService.php): current API routes.
- [Official Monnify SDK verification service](https://github.com/Monnify/monnify-laravel/blob/main/src/Services/VerificationService.php): v2 bank-account validation.
