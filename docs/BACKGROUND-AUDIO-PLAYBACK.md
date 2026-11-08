# Background audio playback repair

Reported on Redmi 16 C and Oppo Reno 8T: foreground song-to-song playback works, but audio stops after locking the screen or at a track boundary.

## Focused change

The existing persistent native audio element and queue remain in use. Previously a transition explicitly paused the element, removed its source and called `load()` before awaiting the next stream URL. Even the normal no-ad decision introduced an asynchronous boundary. This could leave a background page without active media while it waited for JavaScript/network work.

The player now prepares one upcoming source during the final 90 seconds of the current song. It preserves the selected shuffle/repeat choice, discards preparation after queue changes and uses a two-minute freshness limit. A ready next song starts in the native `ended` handler without first pausing, clearing or loading an empty element. The current element buffers normally with `preload=auto`. A slow, unprepared transition retains its current source until the replacement is available. Speculative network failures do not interrupt the current song, and retries are limited. Signed URLs remain memory-only and are not saved to browser preferences.

Explicit pause cancels pending continuation and is respected even if an end callback is already queued. Media-session controls continue to use the same player. Automatic playback does not start on page load or after a deliberate pause, and repeat-off still stops at the end of the selected list.

The existing between-song ad adapter prepares its decision while music is playing. A ready no-ad decision is synchronous. Advertising remains disabled by the unchanged approved manifest; no advertiser account, creative, ad frequency or Premium exclusion policy changed.

Offline preparation decrypts only the upcoming song. The current blob stays valid until the replacement is selected; discarded, stale and superseded blobs are released. A prepared offline source is checked again against the owner, device, permission, grant deadline and existing clock guard before use. Removal, reverification, logout/account changes and cross-tab revocation invalidate prepared sources. Preparation neither starts a play report nor bypasses existing entitlement or royalty checks.

Public shell cache v21 delivers the new player/offline resources without resetting encrypted songs or device keys. No database/schema, account, Studio, UI layout, colours, package, payment or commission changes.

## Verification

- `node --test tests/player.test.cjs tests/offline.test.cjs`: 31 passed. Includes synchronous native-end transitions, slow-source handoff, explicit-pause cancellation, unchanged play-report idempotency, prepared-choice/shuffle reuse, changed-queue disposal, late offline blob disposal, expired grants, failure retry limits and prepared ad decisions.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium npm run test:player:browser`: passed native guest/Premium autoplay and next/back at 320/393/1440px and sound recovery at 320/360/393/1440px.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/offline-browser.cjs`: desktop/mobile real encrypted PWA installation and upgrade, saved audio retention, offline playback/continuation, expiry and clock safeguards, sync/cleanup and two accessibility audits passed.
- `LAE_XVFB_BINARY=/tmp/lae-xvfb/usr/bin/Xvfb LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/background-playback-browser.cjs`: genuine headed Chromium test with native background lifecycle; guest, Premium and artist cases. Verifies two natural song endings with `document.hidden=true`, prepared-source reuse and explicit media-session pause/resume. It uses a clean local profile, local generated test audio and fixture APIs, with no autoplay overrides or fabricated visibility. Playwright's normal forced-focus defaults are disabled for this test. Xvfb runs on a private local display with TCP disabled; CI uses the Xvfb installed by Playwright browser dependencies.
- JavaScript syntax and whitespace checks passed. No paid providers, ad networks, real listener accounts or customer credits were used.

## Practical verification still required

A hidden desktop browser window is not a physical Android lock screen. Redmi/Oppo lock-screen playback and lock-screen media buttons must be checked after an approved deployment using the actual phones and browser. A website cannot guarantee playback if Android kills the browser, the tab is closed, connectivity is lost during online streaming, or the device powers off. This repair does not use silent-audio loops or keep the display awake to evade these restrictions.

The change is isolated on `codex/background-audio-playback`. Production remains unchanged until deployment approval. The previous production commit `d66e6da9ca30b109568eaa95c4c04e438321a935` remains available for rollback.
