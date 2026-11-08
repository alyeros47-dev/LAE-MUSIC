# Approved glossy black, amber and original logos

The interface uses a near-black background, neutral graphite panels, bright amber accents and white/silver text. Main actions have a bright metallic sheen; secondary actions have restrained graphite gloss. Existing navigation, wording, forms and application behaviour are preserved.

| Use | Colour |
| --- | --- |
| Page background | `#050609` |
| Main panels | `#101217` |
| Raised surfaces | `#191c23` |
| Primary accent | `#ffc238` |
| Main text | `#f8faff` |
| Secondary text | `#b9c0ce` |

The existing `--lime` variable name remains for compatibility; it now contains bright amber. Error styling and artist artwork are retained. Browser and installed-app theme colours match the background.

## Original approved logos

Both PNG files were extracted byte-for-byte from `LAE-MUSIC_Approved_Two_Logos.zip`. They have not been regenerated, cropped or recoloured.

- `web/lae-logo-wide.png` (2048 × 682): main sidebar wordmark, including the phone navigation drawer. SHA-256: `e59e058b753000e99e4472d7a76a9d248b4527e5d3413b1631a74fc5d9f25452`.
- `web/lae-logo-square.png` (1254 × 1254): home music feature, favicon, app icon and notification image. SHA-256: `add5a5e7d34250eb15f8db13357fe1034cc8ba42dbf87657847d4618933ce574`.

Images use contain sizing to preserve the complete artwork. The wordmark uses the existing header/spacing reservation; the music feature stays inside its existing box. On phones the decorative feature is smaller and sits beside the main action, without covering it. Old SVG assets remain available for compatibility and the monochrome notification badge.

Only the two new public image routes were added to the static whitelist. Public shell cache v20 includes both logos; cache upgrade logic, encrypted song storage and device keys are unchanged. The original PNGs total about 3.3 MB and are cached with the public offline shell.

## Focused verification

- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/branding-browser.cjs`: passed. Actual GET/HEAD image delivery, exact file bytes/dimensions, manifest/favicon references, decoded images, complete feature placement, unobscured action, no horizontal overflow and accessible home navigation at 320/393/768/1024/1440px. Full-page Axe checks passed at 393/1440px. Added to the existing browser CI runner.
- Isolated baseline comparison: hero, headline, actions, sidebar, topbar and footer bounding rectangles match production exactly at 1440/393px. Navigation starts less than one pixel from its previous position. Additional form/button contrast checks passed at both widths.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium npm run test:player:browser`: passed. Native guest/Premium automatic playback, next/back and saved song lists at 320/393/1440px; mute/volume recovery at 320/360/393/1440px.
- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/offline-browser.cjs`: passed. Desktop/mobile real service-worker installation and shell upgrade, retained encrypted songs, offline reload/playback, next/back, expiry, clock safeguards, key protection, sync, cross-tab cleanup and two Axe audits.
- Both PNG hashes match the uploaded ZIP. JavaScript syntax and `git diff --check` passed.

No Studio, account, payment, membership, commission, database or music-provider behaviour changed. No paid API calls or customer credits were used. Browser fixture updates only allow the new images to load with the correct MIME type.

## Review status

Preview screenshots: `artifacts/approved-brand-1440.png` and `artifacts/approved-brand-393.png`. These isolated previews use an empty catalogue fixture; they do not represent a changed live catalogue. The branding update is ready for review in Draft PR #35. Production remains unchanged; merge/deployment requires the owner's approval.
