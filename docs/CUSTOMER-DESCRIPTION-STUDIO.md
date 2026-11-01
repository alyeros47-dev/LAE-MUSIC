# Customer description-led songwriting

The existing main-site `/studio` now offers description → original lyrics +
full musical style, using the existing OpenAI connection and `gpt-6.1-sol`.
Gospel and clean secular concepts are supported without forced Gospel presets.
Artist references are interpreted in context and researched automatically with
connected MusicBrainz and Wikipedia tools. Researched broad qualities inform
original production; this does not analyse recordings or copy an exact voice.

The customer sees the description, an occasional essential clarification,
editable lyrics, a full style and its compact audio-generation summary.
Developer budgets, tokens, API keys and manual research checks are absent.
The previous Gospel selector remains available explicitly; the 70 Gospel DNA
profiles and complete approved library are unchanged. Existing voice recording,
music generation, downloads, publishing and upload codes retain their handlers.

Normal customers retain verified artist-package access and once-only lyrics
credit charging. The platform owner can inspect this same real songwriting
service on the main site using their existing administrator session and API
balance, without buying a package or debiting customer credits. This exception
grants no audio allowance, package, commission, Premium benefit or withdrawal
entitlement. Other administrator roles, listeners and unpaid artists cannot
use it to bypass paid artist tools.

The experimental lab's $0 spending cap is not used by this customer service.
Metered model usage, costs and research receipts are recorded server-side in
the existing request journal. Complete lyrics and detailed styles survive
refresh/restart through existing account records. No production migration,
storage transfer, API-key replacement or payment activation is required.

## Verification and release

A controlled real Gospel request passed on 2026-11-01 with the live API
connection. Two successful `gpt-6.1-sol` calls resolved “Sinnach” to Sinach via
connected research and returned 1,381 lyrics characters, 5,859 detailed-style
characters and a 991-character music prompt. Recorded estimated cost for those
successful calls: US$0.039972. An earlier rejected string-input request revealed
the format problem; the corrected calls use the same system/user message-array
Responses contract as the working original backend. Historical request averages
are not a fixed price or a promise about a complete song.

Free tests cover customer and owner interfaces at mobile/desktop widths,
hidden legacy controls, full brief preservation, copy, refresh, matching style
handoff, fractional-minute durations, accessibility and protected entitlements.
Disposable PostgreSQL checks actual once-only debit/replay, full-style history,
cross-account isolation, owner inspection without customer credits, and restart
recovery. Release verification performs one further real clean-secular request
through the actual live customer interface, not a mock or MusicAPI test.

The known live commit before this release is
`2f9876c0130fda3e3961a53aa7ac7767c58209a6`. It is a code-only rollback target;
the database remains at schema 26 and new journal JSON is backward compatible.
`LAE_DESCRIPTION_STUDIO_DISABLED=1` also disables the new service and restores
the existing artist studio path. Production settings remain unchanged during
normal deployment. No new purchase or paid audio test is performed.
