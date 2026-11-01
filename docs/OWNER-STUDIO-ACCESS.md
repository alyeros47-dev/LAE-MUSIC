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
