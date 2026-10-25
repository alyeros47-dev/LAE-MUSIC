# Named administration and database transport

This candidate adds migration 010 without changing prior migrations, ordinary accounts or financial records. It is not a live deployment. External payment, storage, music and email verification remain release gates.

## Owner setup

1. Configure a dedicated `ADMIN_MFA_KEY`: 32 cryptographically random bytes represented as 64 lowercase hexadecimal characters. Store it in the host secret manager and an access-controlled recovery backup. Do not reuse `ADMIN_KEY`, payment keys or `ACCOUNT_EMAIL_KEY`. Losing this key prevents named administrator authentication; rotating it requires a reviewed re-enrollment procedure, not simply overwriting the variable.
2. Apply migrations through normal application initialization. Shared-key access remains available while `admin_auth_settings.named_enabled` is false. Keep the existing strong `ADMIN_KEY` during this transition.
3. Sign in with the owner key and open **Access & security**. Confirm the key, create a named owner with a separate password of at least 14 characters, and add the displayed setup key to a standard authenticator app. Setup keys are shown privately; there is no external QR-image service.
4. Confirm a six-digit authenticator code. This atomically activates the owner and disables shared-key sign-in and existing shared-key cookies. Save the eight one-use recovery codes in a private password manager/offline backup. They are not emailed or retrievable later.
5. Invite other operators through private, expiring enrollment links. Verify the recipient and role before sharing. Links are shown once, stored only as hashes and expire after 24 hours. They are not sent through the unconfigured email service. Invitees choose their password and confirm an authenticator before gaining access.

Do not switch modes on production before the owner has confirmed key custody and recovery arrangements. There is no HTTP route to restore shared-key mode, bypass MFA, reset another operator's factor or remove the last active owner. Recovery when both the authenticator and backup codes are lost requires a separately reviewed offline owner procedure; it is not implemented as an insecure public reset.

## Permissions and credential controls

Owners manage all existing administration and staff access. Content operators manage catalog visibility, moderation and homepage/editorial content. Finance operators read financial/account reports and review refunds/withdrawals; sensitive writes require authentication within ten minutes. Support operators read account and generation/release reports. Unknown privileged operations are denied for scoped roles. The advanced legacy management studio remains owner-only. Every named role can manage its own password, recovery codes and authenticator.

Named sessions use opaque tokens, hash-only PostgreSQL storage, a four-hour expiry and a Secure/HttpOnly/SameSite=Strict host-only cookie. Passwords use asynchronous scrypt. Authenticator secrets use dedicated AES-256-GCM encryption with operator-specific associated data. RFC 6238 SHA-1 six-digit codes use a 30-second period with a one-step clock window; accepted counters cannot be reused. Recovery codes are hashed and atomically consumed once. Rate limits for login and factor checks are durable across processes. An authenticator replacement keeps the current factor active until confirmation, then revokes old sessions and recovery codes. Password changes revoke other administrator sessions.

Owner changes use revision checks, preserve at least one active owner and revoke affected sessions. Unaccepted invitations issued by the affected operator are revoked. Modern administrative mutations using the shared transaction helper recheck session/version/role inside the transaction before mutation. Audit records carry the actual operator ID. Legacy immediate database writes receive request authorization and audit attribution; these are not claimed to have been rewritten as a transactional subsystem.

Private invitation fragments are removed from the visible URL before application requests. Enrollment pages have no-store/no-referrer policies. Keys, raw tokens, passwords and recovery codes do not enter normal audit details or idempotency result caches. Browser session verification leaves the current review form in place so the operator can retry deliberately.

## PostgreSQL transport

Remote database URLs now default to verified TLS (`rejectUnauthorized: true`). Optional `PG_CA_CERT` supplies the PEM CA chain when needed. URL SSL options cannot override the selected policy, and connection-routing query parameters are rejected. Exact loopback hosts retain plaintext for disposable local tests; a password containing "localhost" or a hostname containing that string cannot turn off TLS.

Render's private PostgreSQL connection can require plaintext on its private network. Configure `DATABASE_SSL_MODE=private` and `DATABASE_PRIVATE_HOST` equal to the exact internal hostname in `DATABASE_URL`; only single-label or `.internal` hostnames qualify. This is an explicit operator choice, not detection based on credentials or substrings. For external connections use `DATABASE_SSL_MODE=verify-full` and reviewed CA trust. Do not use `sslmode=no-verify` or `rejectUnauthorized:false`. `DATABASE_POOL_MAX` accepts 1–50, default 10.

Actual Render external/private connectivity, CA trust, clock synchronization, secret backups and multi-operator operational recovery must be verified in staging. CI uses loopback PostgreSQL, fixture authenticator identities and no real owner enrollment.

## Verification

Local behavioral tests cover RFC vectors, replay rejection, role denial, request-context isolation, authorization rollback and TLS policy. PostgreSQL journeys exercise owner transition, invitation binding, cross-role authorization, code replay/concurrency, session verification, versioned access changes, password/factor rotation, audit secrecy and restart persistence. Browser fixtures exercise owner/staff screens, URL scrubbing, role navigation, recovery-code display and retaining form input during verification at three viewport sizes. See the release evidence for executed results; adding a test is not proof it has passed.
