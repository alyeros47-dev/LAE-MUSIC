# LAE-MUSIC Android — Phase 1

This is an **Android-only starter app** that displays the existing LAE-MUSIC listener music catalogue at https://lae-music.onrender.com/music. It does **not** modify the website, backend, database, artist subscriptions, or royalty rules.

## Status
- Android project structure and app entry point committed.
- Requires Android Studio, JDK 17, Android SDK 35, and network access to Gradle dependencies.
- **Not yet compiled or tested on an Android device.**
- This initial version is a WebView-based online listener shell, **not** a finished native streaming player.
- Offline downloads, background audio controls, monthly payments, ads, offline-play reconciliation, and anti-fraud logic **are not implemented**.

## Build
Open `android-app/` as the project root in Android Studio. Allow Gradle sync. Build and run on an emulator or Android phone. The project uses AGP 8.7.3 and Kotlin 2.0.21.

## Next engineering stages
1. Test existing listener catalogue and playback in the Android app.
2. Add native player and background playback with Media3.
3. Add secure app-managed offline cache and reconnect verification.
4. Implement paid listener entitlement and Play Billing with backend verification.
5. Add compliant ad inventory for free listeners and fraud-resistant royalty accounting.

No subscription money should be collected until payment verification, refund handling, and entitlement expiry are implemented and tested.
