# Gospel lyrics messages and originality — PR #12

Development only. No production merge/deployment, paid provider generation or live-data mutation.

## Three independent responsibilities

The optional **Lyrics Type** selector uses exactly the 17 owner-proposed names in `lib/lyrics-originality.js`; they remain marked for owner review. **Follow my description** is the empty default. It is part of **AI Creates My Song** only, persists with that artist's browser draft and is validated on the server before a credit reservation. The 17 choices are listed in [the inspection inventory](GOSPEL-STUDIO-INSPECTION-LIST.md).

Lyrics Type supplies communication guidance, the customer's description supplies the actual experience/story/message, and the existing 14 Gospel groups / 70 Music DNA styles supply musical identity. No Music DNA profile was changed. Voice, language and allowed mood/energy adjustments remain independent. A prayer or worship message does not authorize adding church keyboards/organ/pads/choir outside the selected instrumental identity. Existing production-term and mood checks remain in force.

**I Have My Own Lyrics** keeps its existing DNA/custom-production routes. Its audio adapter sends the supplied lyrics unchanged; it neither forwards a Lyrics Type nor invokes the new AI lyrics checks or rewriting.

## Originality and language instructions

A stable per-artist/request-key variation brief supplies alternative openings, development approaches, hook cadences and imagery strategies. A replay keeps the same brief; a new key changes its seed. These are message-development suggestions, never new facts or musical prescriptions, and do not guarantee a mathematically unique outcome.

The system prompt requires concrete brief-led wording; fresh verses, images and hooks; natural idiomatic selected languages; meaningful mixed-language use; and a private meaning/topic/wording self-review inside the same response. It explicitly rejects generic road/food/hunger/poverty/suffering/miracle stories when not relevant, decorative African-sounding words and routine catchphrase insertion. It asks for accurate simpler expressions or supplied phrases when uncertain. No particular Yoruba/Pidgin word is blacklisted. No additional provider call or automatic paid regeneration is added.

## Checks, exceptions and privacy

- Obvious excess repetition in **labelled narrative verses** and extreme short-syllable filler are checked before completion. Chorus/refrain/chant sections, unlabelled devotional repetition, expressly requested vocables and explicit supplied/quoted phrases have conservative exceptions. Ordinary repetition is not a blanket failure.
- Completed AI lyrics are compared inside the existing completion transaction with at most **128 AI lyric records from the past 30 days** already present in the product's private lyrics library. MusicAPI audio/provenance records are excluded. Five-token overlap compares verse material separately from substantive hooks. Repeated identical lines within a song are deduplicated for this comparison. Short common worship refrains cannot trigger the near-copy threshold by themselves; longer copied hooks can. Supplied exact phrases are excluded from both sides of the comparison.
- A short shared PostgreSQL transaction lock prevents two concurrent near-copies from both completing. A rejected output or history-read failure rolls back the completion. The existing handler restores its reservation once; no automatic provider retry runs. Existing exact Music DNA fingerprint protection is retained.
- No new lyrics corpus, table, embeddings, extra raw-lyrics logs or external comparison service is created. Existing private-library text is compared transiently inside the backend. It is not returned to another customer or placed in the generation prompt. Errors disclose no matching lyrics, account or song identifiers. Existing artist-scoped library access is unchanged.
- The comparison is a **bounded lexical heuristic**, not semantic plagiarism detection. Older/out-of-window songs, substantial paraphrases or brief repeated catchphrases can escape it. Native fluency, truthful narrative fidelity, theology, semantic originality and actual model behaviour still need human review; neither echoed language codes nor mocked fixtures prove those qualities. Requested copyrighted phrases are not automatically licensed by these exceptions.

No migration, new environment variable, price, royalty, commission or credit-cost change is required. Existing saved lyrics are not modified. The lock and bounded query should receive realistic load review before broad launch.

## Free verification and inspection

Focused tests cover all 17 mocked handler requests, stable/reseeded variation, unchanged selected DNA/voice/language, optional invalid/empty types, copied verses/hooks, legitimate refrains and supplied phrases, natural-language fixture preservation, no paid retry, actual completion rollback/refund/replay and cross-account concurrency on disposable PostgreSQL. Browser tests use the actual mobile/desktop studio with fixture services, checking selector options, draft restoration, own-lyrics routes, upload-code flow and hidden unavailable tools. The separate read-only preview has no provider keys and blocks mutations.

The new types and instructions remain subject to owner inspection. Tests check contracts and obvious defects; **no real lyrics/audio generation was purchased or performed**, so provider-level originality, linguistic quality and musical fidelity are not certified. Production remains unchanged.
