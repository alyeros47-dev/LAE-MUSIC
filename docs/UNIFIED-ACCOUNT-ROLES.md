# One LAE-MUSIC email and password

A customer can use one email and password for listener, artist and partner access. Artist and partner already use the same creator profile; this change explicitly connects that profile with the customer's listener profile.

## Customer journey

1. Sign in with the existing email and password.
2. Open **My account → Listener, artist & partner access**.
3. Choose **Add artist & partner access** or **Add listener access**. The account email is retained; no new email or password is requested. Adding artist access asks for country and an optional display-name adjustment.
4. Confirm the current password and the choice to use it across roles. If a separate existing profile with the same email has a different password, prove that password once before connecting it.
5. Both roles are signed in. The connected page offers the listener library, artist workspace and partner dashboard. Later sign-in through any of the three choices recognizes the connected roles.

Visiting a missing role while already signed in opens this path instead of sending the customer through another registration. Choosing a missing role during registration with an existing account's correct password also connects the profiles; an incorrect password cannot claim the existing email.

The current account password becomes the shared password. Connecting existing profiles requires proof of both where their passwords differ. Connections are never inferred just from email addresses. The service does not connect profiles with different emails, silently claim another role, or include administrator access.

## Data and business rules

Migration `025-linked-account-roles.sql` adds an initially empty one-to-one role-link table. It does not automatically link, remove, renumber or transfer existing accounts, songs, playlists, voice profiles, purchases, subscriptions, balances, commissions or upload objects. It does not change historical migration checksums.

Existing creator/listener IDs remain the owners of their respective records. Linking is transactional and audited. Existing profiles keep their names, country, selected package, referrer and financial history. A new artist profile preserves a valid incoming referrer and requested package; its membership remains pending payment. Purchase-link handoffs retain the selected package/referrer; Premium listener invitations retain their return destination. Existing referrers are not overwritten on retry.

Adding a role is free. It does not buy Premium or an artist package, grant paid access, reset an existing artist's credits, create commissions or send money. Existing free-testing rules still apply to genuinely new artist workspaces.

## Authentication and recovery

- A successful linked sign-in issues paired existing-format HttpOnly/Secure/SameSite cookies and sessions, without exposing tokens in JSON.
- Connecting roles invalidates prior sessions and outstanding recovery tokens before issuing the new paired session.
- Password changes and password recovery update both credentials in one transaction and invalidate the relevant sessions/tokens across both roles. Artist password changes retain the current paired session; listener password changes require sign-in again, preserving the existing listener security policy.
- Logout and session revocation invalidate paired sessions. Unlinked legacy identities remain independent until explicitly connected.
- Shared email locks and consistent profile lock order serialize sign-in, linking, password changes and recovery. Failed transactions leave credentials, links and sessions unchanged.
- Already configured social identities respect explicit role links when issuing sessions. Unconfigured providers remain hidden. This change does not activate Google, Facebook, TikTok or email delivery; those still need their existing provider configuration.

## Verification

Focused tests cover access from either role; one email/password across all three sign-in choices; wrong passwords and origin rejection; legacy-profile ownership checks; preservation of songs, playlists, IDs and credits; racing connections; shared-password changes, rollback, recovery and revocation; referral/package attribution without paid entitlements; and linked social-provider session issuance.

The real studio frontend is checked at phone and laptop widths using intercepted APIs, including role access from both My account and registration, eye controls, error recovery, dashboard links and automated accessibility checks. Tests use disposable local PostgreSQL schemas and mocked providers. No production data, R2 writes, paid API calls, checkout or withdrawal operations are used.

Production deployment requires owner approval and the standard exact-candidate checks. Existing customers' old same-email profiles are not bulk-linked during deployment; each customer proves ownership through the account page.
