# Google Play readiness — 18 November 2026

**NOT READY FOR GOOGLE PLAY SUBMISSION.** Owner reports no Play Console developer account or app listing yet. No Play publication, live purchases, website deployment, payment changes or production metadata changes were made.

## Prepared in this branch

Native Kotlin/Compose app, production ID `com.laemusic.listener`, minimum API 26, target/compile API 36, version code 3. Disabled Billing Library 8.0.0 is within the current submission support window; supported library presence is not a completed purchase integration. No Firebase required.

Release bundle task `:app:bundleRelease` uses R8 and produces `app/build/outputs/bundle/release/app-release.aab`. Without all four owner upload-signing environment values it is deliberately **unsigned**, suitable for build review but not uploading to Play. Partial signing configuration fails rather than falling back to debug signing. Mapping files must be retained for the exact uploaded version. The existing debug preview key is not a production signing key.

Prepared listing text under `listing/en-US`, approved-logo store assets under `assets`, privacy draft, Data Safety worksheet, deletion design, catalogue metadata review and this checklist. Policies/listing text remain drafts until approved and their described features are verified. Actual catalogue screenshots come from the device-test evidence, not synthetic test artists.

Preferences/ranking are local, account-scoped and separate from royalty accounting. They do not create a global ranking service or learn across devices. A fair-exposure slot gives less-exposed matching artists a chance every five positions, without inventing popularity or guaranteed plays. Full metadata coverage still needs editorial confirmation and authorized publishing/backend work; see METADATA-REVIEW.md.

## Owner actions

