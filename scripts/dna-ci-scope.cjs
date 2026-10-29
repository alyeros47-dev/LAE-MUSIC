"use strict";
const fs = require("node:fs"),
  { execFileSync } = require("node:child_process");
const stable = (v) =>
  JSON.stringify(
    Array.isArray(v)
      ? v.map((x) => JSON.parse(stable(x)))
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, JSON.parse(stable(v[k]))]),
          )
        : v,
  );
const same = (a, b) => stable(a) === stable(b);
const SHARED = new Set([
  "lib/music-dna.js",
  "web/music-dna.js",
  "web/studio-engine.js",
  "tests/music-dna-group-contract.cjs",
  "tests/lyrics-handler-fixture.cjs",
  "tests/music-dna-fixture.cjs",
  "tests/music-dna.test.cjs",
  "tests/music-dna-smoke.test.cjs",
]);
const SUPPORT = new Set([
  ".github/workflows/platform-tests.yml",
  "scripts/dna-ci-scope.cjs",
  "scripts/test-music-dna.cjs",
  "scripts/check-music-dna.cjs",
  "tests/dna-ci-scope.test.cjs",
]);
function classify({
  files,
  before,
  after,
  packageBefore,
  packageAfter,
  allBefore = "",
  allAfter = "",
  browserBefore = "",
  browserAfter = "",
}) {
  const full = (reason) => ({
    mode: "full",
    groups: [],
    shared: false,
    metadata: false,
    reason,
  });
  let shared = false,
    metadata = false;
  for (const file of files) {
    if (SHARED.has(file)) {
      shared = true;
      continue;
    }
    if (
      SUPPORT.has(file) ||
      file === "config/music-dna.json" ||
      /^docs\/MUSIC-DNA[-A-Z0-9]*\.md$/.test(file)
    )
      continue;
    if (/^tests\/music-dna-[a-z]+\d+(?:-output)?(?:\.test)?\.cjs$/.test(file)) {
      metadata = metadata || /^tests\/music-dna-(g1|g2)\.test\.cjs$/.test(file);
      continue;
    }
    if (file === "package.json") {
      const a = structuredClone(packageBefore),
        b = structuredClone(packageAfter);
      if (!a || !b) return full("Package inventory unavailable");
      if (a.scripts) delete a.scripts["test:dna"];
      if (b.scripts) delete b.scripts["test:dna"];
      if (!same(a, b))
        return full("Dependencies or unrelated package commands changed");
      continue;
    }
    if (file === "tests/browser.cjs") {
      const oldCount = `assert.equal(await page.locator('[name="musicDnaStyle"] optgroup').count(),2);`;
      const newCount = `assert.equal(await page.locator('[name="musicDnaStyle"] optgroup').count(),g1Catalog.categories.length);`;
      if (
        !browserBefore.includes(oldCount) ||
        browserBefore.replace(oldCount, newCount) !== browserAfter
      )
        return full(
          "Browser behavior changed beyond a catalogue count assertion",
        );
      metadata = true;
      continue;
    }
    if (file === "tests/all.cjs") {
      const strip = (s) =>
        s
          .split("\n")
          .filter(
            (l) =>
              l.trim() &&
              !/^\s*require\(['"]\.\/music-dna[-a-z0-9.]*\.cjs['"]\);?\s*$/.test(
                l,
              ),
          )
          .join("\n");
      if (strip(allBefore) !== strip(allAfter))
        return full("Unrelated test registration changed");
      continue;
    }
    return full("Change outside the Music DNA boundary");
  }
  if (
    !before ||
    !after ||
    !Array.isArray(before.styles) ||
    !Array.isArray(after.styles)
  )
    return full("Catalogue comparison unavailable");
  if (
    !same(before.departments, after.departments) ||
    before.status !== after.status
  )
    return full("Shared department or approval policy changed");
  const beforeCats = new Map(before.categories.map((c) => [c.id, c])),
    afterCats = new Map(after.categories.map((c) => [c.id, c]));
  const a = new Map(before.styles.map((s) => [s.id, s])),
    b = new Map(after.styles.map((s) => [s.id, s])),
    groups = new Set();
  function group(style, cats) {
    const id = cats.get(style.category_id)?.group_id;
    if (!/^[A-Z]+[1-9][0-9]*$/.test(id || "")) return false;
    groups.add(id);
    return true;
  }
  for (const [id, s] of b)
    if (!same(a.get(id) || null, s) && !group(s, afterCats))
      return full("Changed style lacks an explicit group");
  for (const [id, s] of a)
    if (!b.has(id) && !group(s, beforeCats))
      return full("Removed style lacks a group");
  for (const [id, c] of afterCats)
    if (!same(c, beforeCats.get(id) || null))
      for (const s of b.values())
        if (s.category_id === id && !group(s, afterCats))
          return full("Category scope unavailable");
  if (!groups.size && shared) {
    const first = after.categories.find((c) => c.group_id);
    if (first) groups.add(first.group_id);
  }
  return {
    mode: shared ? "shared" : "focused",
    groups: [...groups].sort(),
    shared,
    metadata,
    reason: shared
      ? "Relevant shared DNA checks and a small regression"
      : "Catalogue/package-only verification",
  };
}
function main() {
  let result = {
    mode: "full",
    groups: [],
    shared: false,
    metadata: false,
    reason: "Explicit full integration or initial PR",
  };
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  if (
    process.env.GITHUB_EVENT_NAME === "pull_request" &&
    event.action === "synchronize" &&
    /^[a-f0-9]{40}$/.test(event.before || "") &&
    /^[a-f0-9]{40}$/.test(event.pull_request?.head?.sha || "")
  ) {
    const before = event.before,
      after = event.pull_request.head.sha;
    const git = (...args) =>
      execFileSync("git", args, {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
    const read = (sha, p) => git("show", sha + ":" + p),
      json = (sha, p) => JSON.parse(read(sha, p));
    try {
      result = classify({
        files: git("diff", "--name-only", "-z", before, after)
          .split("\0")
          .filter(Boolean),
        before: json(before, "config/music-dna.json"),
        after: json(after, "config/music-dna.json"),
        packageBefore: json(before, "package.json"),
        packageAfter: json(after, "package.json"),
        allBefore: read(before, "tests/all.cjs"),
        allAfter: read(after, "tests/all.cjs"),
        browserBefore: read(before, "tests/browser.cjs"),
        browserAfter: read(after, "tests/browser.cjs"),
      });
    } catch {
      result.reason = "Comparison failed; full verification required";
    }
  }
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `mode=${result.mode}\ngroups=${JSON.stringify(result.groups)}\nshared=${result.shared}\nmetadata=${result.metadata}\n`,
    );
  console.log(JSON.stringify(result));
}
if (require.main === module) main();
module.exports = { classify };
