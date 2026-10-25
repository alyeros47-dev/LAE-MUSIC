# Artist and partner account notifications

Migration 011 adds a durable in-app inbox. No email/push transport, financial entitlement, payment success simulation or new commercial rate is activated. Existing listener release notifications retain their endpoints and behavior. Artist inbox URLs and APIs explicitly select the artist role, including when the same browser has a listener session.

## Recorded events

PostgreSQL triggers append notifications in the same transaction as verified purchase/cancellation records, withdrawal request/review, completed/failed generation tasks, durable studio draft readiness/failure/publication, direct-sale commission changes and independently verified product reversals. Rollback removes the uncommitted notification along with the business mutation. Replayed transitions use stable unique source references. Repeated writes of an unchanged status do not create another message. Existing historical data is not backfilled or reclassified.

Messages distinguish an approved withdrawal from a completed bank payment, a pending commission from withdrawable funds and cancellation of an unpaid record from a refund. Notifications do not fund wallets, change package dates, claim settled money or authorize duplicate provider submissions. Generation failure messages direct artists back to the owned task/allowance records rather than promising a credit refund.

Notification content, recipient and source references are immutable. Acknowledgement is owner-scoped and can be set once; messages cannot be reset to unread or deleted through the API. The inbox provides bounded keyset pagination, an unread filter, unread counts and acknowledgement up to the newest currently displayed reference. Newly arriving messages after that reference remain unread. Internal destinations come from a database allowlist.

## Subscription reminders

The newest paid, started and unheld subscription term is checked for the 30-day, 7-day, 1-day and recently expired windows. Only the current window is emitted when first seen; missing older windows are not all sent at once. An already-paid continuous renewal suppresses the old term's warning. A unique source reference prevents duplicates across requests, restarts and workers. Expiration catch-up is bounded to the preceding seven days. Existing reminders remain historical records after later renewal or refund; the subscription screen shows current eligibility.

Production/staging processes run a PostgreSQL-coordinated scan every 15 minutes and on startup. `ARTIST_NOTIFICATION_WORKER_ENABLED=false` disables this scheduled scan for maintenance. Opening an authenticated artist inbox still checks that artist's due reminders. There is no external delivery dependency and no auto-renewal charge. Test/development processes do not schedule the global scan.

Artists open the inbox from their workspace or account. The shared player stays outside the route. Owner/support Security operations shows aggregate notification counts, latest timestamps and whether this process schedules reminders, without exposing inbox contents. There is no claim of email, push or delivery to a human recipient.

## Verification

Behavioral tests validate cursor and acknowledgement bounds. Disposable PostgreSQL tests cover concurrent reminder deduplication, renewal suppression, held/distant/expired terms, role/owner isolation, immutable content, acknowledgement, withdrawal atomicity and rollback, task/cancellation deduplication, earlier verified-commerce/refund/release events, pagination under incoming events and aggregate health. Browser fixtures exercise the artist inbox, unread filtering and acknowledgement while playback continues at desktop, tablet and mobile widths. Final executed evidence belongs in the release notes after CI; test definitions alone are not a passing result.

Actual payment settlement/bank payouts, provider media/email integration, approved download/streaming revenue rules and production-schema/load review remain release gates.
