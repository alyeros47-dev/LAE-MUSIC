# LAE-MUSIC Android listening app

Native Kotlin / Jetpack Compose listening application. The existing website and PostgreSQL backend remain authoritative; this project creates no separate business, user database, catalogue or royalty calculation.

**Development preview, not a Play Store release.** Current verification results and outstanding release gates are in `docs/RELEASE-CHECKLIST.md`.

## Architecture

- Compose: full-screen vertical Discover pager, portrait artwork with undistorted square fallback, Discover/Explore tabs, and exactly Home / Discover / My Music / Downloads / Profile.
- One Media3 ExoPlayer in a foreground `MediaSessionService`: complete queues, automatic transitions, system notification/lock-screen controls, audio focus, noisy-headphone handling, network retries and bounded upcoming-stream buffering. The Activity never owns track transitions.
- Existing HTTPS APIs at `https://lae-music.com` (the existing Render service also serves `lae-music.onrender.com`). Real catalogue, artist pictures, likes, comments, follows, sharing, playlists, history and listener accounts. No production sample songs or fake engagement.
- Android Keystore-protected session cookies. Existing artist users can explicitly connect listening through the existing role-link API; no new email, paid artist permission or creator tools are introduced.
- WorkManager and SQLite manage download state. Protected media lives in app-private `noBackupFilesDir`, encrypted in authenticated, seekable AES-GCM blocks. There is no MP3 export or file-provider sharing route.
- Existing server-signed P-256 offline grants and device challenges are used without bypass. Current policy is a daily online licence refresh, bounded by subscription expiry. **Expired licences lock playback; they do not delete saved files.** Account/device binding and app restarts/reboots preserve protected files and keys. This is app protection, not a claim of commercial DRM or immunity to rooted devices.
- Premium stream heartbeats use the current server validation. Offline listening events use the existing signed sequence protocol. A preload, swipe, skip, pause or seek does not itself qualify as a payable stream. No royalty percentages or financial calculations are changed.
- Google Play Billing client scaffolding is disabled. A purchase callback never grants access locally. Server-verified Play entitlement synchronization, product configuration and financial source integration remain release gates; website subscriptions currently use the existing authenticated entitlement endpoint.

## Build

JDK 17, Android SDK 36 / build-tools 35.0.0, Gradle 8.11.1 (wrapper with distribution checksum), Kotlin 2.1.20, AGP 8.10.1. Supports Android 8.0/API 26 and newer; targets API 36.

```sh
cd android-app
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
```

Install `app/build/outputs/apk/debug/app-debug.apk`. The inspection package is `com.laemusic.listener.preview`; production namespace remains `com.laemusic.listener`. The preview connects to the real catalogue. Sign in with existing listening credentials. Do not clear app data or uninstall when testing persistence; those Android actions intentionally remove private app data.

The GitHub Android workflow uploads the inspection APK, unit/lint reports, and emulator evidence. Instrumented tests use synthetic audio and an interceptor that prevents production calls. A separate short guest catalogue smoke check reads public music for less than the qualification threshold; no purchase or generation is requested.

## Boundaries

No Studio, lyrics generation, voice recording, artist upload, publishing, affiliate management, payment credentials or private API keys are included. The website, backend business rules, package prices and royalty/commission calculations are untouched. No Android purchase, Play publication or production website deployment is authorized by this preview.
