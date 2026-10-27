# Free studio testing in the Review Sandbox

Owner instruction, October 27, 2026: suspend the artist-package purchase requirement for registered sandbox artists until further notice. No hosting upgrade or production rollout is authorized.

The isolated review Docker image sets `LAE_REVIEW_TEST_OPEN=1` together with the existing staging marker and loopback database checks. Each existing or newly registered artist receives two lyrics requests and two audio-generation requests. Audio requests are intended to produce two songs each; actual output depends on the music provider. These are test entitlements, not purchased subscriptions, cash balances or changes to approved production packages.

The former instance-wide two-lyrics/one-audio provider gate no longer governs open testing. Database reservations serialize requests per artist. An authenticated server reservation is required before a billed provider call. Request replay cannot send another provider request; confirmed failures restore the reservation once, while uncertain provider acceptance remains reserved for reconciliation. A five-attempt-per-provider/account/day safety ceiling limits repeated failures without sharing allowances across artists. Voice training and WAV exports are excluded from this free test grant.

Studio submission verifies the current artist session before sending lyrics or audio. While an artist actively edits the visible studio, a session check runs every two minutes. Drafts remain in that artist's browser storage; session loss requires signing back in, not purchasing credits. This does not bypass authentication or make ephemeral accounts persistent.

No paid Render storage is activated. Accounts and locally uploaded test files can still reset when this temporary service restarts or updates. Live accounts, PostgreSQL data, R2 objects, keys and commercial quotas remain untouched. R2-dependent voice upload/training tests remain pending at the owner's request.

Verification includes the application suite, desktop/tablet/mobile browser journeys and accessibility checks, isolated PostgreSQL concurrent reservations and once-only refunds, and disposable-container account/media retention regression checks. Real-provider sandbox results are reported separately from these mock/local checks. Production readiness is not implied.
