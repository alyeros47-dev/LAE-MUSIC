"use strict";
const { spawnSync } = require("node:child_process"),
  fs = require("node:fs");
const args = process.argv.slice(2);
let groups;
if (args.length) {
  if (args[0] !== "--groups" || args.length !== 2)
    throw Error("Use npm run test:dna -- --groups G3");
  groups = args[1].split(",");
} else {
  if (!Object.hasOwn(process.env, "LAE_DNA_GROUPS"))
    throw Error(
      "Specify --groups G3, or let CI provide the changed-group list.",
    );
  groups = JSON.parse(process.env.LAE_DNA_GROUPS);
}
if (
  !Array.isArray(groups) ||
  groups.some((g) => !/^[A-Z]+[1-9][0-9]*$/.test(g)) ||
  new Set(groups).size !== groups.length
)
  throw Error("Choose distinct Music DNA group IDs.");
function run(...cmd) {
  const r = spawnSync(process.execPath, cmd, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
run("scripts/check-music-dna.cjs");
run("--test", "tests/dna-ci-scope.test.cjs");
for (const group of groups) {
  const file = "tests/music-dna-" + group.toLowerCase() + ".test.cjs";
  if (!fs.existsSync(file)) throw Error("No focused contract for " + group);
  run("--test", file);
}
if (process.env.LAE_DNA_SHARED === "true")
  run("--test", "tests/music-dna.test.cjs", "tests/music-dna-smoke.test.cjs");
if (process.env.LAE_DNA_METADATA === "true") {
  run("--check", "tests/browser.cjs");
  run(
    "--test",
    "--test-name-pattern=G1 public names|G2 keeps all five",
    "tests/music-dna-g1.test.cjs",
    "tests/music-dna-g2.test.cjs",
  );
}
console.log(
  JSON.stringify({
    status: "focused_music_dna_passed",
    groups,
    shared_checks: process.env.LAE_DNA_SHARED === "true",
    paid_provider_calls: 0,
    full_platform_tests: false,
  }),
);
