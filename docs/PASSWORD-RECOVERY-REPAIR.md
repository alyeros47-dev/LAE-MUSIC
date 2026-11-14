# Password recovery repair

The live capability check on 14 November 2026 reports account email delivery
**disabled**. The committed fallback email manifest is also disabled. Having
SMTP credentials alone never enabled delivery under that manifest. No actual
production reset email or inbox receipt has been verified.

## Scoped changes

- Keep Forgot your password visible on the existing sign-in page.
- Recovery asks for email only; it finds artist and listener accounts. Proven
  linked roles receive one recovery link, which updates their shared password.
  Separate, unlinked same-email identities remain separate and receive their
  own role-bound links. No account is silently merged or created by recovery.
- Preserve generic responses, 30-minute expiry, cryptographically random tokens,
  hashed token storage, encrypted outbox, single-use checks, session revocation,
  and transactional password updates.
- Allow the existing SMTP implementation to use explicit Render settings without
  changing the fallback manifest or exposing credentials in the repository.
- Preserve existing passwords and all membership/payment permissions.

## Required live setup

Use the verified email provider's actual details. Do not guess a sender or host.
Configure these in the existing Render service's Environment settings:

| Variable | Required value |
| --- | --- |
| `ACCOUNT_EMAIL_ENABLED` | `true` after sender/transport setup |
| `ACCOUNT_EMAIL_PROVIDER` | `smtp` |
| `ACCOUNT_EMAIL_ORIGIN` | `https://lae-music.com` |
| `SMTP_HOST` | Provider's SMTP hostname |
| `SMTP_PORT` | `465` with TLS or `587` with mandatory STARTTLS |
| `SMTP_FROM` | Verified sender email address |
| `SMTP_USER` | Provider's SMTP username |
| `SMTP_PASSWORD` | Provider's SMTP credential, stored only as a Render secret |
| `ACCOUNT_EMAIL_KEY` | A dedicated random 32-byte key encoded as 64 lowercase hexadecimal characters |

Keep an existing valid `ACCOUNT_EMAIL_KEY`; do not rotate it while queued email
messages still need it. `NODE_ENV` must be `production` (or `staging` on staging).
No provider purchase, new external account, production setting or production
password has been changed by this repair.

## Read-only live account check

The bounded read-only account audit passed in GitHub Actions run
[43617249364](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/43617249364).
It used the existing secured Render management credential only inside the runner,
then queried the existing database in a read-only transaction. It returned only
configuration booleans and aggregate counts. Production writes: **zero**.

- 51 artist profiles and 27 listener profiles remain present.
- No credentials fail the existing password-format checks.
- No stored emails fail the existing email-normalization checks.
- Three linked artist/listener pairs have consistent credentials.
- One successful account sign-in was recorded within the previous 24 hours.
- No account-security limits above the login threshold are currently active.
- No password reset emails were queued, accepted by the transport or left uncertain.
- `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_HOST`, `SMTP_FROM` and `ACCOUNT_EMAIL_KEY`
  are missing. Email activation and its HTTPS origin are also unset.

The owner has clarified that the rejected passwords may have been mixed up.
The request to investigate a separate login failure is withdrawn. The remaining
scope is password recovery only; existing login behavior and passwords are
preserved. The completed read-only audit above is retained as evidence, not as
an ongoing account-access investigation.

## Verification and remaining checks

Focused tests use disposable local PostgreSQL, existing account handlers, the
actual browser forms, original-format scrypt credentials and a controlled mailbox.
The SMTP/TLS suite uses real Nodemailer and an isolated TLS mail server. These
checks establish code behavior, **not external email deliverability**.

After live email configuration is available, request one reset for an explicitly
identified, owner-controlled account. Confirm actual inbox receipt. Let its owner
follow the link and set a private new password, then confirm normal sign-in.
Never put the password, reset link, API key or outbox payload in chat or logs.
Verify expiry/replay with controlled test tokens, not by exposing live tokens.

No separate login-failure diagnosis is required. The remaining live acceptance
check is receiving a real reset email, following its single-use link and signing
in with the newly chosen password. Do not label recovery complete until that
check passes.

Local verification passed: 19 PostgreSQL recovery/security checks, 16 linked-role
checks, 9 email/security units, 5 login units, 4 actual-library SMTP/TLS checks,
browser journeys at 390px and 1440px. No paid provider
calls or production customer-data changes were made.
