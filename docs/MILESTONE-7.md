# Milestone 7 — Account security and recovery

Website release candidate 0.8.0-rc.7 continues the existing architecture and development branch. No production deployment or merge is performed. Existing user data, passwords, subscriptions and active sessions are preserved by migration 008.

## Account access

Listener and artist/partner identities remain separate, including when they use the same email address. The new account-security page lists only the selected account's active sessions, labels the current session, and requires the current password to revoke a device, other sessions or all sessions. Raw session credentials and token hashes are never returned. Older sessions have an honest unknown start date. Coarse device labels omit full user-agent strings and IP addresses.

Password changes use asynchronous scrypt, account-row locking, current-session revalidation, atomic credential updates, session revocation and outstanding-link invalidation. Artist changes retain the current session; listener changes require signing in again, preserving existing behavior. Login verifies that credentials have not changed between password verification and session creation. Existing route URLs remain compatible. Security requests have database-backed limits and expired temporary records have bounded cleanup.

## Verification and recovery

Public reset requests return the same message for known and unknown accounts. Delivery is queued separately from the HTTP response. A 256-bit random link token is stored only as a SHA-256 hash; its email envelope is authenticated and encrypted with a dedicated AES-256-GCM key. Links bind the account role, purpose and credential/email snapshot, expire after 30 minutes, and work once. A new request supersedes the previous link for that purpose. GET requests and email scanners do not consume links. Confirmation requires POST; successful password reset atomically revokes the selected identity's sessions and does not automatically sign the user in.

Links use a configured HTTPS origin rather than request headers. The token travels in a URL fragment, is removed from the address bar on page load and remains only in page memory until confirmation. Recovery pages use `no-referrer` and `no-store`. A refresh after the fragment is removed requires opening the email link again. Verification is optional and does not block public streaming or silently change existing paid entitlements.

The encrypted outbox claims work with `FOR UPDATE SKIP LOCKED`. Competing workers do not send a queued job twice. Interrupted or ambiguous SMTP acceptance becomes `uncertain` and is not blindly retried. A new user request can issue a new link within the rate limit. Administrator reports show delivery health and account audit actions without addresses, credentials, ciphertext or reset links.

## Email integration boundary

The committed `config/account-email.json` disables delivery and leaves the provider, origin, sender and host unset. A prepared SMTP transport uses reviewed fixed configuration, port 465/TLS or 587/mandatory STARTTLS, verified TLS certificates, bounded timeouts, disabled file/URL content access and no SMTP debug logs. Nodemailer is pinned; transport configuration and acceptance are fixture-tested. Real SMTP authentication, sender/domain ownership, SPF/DKIM/DMARC and inbox delivery require staging verification. Adding credentials alone does not activate the disabled manifest. No real emails are sent by development tests.

The owner has been asked for the transactional email provider. SMTP is prepared as a standard transport option, not a claim that an account or sender is approved. A different provider can implement the same delivery interface. Missing credentials or the provider decision do not disable authenticated password changes or session controls.

## Verification and release gates

Local behavioral tests and the disposable PostgreSQL/Chromium journeys distinguish fixtures from real services. Final executed evidence is recorded with the release candidate after CI completes. Remaining gates include actual provider and sender verification, key custody/rotation procedures, production-schema migration rehearsal, physical-device/accessibility review and named administrator identities. Payment, royalty and settlement gates from prior milestones remain in force.

References: [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Nodemailer SMTP/TLS options](https://nodemailer.com/smtp), [content-access controls](https://nodemailer.com/message).
