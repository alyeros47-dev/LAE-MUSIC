# Artist referrals open packages first

Artist product links such as `/start?ref=9&product=growth` previously opened the registration form because the frontend treated `/start` as a `/join` alias. The current checkout implementation also requires an existing creator account. It does not implement the owner's requested payment-before-artist-registration journey.

This correction makes `/start`, `/get-started`, old product registration links and anonymous artist-registration entry points open the public Starter/Growth/Professional package comparison. A selected product is highlighted. Changing packages retains a valid referring partner ID. Prices and allowances come from the existing public server catalogue; local estimates use the existing currency display. Invalid referral and product values are disclosed. Old `legacy=1` product links receive the same integrated frontend.

Comparing or choosing a package never creates an account, order, payment, commission or entitlement. The page shows the intended order: package, verified payment, artist account and studio. It has no registration form, fake payment success, or inactive Pay button. The current checkout-unavailable message is explicit. General free listener and partner registration, explicit existing-account sign-in and authenticated role linking remain available. Dedicated isolated review enrollment is preserved; it does not enable a production trial.

## Remaining payment work

The payment-before-account journey is **not operational yet**. Both current provider coordinators bind orders and checkout attempts to an existing account. Merchant configuration remains disabled and unverified. This UI correction does not enable money collection or redirect a guest into the existing account-required checkout.

A complete guest purchase flow still requires durable, provider-verified purchase ownership before artist setup: server-priced order/reference/FX binding; authenticated provider verification; a secure, expiring ownership/receipt handoff; one-time account attachment or existing-account claim; transactional entitlement and referral fulfillment; duplicate/refund/dispute protection; and abandonment/recovery handling. A browser `paid=true`, selected plan, callback query or payment reference alone must never authorize registration fulfillment, studio access or commissions. Existing account checkouts and financial ledgers must be preserved when that extension is built.

No payment-before-account capability is advertised as active. Production settings, database schemas, API keys, billing, percentages and paid artist access checks are unchanged. Paid provider testing and financial activation remain outside this correction.

## Focused verification

Tests exercise public route selection, old link compatibility, safe referral/product parsing, retained attribution across package changes, absence of account/payment writes, disabled checkout, actual phone/laptop layouts and accessibility, free listener/partner enrollment, explicit sign-in and linked-role navigation. No paid services are needed.


The link-based internal demo now extends this page with a separate simulated purchase/profile/referral experience. See [LINK-BASED-REFERRAL-DEMO.md](LINK-BASED-REFERRAL-DEMO.md). It does not enable the real guest-payment or account-claim journey described above.
