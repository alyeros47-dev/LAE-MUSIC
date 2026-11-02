# Artist references and clarification repair

Read-only production receipts confirmed `gpt-6.1-sol` for the reported Kizz
Daniel requests. Two MusicBrainz timeouts stopped the old lookup before Wikipedia
was attempted. That outage was incorrectly presented as an unknown artist.
Other lookups did fetch both sources, so this is a workflow/research problem,
not evidence that GPT-4 was selected.

MusicBrainz and Wikipedia now run independently. Exact stage names and sourced
aliases establish identity; a matching musician biography can establish it when
MusicBrainz is unavailable. Verified public evidence is cached for six hours
(maximum 64 entries), with cache-hit receipts rather than invented fresh lookups.
Longer bounded article extracts provide more musical context. Genuine homonyms
remain ambiguous. A complete source outage returns a temporary service error
and restores the lyrics credit rather than asking for the artist's name again.

The interpreter researches recognizable references before asking identity
questions. Composition instructions distinguish verified artist facts from
original production decisions: incomplete recording analysis is not a reason
to demand permission, a legal name or an obligatory song title. Broad vocal
phrasing, articulation, dynamics and melodic delivery are supported without
promising an exact voice or claiming a recording was analysed.

Both artist and owner interfaces show an explicit Your answer field and Continue
with my answer action. An empty answer cannot submit another request. The
previous question travels with the answer and immutable original description,
and a completed clarification stays resolved after refresh. Existing account,
credit, audio, publishing and temporary artist-testing flows remain intact.
