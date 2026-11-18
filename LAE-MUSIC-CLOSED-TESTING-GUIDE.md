# LAE-MUSIC — Google Play Closed Testing upload

Prepared 18 November 2026. **The signed AAB is ready to upload as a draft release. Google Play publication and the 14-day test have not been started by this task.**

## 1. Download the correct file

[Download LAE-MUSIC-Closed-Testing-v3.aab](https://raw.githubusercontent.com/alyeros47-dev/LAE-MUSIC/android-preview-downloads/LAE-MUSIC-Closed-Testing-v3.aab)

Use Chrome on a computer, save the file, then select it from Play Console. This is an Android App Bundle for Google Play, not an APK to open or install directly on a phone. Keep its `.aab` extension.

| Item | Value |
|---|---|
| App name | LAE-MUSIC |
| Package | `com.laemusic.listener` |
| Version code | `3` |
| Version name | `0.3.0-preview` |
| Minimum Android | Android 8.0 / API 26 |
| Target / compile SDK | Android 16 / API 36 |
| Release type | Minified release; not debuggable |
| File size | 9,057,523 bytes |
| AAB SHA-256 | `4f4dbe55f4cd7162ee5ab842809e1d93d110747631a369dd91735a48d3fae55e` |
| Purchases | Google Play purchases remain disabled; existing verified listening entitlements remain in use |
| Ads | No ads or advertising SDK added |

This uses the existing production package, not either preview package. A Play-installed copy will be separate from the earlier preview apps and their local downloads. Existing LAE-MUSIC accounts and the existing backend are reused.

## 2. Upload in Play Console

1. Sign in at [Google Play Console](https://play.google.com/console). Finish any account identity, contact or device-verification tasks shown on your dashboard.
2. Open your LAE-MUSIC app. If no app entry exists, create **LAE-MUSIC**, choose **App**, the appropriate default language and **Free** installation, reflecting the existing free listening app. Category: **Music & Audio**. Complete Google's required declarations truthfully.
3. Open **Test and release → Testing → Closed testing**. Create or open a closed track; a name such as “Founding listeners” is suitable. This is a closed test, separate from production.
4. Choose **Create new release**. Accept Play App Signing terms and select **Google-generated / Google-managed app signing**. Google will protect the key used for installed apps. The separate key signing this AAB becomes the upload key. No private keystore needs to be uploaded for this default choice.
5. Under **App bundles**, select **Upload / Browse files** and choose `LAE-MUSIC-Closed-Testing-v3.aab`. Check that Console shows package `com.laemusic.listener` and version code `3`.
6. Give the release a simple name, such as **LAE-MUSIC closed test 0.3.0**. Suggested release notes: “First LAE-MUSIC listening test. Try music preferences, Discover, background listening, likes, follows and playlists. Eligible Premium accounts can also test protected offline music.”
7. Save the draft. Complete the required app setup and resolve Console's blocking messages before requesting review or starting the closed rollout. No production release is authorized by these instructions.

The successful upload itself is not a published test. Google may review the release, and the opt-in link may take time to become available. Console is the authority for its status. This workspace has no authenticated Play Console access, so upload acceptance and review cannot be verified here.

## 3. Items still required before a policy-ready closed release

The following unresolved items from the previous audit were not silently removed by signing the file:

- **Privacy and Data Safety:** approve and publish an accurate, public privacy page and provide an in-app link. The existing policy documents are drafts, not verified live URLs. Use the prepared Data Safety worksheet; do not claim the app collects no data. Accounts, comments, likes, listening records and existing entitlement checks use the backend. The new recommendation summaries remain local.
- **Account deletion:** the full in-app and outside-app request/fulfilment process remains unfinished. Linked artist/listener data and required financial retention need approved handling. Do not claim a working deletion process until it exists.
- **Public comments:** reporting exists; verified user blocking and explicit terms acceptance before posting remain incomplete. They require development/moderation work, not just ticking a Console declaration.
- **App access:** tell Google that some features require sign-in/Premium. Provide a dedicated, legitimate review account privately in Console for restricted features. Do not put its password in a public document or send it in chat.
- **Store and app-content setup:** approve the prepared description, icon, feature graphic and real screenshots. Complete target-audience, content-rating, country and foreground-service declarations. Owner decisions must reflect the actual audience and content. A short owner-recorded demonstration of music notification controls and user-started downloads may be required for the service declaration.
- **Payments:** this build does not introduce Google Play purchases or change website checkout. Play receipt/renewal/refund synchronization remains unfinished. Existing subscription access can be tested with an already entitled account; do not advertise in-app purchasing as complete. Review the external account-management links under the applicable Play payment rules.

These are real remaining requirements. **A technically valid signed AAB is not a claim of Google policy approval.** You can upload the bundle as a draft now; publication must wait for required fixes/declarations and Google's review. No website or backend feature was changed in this packaging task.

The earlier catalogue metadata review also remains: five songs need family confirmation, and seven broad Gospel labels need subcategories. Unclear family labels are confined to Both in personalized Discover. No production song metadata was edited.

## 4. Add testers and start the 14-day period

1. In the closed track's **Testers** tab, create an email list or Google Group. Add at least **12 real testers' Google accounts**. Invite extra people if possible so the group can keep at least 12 eligible participants.
2. Include the countries where your testers live in the closed test's availability settings. Set an appropriate feedback email, such as the existing business support email `laemusic067@gmail.com`.
3. After the test is approved and available, copy the actual **opt-in / Join the test** link from Console. No working Play test link has been created by this task.
4. Each tester opens that link while signed into the listed Google account, chooses to join and installs through Google Play. A directly installed APK is not a substitute for joining this closed test.
5. For new personal developer accounts subject to Google's rule, at least **12 testers must remain opted in continuously for 14 days**. The registration fee and a draft AAB upload do not start that period. Follow the counter in Console; keep testers enrolled and gather meaningful feedback while they use the app.
6. After satisfying the requirement, apply for production access in Console and answer Google's testing/readiness questions honestly. Production access is reviewed; it is not an automatic public release after 14 days.

No tester has to buy an artist package just to test free listening. Use normal individual LAE-MUSIC listening accounts for account features. Test protected downloads only with legitimately entitled Premium accounts; do not create fake payment approvals or repeatedly buy subscriptions for testing.

Suggested test tasks: choose preferences; swipe up/down through Discover; browse Home/Explore; play several songs with the screen locked; try notification/headphone controls; sign in and try likes/follows/playlists; for eligible Premium accounts, save songs and test offline playback after restart/reboot. Report the phone, Android version, steps and result. Do not promise that every physical-device condition has already been tested.

## 5. Signing identity and key custody

[Public upload certificate](https://raw.githubusercontent.com/alyeros47-dev/LAE-MUSIC/android-preview-downloads/LAE-MUSIC-Upload-Certificate.pem)

Upload-certificate SHA-256:

`57:BF:80:CE:98:DE:ED:A0:F8:76:42:6C:30:B5:51:86:00:36:59:CF:C6:B5:CB:5D:FA:33:95:9F:8C:F1:59:A2`

The certificate is public and contains no private key. Google Play's **app signing certificate** will be different when Google creates the app signing key. Keep those identities separate when configuring future app links or integrations.

The dedicated upload key is encrypted and retained in a restricted private workspace folder outside Git. **An owner-controlled durable backup has not been completed.** The GitHub connection received HTTP 403 for Actions secrets, so no secret was installed there and no private key/password is included in these downloads. Do not treat this workspace as permanent key storage.

Before future releases, arrange a secure owner-only transfer into your trusted secret storage, without posting credentials in chat or the repository. If a transfer is unavailable, you can create an owner-held replacement upload key on your own trusted computer and request an **upload-key reset** through Console's App signing/App integrity page, providing only its public certificate. Google's documented reset process preserves the Google-managed app signing key and installed-app update identity; it is an account-owner action, not something this connection has performed. It may take processing time, so arrange custody before an urgent update is needed.

Example owner-local key creation (passwords are entered in your local terminal, not shared):

```sh
keytool -genkeypair -keystore lae-owner-upload.p12 -storetype PKCS12 \
  -alias lae-upload -keyalg RSA -keysize 3072 -validity 10000
keytool -exportcert -rfc -keystore lae-owner-upload.p12 \
  -alias lae-upload -file lae-owner-upload-certificate.pem
```

Keep the resulting private keystore/password safely on your own device. Supply only `lae-owner-upload-certificate.pem` to Google's upload-key reset form if that alternative is used. Do not submit that replacement certificate as the signer of the current AAB; the current AAB uses the fingerprint above.

## 6. Verification performed

The release build and app code come from [successful Android CI 44276739178](https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/44276739178), commit `bc1a68da22f8551a0095bb7628d2d37927ae2d9d`. Reused results: **28 unit tests**, lint **zero errors / 35 warnings**, release AAB build, and **seven instrumented tests each on Android 15 and 16**. Those include continuous locked-screen transitions, native navigation/social actions, preference/account isolation and protected playback after reboot.

Fresh packaging checks: strict JAR signature verification; exact equality of every original bundle entry before/after signing; official bundletool validation; manifest/package/SDK/permissions checks; conversion into a release APK; APK signature verification; 16 KB ELF and APK ZIP alignment. A scratch copy with modified DEX data was rejected by the signature check. The embedded R8 mapping is retained in the AAB.

No code, UI, audio engine, account, database, payment setting or production website was changed. No new paid API call, ad feature or live purchase was enabled. A fresh on-device runtime test of the minified production-package APK was not performed here; the original debug/device results are reused transparently. Google's pre-launch report and real closed testers should verify the Play-distributed build.

## Official instructions checked

- [Google Play testing setup](https://support.google.com/googleplay/android-developer/answer/9845334)
- [12 testers / 14 continuous days for applicable new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [App signing and upload-key reset](https://developer.android.com/studio/publish/app-signing)
- [Required app-content and review declarations](https://support.google.com/googleplay/android-developer/answer/9859455)
