# M19 — Approved financial policy and protected artist liabilities

Candidate `0.19.0-rc.19`, development branch `codex/premium-platform-release`, draft PR #6. **Not production-ready. No live financial activation, production merge, Render deployment or production-data access.**

The owner approved replacement [financial protection/refund rules](FINANCIAL-POLICY.md) on 2026-10-26. They supersede the earlier proposed unused-time Premium proration. Approved USD prices, artist-package/affiliate terms, 50% streaming royalty rate, gift split and withdrawal fee remain unchanged.

## Checkout transparency and evidence

The public policy endpoint exposes the reviewed conditions and revision. Artist and Premium checkout show the refund conditions before creating a payment reference and require an unchecked, explicit acceptance checkbox. New checkout requests require `policy_accepted: true` and the current `policy_revision`; missing/stale acknowledgements cannot initialize the provider. An immutable database catalogue stores the exact document/hash, and a server-timestamped acceptance belongs to the authenticated order owner. Database guards reject another owner's acceptance and history edits. Existing historical purchases are not retroactively labeled as having accepted new conditions.

Premium terms explicitly preserve paid access until expiration and explain that voluntary cancellation after access starts does not automatically refund unused time, except where required by law. Automatic renewal remains off. No cancellation action creates a refund, revokes an unrelated term or adds a new charge.

## Artist refund review

New full-refund submissions require an approved basis and a reviewed evidence reference. The backend locks the purchase owner and derives activation, uploaded-service and generation-use facts from the database. A voluntary full annual-package refund needs a future, not-yet-activated term with no used paid benefits. An unused extra-generation purchase cannot have a reserved/consumed entitlement. Started/used services require a documented, staff-verified duplicate, activation failure, service-error or legal exception; a customer claim alone does not establish one. Partial unused-benefit valuations remain under review rather than inventing an allocation or submitting a full refund.

The authorized operator's approval or decline, document revision, source facts, note and reference are immutable. Decision/confirmation fields are bound into idempotent requests. Ordinary users cannot approve exceptions. The existing owner/finance scope, recent MFA, session/access fences, origin checks, purchase locks and one-submission/uncertain-response protections remain in force. A staff policy review is separate from independent gateway proof that money was actually returned. A completed external refund still requires accurate accounting even if a policy exception was not recorded; existing provider verification is not replaced by an operator checkbox.

## Verified generation failure

Failure responses containing usable audio or evidence of provider acceptance do not release the reserved generation. A task remembers whether usable output was ever seen, including a conservative backfill for existing succeeded tasks. Later disappearance of a result cannot automatically restore a previously delivered generation. Completed generations remain consumed when a later provider response reports failure; dissatisfaction does not create a refund endpoint.

Actual terminal failures without usable output release the same reservation once under the existing transaction. New immutable decision records capture the owned task, provider state, response hash and whether a usable result was seen. Conflicting outcomes remain held for review. Provider contradictions after a previously final failure require reconciliation; no system can certify a provider's future behavior. Initial definitive submission rejections retain the existing durable request-key failure result. Real provider capabilities and actual outcomes remain unverified without authorized account access.

## Finalized royalty protection

For new verified refund accounting, original legitimate finalized artist allocations and their unsettled/earned balances remain intact. The platform records an immutable source/statement/currency/mode-linked loss and a balanced **expense** journal instead of automatically debiting artists. Replays cannot duplicate the loss. Prior statement hashes and all historical adjustment/hold records are preserved. Unallocated carry can still reverse without removing an allocated artist entitlement.

An expense entry is **not funded cash or proof of a reserve deposit**. Independent cash-release/treasury verification still applies; an adjusted, unfunded statement cannot be released by toggling a flag. Previously verified earned funds do not become fraudulent merely because the platform later receives a refund. The admin royalty workspace shows platform loss records and explains their funding limits. Read-only preflight checks the source share, currency/mode and matching expense journal along with existing statement invariants.

Fraudulent earnings, duplicates and accounting errors may use documented, reviewable adjustments under the approved policy. A generic correction/appeal workflow and verified reserve funding/dispute settlement are still unfinished; no automatic artist clawback or arbitrary balance-edit route is added. Existing legacy holds require case-specific review, not a silent recredit or deletion.

## Migration and verification

Additive **018-financial-protection.sql** adds policy snapshots/acceptances, immutable refund decisions, generation failure evidence, the usable-output marker and immutable platform-loss records. Migrations 001–017 retain their checksums. Rehearse 018 on a sanitized clone before any authorized production change. Older releases reject the unknown migration and cannot be used as a blind database downgrade.

Executed results are recorded in `artifacts/financial-policy-test-results.txt` and the exact published-head CI on PR #6. Tests distinguish real PostgreSQL transactions/constraints, browser audio/storage, native CSV/SMTP/HTTP behavior and **mocked external providers**. Local parallel browser containers exhausted the workspace disk during one attempt; only task-created disposable containers were removed, and affected checks were rerun. That interruption is not a production-data or provider result.

The release still needs real authorized payment/storage/music/email verification, live checkout/settlement/payout and commission clearance, verified Flutterwave refund/dispute protocols, complete listener support/dispute/correction handling, any legally required partial-benefit valuations, funded-reserve operations, ad creative, sanitized-clone/load/backup recovery and physical-device/manual accessibility review. See [SECURE-STAGING-SETUP.md](SECURE-STAGING-SETUP.md). Do not claim deployment readiness from policy approval or fixture results.
