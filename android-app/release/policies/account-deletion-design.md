# Account deletion — implementation blocker and safe plan

No functional end-to-end deletion route was found in the reviewed app/backend. A support email or a dead “Delete account” button is not a verified deletion implementation. No production account/data was deleted during this work.

Before Play release, implement a clearly visible Profile > Account > Delete account action and a public HTTPS deletion-request page identifying LAE-MUSIC. Reauthenticate the account owner, confirm consequences, record and fulfill the request, and report completion. A temporary suspension alone is not deletion. The outside-app page must remain reachable without installing the app and clearly explain how a request is made. Do not publish a nonexistent URL to Play Console.

The owner must approve how a listener-only deletion interacts with the same person's artist account, published music, licences, earned royalties and referral/financial records. Preserve legally required transaction records with restricted access; obtain approved retention reasons and durations rather than silently wiping them or inventing a timeframe. Personal fields should be erased or anonymized when retention is unnecessary. Revoke sessions, stop downloads, remove local account-bound media/keys as appropriate, and prevent another account accessing them.

Tests needed: owner reauthentication, another user's request rejected, expired/reused request rejected, scope of linked roles, active subscription explanation and cancellation path, private data removal, approved financial retention and request fulfillment. Implementation requires authorized backend/website work and approved policy decisions; it is not simulated in this Android preview.
