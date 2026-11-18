# Android inspection and release gates

## Owner inspection

The current build is an internal listening preview. Validate the Discover composition against the owner's final image, which was not attached to the Android instruction. Implemented from the written description; exact visual-reference acceptance is pending.

- Verify real account sign-in (including previously linked artist/listener accounts), social actions and playlists with two owner-controlled listener accounts.
- Confirm actual Premium access with the already-paid listener account; no new payment is necessary.
- Save songs, wait for “Saved on this device”, disconnect, play multiple saved tracks, restart the app and reboot. Files should remain. Reconnect daily for the existing signed licence policy; storage persistence and entitlement expiry are separate.
- Test 30–60 minute sessions on the Redmi and Oppo phones, including locking/unlocking, Bluetooth/headphones, calls/audio focus, Wi-Fi/mobile handoff and temporary network loss. Emulator checks cannot certify vendor battery behavior or physical Bluetooth hardware.
- Check accessibility, large fonts, slow connections, low storage, pause/retry/delete and account switching. A saved file must remain unavailable to a different account.

## Google Play — not enabled

Required before any app purchase or publication:

1. Owner's Play Console developer account and confirmed package ID/app listing.
2. Owner-approved subscription products/base plans and localized prices. Do not copy website prices into Play or invent product IDs, taxes or store fee rules.
3. A server-only Google Play Developer API service account with access to this app; securely configured Android Publisher OAuth and RTDN/Pub/Sub authentication.
4. Implement and test server entitlement synchronization into the existing listener/payment/royalty records. Bind purchase tokens uniquely to the verified listener using obfuscated account identity; verify package, product, purchase state and expiry with Google's API; handle pending purchases, acknowledgements, renewals, grace/hold, refunds/revocations, duplicate notifications and account switching. Do not treat a website receipt or client callback as a verified Play receipt.
5. Verify actual Google price/currency and cost/settlement evidence under the existing royalty rules. Missing store cost evidence must hold financial allocation, not invent fees or change percentages. Affiliate treatment of app-store purchases needs explicit approved applicability; do not silently create a new commission category.
6. Licensed tester / internal-track purchases, including restore, cancellation, renewal and refund, must pass before enabling `PLAY_PURCHASES_ENABLED`. Never enable that flag alone without the backend integration.
7. Stable private app-signing key, Play App Signing, upload key, package ownership, privacy policy/Data Safety, content rating, foreground-service declarations (playback and downloads), copyright/content-report handling and account-deletion route review. No release keys in Git or APK.
8. Publish `/.well-known/assetlinks.json` for the approved production package and signing certificate on the owned domain, after approval. Intent filters are prepared; verified automatic App Links remain pending this association. The HTTPS song link remains the website fallback.

## Verification status

See the Android Actions run and final development report for executed results. Source implementation is not proof of physical-device playback, existing-account sign-in, real premium offline delivery or Google Play purchase synchronization. Do not label the application production-ready while these gates remain incomplete.

The preview uses debug signing. Repeated CI builds need a stable protected preview signing key to install updates over the same app without uninstalling; CI's default ephemeral debug keys are not release credentials. Never ask owners to uninstall and lose downloads merely to work around a signing mismatch.
