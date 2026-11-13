# Artist owner access and first-200 promotion

This update leaves artist package prices/allowances, providers, Gospel Music DNA,
the music player, streaming, financial calculations and affiliate eligibility unchanged.

## Activation

Migration `034-owner-access-artist-launch.sql` is additive. On its first successful
application it locks artist registration briefly and snapshots the existing
`creators.id` values into an immutable owner-access table. Those IDs receive
permanent unlimited generation and publishing access, including external
recordings with the existing rights confirmation. It does not mark purchases
paid, change account credentials or create affiliate/royalty allocations.

The snapshot happens at update activation, not on every restart. New artist IDs,
including an artist profile subsequently added to a listener account, cannot
inherit owner privileges through an email, display name, selected plan or request flag.
Original Studio codes still bind their original recording; owners leave the code
empty when uploading an external recording.

## Limited promotion

An account-creation trigger atomically allocates the first 200 new artist IDs.
The allocation counter, unique account grant and unique slot are committed with
registration, so a failed/rolled-back registration consumes no slot. Owners use
none of the allocations. Registrations after slot 200 receive no promotion.

Each promotional grant provides one music request, producing the existing two
separate tracks with individual one-use upload codes, plus one companion lyrics
draft for the AI-lyrics workflow. Own lyrics remain supported. A creator lock and
unique active-reservation index prevent concurrent double spending. Definite
no-output failures restore the same credit. Unknown provider acceptance stays
reserved under the existing reconciliation rules rather than granting a retry.

Both promotional tracks remain publishable after that credit is used, through
the code/file upload or saved-Studio release path. External recordings are not
permitted for new artists. Additional generation requires an active paid package.
The promotional tracks do not use up a later paid package's track allowance.

## Verification and deployment limits

`tests/artist-launch-postgres.cjs` uses real disposable PostgreSQL, concurrent
registrations/generations and mocked providers/storage. It verifies the frozen
owner set, owner generation beyond the former daily cap, external publishing,
credit/refund behavior, separate codes, both publishing paths, exact 200-account
cutoff, linked-role registration, and unchanged paid-plan quotas. The related
browser test uses the real interface at phone and desktop widths.

Existing paid-only test fixtures fill the promotion using its real registration
trigger before testing post-promotion paid access; the promotion itself remains
covered separately. No production records or settings are used in these tests.

No paid audio or text generation is run for this update. Actual provider output,
provider balance and storage availability remain subject to the existing service
configuration. Unlimited owner access waives platform allowance purchases; it
does not remove provider authentication, content rules or concurrency safeguards.

Production activation requires the reviewed update and this migration together.
Do not rerun the owner snapshot manually. Preserve migration 034 and its grants
in any rollback build: the older application's migration runner rejects a newer
migration history, so a simple rollback to the pre-update build is unsuitable.
