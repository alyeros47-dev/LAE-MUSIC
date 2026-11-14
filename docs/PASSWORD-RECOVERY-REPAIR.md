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

The current Render connector can inspect the service and logs but cannot read
its environment variables or the external Neon database. The execution workspace
has no Render API key, database credential, SMTP credential or inbox connection.
GitHub also refuses repository-secret listing for the current integration. This
limits verification of existing production identities and provider configuration;
it is not evidence that those credentials or identities do not exist.

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

The cause of the reported rejection of all existing production logins remains
unconfirmed. The current login endpoint returns the expected generic unauthorized
response for an unregistered diagnostic address. Original stored-password format
is compatible in the isolated regression checks. A specific affected account or
read-only production database access is still needed to establish the live cause.
Do not label account recovery complete until the real inbox and sign-in test passes.
