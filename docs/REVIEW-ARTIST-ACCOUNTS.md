# Artist profiles and separate sandbox test logins

The owner created a temporary Neon child branch and saved its connection string as the GitHub Actions secret `SANDBOX_NEON_DATABASE_URL`. The public sandbox must never connect directly to that unmasked database or to production.

## Import boundaries

The existing sandbox configuration workflow consumes the source secret only inside its GitHub runner. It requires a verified-TLS Neon PostgreSQL endpoint different from the live endpoint, including rejection of the production endpoint's pooler alias. The PostgreSQL connection defaults to read-only and opens a repeatable-read READ ONLY transaction, then confirms `transaction_read_only=on`.

The query projects only artist ID, display name, country, biography and selected package. It never selects email, password/hash/salt, sessions, recovery/MFA tokens, bank/payout data, subscriptions, balances, commissions or private music. Unexpected fields, duplicate identities, unknown packages, more than 1,000 artists and snapshots larger than 48 KB are rejected rather than silently truncated. No SQL writes are issued to the Neon branch or production.

Only this validated metadata is stored in the sandbox's protected `LAE_REVIEW_ARTIST_SNAPSHOT` environment value. The Neon URL and live credentials do not go to Render. Production environment/deployment fingerprints and sandbox-only Render mutation checks remain in force. The existing live database, users, R2 bucket and API configurations remain intact.

Startup imports into the exact loopback review database and verifies its actual name/host/port before writes. A transaction/advisory lock attaches existing public artist mappings to their copied songs and creates missing artists without duplicates. Every profile uses a reserved `.invalid` email and independently generated unusable credentials, with inactive `review_imported` membership. Selected package metadata is retained; no payment, subscription, generation credit, commission or balance is fabricated. Reimport does not overwrite test edits or reset passwords.

Once saved, the validated metadata can be reused after the one-day Neon branch expires. A refresh is an explicit operation. The review database itself is still ephemeral: profile metadata is restored after redeployment, but test passwords and subsequent test activity can reset. The live platform's original passwords are unaffected.

## Owner testing

1. Open the existing Review Sandbox's `/admin/console` and sign in as its owner using its separate sandbox administrator credential.
2. Open **Artists**, then **Sandbox artist test login**.
3. Select an imported artist, note the synthetic sandbox email and set a new test password. Both fields have Show/Hide controls and matching validation.
4. In a separate private/incognito window, open `/join?role=artist` and sign in with that synthetic email and new test password. This keeps the administrator session out of the artist test.
5. Verify profile, workspace and copied published songs. This does not grant an active paid package or the still-undecided free music-generation promotion.

Only owners may list imported test accounts or set their passwords. Production returns 404 for these controls; artists and non-owner operators cannot use them. Resetting a password locks the linked copied account, revokes only its local sessions and creates an audit entry without credentials. It cannot target an ordinary unrelated account.

## Verification

Unit tests cover read-only SQL projection, endpoint/pooler isolation, secret redaction, closed source connections, strict snapshot fields, connected-database isolation, repeat-safe imports, owner scope and limited password/session changes. Configuration tests confirm no Neon URL reaches review environment writes and that a cached sanitized copy survives source expiration.

The actual 512 MB review-container smoke test imports an isolated profile fixture, rejects anonymous access, sets a test password as owner, authenticates that artist through the existing login/session implementation and checks that no paid generation entitlement appeared. The browser journey exercises the owner form, both eye controls and clearing the submitted password on desktop/tablet/mobile.

After an authorized real import, the hosted verifier checks a copied artist (preferring one with published songs), its existing login/session, catalog ownership, lack of paid entitlement and denial of administrator access. It uses a temporary random password, replaces it with an unknown random value afterward, and signs out its sessions. It prints counts/booleans only. The owner then assigns their own test password in the UI; no shared default password is published.

Real import and hosted results must be recorded separately from mocks and local fixtures. This is not restoration of original login credentials, unpublished songs, financial records, voice training or verified real music generation, and does not authorize production deployment.
