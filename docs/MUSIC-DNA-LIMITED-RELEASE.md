# Controlled Music DNA release preparation

This is a limited studio-update plan for the existing LAE-MUSIC service, not a full
commercial-launch certificate or deployment authorization.

## Owner's practical acceptance evidence

The owner reports successful testing on the main site: voice recording/profile use,
music generation with artwork, generated-work download, and publication of a song
with a cover image. Record this as **owner-reported acceptance**, not a new automated
provider test. Generated-work export belongs to the creator; permanent listener MP3
purchases/downloads remain prohibited. Affiliate payouts and Premium offline
listening were not confirmed by this report. The new 215-style Music DNA library's
actual lyric/audio quality still needs acceptance after a controlled rollout.

W7's approved descriptions and the complete library have the passing focused/prior
comprehensive evidence linked in the existing final-verification documents. No paid
provider call was made during this release-preparation work.

## Compared release scope

Compared the observed production code `4e749296bc7a51239684fabffdf00e2c984d113c`
with W7-approved code `a02b6fa748fc01b73ec1b7ab13f289363c368bb9`: 172 changed files,
including tests/documentation. Runtime changes include the Music DNA registry,
prompts, provenance/credits integration, studio routes/frontend and migration 023.
No financial-runtime file changes were returned by that comparison. Later commits
add verification documentation/manual workflow support only.

The committed payment manifest remains disabled. A limited release must preserve
that disabled state, existing storage/provider settings and existing live data.
Untested referral/financial/offline features must not be advertised as verified or
activated as part of this studio update. Owner testing of working studio functions
does not certify unrelated features.

## Safety and release gates

- Startup runs the checksummed migration runner before serving requests. Migration
  023 is additive but its successful application is required for the new provenance
  writes. A failed startup can make the service unavailable; a code rollback alone
  is not a database recovery plan.
- The previous release helper is pinned to PR #6, an old production base and an old
  backup identity. Do not reuse it unchanged to deploy PR #10 or relax its checks
  merely to bypass those mismatches. A reviewed current-candidate release procedure
  is still required.
- The registered manual audit workflow now has a separate `isolated_recovery` input.
  Default false preserves the read-only inspection. True runs only guarded private
  recovery on the Music DNA development branch, sharing the existing recovery
  concurrency lock. There are no production deploy or migration steps in that job.
- Recovery uses the existing bounded implementation: identify the live database,
  create an expiring owned backup branch, fingerprint it privately, pipe pg_dump to
  a disposable private PostgreSQL instance, verify restored records, apply current
  migrations twice, verify original records/history and legacy initialization, then
  remove the local database and owned backup compute endpoint. It never restores or
  migrates the production branch. The backup remains until its stated expiry.
- Creating a valid backup and passing migration rehearsal will reduce release risk;
  they do not promise zero risk or verify billing, payouts, audible style accuracy
  or all physical browsers.

## Verification in this batch

- `node --test tests/neon-recovery-rehearsal.test.cjs tests/neon-recovery.test.cjs`:
  10 passed, zero failures. These are mocked management/recovery guard tests.
- `node --test tests/production-release.test.cjs`: six passed, zero failures. These
  guard tests do not authorize the old release helper for PR #10.
- Actual recovery/migration rehearsal: see result below before claiming verified.
- No completed full-library/voice-language audit was requested again. Redundant
  automatic broad runs were canceled when workflow-only publication triggered them.

A standalone new workflow initially returned GitHub HTTP 404 because it was not
registered for dispatch. It was removed; isolated recovery was attached to the
already registered manual audit workflow instead. No recovery job ran from that
failed dispatch, and no merge to production was used to register a workflow.

## Recovery-check repair

The first isolated run created backup `br-rapid-brook-b4o7ybnx`, expiring at
2026-11-05 14:26:46 UTC, and restored its data into private disposable PostgreSQL.
It failed at the post-migration fingerprint comparison; production was unchanged.
The previous checker incorrectly included newly appended migration-history rows in
its requirement for an identical pre-migration fingerprint.

The repaired checker fingerprints every original business row unchanged, filters
only the original migration versions for the original-history fingerprint, and
separately verifies that all original migration records/checksums remain intact and
that only exactly the reported new migration versions were appended. Migration replay
and legacy initialization must preserve the complete new migration history too.
No changed business rows, removed history, modified old checksums, duplicate versions
or unreported history additions are permitted. Tests explicitly cover these failures.

After repair: 12 recovery tests passed, zero failures. The actual retry reuses the
verified owned backup rather than creating another copy. See actual run outcome below.

## Actual recovery result — PASS

[Run 40892035243](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40892035243)
passed on code `569e450da6ae3f60f8a79bdc2346eafd96062afa`:

- `recovery_verified: true`, `restore_tested: true`.
- One current migration applied on the private restored copy; replay was stable.
- 141 existing tables / 470 existing rows preserved, including original history.
- Existing engine initialization verified without changing those records.
- Disposable local recovery database removed; temporary backup compute removed.
- `production_writes: 0`, production database not replaced/restored, production
  environment unchanged. The live service was not deployed or restarted.
- Verified backup: `br-rapid-brook-b4o7ybnx`, expires **2026-11-05 14:26:46 UTC**.
  This evidence is time-limited. Recheck identity, expiry and backup freshness
  immediately before any approved release; an old copy does not cover later writes.

Recovery/migration rehearsal is now resolved for this snapshot. It does not mean
migration 023 is already applied on production. The remaining limited-release gate
is a current PR #10 release procedure pinned to the tested candidate, current live
base and verified backup, with applicable release checks. The older PR #6 release
helper must still refuse to perform this deployment unchanged. No merge/deployment
was requested by this verification job. Full commercial launch remains blocked on
its separate financial/offline/operational requirements.
