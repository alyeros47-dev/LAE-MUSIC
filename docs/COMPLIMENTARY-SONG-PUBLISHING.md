# Complete complimentary-song publishing

The prior upload-form repair restored file inputs but still required a paid package to submit. This prevented the owner-approved free artist test journey from completing.

When the existing `LAE_ARTIST_TEST_ACCESS=1` campaign is enabled, artists may publish their own successfully completed complimentary studio recordings using the associated one-use upload codes. The server verifies ownership and the durable link between code, recording, successful provider task and completed complimentary reservation at upload start and again at publication. Restored/failed/reserved requests do not qualify. The exact original audio fingerprint, title, signature checks, per-artist transaction lock and duplicate-publication protections remain unchanged.

A code-shaped string only enables frontend submission; it never grants server authorization. Arbitrary external audio and non-complimentary recordings still require the existing active artist package and quota. Turning off the campaign restores the paid requirement. No package activation, payment, referral commission, royalty percentage, generation charge, new migration or environment change is introduced.

Focused local verification: actual studio browser journey passes at 390px and 1440px with free-artist code entry/prefill, missing/invalid code blocking, audio/cover submission through mocked storage, existing paid/review flows, no accessibility errors or overflow. Upload/Gospel/visibility tests: 23 passed. Integrity and Sonic workflow guards passed.

Database integration assertions cover campaign off, no grant, reserved or restored grant, failed task, wrong owner, missing generated permit, allowed completed task, publication and reuse protection. These run only against the CI-enforced disposable database. No paid generation or production storage test is performed.
