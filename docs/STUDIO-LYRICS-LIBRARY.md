# Studio lyrics recovery and deferred storage

The studio now lists the signed-in artist’s last 50 completed lyrics drafts using the existing generation records. Artists can review lyrics/style and explicitly replace the editor with a saved draft. Opening and restoring a draft are read-only; they neither request generation nor debit lyrics/music credits. Upload codes/hashes and creator identifiers are excluded. The endpoint remains authenticated and selects by the session artist, never a client-supplied artist identifier. Existing history metadata is preserved.

After every lyrics-generation attempt the interface reloads the server wallet and history. Exhausted credits disable the generation button. If balance verification fails, another lyrics request stays disabled until reload. Successful output is left in the editor even if the refresh fails. Saved drafts remain scoped to the artist. The history fallback preserves studio access if the history read fails and asks the artist to reload; it does not replace stored records.

The owner deferred R2 bucket setup and storage-dependent voice/upload testing. Automatic bootstrap and storage probes are now off in the isolated workflow, with explicit opt-in flags required by the configuration script. No live bucket/credential is used as a substitute. No provider credentials, paid package benefits, prices, commissions, royalty rates or production records are changed.

## Verification scope

Unit checks cover the owned, bounded projection; invalid identity/database rejection; read-only credit-free reopening; and absence of R2 network requests while storage is deferred. Native PostgreSQL coverage inserts two distinct artist fixtures and verifies anonymous denial, cross-account exclusion, recovered text and an unchanged wallet across repeat reads. Browser journeys cover draft review/restore with no generation request, then a mocked lyrics result and verified empty-wallet disabling across desktop/tablet/mobile. Existing quota/idempotency/music, payment, royalty, streaming and offline regressions remain enabled.

External music/payment responses in regression tests are mocks. Previously verified hosted OpenAI generation does not certify full MusicAPI generation. Real music generation, voice training, R2 publishing, payment-provider checkout/settlement and payouts still require their separate authorized integration evidence. This change grants no fake paid entitlements and does not activate live financial operations or production deployment.

## Real sandbox evidence

The application head `a1adc1846ade71a6c714b3904cd1d20734c66a47` passed 174 native PostgreSQL tests plus 8 populated upgrades. Isolated configuration run 40369487848 deployed only the sandbox and reported unchanged live configuration/deployment, no key updates and null R2 bootstrap/probes. Real OpenAI testing generated original lyrics, recovered identical saved lyrics/style, reopened history without spending credits, and replayed the original request without a second debit. The artist remained unpaid. This is actual lyrics/library evidence; full MusicAPI generation and payment processing remain unverified. The opt-in verification script performs one real billed-provider request with an approved existing welcome credit and never retries an ambiguous result with a new key.
