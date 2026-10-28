# Mobile registration, sign-in and account navigation

The reported signed-in account name alongside a sign-in prompt exposed a distinction the interface did not explain: listener identities and artist/partner identities use separate existing records/cookies, while the generic entry point defaulted to Listener. An artist entering the correct password through that entry point could therefore receive an incorrect-credentials error. No password-hashing defect was established. The temporary Review Sandbox database can additionally reset on a hosting restart/deployment; its accounts are separate from live accounts.

## Changes

- A shared password-control module adds Show/Hide eye buttons to the redesigned signup, login, change-password, recovery and administrator dialogs. Buttons have 44px touch targets, keyboard support, state, field association and descriptions. They preserve selection/value, keep input labels distinct, and hide values on submission. Passwords never enter application storage or logs.
- Confirmation fields show a specific mismatch message before sending a registration request. Password guidance explains the 10–128 character signup requirement, case sensitivity and spaces. Sign-in permits existing shorter passwords to reach the unchanged verifier instead of applying signup length rules.
- The generic sign-in endpoint tries the selected existing role and then the other role only after an authentication rejection. Both use the existing password verifier, account limits, transactional session creation, password-change race fence, audit and Secure/HttpOnly/SameSite cookies. Operational errors and throttles are not converted to bad-password messages. Legacy role-specific endpoints stay compatible.
- A matching credential authenticates only its existing identity. Same-email accounts are not merged, another profile is not created, and no subscriptions or paid benefits are granted. Artist/partner remains the same existing role. Registration must confirm the returned role’s session before announcing success.
- Navigation rechecks server session state and coalesces simultaneous session requests. Failed reads preserve last-known navigation identity but block protected rendering with a retry prompt, rather than pretending to log the user out. Changed identity/premium state activates the offline-library safeguards; unchanged state avoids reinitializing it on every page.
- The most recently used authenticated role is a non-secret UI preference; server cookies and authorization remain the source of truth. Account screens offer explicit role links when both are signed in. A signed-in listener visiting artist tools sees an explanation and an optional free artist-profile registration link, rather than a false logged-out message.
- Mobile navigation includes a prominent account link and larger header/menu targets. R2, music-generation internals, pricing and production configuration are unchanged.
- Only the marked staging review service displays the temporary-account reset notice. A genuine password rejection remains a rejection; a sandbox-only explanation tells testers that an account predating a reset may need fresh test registration. Production session response shape is preserved.

## Verification and limits

Unit/router checks cover correct role selection/fallback, same-email isolation, throttling/operational failures, invalid passwords, module serving and review-only notice gating. PostgreSQL tests exercise real credential verification, secure sessions, opposite-entry-point sign-in, role-only access and absence of invented listener records/paid subscriptions. Browser journeys exercise password visibility/mismatch correction, registration-to-library, listener-to-studio guidance, generic artist login, mobile account navigation and session-read failure/retry at desktop/tablet/mobile sizes. These browser external services are fixtures.

`scripts/verify-review-auth.cjs` is an explicit opt-in HTTPS check pinned to the existing review origin. It registers isolated artist/listener test identities, verifies secure registration cookies and repeat authenticated reads, logout invalidation, wrong-password denial, opposite-entry-point login, password whitespace preservation and role isolation. It performs no music, storage or payment operation and never prints credentials/cookies. Record its actual execution separately from unit/browser results.

This update changes no schema, existing password hashes, production data, provider keys or music-generation engine. Test accounts remain temporary in the current review hosting architecture; permanent staging storage is not implied. Production deployment still requires owner approval.

## Observed isolated verification

Application head `030d52a8d7d0543f545fb23d63f5e9a8d4b47a9e` passed local 227 application tests and expanded Chromium desktop/tablet/mobile journeys. Exact-head PostgreSQL CI passed 175 native tests and 8 populated upgrades. Review configuration run 40400882111 deployed only the sandbox, preserving live configuration/deployment and running no R2 bootstrap/probe. The opt-in HTTPS check then passed for both roles: fresh registration, repeat authenticated reads, logout, invalid-token rejection, wrong-password rejection, successful sign-in through the opposite entry point, role isolation and password-whitespace preservation.

### Phone retest

Open the review site, refresh the page, and create a fresh **sandbox** test account after this update. The temporary sandbox restarted during deployment, so earlier sandbox test accounts may no longer exist. Do not use the live site for this test. Check both password eyes, correct a deliberate mismatch, register, navigate between the account/library or artist workspace/studio, sign out and sign back in with the same credentials. A listener opening the studio should see that they are signed in and need an optional artist profile; it should not claim they are logged out. Existing live users and credentials remain unchanged.

[Exact-head CI run 40400888999](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40400888999) subsequently passed all four jobs: application/Chromium, PostgreSQL, Firefox and WebKit, including the expanded account journeys and real PWA regressions. These are emulated desktop/tablet/mobile browser checks; the owner's phone retest is still needed.
