# LAE-MUSIC Android — Stage 2

This is a separate Android-only application connected to the existing LAE-MUSIC backend at https://lae-music.onrender.com. It does not change the live website.

## Implemented in source
- Native Android song list, search, and online Media3 ExoPlayer audio player.
- Uses existing public `GET /api/music/tracks` and `GET /api/music/tracks/{id}/stream` APIs.
- Playback controls: play, pause, resume, replay; buffering and error states.
- The server returns time-limited R2 streaming URLs.

## Build and test
Open this `android-app` folder in Android Studio with JDK 17 and Android SDK 35. Allow Gradle sync (Android Gradle Plugin 8.7.3; Kotlin 2.0.21). Build and run on a physical Android phone or emulator with internet access.

**Not yet compiled, installed, or device-tested.** This repository does not currently include a Gradle wrapper; Android Studio can be used to configure/build with a compatible Gradle installation. Verify streaming against actual published tracks and Cloudflare R2.

## Not yet implemented
- Android background playback and media notification (playback currently pauses when the app goes to the background).
- Premium listener subscriptions and Google Play Billing.
- Secure offline storage and entitlement expiry.
- Free-tier advertisements.
- Validated royalty accounting for Android playback (the native player deliberately does not report a payable stream until anti-fraud rules are designed).
- App signing, icon, store listing and Play Store publishing.

Do not sell premium offline access until subscriptions, verification, and offline playback are fully implemented and tested.
