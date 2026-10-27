# Studio delivery and affiliate verification

## Artist output delivery

Generated-song downloads are for the authenticated artist's own work. Listener permanent MP3 downloads, separate song purchases and download commissions remain disabled. The completed-output endpoint accepts task/clip identifiers, verifies the artist's ownership, obtains media only from the verified provider and delivers a real attachment with a safe filename. It does not accept an arbitrary URL. Existing media protections validate exact public CDN hosts, redirects, DNS, byte limits and file signatures. Default hosts come from the official Sonic task examples: https://docs.musicapi.ai/get-sonic-music .

Explicitly streaming/pending clips are no longer presented as finished downloadable songs. Results now display the provider's artwork, with the platform cover as a fallback, and offer separate audio and artwork downloads. Saved private drafts retain copied artwork and have an authenticated download that works without another music generation.

The existing private-release importer now has an isolated review filesystem adapter. It uses the same release database, ownership, copy leases, duplicate-save checks and publication flow. Files live under the temporary review media directory, not R2. In open review testing, publication uses the existing five-slot test upload allowance without inventing a paid subscription. A supplied generated upload code is checked for owner/title/one-time use in review uploads as well.

Private releases survive normal logout/login while that sandbox instance retains its database/files. They still cannot survive loss of ephemeral storage across every restart/deployment. Code alone cannot provide durable storage. No paid hosting/disk or production database connection was activated. Artists can download their own generated work for a durable personal backup; this does not enable listener catalog downloads.

## Lyrics and complete endings

The previous backend accepted 6,000 lyrics characters but silently submitted only 4,900, and did not pass the chosen target duration. It now sends every accepted lyric character, validates the documented Sonic v6 limit of 5,000 characters, passes an integer target duration and validates a conservative sung-word/character budget for that duration before reserving a music credit. The lyrics model receives the same duration budget and instructions for a resolved outro/end. Oversized model drafts restore the lyrics credit; user drafts are never silently cut.

The requested duration transfers from Lyrics Studio to Music Studio and remains editable there. The interface shows character/word guidance. Duration is a provider target, not a guarantee that every performance ends perfectly. Documentation: https://docs.musicapi.ai/sonic-instructions .

## Financial implementation and evidence

Referral attribution, free registration, team product volume, approved verified-sale commissions, dashboard reporting, duplicate receipt protection and refund journals are implemented. The isolated PostgreSQL suite executed 175 tests, including:

- Verified artist-package sales credit the approved direct percentages: Starter 15% of $6 ($0.90), Growth 25% of $10 ($2.50), Professional 25% of $20 ($5.00).
- Concurrent signed fixture settlement grants the package/commission once; replayed events for the same payment cannot mint another commission.
- Self-referrals, signup-only activity, client-supplied prices, unpaid/failed orders and forged evidence cannot establish commissions.
- Approved Premium listener commissions preserve the 10%/5% split, USD accounting and rounding safeguards.
- Pending commissions remain separate from withdrawable settled funds. Verified refunds reverse pending commissions through reviewable journals.
- Studio credit purchases do not invent an additional affiliate commission. There are no separate MP3 purchase/download commissions.

Those database tests use signed provider fixtures and authoritative lookup mocks, not real-money transactions. Interactive Paystack/Flutterwave test sales still require the existing secure test-provider configuration and approved merchant manifest. Live checkout, settlement and payouts are not enabled by this work. No production data or approved commercial percentages were changed.

## Verification boundaries

Application tests, browser journeys, isolated PostgreSQL/media fixtures and real sandbox provider checks must be reported separately. Real output download, artwork copying, private saving and recovery are verified after the sandbox rollout; no production-ready claim is implied. R2-specific production integration remains unchanged.
