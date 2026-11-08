# Glossy black and amber draft — original logo files pending

The interface uses a near-black canvas, neutral graphite panels, bright amber-gold accents and white/silver text. Main actions have a light metallic sheen; secondary actions have restrained graphite gloss. Typography, dimensions, spacing, content and application logic stay intact.

| Use | Colour |
| --- | --- |
| Page background | `#050609` |
| Main panels | `#101217` |
| Raised surfaces | `#191c23` |
| Primary accent | `#ffc238` |
| Main text | `#f8faff` |
| Secondary text | `#b9c0ce` |

The existing `--lime` name remains for compatibility; it now holds bright amber. Added finish rules use only background, border colour, shadow and text colour. Existing red error treatments and artist images remain intact. Browser/app theme colours match the background. Public offline-shell cache v20 refreshes appearance without deleting encrypted songs or device keys; the existing offline test derives cache versions dynamically.

## Verification

- Existing base CSS is identical after colour literals are removed. Added finish rules contain paint-only properties.
- Actual browser bounding rectangles match the current production layout at 1440px and 393px for the hero, headline, actions, sidebar, topbar and footer.
- Full-page accessibility checks, including a temporary fixture of input, textarea, select and primary/secondary/danger actions, passed at both widths. This fixture is not part of the website or screenshots.
- Contrast ratios: main text 19.40:1, secondary text 10.25:1, amber links 11.62:1, primary label against the darkest gradient stop 10.17:1, placeholders 8.89:1 and input boundaries 3.79:1.
- Native guest/Premium automatic playback and skip controls passed at 320/393/1440px. Mute/volume recovery passed at 320/360/393/1440px.
- Existing offline upgrade/encryption/expiry checks passed before this paint revision; their code and behaviour are unchanged. No payment, membership, commission or database logic was modified, and unrelated backend tests were not repeated.
- HTML body is unchanged; app-manifest settings differ only in appearance colours. No paid providers, customer credits, production writes or deployment.

## Logo and preview status

The supplied logo pictures are visible in the conversation, but their original image files are unavailable in the execution workspace. Existing logo assets have not been redrawn or substituted. Install the supplied wide and compact logos once their exact files arrive, preferably together in a ZIP.

Preview screenshots: `artifacts/glossy-black-amber-1440.png` and `artifacts/glossy-black-amber-393.png`. These isolated colour previews use sample API responses and the existing logo; they do not show a changed live catalogue. Production remains unchanged. This draft is not complete for deployment while original logo assets remain missing.
