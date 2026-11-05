# Mobile silent-playback recovery

## Report and confirmed findings

The reported Redmi 15C played through every song with a moving playback timer but no sound across accounts on the same phone. That observation narrows the investigation to shared playback/device state; it does not by itself establish which phone setting caused the incident.

Read-only checks of the two published artists matching “Jane” found working audio storage and non-silent recordings. Both sampled MP3s decoded as 48 kHz stereo and returned HTTP 206 range data. Across the first 30 seconds, the samples had mean/peak levels of -26.0/-3.3 dB and -19.7/-1.6 dB. No private recordings, signed URLs, credentials or account data are committed here. No playback-count POSTs, provider requests, training operations or storage writes were made.

The shared player had three reproducible defects:

- A saved `volume: 0` in the browser-wide playback preference affected every account using that browser. Tapping Mute changed only `audio.muted`, so it could not restore a zero volume.
- Responsive CSS hid the mute button below 1200px. A phone user had no visible one-tap way to restore sound.
- Restoring preferences updated only the compact slider. The expanded slider could display 80% while the actual audio element remained at zero. Muted/zero-volume playback had no persistent sound-state message.

The new regression assertions failed on the original code. Native-media browser tests reproduce a moving timer at zero volume, then verify recovery using the repaired controls.

## Repair

- Keep a labelled, 44px speaker button visible on phones, tablets and desktops. New player code also works with a cached older shell: the added status span is optional, and the old class that hid the speaker is removed at runtime.
- Show a separate “Sound off · Tap the speaker” status without hiding buffering or stream errors.
- Treat either `muted` or zero volume as sound off. Unmute clears mute and restores the last positive volume, or the existing 80% default if an older preference has no recovery level.
- Synchronize compact/expanded sliders after restore and either control's input. Remember explicit mute and the last positive level across reloads.
- Respect intentional silence: restoring the page does not autoplay, and pressing Unmute alone does not start paused audio.
- Preserve the queue, play position, artist drafts and account data. No browser storage is cleared. No account, credit, stream accounting, generation, voice-profile, backend or database rules change.
- The expanded player also explains how to check device media volume and connected headphones/Bluetooth if site sound is enabled.

## Verification and limits

Focused checks cover legacy zero volume, chosen-volume recovery, slider synchronization, intentional mute/reload, corrupt recovery preferences, existing stream errors and unchanged publishing policy. Real-browser tests use production player/HTML/CSS and local non-silent WAV fixtures at 320px, 360px, 393px and 1440px, including Android-style touch contexts. They assert native media progress, visible touch controls, audible element settings, no autoplay, no lost artist drafts, no overflow and player accessibility.

Existing offline/PWA tests verify actual offline media playback, account cleanup and once-only synchronization. Wider customer/admin journeys check that the shared player layout still works. CI runs the focused sound browser tests on Chromium, Firefox and WebKit.

These checks do not certify a physical Redmi 15C, read Jane's local browser preferences or change Android media volume, Bluetooth routing or browser/site permissions. Jane's phone still needs a brief confirmation after the fix is available. The reported voice-training failure is separate: its explanatory fix remains in unmerged PR #28 and did not change live playback. No paid generation or retraining is authorized or needed for this repair.

## Rollout and rollback

Review this isolated playback repair before production deployment under the owner's standing approval requirement. The previous Studio-only publishing release remains intact. Rollback changes application code only; no database migration, environment change or storage restoration is needed. New preference fields are backward-compatible with the existing player storage key.
