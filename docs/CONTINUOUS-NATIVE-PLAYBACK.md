# Continuous playback and next-song byte buffering

The former player prepared only a signed address in the last 90 seconds of a song and discarded preparations after two minutes. It still required a native network request at the song boundary. Long songs depended on later progress callbacks to prepare anything. Repeat was off by default, so the end of a selected list stopped playback.

The player now prepares the next recording's complete original bytes as soon as the current song starts. It holds one upcoming recording in a temporary, revocable memory URL, switches the existing native audio element to that URL at the natural ending, and releases superseded buffers. The handoff needs no new media download. Buffered preparations do not expire merely because a long current song is playing; offline sources retain their existing entitlement and clock validation before use.

A same-origin, read-only audio relay supports this preparation without requiring storage CORS changes. It serves published recordings only, uses server-selected storage objects, enforces MIME/size/range checks, and streams unchanged bytes with backpressure and cancellation. It creates no play, royalty, payment or account records. Prebuffering neither persists unrestricted downloads nor grants Premium offline access.

Continuous queue repeat is the default, including migration of the old implicit repeat-off preference. A new explicit repeat selection is saved and respected. Deliberate Pause, next/back, shuffle, ready advertisements and saved offline-library rules remain in place. The public shell advances to v24 without deleting encrypted songs or device keys.

Focused unit checks cover early preparation of seven-minute songs, preparations surviving a six-minute interval, repeated queue wrap, intentional pause/stop preferences, exact buffered bytes, bounded memory and cancellation, original-file relaying, native byte ranges and unpublished-recording rejection. The native background browser test uses a local synthetic MP3, genuine hidden headed tabs, suppressed progress callbacks and blocked direct media requests, and checks multiple natural endings and wraparound for guest, Premium and artist sessions. No paid music provider is used.

Hidden desktop-browser tests do not establish behavior on a physical Android lock screen. The Redmi/Oppo screen-lock scenario still needs a real-device listening check after approved deployment. No silent-audio keepalive, screen wake lock or claim of playback after the browser is closed is included.