1. Create a [Google Play Console developer account](https://play.google.com/console/signup). For a real business, an organization account representing LAE MUSIC VENTURE is appropriate if legal details can be verified. Supply the business details, address, website, verified contacts, payments profile and D-U-N-S information requested by Google. Do not send identity documents or secrets in chat. Google charges a one-time registration fee; pay directly to Google. Confirm the actual account requirements during registration.
2. Create the LAE-MUSIC app listing and confirm the permanent production package ID `com.laemusic.listener` before uploading any bundle. Enrol in Play App Signing and keep an owner-controlled upload key/backups. `scripts/create-upload-key.sh` is an interactive helper; it never creates or uploads a key automatically. Configure `LAE_UPLOAD_KEYSTORE_PATH`, `LAE_UPLOAD_STORE_PASSWORD`, `LAE_UPLOAD_KEY_ALIAS`, `LAE_UPLOAD_KEY_PASSWORD` only in a trusted signing environment. Do not commit keys/passwords.
3. Approve the final listing, privacy/retention/deletion policies, public contact details, target age groups, country availability and content-rating answers. The content is creator-uploaded; a Gospel preference is not proof that every item is suitable for every age. Establish review/support capacity. Supply a dedicated reviewer account with existing legitimate entitlements through Console's private app-access instructions, not a public repository file.
4. Configure actual Play subscription products/base plans and approve localized prices, renewal/cancellation disclosure, taxes and fee treatment. Do not assume website Monnify subscriptions automatically become Play subscriptions. Invite a least-privilege app developer/service identity for Android Publisher API and RTDN configuration once the app exists.
5. Authorize the narrowly scoped backend/deletion/moderation/policy work below. Website and production payment systems remain untouched here. Owner approval is needed before any live backend deployment.
6. Run internal/closed testing and Google's pre-launch report. If using a new personal account, Google currently requires 12 opted-in testers for 14 continuous days before applying for production access; organization accounts have their own verification gates. Owner's successful one-hour locked-screen test is useful evidence but does not replace required Play testing.

## Remaining implementation and verification blockers

| Gate | Actual state / required completion |
|---|---|
| Play Billing | Client scaffolding is disabled, not connected to purchase UI; `/api/platform/android/play/verify` is not implemented. Requires server Google receipt verification, unique account/token binding, acknowledgement, RTDN authentication/deduplication, restore/renewal/grace/hold/refund handling and approved financial integration into existing subscription/royalty records. Test licensed purchases; never grant access from a client callback. No payment logic changed in this task. |
| Privacy policy | Draft prepared, not approved or published at a verified public URL; add a working in-app link only when it exists. |
| Account deletion | No completed in-app + external request/fulfilment path. Linked artist/listener accounts, financial retention and music ownership need approved scope; design prepared without deleting anything. |
| Public comments / UGC | Existing real comments and song/comment reporting remain. Verified block-user functionality and explicit terms acceptance before posting are not complete in the reviewed Android workflow. Add author-ID-based blocking plus backend enforcement/moderation, not matching names or a decorative button. |
| Signing / Console | No developer account/app, owner upload key or signed upload bundle configured; no submission has occurred. The unsigned bundle is not an upload-ready release. |
| Metadata | All 19 catalogue rows lack explicit family/categories; four Afrobeats rows and one unclear label need family review; seven broad Gospel labels need subcategories. No silent reclassification or production updates. |
| Physical release test | Owner confirmed existing APK background playback for about one hour. Repeat relevant preference/account tests on Redmi/Oppo and check offline restart/reboot, Bluetooth/audio focus, slow/failed networking and accessibility on the final signed candidate. Hosted emulator checks do not certify physical hardware or Play services. |
| Foreground services | Manifest declares media playback and data-sync download services. Complete Console's service declarations and a real short demo video showing user-started music/download controls. No screen-recording or boot-autoplay feature is added. |
| App Links | HTTPS song sharing has website fallback. Publish verified `assetlinks.json` for the final production package and Play signing certificate only after owner approval. Template already exists. |
| Store assets/reviewer access | Use real screenshots and approved assets; owner approves listing. Supply legitimate reviewer credentials/access privately. No account password or real customer data in screenshots. |

## Preview installation safety

The owner's installed `com.laemusic.listener.preview` build remains valid. It was signed by an earlier CI debug key, which cannot be recovered from the APK. This iteration uses **`com.laemusic.listener.preview.preferences`** and label **LAE-MUSIC Preferences Preview**, so it can be installed alongside the tested app without uninstalling it or deleting its downloads. Sign into this separate app normally; protected data does not migrate between apps. Future in-place preview upgrades need a stable protected preview signing key. Final production signing is a separate owner-controlled setup.

## Official requirements checked

- [Target API requirement](https://developer.android.com/google/play/requirements/target-sdk): API 36 for new phone apps/updates at this review date.
- [Billing support windows](https://developer.android.com/google/play/billing/deprecation-faq): v8 is accepted through 31 August 2027 under the current table; no unnecessary SDK migration performed.
- [16 KB page-size support](https://developer.android.com/guide/practices/page-sizes): inspect the final AAB for native libraries; Kotlin/Java-only apps support 16 KB without native rebuilding. Recheck if native dependencies are added.
- [Developer account details](https://support.google.com/googleplay/android-developer/answer/13628312) and [new personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465).
- [Store asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151), [user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [UGC moderation/blocking](https://support.google.com/googleplay/android-developer/answer/9876937).

Recheck policy/Console requirements against the final signed release; this dated audit is not Google approval.

## Binary review procedure

Run `python3 scripts/inspect-release-bundle.py app/build/outputs/bundle/release/app-release.aab` after building. The app includes the transitive Compose `libandroidx.graphics.path.so`; it is **not** a native-library-free bundle. Inspect all packaged ABIs and every 64-bit ELF LOAD alignment, then run the official bundletool `validate` and inspect the manifest/BundleConfig. The reviewed library has 16 KB ELF alignment. Check generated APK ZIP alignment separately with Android build-tools (`zipalign -c -P 16 -v 4`) and test a 16 KB Android device/emulator before release; ELF alignment alone is not an end-to-end runtime certification. Never mistake an unsigned AAB for a signed production upload.
