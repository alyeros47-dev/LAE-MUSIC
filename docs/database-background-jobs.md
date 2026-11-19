# Idle database work

Empty queues use aligned 15-minute fallback checks through `lib/background-job.js`.
Workers run once after application startup. They do not overlap, stop scheduling
after shutdown, and back off on errors. `unref()` avoids keeping a stopped process
alive solely for a timer. An in-flight job is allowed to finish.

Customer work wakes the relevant worker after its transaction commits:

- Account recovery and verification requests wake the email outbox. Backlogged
  email continues at one-second intervals; uncertain sends retain their existing
  state and are not blindly resent.
- Studio release creation, retry and publication wake import/event delivery.
  Existing four-second processing, lease renewal and publication locks remain.
- Successful checkout, verification and webhook handling wake payment and
  affiliate reconciliation. Outstanding payment checks keep their one-minute
  cadence. Transfer submission also wakes reconciliation, including uncertain
  provider responses. No scheduler initiates a replacement transfer.

Affiliate commission retries report whether work existed; empty scans sleep.
Existing settlement, approval, payout enablement and verification gates remain.
Account/request housekeeping shares the 15-minute schedule. Expiry checks still
occur when credentials, reset links and rate limits are used; delayed physical
cleanup does not extend their validity. Artist reminders retain 15-minute checks,
and quarterly closure retains hourly checks, aligned to common boundaries.

The fallback also recovers work committed just before process loss. This service
currently has one instance. A different process can discover unseen work at the
next fallback; notification across multiple instances is outside this change.

## Verification and cost interpretation

Fake-clock tests verify only five empty checks over an hour (startup plus four
fallbacks), immediate wakeup, backlog draining, non-overlap, shutdown and recovery.
The disposable PostgreSQL test verifies committed outbox visibility, delivery,
single-use password reset and login. Existing hosted suites exercise payments,
commissions, publishing and account access. Fixtures are not live payments or
proof of real SMTP inbox delivery.

Fewer queries are not a promised percentage reduction in CU-hours. Real visitors,
bots and genuinely pending work can keep Neon active. Observe idle/active compute
state through the Neon Management API, which does not wake SQL compute. Do not
probe the database every minute merely to measure scale-to-zero.

No billing, compute size, connection URL, schema, financial rules, media storage,
website player or Android playback changes are included. The previous production
code remains a compatible rollback target because this change has no migrations.
