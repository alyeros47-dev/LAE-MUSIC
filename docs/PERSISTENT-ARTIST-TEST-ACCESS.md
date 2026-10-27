# Persistent complimentary artist studio access

This implements the owner's approved two-lyrics/two-audio testing programme on the existing backend and database. It is not a sandbox deployment, paid subscription or commission-bearing sale.

## Release configuration

Apply additive migration `021-artist-test-access.sql` through the normal serialized migration runner. Enable `LAE_ARTIST_TEST_ACCESS=1` on the existing service only with its approved code release. Do not enable `LAE_REVIEW_*`, deploy the review Docker image, replace environment variables or copy temporary review accounts. The default remains disabled until activation.

An existing authenticated artist, or a newly registered artist, receives two complimentary lyrics credits once under the unique `artist-two-lyrics-v1:<artist>` ledger reference. Historical credits remain unchanged; artists who already hold credits keep them in addition to the new once-only grant. Refreshing, signing in, restarting and updating cannot repeat the grant. Closing the programme cannot accidentally award the old four-credit welcome grant to those participants.

Each artist can reserve two complimentary **music-generation requests**. Each request is intended to return two songs where supported by the provider; this is not a promise of exact provider output. Generation usage lives in `artist_test_generations` with original reservation, provider task, result status and timestamps. It survives logout and application replacement because it uses the existing PostgreSQL database. The flag enables studio testing only, not arbitrary external-song uploads, purchases or unlimited generation.

Free requests are used before existing paid-package requests. Once the two free requests are exhausted, an artist with a verified active package retains their normal paid allowance; an unpaid artist receives a clear exhausted-allowance response. Existing package quotas, prices, commission rules and purchased generation credits are unchanged. There are no fabricated subscriptions, receipts, commissions, financial transfers or withdrawable balances.

## Charge and failure safeguards

The existing artist lock, request hash and durable idempotency journal remain authoritative. Concurrent retries can temporarily return the same provisional reference; it resolves to the original provider task rather than starting another generation. Different concurrent requests cannot bypass active-job or daily limits.

Confirmed pre-acceptance rejection restores a music reservation once. Confirmed failed tasks restore once even if the programme has since been disabled. A successful result completes the reservation. Uncertain acceptance, missing provider IDs, conflicting failure/audio evidence and timeouts retain the reservation for review. Existing lyrics credit reservation/refund protections remain in use. Disabling and re-enabling access does not reset consumption or rerun grants.

The normal lyrics-wallet API now advertises the two approved model choices in production as well as review, rather than advertising Mini outside the review environment. Explicit model selection still requires provider verification before a credit is reserved. Existing API keys and configured engine prompts are retained.

## Executed evidence

Local verification passed 300 application tests, 181 PostgreSQL tests and 9 populated upgrade tests through all 21 migrations. Actual HTTP checks run the normal Node server with the programme enabled: registration, a two-credit balance, approved model choices, free music allowance, no paid membership, logout, application replacement, login, unchanged balance/allowance, and disabling the programme without awarding extra credits. Real PostgreSQL generation-handler checks cover concurrent duplicate keys, exhaustion, ownership, definitive rejection, uncertain acceptance, disabled-programme reconciliation and fallback to an existing paid allowance. Their external provider responses are **mocked**, with no billed generation or production records used.

Browser and full CI evidence is linked from PR #6. This document does not certify production activation or a real provider generation under the new programme.

## Remaining production recovery gate

The code upgrade and fixture recovery tests do not prove a restorable production backup. The current development environment has no Neon management credential or connected Neon account, and repository secret administration is unavailable to this session. No production backup has been claimed verified. Provider recovery access or an owner-confirmed usable recovery point is still required before applying production migrations. The existing database must be retained; creating a replacement database or copying temporary sandbox records is not an acceptable substitute.
