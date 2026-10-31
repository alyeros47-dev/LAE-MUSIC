# Resume interrupted generated-song uploads

The previous flow reserved a code at upload start, then rejected every reserved code as already used. A network or artwork failure therefore stranded an unpublished draft and its valid recording.

Code validation now distinguishes a pending reservation from a published/removed release. The same owned code and original file formats resume the existing pending track under the creator/record locks. Parallel requests converge on one draft. Existing paid/free publishing authorization, exact audio fingerprint and one-use publication rules remain enforced. Resuming excludes that draft from the annual slot count rather than reserving a second slot.

After committing the reservation, the server may verify an existing stored audio object against its expected MIME, size and original recording hash. Only then may the frontend skip resending that audio and continue with artwork and publication. Missing, corrupt or unavailable stored audio falls back to uploading the original file. Published codes guide the owner to the catalog; repeating an already-successful finish confirms success without publishing or notifying twice.

Transport errors explain that the draft/code remain preserved and that the same files should be retried. No generation call, credit deduction/restoration, code reset, data deletion, schema migration or credential change is introduced. A successful generation is not refunded merely because its separate publishing upload was interrupted.

Verification includes real UI interruption/retry on mobile and desktop with mocked storage, actual handler tests for valid/corrupt/missing stored audio and lost finish responses, and disposable PostgreSQL cases for concurrency, ownership, immutable audio, quota exclusion and final one-use enforcement. No arbitrary test object is written to the production R2 bucket. Read-only production diagnosis identified an existing pending audio object with missing artwork; code recovery does not replace that audio or the owner's chosen cover.
