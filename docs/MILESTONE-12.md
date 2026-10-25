# Read-only release verification

`npm run preflight` emits a JSON report of configuration presence and outstanding release gates. It intentionally exits **2** while the current candidate has unresolved production requirements. Credentials are not printed, and their presence is not treated as integration verification. This command cannot activate gateways, send email, call a music provider, grant credits, renew packages or apply migrations.

To inspect a sanitized staging/production-schema clone with its own reviewed connection credentials:

```sh
npm run --silent preflight -- --database > preflight-report.json
```

The optional database inspection uses the same verified TLS/private-host policy as the application. It opens a repeatable-read, read-only transaction, sets statement/lock timeouts, checks required tables and migration checksums, stops on missing/changed/unknown migration history, and checks expected migration triggers are enabled on their intended tables. It then checks original purchase/receipt consistency, ledger account/currency integrity, negative artist earned/held balances and active-owner invariants. Unresolved checkout/refund/commission reconciliation counts are reported separately. It never repairs or resets records.

Exit 2 is the current release-blocked result, not a passing external integration test. A database subsection marked `pass` means only the listed read-only consistency checks passed. It does not establish that a sanitized production clone, provider settlement, migration lock time, query plans, backups, recovery or load were reviewed. Database failures produce a generic unavailable result without printing connection strings or raw database errors.

Behavioral tests cover secret omission, migration drift and read-only rollback/release. The PostgreSQL suite exercises the actual fresh-schema report before financial fixtures are added, confirms no migration/subscription/transfer counts change and also exercises coordinated staging notification-worker startup and shutdown. The local default report is recorded in `artifacts/preflight-report.json`; no external database was inspected from this workspace. Final CI evidence is recorded in the release notes.

Use [FEATURE-STATUS.md](FEATURE-STATUS.md) alongside this report. Neither code configuration nor a green fixture suite authorizes the final deployment announcement. Live commercial processing, paid-download pricing, streaming revenue funding and the other documented external/business gates remain unresolved.
