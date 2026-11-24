# External AI music upload memberships

This development change adds a website-only paid upload category. It does not change the Android listening app, Studio production prompts or engine, Studio prices/generations, streaming royalty percentages, Monnify credentials, gateway fee allocation or existing financial history.

## Approved products

| Annual package | Price | Successful publications |
| --- | --- | --- |
| Starter | USD 5 | 10 songs |
| Growth | USD 10 | 30 songs |
| Premium | USD 20 | 100 songs |

The existing internal identifier `professional` represents the customer-facing Premium package. Prices and allowances are in `config/external-upload-packages.json`, separate from Studio terms. Purchases use `external_upload_subscription` commerce orders, the existing Monnify quote/checkout/verification flow, immutable order terms and separate upload membership records. Choosing a package or opening a browser callback never activates it. Verified receipts activate annual entitlements once. Early renewals follow the existing annual-membership pattern: the next term begins when the current external term ends. No automatic payment or royalty deduction is introduced.

Studio packages remain Starter USD 6 (3 generations/6 tracks), Growth USD 10 (6/12) and Premium USD 20 (15/30). External purchases do not issue Studio generations, lyrics credits or Studio memberships. External songs are excluded from Studio publishing counters. The working first-200 promotion is preserved: no reset to 100, duplicate award or new free upload offer.

## Customer workflow

Open `/external-upload-packages`, or **Artist workspace → External uploads**. Review the selected external plan, register/sign in if needed, then use the existing Purchases checkout. Referral and plan context survive registration, sign-in and adding artist access to an existing listener account; established referral relationships take precedence. Verified payment displays the active membership, remaining song allowance and expiry.

The Music Creator Agreement is versioned to include the approved external packages and rights requirements; existing consent history is retained. Accept the current agreement before new creation or publication. **Generate Upload Code** issues a unique, account-linked `EX-…` code. Creating a code does not consume an upload. Saved unused/pending codes remain accessible in the owner's dashboard. Choose **Upload song**, enter the title/category, choose MP3/M4A audio (existing 30 MB limit) and optional artwork (existing 3 MB limit), and accept the external rights declaration. Each code binds one recording checksum; it cannot publish a different account's file. Interrupted uploads can resume using the same file and code, with fresh object keys isolating older in-flight writes. Use a new code to choose a different recording before publication.

The existing storage upload and file-verification pipeline is reused. Only successful publication consumes one slot. A unique consumed code cannot be reused, and creator/membership locks prevent concurrent publications from exceeding the paid allowance. Expiry stops new uploads without deleting published songs or their records. Existing owner access and Studio/free-generation exceptions remain intact.

## Rights, complaints and royalties

Each new external upload stores the exact distribution/monetization declaration, version, artist account and acceptance time. AI-generated content is not automatically copyright-free. External service terms must actually permit the proposed use; no assumption is made that a free Suno account supplies commercial rights.

Creators may publish before documentary approval while eligible royalty activity is recorded through the existing pending/settlement system. Before a royalty withdrawal can be requested or approved, external creators need an approved supporting document. Unresolved external song reports also block withdrawal. These are gates, not changes to royalty amounts, percentages, funding, withdrawal fees or payout authorization. Affiliate cash withdrawals remain separate from the external-music rights check.

The creator submits PDF/PNG/JPEG evidence up to 5 MB under **Music rights documents**. Files are AES-256-GCM encrypted before saving to the existing R2 storage. Only ciphertext is stored at the bucket URL; document plaintext is returned only through authenticated administration. The service derives a dedicated document key from the existing server-only account-email key (or administrator key fallback). Retain that source key securely when rotating credentials so historical documents remain readable; no key is exposed to the browser or logs. Document metadata and audit records contain no file contents.

Owners and existing content operators review documents in **Admin → External music rights**. A decision and short review note are recorded. Approval requires actual examination of distribution/monetization evidence and does not transfer money. Existing report, moderation and takedown tools handle disputed songs. Confirmed/unresolved disputes remain subject to manual rights and financial review; an approval must not be used to bypass a song complaint or funding hold. Existing live royalty cash-settlement/payout prerequisites are preserved; this task does not enable a new bank payout service.

## Approved affiliate treatment

The owner explicitly approved applying existing artist-package rules to external packages: 20% direct and the existing second-level creator milestones, with each paying creator counted once across Studio and external package purchases. There is no 10% artist indirect commission. Premium-listener rules remain unchanged.

Only verified eligible receipts create pending obligations. External direct commissions have unique order references and use existing original-payment-currency accounting, settlement checks, cash funding, withdrawal safeguards and 3% withdrawal charge. Existing USD reference records are not a second withdrawable balance. Qualified external purchasers can voluntarily participate in the existing affiliate program; no separate affiliate registration is added. Existing links and registration attribution remain authoritative. External package sharing links appear alongside existing products.

The creator milestone evidence function retains its original Studio evidence and adds eligible external receipts. Existing creator/mode uniqueness and stage membership safeguards prevent double counting when a creator buys both types or renews. Previously earned rewards, historical rates and relationships are not rewritten. Free generation awards never produce external purchase commissions.

Refund holds prevent new external uploads and commission funding. Verified refund reversals revoke the affected entitlement and reverse/hold its recorded obligations using existing financial reconciliation. Used external uploads are included when reviewing refund eligibility. No refund or payout is claimed successful without the original provider verification.

## Verification and deployment

Relevant local tests and the dedicated `external-upload-tests.yml` workflow cover unit rules, encrypted document handling, disposable PostgreSQL migrations, intercepted Monnify verification, membership activation, code ownership/retries, publication, concurrent quota consumption, referral/creator counting, rights review, expiry and renewals. Browser tests use real registration/dashboard/upload UI with a disposable database and intercepted provider/storage transport. These are **not real-money acceptance tests** and send no MusicAPI requests.

No production schema, credentials or billing changes are made during preparation. Migration `042-external-upload-memberships.sql` is additive except for expanding the existing commerce kind and approved policy scopes; existing tables, balances, songs and subscriptions are retained. It must be reviewed and pass the existing migration/payment suites before deployment. After approval, use the existing Render deployment process, then verify the new product through an owner-controlled checkout. Do not claim that a simulated payment proves acceptance of a live external-package purchase.

Rollback must retain the new migration in the repository because the application rejects unknown migration history. Do not drop these tables or restore an older schema. Use a schema-compatible application rollback that retains financial and publication records.
