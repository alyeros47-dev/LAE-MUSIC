# Data Safety worksheet — owner review required

Based on the Android source reviewed on 18 November 2026. Complete the actual Console form after confirming backend practices and the finished billing/deletion/moderation work. Do not submit this worksheet as a claim that no data is collected.

| Data | Current handling | Purpose / decision to confirm |
|---|---|---|
| Email, display name and account ID | Existing HTTPS sign-in/account service; protected session stored on device | Account management, identification; required for account features, guest streaming available |
| Password | Sent to existing HTTPS authentication service, not persisted by this app | Authentication; do not log |
| Song requests, IP/network access records | Existing LAE-MUSIC hosting/backend | Content delivery and service operation; confirm logging/retention and processor roles |
| Listening history and eligible-play events | Existing listening/royalty endpoints; signed device/sequence events for offline playback | App functionality, history, existing valid-play accounting; a preload/swipe alone is not payable |
| Likes, follows, playlists, comments and reports | Existing account-linked backend APIs | App functionality/personalization/moderation; comments are public user-generated content |
| Purchase/subscription history | Existing subscription status is checked; no new Play purchases enabled | Account entitlements; finished Play verification will add token/transaction processing and needs a fresh review |
| Device-bound offline key/challenges | Keystore/private files and existing signed-grant endpoints | Protected offline access, account/device binding and fraud prevention; assess Console's device/other identifier disclosure |
| Gospel/secular choices, listening duration/completion/skips/repeats, recommendation summaries | New account-scoped encrypted local storage only; not sent to a new server/analytics service | Local personalization; musical choices can be sensitive, do not profile religion or use for advertising |
| Downloaded audio, cache and artwork | Private device storage; media encrypted at rest | Offline functionality and performance; do not disclose as unrestricted MP3 export |

No Firebase, ads SDK, advertising ID permission, contacts, location, camera or microphone permission is introduced. No crash/usage analytics SDK is configured. User-initiated Android sharing passes a public song URL to the chosen app; confirm Console's user-action sharing exception rather than blindly reporting all network transfers as third-party data sharing.

The app requests notification, internet/network, wake-lock and media-playback/download foreground-service permissions. It is a listening app, not the website Studio recorder. These permissions must match the final merged manifest, including transitive SDK permissions.

Confirm whether “app activity”, “other user-generated content”, “user IDs”, purchase history, device IDs and any other categories apply in the current Console questionnaire. Data encrypted in transit is supported by the app's HTTPS-only configuration; inspect all backend processors before attesting globally. “Users can request deletion” must not be selected as operational until the real deletion workflow is implemented and tested. No data-sold/no-sharing claims can be finalized without owner confirmation of all business processing.

Before submission: publish the approved privacy policy and deletion page; finalize retention and linked-role deletion scope; review every SDK; answer the form against the final binary/backend, not this preview alone. New billing, ads, analytics or server-side recommendations require a fresh review.
