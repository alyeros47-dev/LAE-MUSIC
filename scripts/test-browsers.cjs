"use strict";
const { spawnSync } = require("node:child_process");
for (const file of ["tests/browser.cjs", "tests/offline-browser.cjs"]) {
  const result = spawnSync(process.execPath, [file], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
