"use strict";
const { spawnSync } = require("node:child_process");
const { engines } = require("../tests/browser-engine.cjs");
const selected = (
  process.env.LAE_TEST_BROWSERS ||
  process.env.LAE_TEST_BROWSER ||
  "chromium"
).split(",");
if (
  !selected.length ||
  selected.some((engine) => !engines.includes(engine)) ||
  new Set(selected).size !== selected.length
) {
  throw Error(
    "LAE_TEST_BROWSERS must select unique supported browser engines.",
  );
}
for (const engine of selected) {
  for (const file of ["tests/browser.cjs", "tests/offline-browser.cjs", "tests/artist-downloads-browser.cjs"]) {
    const result = spawnSync(process.execPath, [file], {
      stdio: "inherit",
      env: { ...process.env, LAE_TEST_BROWSER: engine },
    });
    if (result.status !== 0) {
      process.exitCode = result.status || 1;
      process.exit(process.exitCode);
    }
  }
}
