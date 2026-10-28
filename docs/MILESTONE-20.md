# Milestone 20 — Seven-day complaints and monthly royalty reconciliation

Development candidate **0.20.0-rc.20**, draft [PR #6](https://github.com/alyeros47-dev/LAE-MUSIC/pull/6), branch `codex/premium-platform-release`. Implements the owner's explicit correction; no merge, deployment, live-finance activation or production-data access.

## Approved behavior

The canonical [financial policy](FINANCIAL-POLICY.md) and shared versioned checkout disclosure now use revision `owner-financial-2026-10-26-v2`. Current checkout acknowledgement includes complaint deadlines, monthly settlement and later-dispute conditions. Artist withdrawal screens show the same applicable conditions. Prior policy documents/acceptances remain immutable and are not retroactively relabeled.

Complaint intake uses the authenticated purchase owner, original verified payment or matching staff-verified incident, database receipt time and an inclusive seven-day UTC deadline. An arbitrary client date cannot restart the clock. Expired ordinary voluntary requests close; legal/provider/fraud claims remain reviewable without treating an allegation as established evidence. Distinct verified incidents on one purchase remain reportable; duplicate claims/retries are fenced. Filing never sends a refund or changes Premium expiration. Listener purchase history exposes complaint intake and private review references. Existing artist refund submissions also require this timing policy before provider submission, based on original complaint receipt time rather than the operator's eventual review date.

Finance/owner administrators can record verified service incidents, review complaints and route late royalty disputes with recent MFA, optimistic revisions, idempotent writes, actor attribution and immutable event history. Ordinary listeners and support/content roles cannot perform financial review. Review statuses are operational notes, never independent provider proof, automatic access restoration or payment confirmation.

Royalty estimates remain available at month-end. Both application and database prevent new finalization and cash release until seven complete UTC days after month-end. September ends October 1 00:00 UTC; the earliest release is October 8 00:00 UTC. The finalizer rechecks database time after acquiring its period fence. New statements preserve the exact policy revision and reconciliation terms. Earlier finalized statements are preserved, while new releases still respect the seven-day guard.

Verified refunds/reversals reduce the relevant recognized revenue before finalization. Unresolved complaints/payment holds block closing affected pools. Release additionally requires existing independent settlement verification, sufficient unallocated settled funds, correct original currency and no unresolved adjustments or holds. The runtime has no live settlement verifier; test-mode liabilities cannot become cash.

After finalization, independently verified reversals create source-, currency- and statement-bound late-dispute cases and balanced pending-allocation clearing. They do **not** automatically debit an artist or recognize the entire loss as a LAE-MUSIC expense. Administrators can document reconciliation, reserve, legal-adjustment or fraud-recovery review. These routes do not clear financial holds or claim a funded reserve/agreement. Actual reserve funding and reviewed correction/recovery execution remain unavailable until independently verified workflows are implemented. Prior M19 expenses/adjustments remain intact as history.

The universal 50% streaming model, approved USD base prices, shared FX accounting, all affiliate percentages, gift split, withdrawal fee and 48-hour offline synchronization limit are unchanged. No permanent listener downloads or separate song purchases are introduced.

## Database and verification

Additive migration **019-seven-day-reconciliation.sql** adds seven-day guards, mandatory immutable terms for new statements, verified incidents, owner/time-guarded complaints, revisioned review histories and late-dispute source checks. Applied migrations 001–018 retain their exact checksums. Existing records are preserved. Rehearse on a sanitized production clone before an approved release; tests use only an owned loopback disposable database.

Executed evidence is recorded in `artifacts/seven-day-policy-test-results.txt` and exact-head CI on PR #6. New coverage includes deadline/UTC boundaries, leap/year transitions, protected exceptions, forged dates, wrong owners, future/mismatched incidents, separate incidents on one purchase, concurrent retries/reviews, immutable records, pending-review holds, verified pre-finalization deductions, database rejection of early finalization/release, and late-dispute routing without automatic loss assignment. Browser journeys exercise listener complaint submission and history alongside existing checkout, artist and administrator workflows. External providers remain fixtures.

## Remaining release gates

Real authorized Paystack/Flutterwave, R2, music/lyrics, SMTP and ad creative verification remain unconfigured. Live checkout, cash settlement/treasury FX, bank payouts, commission clearance, funded reserves, reviewed generic corrections/recovery, complete independently verified listener refund/dispute outcomes and partial-benefit valuations remain required. A sanitized production clone, operational/load/backup rehearsal and physical-device/manual accessibility checks are still needed. Linux WebKit is not physical Safari/iOS certification. See [secure staging setup](SECURE-STAGING-SETUP.md). The website is **not deployment-ready**.
