# Description-led Gospel studio — internal experiment

This is an **additive, separate preview**, on `codex/description-led-studio-lab`.
The public studio, Music DNA catalogue, Sonic/music engine, account database,
voice profiles, storage, credits, payments and referrals remain unchanged.
No production merge or deployment is authorized by this implementation.

## Audit and boundaries

The existing `/api/music/lyrics-generate` route shortened the customer idea to
1,200 characters. Legacy selectors and DNA instructions could override the
generic instruction to follow the description. That route's OpenAI Responses
request contained no connected artist-research tools. Its returned style was
shortened to 950 characters. The existing music engine accepts lyrics in
`prompt` (maximum 5,000 characters, further duration budgets apply) and style
in `tags` (maximum 1,000); the engine's model is `sonic-v6`.

The experiment does **not** patch those live routes. It has its own entrypoint,
assets, optional isolated usage database and private administrator login. Its first model
request interprets the full 12,000-character description; its second composes
lyrics and musical direction from the original full description plus the
interpretation and real retrieved evidence. There are no preset, mood, gender,
instrument or language selection chains. Gospel is the explicit scope.

The detailed style and the separately compiled 1,000-character engine prompt
are both shown and editable. Over-limit requests are rejected with a visible
error; no accepted brief, lyric or style is silently cut. The original remains
available. Customer edits survive page refresh within the same tab. If the
detailed style is edited, users must also check/update the engine prompt.

`Validate music-engine handoff` constructs and validates the exact existing
text-only Sonic payload, using edited lyrics and engine prompt. It sends no
audio request, saves no voice profile, creates no upload code, changes no
wallet and consumes no customer credits. Audio execution and listening
analysis are intentionally outside this text-first experiment.

## Exact model and truthful research

Model: **`gpt-6.1-sol`**, `POST /v1/responses`, `service_tier: default`,
`store: false`. There is no model fallback. A read-only Render audit verified
the production and review configuration resolve to that exact ID and each
existing OpenAI connection returned HTTP 200 for `GET /v1/models/gpt-6.1-sol`.
The lab rechecks availability before a test and checks returned model and tier.
An unexpected model/tier fails closed and retains the cost reservation.

Connected research: MusicBrainz artist search and Wikipedia search/intro APIs,
called by the backend, bounded in size and time. Only artist names are queried;
private song briefs are never used as web search queries. Fetched candidate
identities, source links, excerpts and request statuses are supplied to the
composition call. Reported facts require exact supporting evidence quotes.
Musical arrangement extrapolations are labelled original interpretations.
Incomplete/unclear research leads to a focused clarification, not invented
research. No claim is made that metadata is analysis of a recording. These
public APIs have no per-call API fee; hosting/compute is separate.

Browser speech recognition is optional **voice-to-text**, not voice cloning or
audio analysis. Availability and local-language accuracy depend on the browser's
speech service. Typed input/keyboard dictation remain available. This lab has
no audio-upload analyser. Cultural and linguistic authenticity, subtle reference
disambiguation and musical quality still need human/native-speaker review.

## Originality and privacy

Prompts preserve customer names, local expressions, message and exclusions;
ask for contextual corrections, original imagery/hooks/structures, and no
automatic poverty/food/road/miracle narrative or invented local-language words.
Each request carries a fresh UUID variation seed (a creative instruction, not
a promise of mathematical uniqueness). Only HMAC narrative shingle hashes of
recent internal outputs are retained for similarity checks; choruses, refrains,
hooks and explicitly requested phrases are excluded. No existing customer
generation records are read. Excessive overlap is flagged and blocks handoff;
there is no automatic paid regeneration. This catches obvious reuse, not every
possible paraphrase or semantic similarity.

Full briefs/lyrics/results exist only in the private job's memory (one hour)
and the current tab's session storage (cleared at sign-out). Durable lab tables, when configured,
store metering metadata, research request metadata and keyed fingerprints.
Original lyrics are not saved to the customer catalogue. An in-flight process
restart can lose an output; durable idempotency prevents charging again as a
recovery attempt. Copy reviewed results if they must be retained longer.

## Costs and authorization

