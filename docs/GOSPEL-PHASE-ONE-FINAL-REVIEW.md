# Gospel Phase 1: historical lyrics audit and customer visibility review

Development only, PR #12. No merge, production configuration edit, production database write or Render deployment is authorized by this report.

## The requested 17 lyrics types: not recovered

The search covered all **19 current GitHub branches**, all **12 pull-request heads/descriptions**, available local development branches and **719 reachable commits**. There are no repository tags or issue comments containing another approved list. We inspected **1,914 distinct historical text blobs**, including documentation, HTML, JavaScript, JSON, test fixtures and implementation history, plus **eight distinct decoded embedded HTML/JavaScript versions** in the original server assets. We also inspected **11,233 parsable registry versions** and the earlier single-quoted JavaScript instruction registries. No 17-type lyrics registry or matching approved specification was found.

Relevant history includes the original studio (`812e7ff`), the cultural songwriting engine (`da81507`), categorized Nigerian Gospel presets (`67e3354`), Gospel country organization (`950b3c2`), and country/category selectors (`d30a4fc`). The earlier instruction registries contain 16 musical traditions, 20/28 beat guides, 39/40/66 Gospel profiles and 33 secular profiles across versions. These are not evidence for an approved list of 17 lyrics types.

One **17-entry intermediate Music DNA category catalogue** exists at [the S3 development snapshot](https://github.com/alyeros47-dev/LAE-MUSIC/blob/96d235c7f5ee189d96e031251b0d013f65bb29fb/config/music-dna.json): Gospel G1–G14 plus **three secular groups S1–S3**. It contains Music DNA musical group headings, not 17 independent lyrics formats/types. Restoring that snapshot would expose secular groups and regress the completed library. It was not treated as the missing specification.

The preserved legacy genre selector has nine entries: Gospel & Worship; Reggae; Afrobeats; Nigerian Praise; Highlife; Hip-Hop & R&B; Pop; Traditional African; Other. These were not renamed or expanded into invented lyrics types. The current Gospel launch projection still contains exactly 14 approved groups and 70 styles; all 215 original DNA profiles remain in source.

**Resolution needed:** the owner must provide or approve the actual 17 names and their intended generation guidance. Nothing has been fabricated or falsely certified as restored.

## Customer-facing visibility repairs

`web/feature-visibility.js` projects server capabilities into customer visibility. Unknown or absent capabilities fail closed. Unavailable feature groups are hidden from rendering/accessibility with a persistent display fence; a form-state update cannot accidentally reveal them. Customer feature navigation starts hidden until capability/account checks permit it. Restoring an actual capability or signing into an existing Premium account restores its appropriate navigation.

The following are hidden for ordinary customers when unavailable:

- Live purchase/checkout actions, Premium purchase controls and additional-generation purchase actions; there is no disabled “Checkout unavailable” button or public unpaid-purchase workaround.
- Bank payout/withdrawal submission while payouts are inactive. Existing earnings, ledger and withdrawal records remain readable.
- Affiliate practice/demo entry points. A query parameter cannot reveal them on the ordinary customer interface. Explicit isolated review environments retain the approved testing tools; production cannot enable them with review-only environment variables.
- AI lyrics or audio generation tools when the corresponding provider is unconfigured, including invalid creation-method choices and progress actions that need that provider.
- Voice sample saving/training tools without the configured provider/storage; an unready custom voice is removed from the selector. A ready saved voice remains usable independently of new-upload availability, and successful training reveals its ready choice.
- Private-release saving/retrying when imports are unavailable, and publishing/upload submission without current artist entitlement. Server plan, quota, ownership, audio and one-use checks remain authoritative.
- Unsupported microphone recording/dictation and unavailable browser-push enrollment. Supported input methods and working standard voice controls remain.
- New offline saving and offline advertising when the service/browser cannot support it. Signed-in listeners retain access to subscription/payment history and complaint controls even after Premium expires; checkout remains hidden. Cached offline-library management remains available where applicable. The PWA shell includes the new visibility dependency; existing IndexedDB music/keys are not reset.
- Unconfigured email reset requests, verification sends and recovery entry points. Existing valid recovery links, password changes and session management remain intact.
- The optional legacy profile-selection area in the Gospel launch. Only the approved Gospel group/style selection is offered; the personal-lyrics custom Gospel direction remains supported. The archived profile/department code is preserved.

Readonly records, approved informational pricing and clear service notices are not fake activation features. Ordinary prerequisites—such as stopping a recording that has not started, entering required fields, an empty playback queue or an exhausted individual allowance—are working workflow states, not inactive product features. Those controls can remain temporarily disabled. Admin operational reporting is not part of the customer visibility gate. No API authorization, price, commission, credit or royalty rules were weakened or enabled.

## Free verification

The focused customer-visibility, account-security, offline, studio and own-lyrics tests passed locally (41 tests). The real application browser harness verifies mobile and desktop Gospel selection and both own-lyrics methods, then checks actual invisibility of unavailable controls across Studio, artist plans, finances, uploads, Premium, partners and email recovery, including direct URLs and demo query parameters. Existing Chromium PWA tests verify encrypted offline reload/playback, expiry, clock guards, once-only play synchronization and account cleanup with synthetic services. No paid provider call is made by these tests.

Final CI evidence will be attached to PR #12. The unchanged full 9,675-case voice/language matrix is not repeated for this visibility-only change. Existing registry/music-generation accounting tests remain enabled in the normal application checks.

## Paid generation proposal — not authorized or run

Official sources checked October 30, 2026:

- [MusicAPI operation-credit guide](https://docs.musicapi.ai/credits-usage-guide)
- [MusicAPI Sonic request instructions](https://docs.musicapi.ai/sonic-instructions)
- [MusicAPI current pricing](https://musicapi.ai/pricing)

The official current operation price is **20 MusicAPI provider credits per `create_music` generation request**, with an intended two songs. Persona generation also costs 20 credits; training a new voice is a separate operation and is excluded here. Status polling is free. LAE-MUSIC's existing artist allowance consumes **one platform generation per request**; that is a different unit from MusicAPI provider credits.

Proposed minimum acceptance batch:

| Test | Request | Provider credits | Platform allowance | Intended output |
| --- | --- | ---: | ---: | --- |
| A | Personal Christian lyrics + approved G1-01 DNA, Calm & Relaxing, English, standard voice | 20 | 1 generation | 2 songs |
| B | Personal Christian lyrics + custom Gospel rhythm/instrument/tempo directions, Energetic & Danceable, standard voice | 20 | 1 generation | 2 songs |
| Total | Exactly two generation POSTs | **40** | **2 generations** | **Up to four songs** |

Both tests use supplied original lyrics and require **zero OpenAI lyrics calls**. They exercise the new DNA-compiled and custom-style own-lyrics routes, actual audio completion, playback, artwork, existing MP3 delivery and post-completion code issuance. They do not request WAV conversion, extensions, stems, persona creation/training or additional generations. There are no new test purchase orders or proposed product-price changes. A failed or ambiguous operation does not authorize another generation; the existing idempotency/reconciliation rules apply.

**Exact USD equivalent is NOT VERIFIED.** The account's active subscription/credit-pack rate and applicable billing terms are not attached to this development environment. The public pricing page alone cannot establish which purchased credit pool this account will consume. The dollar equivalent is `40 × actual USD cost per provider credit`, subject to the account's real billing terms. We will not invent a dollar price or run this batch until the owner sees and approves the verified cost. A non-secret billing-plan/credit-pack price and credit allocation can establish that rate; do not share API keys.

This minimum audio batch is not evidence that the still-missing 17 lyrics types work; those need their actual specification and corresponding free prompt tests first.

## Deployment readiness

**NOT READY FOR DEPLOYMENT / VERIFICATION INCOMPLETE.** The missing approved 17-type specification remains unresolved. The new audio paths have mock/fixture coverage and earlier owner-reported engine acceptance, but the proposed real-generation acceptance batch has not run. Its 40-credit provider budget is verified; its account-specific dollar equivalent is not. Live checkout and bank payouts remain closed and hidden, not declared complete. A later authorized release also requires fresh recovery/backup and release-candidate pin checks. No merge or deployment has occurred.
