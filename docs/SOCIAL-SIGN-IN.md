# Google, Facebook and TikTok sign-in

This extends the existing LAE-MUSIC account engine. It does not replace the database, sessions, passwords, users, referral relationships, credits, storage or provider integrations. Song sharing remains included in PR #19.

## Current external setup status

The read-only audit of the existing production Render service found none of the expected social-provider settings configured. Audit: https://github.com/alyeros47-dev/LAE-MUSIC/actions/runs/41214707684 . No setting or production record was changed. Repository-secret metadata access returned HTTP 403, so no claim is made about undisclosed GitHub secrets.

The integration is disabled by default. No nonfunctional provider buttons appear. Official developer applications, credentials, redirect approval and real-provider user tests are required before activating each provider. Having an OpenAI/Google AI API key does not configure Google OAuth.

## Owner setup on the existing service

Keep every current environment variable. Add the following separately in **Render → LAE-MUSIC → Environment**; do not paste secrets in chat, source code or screenshots. These are OAuth login credentials, not replacements for existing music/lyrics/storage keys.

Common settings:

- `SOCIAL_AUTH_ORIGIN=https://lae-music.com`
- `SOCIAL_AUTH_ENABLED=false` until the approved provider setup and isolated real-user test are ready.
- Each provider also has its own explicit enable flag; credentials alone do not turn buttons on.

| Provider | Required settings | Exact approved callback to register |
| --- | --- | --- |
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SOCIAL_GOOGLE_ENABLED` | `https://lae-music.com/api/platform/social/google/callback` |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_VERSION`, `SOCIAL_FACEBOOK_ENABLED` | `https://lae-music.com/api/platform/social/facebook/callback` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `SOCIAL_TIKTOK_ENABLED` | `https://lae-music.com/api/platform/social/tiktok/callback` |

1. **Google:** open https://console.cloud.google.com/auth/clients . Create/select a Web application OAuth client, configure the LAE-MUSIC consent/branding information and its audience/test users, and register the exact Google callback above. Obtain the client ID and secret. This uses the authorization-code flow, OpenID/email/profile scopes, PKCE and a verified ID token.
2. **Facebook:** open https://developers.facebook.com/apps/ . Create/select the LAE-MUSIC app, configure Facebook Login for the website, app domain and exact valid OAuth redirect URI, and obtain the App ID/secret. Set `FACEBOOK_GRAPH_VERSION` to the supported version actually assigned/approved for that app, for example the `vNN.N` value shown in its dashboard; there is deliberately no guessed production default. Request only public_profile/email. Complete the provider's applicable app-mode, review, privacy and data-deletion requirements.
3. **TikTok:** open https://developers.tiktok.com/ → Manage apps. Configure Login Kit for Web, register the exact TikTok callback and obtain the client key/secret. Complete required website/app verification and authorization for `user.info.basic`. That scope provides an immutable open_id and display name, not an email. First-time users therefore supply an email once on LAE-MUSIC.
4. Supply approved privacy/deletion URLs required by each provider. Do not claim unreviewed draft policies are approved. Use provider-authorized test identities and a separately configured review environment/callback for initial external tests; never point a review service at the production database or change live storage for these tests.
5. Enable a provider only after its consent, callback and account-reuse tests succeed. Set its `SOCIAL_<PROVIDER>_ENABLED=true` and the common flag to `true` through secure configuration. Unconfigured providers stay hidden even if another provider is enabled. A provider app still in restricted/test mode cannot be described as available to all customers.

Social login uses the configured canonical origin. Another public hostname returns the visitor to that origin before starting consent; sessions are not copied between hostnames. Linking an already signed-in account must happen on the canonical origin.

## Customer journeys

- On sign-in/registration, only configured providers have a Continue with button. The chosen listener/artist/partner role, product/referral context and Premium return destination are retained server-side.
- A previously connected provider signs into its existing local account; it does not register again on every visit.
- On first connection, the user confirms prefilled name/email and supplies missing information, such as country for a new artist or email for TikTok. A new local password is optional; existing passwords are never replaced. If email recovery is not configured and the user chooses no local password, they must keep using their connected social provider(s).
- An existing local account with the same email is **not** silently merged. The user proves ownership using its current password, or signs in first and explicitly connects the provider from Your account. Existing social-only users can connect another provider while signed in.
- Creating or connecting an account does not activate a paid package, grant Premium, create an affiliate reward, charge money or change a previous referrer. Payment-first checkout remains a separate unfinished integration.
- OAuth cancellation, missing permission and expired sessions provide a normal sign-in path. A session is reported successful only after the shared session endpoint recognizes the correct role.

## Security and persistence

Random one-use state is atomically claimed and bound to an HttpOnly/Secure/SameSite=Lax host cookie, exact provider, app/client ID, expiry and configured host. Google ID-token signature/issuer/audience/expiry/azp/nonce are checked with `jose` and pinned Google JWKS; Google also uses PKCE. Facebook exchanges server-side, verifies token app/user/expiry and requests profile data with appsecret_proof. TikTok validates the granted basic scope and matches token open_id against user info. TikTok Web's documented flow does not require mobile/desktop PKCE; no unsupported guarantee is made.

Provider access/refresh tokens are used only in memory and are not returned to the frontend or persisted. Pending profile data expires after 15 minutes and is removed by account maintenance; completed/failed flows clear profile/verifier/nonce data. Provider secrets are never in browser JavaScript. Return destinations are server-selected local paths. Password proof is rate-limited per account outside the mutation transaction, so failures cannot reset the budget through rollback. Linking requires the same valid local session that initiated it. Identity uniqueness and transaction/advisory locks prevent concurrent double registration/linking. No automatic privileged/admin role can be obtained from provider input.

Migration `024-social-sign-in.sql` adds only social identity/flow tables and indexes. It does not rewrite existing account rows. Historical upgrade tests preserve both roles' scrypt passwords, sessions, songs and separate currency books. Rolling back to older code must retain the additive migration manifest or follow the existing tested recovery procedure; never reset the database to hide migration history.

## Verification limits

Automated provider transport/signature/state/account-preservation tests and browser journeys use controlled identities and intercepted APIs. They do not prove a real Google/Facebook/TikTok developer application is approved or that external consent works on real customer phones. Facebook documentation fetch was rate-limited during development; its version remains explicit configuration, and its external compatibility test remains pending. No paid OpenAI/MusicAPI generation is required or authorized by this feature.

Official references:
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
- https://developers.facebook.com/docs/graph-api/reference/debug_token/
- https://developers.tiktok.com/docs/en/login-kit-web
- https://developers.tiktok.com/docs/en/oauth-user-access-token-management
- https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info

Local verification completed: 67 focused authentication/platform/migration/request-protection checks; 212 existing/current PostgreSQL application checks (including the initial social transaction cases); 10 populated historical-upgrade checks; and the expanded 10-case social PostgreSQL suite including independent concurrent completions. All passed. Social UI journeys passed at 390px and 1440px with zero automated accessibility violations. Existing Chromium website journeys passed at desktop/tablet/mobile with 53 accessibility audits. Production dependency audit reported zero vulnerabilities. Provider credentials/approval/real consent remain NOT VERIFIED and activation remains disabled.
