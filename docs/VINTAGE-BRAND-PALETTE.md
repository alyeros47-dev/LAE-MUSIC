# Vintage colour draft — original logo files pending

The owner requested a colour and logo update while preserving the current layout, settings and working features. This draft changes the public interface from green to warm charcoal/espresso surfaces, antique-gold accents and ivory text. Typography, geometry, content, buttons, links and application logic are unchanged.

| Use | Colour |
| --- | --- |
| Page background | `#151210` |
| Main panels | `#1f1b18` |
| Raised surfaces | `#2a2420` |
| Primary accent | `#e2bf7b` |
| Main text | `#f6eedf` |
| Secondary text | `#c0b5a5` |

The existing `--lime` variable name remains for compatibility; its value is antique gold. Existing red error treatments and artist images remain intact. Browser/app theme colours follow the page background. Public offline-shell cache v20 refreshes the appearance without deleting encrypted songs or device keys. The offline test derives the current/prior shell names so future appearance-only releases do not depend on hardcoded cache versions.

## Verification

- Removing colour literals from the before/after CSS produces identical content: selectors, sizes, positions, spacing and layout rules are unchanged.
- HTML body bytes are unchanged. App-manifest settings are unchanged except background/theme colours. No server, Studio, payment, membership, referral or royalty code is modified.
- Contrast ratios: main text 16.18:1, secondary text 8.46:1, gold links 9.75:1, primary-button label 9.82:1, form labels 14.16:1, placeholders 7.30:1 and input boundaries 3.66:1.
- Existing Chromium customer journeys passed 53 accessibility audits at desktop, tablet and mobile sizes, using mocked payment/media services.
- Native automatic playback and skip controls passed for guests and Premium at 320/393/1440px. Existing mute/volume recovery passed at four widths.
- Actual encrypted PWA tests passed at desktop/mobile, including installed-shell upgrade with two saved songs, offline progression, skip controls, access expiry, clock checks, exactly-once sync and account cleanup.
- No paid provider calls, customer credit use, production writes or deployment.

## Remaining logo work

Both supplied logo pictures are visible in the conversation, but their downloadable image files are not present in the execution workspace. They have not been redrawn or substituted. Exact source files are required before installing the wide wordmark and compact branding. Existing logo/placeholder assets remain in this draft until those files arrive. Request both originals in a ZIP to preserve the exact artwork.

Local preview screenshots: `artifacts/vintage-palette-1440.png` and `artifacts/vintage-palette-393.png`. These previews show the colour draft with the existing logo. Production remains unchanged; this draft is not complete for deployment while the original logo assets are missing.
