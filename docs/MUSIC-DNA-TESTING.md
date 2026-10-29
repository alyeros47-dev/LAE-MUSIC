# Focused package verification

For a new package, use:

```
npm run test:dna -- --groups G3
```

This validates the catalogue, CI scope guards and the current group's focused tests.
It does not run payments, affiliates, withdrawals, streaming, PostgreSQL or full
browser journeys. Provider responses are mocked and no paid generation is performed.
The runner requires an explicit group or a CI-provided list so an empty invocation
cannot be mistaken for verification of every style.

For relevant shared DNA changes, the same CI runner additionally executes the small
foundation suite and a single previous-style smoke check. Catalogue-wide public
metadata assertions are data-driven; current one-time housekeeping checks only two
older groups' public metadata tests, not their complete generation suites.

## CI routing

`change-scope` compares the previous PR head with the current PR head on synchronize
events. It deliberately does not compare the entire accumulating PR with main, which
would keep rerunning old integration work for each new catalogue package.

- Catalogue/profile additions and group-specific fixtures select only changed groups.
- Shared DNA components select relevant foundation checks and a small regression.
- Only the exact catalogue-count update in the browser test is treated as metadata
  housekeeping; other browser behavior changes require full verification.
- Changes outside the explicit DNA boundary, unrelated dependency/script changes,
  unavailable comparisons or classifier failure cannot silently skip full checks.
- Initial PR and manual workflow dispatch retain full verification. Final integration
  can run `platform-tests.yml` manually on the exact candidate with default inputs.
- Production release/audit/recovery job contents and authorization conditions are
  unchanged. Focused runs do not satisfy the full integration/release gate.

The G3 update also validates the workflow YAML and confirms that existing production
jobs are unchanged. CI scope behavior has direct unit tests, including explicit manual
full-integration routing. Future routine data packages normally need only their own
focused suite; shared-component checks are added only for changed shared components.

Report focused results as focused results. Previously passed full suites do not
establish full-platform verification of a newer package candidate. Reserve complete
end-to-end/provider acceptance for the final integration stage and required approvals.
