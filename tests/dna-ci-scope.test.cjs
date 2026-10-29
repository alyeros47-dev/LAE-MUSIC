"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { classify } = require("../scripts/dna-ci-scope.cjs");
function pair() {
  const c = {
      status: "approved",
      revision: "old",
      departments: [{ id: "gospel", research_groups: 14 }],
      categories: [{ id: "gospel-g1", group_id: "G1" }],
      styles: [{ id: "G1-01", category_id: "gospel-g1", rhythm: "unchanged" }],
    },
    next = structuredClone(c);
  next.revision = "new";
  next.categories.push({ id: "gospel-g3", group_id: "G3" });
  next.styles.push({ id: "G3-01", category_id: "gospel-g3", rhythm: "new" });
  return { before: c, after: next };
}
test("incremental catalogue/package changes select only the new group, not the full PR history", () => {
  const x = classify({
    files: [
      "config/music-dna.json",
      "tests/music-dna-g3.test.cjs",
      "docs/MUSIC-DNA-G3.md",
    ],
    ...pair(),
  });
  assert.equal(x.mode, "focused");
  assert.deepEqual(x.groups, ["G3"]);
  assert.equal(x.shared, false);
});
test("shared DNA changes add relevant tests; an unchanged catalogue uses a small existing-group regression", () => {
  const p = pair();
  let x = classify({
    files: ["config/music-dna.json", "lib/music-dna.js"],
    ...p,
  });
  assert.equal(x.mode, "shared");
  assert.deepEqual(x.groups, ["G3"]);
  x = classify({
    files: ["lib/music-dna.js"],
    before: p.before,
    after: p.before,
  });
  assert.deepEqual(x.groups, ["G1"]);
});
test("unrelated application, finance, dependency and test registration changes cannot bypass full verification", () => {
  for (const file of [
    "server.js",
    "lib/credits.js",
    "lib/payments/refunds.js",
    "web/player.js",
  ])
    assert.equal(classify({ files: [file], ...pair() }).mode, "full");
  assert.equal(
    classify({
      files: ["package.json"],
      ...pair(),
      packageBefore: { dependencies: {} },
      packageAfter: { dependencies: { unsafe: "1" } },
    }).mode,
    "full",
  );
  assert.equal(
    classify({
      files: ["tests/all.cjs"],
      ...pair(),
      allBefore: "require('./safe.cjs');",
      allAfter: "require('./other.cjs');",
    }).mode,
    "full",
  );
});
test("the focused npm command and DNA-only test registration preserve all other commands", () => {
  const packageBefore = { scripts: { test: "full" } },
    packageAfter = {
      scripts: { test: "full", "test:dna": "node scripts/test-music-dna.cjs" },
    };
  const x = classify({
    files: [
      "package.json",
      "tests/all.cjs",
      ".github/workflows/platform-tests.yml",
    ],
    ...pair(),
    packageBefore,
    packageAfter,
    allBefore: "require('./safe.cjs');",
    allAfter: "require('./safe.cjs');\nrequire('./music-dna-g3.test.cjs');",
  });
  assert.equal(x.mode, "focused");
  assert.deepEqual(x.groups, ["G3"]);
});
test("missing comparisons and changes to existing data are never silently skipped", () => {
  assert.equal(classify({ files: ["config/music-dna.json"] }).mode, "full");
  const p = pair();
  p.after.styles[0].rhythm = "changed";
  assert.deepEqual(
    classify({ files: ["config/music-dna.json"], ...p }).groups,
    ["G1", "G3"],
  );
});

test("only the exact data-driven catalogue-count browser assertion can use focused verification", () => {
  const browserBefore = `assert.equal(await page.locator('[name="musicDnaStyle"] optgroup').count(),2);`,
    browserAfter = `assert.equal(await page.locator('[name="musicDnaStyle"] optgroup').count(),g1Catalog.categories.length);`;
  assert.equal(
    classify({
      files: ["tests/browser.cjs"],
      ...pair(),
      browserBefore,
      browserAfter,
    }).mode,
    "focused",
  );
  assert.equal(
    classify({
      files: ["tests/browser.cjs"],
      ...pair(),
      browserBefore,
      browserAfter: browserAfter + "unsafeBehavior();",
    }).mode,
    "full",
  );
});
test("manual workflow dispatch preserves the explicit full-integration path", () => {
  const fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path"),
    { spawnSync } = require("node:child_process"),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lae-dna-scope-"));
  try {
    const event = path.join(dir, "event.json"),
      out = path.join(dir, "outputs");
    fs.writeFileSync(event, "{}");
    const r = spawnSync(process.execPath, ["scripts/dna-ci-scope.cjs"], {
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_EVENT_PATH: event,
        GITHUB_OUTPUT: out,
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).mode, "full");
    assert(fs.readFileSync(out, "utf8").includes("mode=full"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
