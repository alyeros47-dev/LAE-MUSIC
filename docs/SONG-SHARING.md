# Published-song sharing

Every published song card now has a visible Share action. The public song page has Share song alongside its existing actions. Playlist entries and an artist's published catalogue also expose sharing, while pending/private/removed entries do not. The existing song menu opens the same share interface.

Sharing is available to guests and signed-in listeners, artists and partners without registration or payment. It shares only the public `/discover?track=<id>` listening page and the public song/artist names. It never exports an audio file, studio upload code, signed R2 URL, customer email or private draft. Explicit unpublished statuses and malformed/non-numeric track IDs are rejected.

The dialog offers:

- Share on WhatsApp: a URL-encoded `https://wa.me/?text=...` link. The visitor chooses the recipient or group in WhatsApp and confirms sending. This is link sharing, not a WhatsApp Business API connection, automatic group posting or WhatsApp sign-in. No API key is required.
- More sharing options: the browser/phone's native share sheet when supported; available target applications depend on the device. Cancellation and unsupported/blocked native sharing leave WhatsApp and copying available.
- Copy song link: browser clipboard where available, with a selectable read-only URL and manual-copy instructions when clipboard access is unavailable or refused.

No messages are automatically sent. No share counter is added because opening a share sheet is not proof a message was delivered. Existing playback, likes, comments, account requirements for other actions, payments and generation are preserved. The WhatsApp destination opens with `noopener noreferrer`; no social SDK or tracker is loaded.

## Validation

`node --test tests/song-sharing.test.cjs tests/platform.test.cjs`: 20 passed. Checks public-only payloads, invalid/private inputs, Unicode/URL encoding, actual unauthenticated module serving and existing platform guards.

`LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/song-sharing-browser.cjs`: passed at 390px and 1440px. Uses the actual frontend with intercepted API responses and stubbed browser sharing; verifies discovery cards, public details, artist catalogue, playlists, guest access, no draft sharing, WhatsApp URL, successful copy, clipboard fallback, native share/cancel/failure/absence, no API writes, no page errors, no horizontal overflow and zero automated accessibility violations. It does not send WhatsApp messages or prove delivery in a real phone app.

Both test files are included in the existing application/browser CI runners. No database migration, storage mutation or paid provider call is needed.

## Separate next milestone: social sign-in

Google, Facebook and TikTok sign-in are not currently integrated. They require official provider applications, approved redirect URLs and securely configured provider credentials, followed by callback and account-linking tests. The implementation must preserve existing users and roles and avoid duplicate accounts or unsafe automatic account linking. Unconfigured sign-in buttons must remain hidden. Native sharing/WhatsApp link sharing does not implement social authentication.

This branch implements song sharing only. Production remains unchanged pending owner approval of a tested release. The separate purchase-first registration/payment work is not activated by this change.
