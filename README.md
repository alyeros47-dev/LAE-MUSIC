# LAE-MUSIC Android testing download

This branch contains the tested Android UI preview APK only. It does not change or deploy the live website or application source.

Download: https://raw.githubusercontent.com/alyeros47-dev/LAE-MUSIC/android-preview-downloads/LAE-MUSIC-Android-Preview.apk

Source commit: 0da3f273f8434e2a8f72f93fdc2f0788d46c67c5
Draft PR: https://github.com/alyeros47-dev/LAE-MUSIC/pull/59
Verified build and device tests: https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/44237351958
APK SHA256: 73746070f537836de44481064451dc8a1882c2dd8e2c77958f6ca31959709419

This is an internal listening preview, not a Google Play release. Google Play purchases remain disabled. Real-account/device testing and the documented release requirements remain pending.

## Music preferences preview — 18 November 2026

Download: https://raw.githubusercontent.com/alyeros47-dev/LAE-MUSIC/android-preview-downloads/LAE-MUSIC-Preferences-Preview.apk

App label: **LAE-MUSIC Preferences Preview**. Package: `com.laemusic.listener.preview.preferences`. Installs separately from the original tested preview, preserving that app and its saved downloads. Sign in normally in the new app; local downloads do not migrate between separate packages.

Source: `bc1a68da22f8551a0095bb7628d2d37927ae2d9d` · Draft PR #59.
Verified CI: https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/44276739178
28 JVM tests; lint zero errors; seven device tests each on Android 15 and Android 16, including preferences/account isolation, locked-screen transitions and protected playback after reboot.
APK SHA256: `43830f57b2bf789c1aaf4f132f82e61fce6202690b598a27c7ae5354079be2e9`.

This is an owner inspection APK. Play purchases remain disabled. Google Play Console, signing, billing/deletion/moderation integration and policy/metadata review remain release requirements. The live website, existing payments and tested playback engine were not changed. This download branch is not merged into production.
