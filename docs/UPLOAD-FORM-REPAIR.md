# Generated-song upload form repair

The studio result link already preserved the chosen recording’s title and upload code. The destination hid the entire form whenever the artist lacked an active paid package, so the audio and artwork pickers disappeared. A second frontend check disabled submission even for explicitly granted review-upload access.

The upload page now always shows the release preparation form to signed-in artists. A nearby status message explains unavailable storage or missing publishing entitlement. Submission requires available storage plus an existing active artist entitlement or explicit review-upload access. Generated-song codes do not confer a paid publishing entitlement. Backend authorization, file validation, recording fingerprints, quotas and one-use codes are unchanged.

## Focused verification

- `LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/gospel-launch-browser.cjs`: PASS on desktop (1440px) and mobile (390px). Actual result-link navigation retains title/code; both file inputs remain visible; inactive accounts and unavailable storage cannot submit; active paid and explicitly approved review accounts submit audio and cover through mocked start/PUT/finish endpoints. Both viewports have no accessibility violations or horizontal overflow.
- `node --test tests/uploads.test.cjs tests/feature-visibility.test.cjs tests/gospel-launch.test.cjs`: 23 passed, zero failures or skips. Includes generated-recording binding, ownership, one-use authorization, plan/quota enforcement and file validation.
- `git diff --check`: PASS.

Browser generation, storage and publishing requests use fixtures. No paid provider requests, live media uploads, production database changes or environment changes were performed. A fresh live upload is not claimed as verified. Production deployment requires owner approval.
