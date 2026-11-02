# Owner studio inspection

Open `/studio?owner=1` to sign in directly with the existing administrator
credentials. Successful owner authentication opens the real description-led
studio at `/studio`. The existing shared-key or named-operator/MFA flow is used;
there is no new key, demo purchase, financial transaction or artist enrollment.

Signed-out customers and artists whose packages are inactive can find this owner
entry on the studio access screen. It does not grant owner rights: invalid
credentials fail, other administrator roles cannot use owner-funded generation,
and ordinary artist accounts retain the verified-package requirement.

This entry opens the real lyrics and musical-style generation already verified
on the live service. The existing paid artist audio, voice and publishing
entitlements remain separate. No public free-generation or demo-to-real-payment
bypass is introduced. Existing accounts, passwords, sessions, subscriptions,
provider configurations and customer records are not changed.

Focused verification: phone/desktop browser journeys for shared-key and named
owner sign-in, invalid credentials, an existing unpaid artist session, the
anonymous entry, successful studio handoff and refresh. All API/provider calls
in automated browser tests are fixtures. Production verification signs in
through this same visible form and checks the real session without generating
new lyrics or audio or spending customer credits.

## Temporary artist inspection period

The owner has subsequently authorized all existing and newly registered artist
accounts to inspect the real studio. `LAE_ARTIST_STUDIO_TESTING=1` opens the normal
artist dashboard, songwriting, voice and audio tools without any demo purchase.
Every artist receives two additional lyrics credits once for campaign
`artist-studio-inspection-20261102`, and two complimentary audio-generation
requests counted from the fixed 2026-11-02 campaign boundary. Existing balances,
old usage and paid subscriptions are retained. Reservations, confirmed failure
restoration, idempotency, generated-song ownership and publishing codes still
apply. Audio count remains limited; provider output is not guaranteed.

The new switch is explicit: historical retired trial flags cannot reopen access.
Set this one switch to `0` when the real purchase gateway is ready; verified paid
artist-package checks resume. No demo payment becomes a sale or a subscription.
During this period, public demo buttons are hidden, old demo page links lead to
real artist sign-in/studio, and referral-demo API writes are closed. Historical
accounting records and real referral/commission logic are preserved.

Additional verification uses disposable PostgreSQL for existing/new account
sign-in, persisted access, once-only credit grants, real lyrics-adapter billing
with a mock provider, audio reservation limits and concurrent reservations.
Production checks use controlled QA accounts to verify the normal sign-in and
real studio screens without submitting paid text or audio requests.
