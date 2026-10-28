"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const state = require("../deploy/review-state.cjs");
const env = {
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: "pr6-ephemeral-review-v1",
  LAE_REVIEW_PERSISTENT_STORAGE: "1",
};
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lae-state-test-")),
    root = path.join(base, "volume"),
    legacyRoot = path.join(base, "tmp");
  fs.mkdirSync(root);
  fs.mkdirSync(legacyRoot);
  return {
    root,
    legacyRoot,
    env,
    mountInfo: "1 0 0:1 / " + root + " rw - ext4 owned rw",
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}
test("review state survives a new container path while passwords, media and paid test counters stay unchanged", () => {
  const f = fixture();
  try {
    assert(state.prepare(f).persistent);
    fs.writeFileSync(path.join(f.root, "postgres", "PG_VERSION"), "16\n");
    fs.writeFileSync(
      path.join(f.root, "media", "owned-test"),
      "original bytes",
    );
    fs.writeFileSync(
      path.join(f.root, "provider-budget.json"),
      JSON.stringify({ openai: 2, musicapi: 1 }),
    );
    const password = fs.readFileSync(path.join(f.root, "password"), "utf8");
    for (const name of Object.keys(state.LINKS))
      fs.unlinkSync(path.join(f.legacyRoot, name));
    assert(state.prepare(f).persistent);
    assert.equal(
      fs.readFileSync(path.join(f.root, "password"), "utf8"),
      password,
    );
    assert.equal(
      fs.readFileSync(path.join(f.root, "media", "owned-test"), "utf8"),
      "original bytes",
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.root, "provider-budget.json")))
        .musicapi,
      1,
    );
    assert.equal(
      fs.statSync(path.join(f.root, "password")).mode & 0o777,
      0o600,
    );
  } finally {
    f.cleanup();
  }
});
test("persistent mode refuses missing mount, foreign disk and local data without overwriting anything", () => {
  const f = fixture();
  try {
    assert.throws(() => state.prepare({ ...f, mountInfo: "" }), /mounted disk/);
    fs.writeFileSync(path.join(f.root, "production-data"), "untouched");
    assert.throws(() => state.prepare(f), /not empty/);
    assert.equal(
      fs.readFileSync(path.join(f.root, "production-data"), "utf8"),
      "untouched",
    );
    fs.unlinkSync(path.join(f.root, "production-data"));
    fs.writeFileSync(
      path.join(f.legacyRoot, "lae-review-password"),
      "local secret",
    );
    assert.throws(() => state.prepare(f), /explicit migration/);
    assert.equal(
      fs.readFileSync(path.join(f.legacyRoot, "lae-review-password"), "utf8"),
      "local secret",
    );
  } finally {
    f.cleanup();
  }
});
test("non-review/production connections and malformed flags are refused before state writes", () => {
  const f = fixture();
  try {
    for (const change of [
      { NODE_ENV: "production" },
      { LAE_REVIEW_ENVIRONMENT: "production" },
      { DATABASE_URL: "postgres://u:p@production.test/live" },
      { RENDER_SERVICE_ID: "srv-production" },
      { LAE_REVIEW_PERSISTENT_STORAGE: "yes" },
    ])
      assert.throws(() => state.prepare({ ...f, env: { ...env, ...change } }));
    assert.deepEqual(fs.readdirSync(f.root), []);
  } finally {
    f.cleanup();
  }
});
test("missing persistent secrets, wrong database version and linked external files fail closed", () => {
  const f = fixture();
  try {
    state.prepare(f);
    fs.writeFileSync(path.join(f.root, "postgres", "PG_VERSION"), "17");
    assert.throws(() => state.verify(f), /version mismatch/);
    fs.writeFileSync(path.join(f.root, "postgres", "PG_VERSION"), "16");
    fs.unlinkSync(path.join(f.root, "password"));
    assert.throws(() => state.prepare(f), /incomplete/);
    assert(!fs.existsSync(path.join(f.root, "password")));
    const outside = path.join(f.root, "..", "outside-test");
    fs.writeFileSync(outside, "untouched");
    fs.symlinkSync(outside, path.join(f.root, "password"));
    assert.throws(() => state.prepare(f), /incomplete/);
    assert.equal(fs.readFileSync(outside, "utf8"), "untouched");
  } finally {
    f.cleanup();
  }
});
test("default ephemeral operation stays explicit and paid validation accepts only the exact isolated one-GB disk", () => {
  assert.deepEqual(
    state.prepare({ env: { ...env, LAE_REVIEW_PERSISTENT_STORAGE: "0" } }),
    { persistent: false },
  );
  const s = {
    id: "srv-dbfmk5ss728c73ded300",
    serviceDetails: {
      plan: "starter",
      disk: {
        id: "dsk-test",
        name: "lae-music-review-state",
        mountPath: "/var/lib/lae-review",
        sizeGB: 1,
      },
    },
  };
  assert(state.persistentService(s));
  for (const patch of [
    { id: "srv-production" },
    { serviceDetails: { ...s.serviceDetails, plan: "standard" } },
    {
      serviceDetails: {
        ...s.serviceDetails,
        disk: { ...s.serviceDetails.disk, sizeGB: 10 },
      },
    },
    {
      serviceDetails: {
        ...s.serviceDetails,
        disk: { ...s.serviceDetails.disk, mountPath: "/production" },
      },
    },
  ])
    assert(!state.persistentService({ ...s, ...patch }));
});
