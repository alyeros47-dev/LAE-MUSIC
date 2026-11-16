# LAE-MUSIC customer support

The Help button adds a public AI guide beside the existing player. It never reads customer account/payment records or changes accounts, credits, subscriptions, referrals, royalties or voice profiles. The chatbot first helps in the conversation. Only unresolved issues or issues requiring private investigation receive a representative handoff. Contact details and a human-support shortcut are absent from the initial interface, public configuration and ordinary replies. Asking for a contact alone prompts the customer to describe the issue. Human support availability depends on staffing; AI assistance is subject to provider availability and usage limits.

## Settings and current information

Owner: **Admin → Customer support**. Set the official WhatsApp number with its country code, enable/disable replies, and set daily request/token ceilings. `SUPPORT_WHATSAPP_NUMBER` is a fallback; the owner setting takes precedence. No number is hardcoded in the source. `CUSTOMER_SUPPORT_DISABLED=1` stops AI requests. Existing `OPENAI_API_KEY` stays on the server. Model is explicitly `gpt-6.1-sol`, checked against the provider; no fallback model is selected.

`lib/support-knowledge.js` is the public guide. Package quantities, prices and rewards come from the existing authoritative configurations. Update its navigation/troubleshooting articles and the revision in `config/customer-support.json` when the product changes. Run the focused tests; never add private customer cases, credentials or unpublished business decisions. The support guide does not change any business rules.

## Privacy, cost and failure handling

Messages are limited to 1,000 characters and six recent conversation turns, expire after 30 minutes, and are bound to an opaque HttpOnly visitor cookie. Common secrets, links, long numbers and emails are removed before the provider call. Customers are warned not to submit private information. Responses use `store:false`; provider processing and retention policies still apply. Conversation/cache contents use authenticated encryption; no plaintext transcripts or personal account identifiers are logged. Expired cached ciphertext is cleared during the next support request. Anonymous hashed usage records remain for cost accounting. Secrets/key rotation invalidates old conversations.

Global daily request/token reservations are serialized in PostgreSQL. Visitor and IP throttles also apply. Uncertain requests retain their token reservation; idempotency prevents repeat charges on retries. There is no automatic paid retry, research call, music generation or customer-credit deduction. Usage shows actual model tokens when available, and reserved ceilings otherwise. Token limits are not a fixed dollar-price guarantee. When AI cannot answer, errors/limits retain public guides and an escalation handoff. Browser connection errors ask for a retry without revealing a contact. Only user clicks open WhatsApp; a deterministic topic summary requires explicit opt-in and contains no transcript or account/payment details.

## Verification and release

Run `node tests/customer-support.test.cjs`, `node tests/customer-support-postgres.cjs` against the explicitly disposable local database, and `node tests/customer-support-browser.cjs`. Shared-shell checks include the existing continuous playback/browser test and platform/player/admin authorization tests. Chromium mobile emulation is not a physical Android test.

`Customer support focused checks` supports a manual, six-question real-text check of royalties, benefits, artist packages/publishing, Premium, affiliate rewards and payment support using the existing connection. It uses a disposable local support schema, synthetic public questions, and no production account data or music credits. Automatic CI never calls a paid AI provider. A separate explicit contact configuration step changes only the new support settings row after its migration exists. Credentials are read in memory from the existing Render service and never printed.

Deployment remains the existing main-branch Render process. Disable AI replies immediately through owner settings for operational rollback. For code rollback, revert only support shell/routes/modules while retaining migration 039: the migration registry intentionally rejects an older source tree missing a recorded migration. Do not restore an older database, delete customer tables or merge the independent voice-repair branch.

Verified real text preflight: three synthetic questions completed with `gpt-6.1-sol` (9,273 input / 396 output tokens total). It correctly distinguished offline catalogue saves from Studio downloads, provided a contextual follow-up, and described Starter plus the current artist referral/milestone split. No MusicAPI requests or customer credits were used. This records measured usage, not a fixed future price.

The official representative guidance uses company language and leads with verified benefits and practical steps. Artist earnings guidance explains the existing 50% artist royalty pool / 50% platform split after approved deductions, with allocations based on qualifying streams. Withdrawal status remains accurate but is discussed only when relevant. Unknown information is clarified or escalated; the conditional WhatsApp policy is unchanged. No business calculations are modified.
