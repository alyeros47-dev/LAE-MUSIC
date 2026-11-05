# PR #27 final verification — 2026-11-05

**Decision: NOT READY FOR PRODUCTION DEPLOYMENT.** The membership implementation and isolated integration checks pass, but the complete branch contains unresolved affiliate scope and the actual financial services remain unconnected. Passing fixture tests does not verify real cash collection or funding. Leave PR #27 draft; do not merge or deploy.

## Hosted checks

The reviewed candidate `0274a47ea7d2e78b4129849de28157bb2c69e376` passed Platform release candidate verification [42084302730](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/42084302730) and the automatically triggered Music DNA audit [42084302713](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/42084302713). Application/Chromium, Firefox, WebKit, PostgreSQL, change-scope and container persistence succeeded. Production release, production service audit and recovery rehearsal were not run. No paid API calls were made. Any subsequent verification-only commit must also finish its hosted checks before release review.

## Music Creator Agreement — PASS (technical and business-consistency review)

`config/music-creator-agreement.json` version `2026-11-05-v1` matches `docs/MUSIC-CREATOR-AGREEMENT.md`. It states the approved annual Starter $6 / 3 generations / 6 tracks, Growth $10 / 6 / 12, and Premium $20 / 15 / 30; two individually coded output tracks remain supported. It preserves original contributions, rights declarations, moderation and takedowns; it does not promise copyright-free output or income, or set new commission/royalty percentages.

Acceptance is explicit and owner-bound, recording the full document, version, SHA-256 content hash and timestamp in immutable acceptance records. A changed agreement requires fresh acceptance. Agreement acceptance alone cannot authorize a charge: a royalty renewal separately confirms the exact plan, USD amount and one-time deduction. Pending, unfunded, held and reserved amounts are excluded. There is no recurring-deduction authorization. Expiry preserves published songs, eligible royalties and dashboard access. Existing benefits and purchased extra generations are preserved. Owner approval of these terms is still part of release approval; this is not legal sign-off on the owner's behalf.

## Branch-scope review — decision required

Against production/main `7cb860cb6082375268326396dcd5701a2d05f090`, the branch includes the earlier purchase-qualified affiliate proposal, migration `027-affiliate-purchase-year.sql`, and annual membership migration `028-annual-artist-memberships.sql`. The earlier proposal changes Premium direct commission from 10% to 20%, quarterly Premium team benefit from 5% to 10%, and free affiliate access to a purchase-qualified one-year window. Artist direct rates remain 15% / 25% / 25% and artist/studio team rates remain 10%.

Those earlier changes were not newly approved or altered by this verification batch. They cannot be treated as a membership-only merge while commission rules are still being finalized. Resolve the branch scope explicitly: separate the unfinished affiliate proposal from the release candidate or approve its complete scope separately. Do not silently revert or finalize financial rules during verification.

A related policy boundary remains: internally funded membership-renewal receipts do not have external-provider presentments. The current affiliate-qualification query requires those presentments, so a royalty-funded renewal does not independently extend affiliate qualification. Settle that behavior with the affiliate policy; do not fabricate external cash evidence.

## Payment and funded-royalty integration — PASS with isolated fixtures; actual services NOT VERIFIED

`tests/artist-membership-integration-postgres.cjs` composes the real checkout adapter, signature verification, independent transaction lookup, commerce fulfillment, royalty accounting/finalization, funding-evidence validation and authenticated HTTP renewal. Five scenarios plus the parent test pass (6 reported tests):

1. A signed test-mode $6 Starter checkout activates exactly one 3-generation / 6-track annual membership. Invalid signatures fail; concurrent duplicate callbacks cannot double-fulfill; a redirect alone grants nothing.
2. Actual default production wiring stays closed, even when a client supplies success flags or a key exists without reviewed configuration.
3. Synthetic historical receipts at the unchanged approved monthly price create a finalized royalty statement, but cannot be spent before verified funding. Published music survives expiry.
4. Missing/insufficient funding proofs roll back. A deliberately injected fixture verifier matching the original receipts releases funds once under concurrency.
5. Authenticated one-time renewal deducts exactly $6 from funded USD royalties, records separate consent, restores the approved annual entitlement, retries idempotently and does not count the internal deduction as newly collected external cash.

The test uses a disposable local PostgreSQL schema, intercepted transport and explicitly synthetic historical live-book receipts, never real money. Real provider fetch is forbidden. Injected fixture funding evidence is not a deployed verifier. The existing migration and membership database suites also pass. Approved package prices, allowances, commission rates and runtime configuration are unchanged by this verification batch.

## Actual deployment dependencies and blockers

- `config/payment-merchant.json` has checkout disabled and no reviewed merchant/currency configuration. `lib/payments/runtime.js` only supports reviewed **staging test-mode** adapters; this candidate has no live checkout enable switch. Merely adding a secret cannot enable production checkout. Real merchant sandbox transport/webhook verification and an approved live integration are still required.
- Read-only public capability checks on both `https://lae-music.com` and `https://lae-music.onrender.com` returned database available, payments disabled, payment mode disabled and payouts disabled. Complimentary artist testing remains reported. Nothing was changed on either service.
- `lib/platform.js` creates royalty settlement without a verifier. `lib/royalty-settlement.js` correctly refuses release with HTTP 503 until independent live cash-settlement verification is implemented and connected. A successful charge or projected royalty is insufficient. Cross-currency releases additionally require independent treasury-conversion evidence.
- Paystack's implemented USD minimum is $2. The existing $0.60 monthly and $1.80 three-month Premium prices cannot be tested/charged through its USD route. Use an approved supported local-currency quote or another verified merchant; do not change approved prices or lower provider safeguards.
- GitHub CI access is available. This execution environment has no connected Render/Neon management tools or injected runtime secrets, so current private production environment/schema inspection and an exact-candidate isolated production-copy migration rehearsal were not performed in this batch. Hosted CI tested fresh and historical fixtures, not production data. Keep the existing database, R2 storage, secrets and recovery path intact.

## Next step

Resolve affiliate branch scope, then connect/review a merchant test environment and independent royalty-funding evidence in an isolated environment. Verify the actual payment/renewal lifecycle, settle the affiliate qualification boundary, and complete the exact-candidate recovery/migration and production-configuration checks through authorized service access. These are concrete release prerequisites, not permission to deploy or add unrelated features. After they pass, obtain explicit owner merge/deployment approval.

## Verification-only changes

- `tests/artist-membership-integration-postgres.cjs`: composed payment/funding/renewal regression coverage.
- `tests/artist-membership.test.cjs`: exact rendered-agreement/document consistency check.
- `package.json`: include the composed integration check in the existing hosted membership PostgreSQL command.
- This report. No production application/configuration/migration changes in this verification batch.
