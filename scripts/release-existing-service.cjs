"use strict";
const { release } = require("../lib/production-release");
async function main() {
  const deployingMain =
    process.env.LAE_RELEASE_MODE === "deploy" &&
    process.env.GITHUB_REF === "refs/heads/main";
  if (
    process.env.GITHUB_REPOSITORY !== "alyeros47-dev/LAE-MUSIC" ||
    (!deployingMain &&
      process.env.GITHUB_REF !== "refs/heads/codex/premium-platform-release") ||
    process.env.GITHUB_SHA !==
      (deployingMain
        ? process.env.LAE_RELEASE_COMMIT_SHA
        : process.env.LAE_RELEASE_CANDIDATE_SHA)
  )
    throw Error("Release workflow identity mismatch");
  const report = await release({
    mode: process.env.LAE_RELEASE_MODE,
    candidate: process.env.LAE_RELEASE_CANDIDATE_SHA,
    commit: process.env.LAE_RELEASE_COMMIT_SHA,
    ciRun: process.env.LAE_RELEASE_CI_RUN,
    key: process.env.RENDER_API_KEY,
    neonKey: process.env.NEON_API_KEY,
    githubToken: process.env.GITHUB_TOKEN,
    record: (x) => console.log(JSON.stringify(x)),
  });
  console.log(JSON.stringify(report));
}
if (require.main === module)
  main().catch((e) => {
    console.error("Existing-service release stopped:", e.message);
    process.exitCode = 1;
  });
module.exports = { main };
