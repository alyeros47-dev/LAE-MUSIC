# Continuous playback repair

After a listener starts a song, the player advances automatically through its song list. Guests and Premium listeners use the same player. Saved Premium music uses the same progression with a fresh offline-license check for each song. Existing shuffle, repeat and deliberate pause settings remain in effect; a completed list stops when repeat is off.

Song menus retain the displayed collection. Song pages retain an existing collection containing the chosen song; a fresh shared-song page loads the public discovery collection using the listener's saved music preferences. An unavailable discovery request does not prevent playing the chosen song. No extra music generation, credit use or account requirement is introduced.

Previous and next are visible, finger-sized controls on phones, with scalable icons that do not depend on installed fonts. Previous skips to the prior track even after several seconds of playback. Reaching the end no longer inserts a false previous-track history entry. Offline transitions release obsolete decrypted audio URLs while retaining encrypted storage and access checks.

Verification uses generated local audio, synthetic service responses and actual browser media events, not paid APIs. Coverage includes guest/Premium playback, native ended-to-next transitions from discovery/cards, menus and shared-song pages, next/back controls, the expanded player, saved listening preferences, intentional pause on reload, sound/mute recovery, offline reload and multi-song playback, expired access, clock rollback, encrypted storage, duplicate listening reports and account/device cleanup. Player unit and browser commands are `npm run test:player` and `npm run test:player:browser`; the offline security journey remains `node tests/offline-browser.cjs`.

Production settings, account records, payments, commissions, Studio and music-generation code are unchanged. Initial playback still requires the listener's first Play action, in accordance with browser media rules. Physical-device/background playback behavior must be checked on the listener's actual phone; browser emulation does not establish OS background support.
