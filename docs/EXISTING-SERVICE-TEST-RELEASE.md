# Existing-service artist testing release

This is a proposed controlled testing release of the redesigned platform to the existing LAE-MUSIC service, not certification that every commercial/payment requirement is complete. Production merge/deployment remains separate from backup verification.

## Verified recovery evidence

[Actual recovery run 40647956016](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/40647956016) verified a private backup branch of the existing production database and streamed a real restore into an isolated disposable CI database. All **45 original tables and 223 original records** matched through all **21 migrations**; repeating migrations was a no-op. The private local database was removed. Production SQL writes were zero; the production database was not replaced/restored and its Render environment comparison remained unchanged.

Retained backup: `br-gentle-mud-b4iztfzt`, requested expiration **2026-11-04 06:46:43 UTC**. This is November 3 at 10:46:43 p.m. Pacific Standard Time. It is a point-in-time copy, not ongoing synchronization. Check that it is still usable and sufficiently current before a later production migration. No public sandbox is connected to it.

The first attempt successfully created/read the backup but Neon rejected a second cloud child (HTTP 400). The revised private CI restore exposed a container TLS trust issue, corrected with a read-only host CA mount while retaining full certificate/hostname checks. A cross-database fingerprint ordering mismatch was corrected using explicit C collation. Failed attempts are not counted as successful restore verification. No raw dump or private records were published.

## Retained service and settings

Keep the existing LAE-MUSIC Node service, `npm start`, production database and R2 bucket. Keep current API keys, account credentials and object references. Do not deploy the review Docker image, copy its temporary database or apply `LAE_REVIEW_*` variables.

At the approved release, set the two new feature settings needed for the owner's testing flow:

```
LAE_ARTIST_TEST_ACCESS=1
GENERATED_MEDIA_ALLOWED_HOSTS=cdn1.suno.ai,cdn2.suno.ai,audiopipe.suno.ai,files.musicapi.ai
```

The first enables the tested persistent two-lyrics-credit/two-music-request programme without a paid subscription. Existing paid entitlements and historical credits remain. The second enables owned generated-audio/artwork saving through the existing R2 release importer, using the exact verified media hosts. The release worker must not be explicitly disabled for private saving to run. Preserve other environment settings rather than replacing them with a template.

Keep `config/payment-merchant.json` checkout disabled. Do not activate real-money operations, fabricate test receipts or enable payouts. The practice commission page is an explicitly separate illustration, not gateway verification. Paystack/Flutterwave test configuration and settlement/payout work remain outstanding; the initial free testing release does not require pretending they have passed.

## Before changing production

Confirm the precise candidate's CI/upgrade evidence and review the change since the last tested commit. Run initialization checks on the private restored data before claiming existing-engine compatibility. An upgrade run must preserve pre-existing records and migration checksums. Do not restore production, reset records or point automated CI tests at it.

Final live R2 write/voice checks remain separately pending under the owner's storage-test deferral. Existing published songs have passed read-only audio Range checks, and real review-provider generation/exports previously passed. Those facts do not certify new production uploads. Arrange a controlled first-upload test with new owned objects; never attach the public sandbox to live storage or delete existing music.

After an approved existing-service release, verify fresh registration → logout → login → lyrics → music → owned downloads/artwork/private saving and existing catalog playback. Test existing sessions/account recognition without exposing passwords. Record actual live outcomes separately from mocks. Do not issue the final commercial deployment-ready announcement while required external/payment, offline-signing, email, operational or storage verification remains incomplete.
