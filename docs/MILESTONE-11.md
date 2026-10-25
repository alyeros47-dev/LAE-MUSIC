# Community and catalog moderation

Migration 012 extends existing comments and reports. It does not rebuild the community system, delete records, alter financial terms or activate external services.

## Corrected behavior

Legacy artist and administrator review lists used an inner join to listener accounts, so guest comments disappeared from review. The unified queries use a left join and the guest display name. Artist comment activity includes guest comments too. The public song screen exposes the existing listener-only comment-report action; public streaming and guest comments remain open.

Reporting a visible comment now locks the comment row and records the report, pending-report count, automatic hold and audit in one transaction. Three distinct unresolved listener reports hold a comment for platform review. Duplicate reports do not add another record. Each new report advances the review revision so an operator cannot unknowingly overwrite a changing report context. Suspicious comments inserted by the existing posting filter receive a platform hold as well.

Artists can hide or restore ordinary comments on their own songs. They cannot restore an automatic/platform-held comment, or a comment hidden by an administrator. The platform review screen includes guest authors, current status, open/historical report counts and the twenty most recent report reasons. Reporter account identities are omitted from that context. Artists receive counts without private report context.

Administrator approval/hiding resolves current reports without deleting them and records a decision note and actor in the audit. An explicit review advances the revision even if visibility stays the same. Competing clients receive a conflict and must refresh. Modern requests use idempotency references; legacy approve/hide requests retain compatibility but cannot bypass a platform hold or ownership. Permanent comment deletion returns a clear unavailable response; hiding preserves the original discussion and report history. Database triggers also prevent deletion of comment/report history.

Catalog complaints have an open/dismissed/unpublished review state, revision, decision note and review timestamp. Operators may dismiss a complaint while preserving current catalog status or unpublish the related song while preserving its audio metadata/source record. Reviews are one-way and auditable; a complaint does not remove music automatically. The original reason/details cannot be rewritten. Existing catalog removal remains an unpublish action.

Content operators and owners can review platform moderation. Finance/support roles cannot. Artist routes use the authenticated artist identity, and listener reporting requires a listener session. Modern administrator mutations also use the in-transaction session/version/role fence introduced in milestone 9.

## Interface and verification

Artists open **Comments** from their workspace; operators open **Moderation**. Forms show clear review decisions and notes, escape all submitted text, retain report history and keep the shared audio player outside navigation. Held records explain that platform review is required.

Behavioral tests validate references, revisions and note limits. Disposable PostgreSQL journeys cover real guest posting, suspicious-content holds, concurrent listener reports, owner isolation, artist hold restrictions, transactional rollback, stale/idempotent reviews, immutable reports, competing reviewers and catalog unpublishing. Named-role PostgreSQL tests verify content access and finance/support denial. Browser fixtures connect listener reporting, artist review, platform review and catalog decisions at desktop/tablet/mobile widths. Executed results are recorded after CI; these test definitions alone are not a passing result.

This candidate still requires production-schema/load review and the external storage, music, payment and email tests listed in the release gates. It does not certify audio rights or claim automatic human moderation.