Initial preview budget is **US$0** pending separate USD authorization. Earlier
MusicAPI-credit authorization does not authorize new OpenAI charges. No real
lyrics generation, hosted paid search or MusicAPI generation is run by the
preview provisioning job or automated tests.

Historical $1.74 / 27 = approximately $0.0644 per API request is **historical
usage**, not a fixed price or the price of a complete song. This flow normally
uses two text calls; a clarification can stop after one. Artist research uses
free public APIs. Rates reviewed 2026-11-01 against
https://platform.openai.com/pricing : Standard input $2/M tokens, cached input
$0.10/M, output $10/M. The separate lab ledger records model ID, returned token
usage, request IDs, service tier, estimated USD and research statuses/fees.
These are estimates, not an invoice or a promise about future pricing.

Before real calls, a conservative reservation uses the complete serialized
UTF-8 input size plus framing allowance and the output-token limit. A durable
PostgreSQL advisory lock applies a **global lifetime cap** atomically. Restarts
do not reset spending. Transport/unknown-cost failures retain their reservation;
invalid text output with known usage still counts. No paid retry is automatic.
Increase a cap only after explicit USD authorization and pricing review; never
reset/delete the metering tables to replenish an approved test allowance.

## Deployment isolation

`scripts/provision-studio-lab.cjs` can create only the new free Node lab service.
It never changes either existing service, database, role/password or storage.
The review OpenAI connection and existing live administrator key are copied
securely in memory into separate lab variables without removing/changing their
originals. The private lab accepts the same administrator key as the main site. No R2 or MusicAPI
keys are supplied. There is no paid-plan fallback or production deployment.

The first attempt at isolated Neon metering provisioning returned **HTTP 423**
after the schema-only branch and separate role were created, before the empty
lab database was created. Read-only follow-up confirmed the test branch is
ready and its compute is idle. `scripts/complete-studio-lab-metering.cjs` resumes
only that exact test branch, wakes its isolated compute with `SELECT 1`, creates
the empty lab database, initializes only lab metering tables, and configures only
the two database variables on the new lab service. It never resets passwords or
connects to the production endpoint. The branch expires 2026-11-08 at 20:42 UTC.
The hosted verification report records whether durable metering is ready.

The initial preview can also run without a database at a **hard $0 cap**. That
inspection-only store refuses every paid reservation; it cannot substitute for
durable metering. A nonzero budget cannot start without a separately configured
lab-only database passing isolation checks. No account/artist data is copied.

The existing review service was found to be ephemeral, so updating it would risk
losing test accounts; it is deliberately untouched. The temporary lab uses only
same-tab drafts and short-lived in-memory jobs when metering is unavailable.

Required preview-only variables: `STUDIO_LAB_ENVIRONMENT`, `ADMIN_KEY`,
`OPENAI_API_KEY`, `OPENAI_LYRICS_MODEL`, `STUDIO_LAB_BUDGET_USD`,
`STUDIO_LAB_CURRENT_STUDIO`; `NODE_ENV=staging`. A separately isolated
`STUDIO_LAB_DATABASE_URL` and `STUDIO_LAB_DATABASE_HOST` are mandatory before
any nonzero budget. Secret values are never logged.
Owner login uses the existing live administrator key on the separate origin;
artist/listener/partner credentials do not grant access. Same-origin JSON and
CSRF checks protect writes. There are no public studio or financial routes.

## Focused verification commands

```
node --test tests/studio-lab.test.cjs
LAE_DB_TESTS=true DATABASE_URL=<disposable localhost lae_music_ci URL> node tests/studio-lab-postgres.cjs
LAE_CHROMIUM_PATH=/usr/bin/chromium node tests/studio-lab-browser.cjs
```

Tests use model/research fixtures, real disposable PostgreSQL, and Chromium at
390/1440px including accessibility checks. No paid API or production data is
used. Public MusicBrainz and Wikipedia were additionally checked with real,
free HTTP requests, both returning HTTP 200. Model availability checks are
read-only; actual real-model lyric/interpretation quality remains unverified
until a separately approved capped USD test.

`align-studio-lab-admin.cjs` checks for accidental use of an older review-only
administrator key, and updates only the new lab ADMIN_KEY to the existing live
value when necessary. It creates/resets no key, never writes to either existing
service, verifies other lab variables remain unchanged, and logs only booleans.
