"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const review = require("../lib/review-testing");
const env = {
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: "pr6-ephemeral-review-v1",
  LAE_REVIEW_TEST_ACCESS: "1",
  DATABASE_URL: "postgres://local@127.0.0.1:55432/lae_music_review",
};
test("temporary free testing is impossible outside the explicit review environment", async () => {
  assert(review.enabled(env));
  for (const e of [
    {},
    { ...env, NODE_ENV: "production" },
    { ...env, LAE_REVIEW_TEST_ACCESS: "0" },
    { ...env, LAE_REVIEW_ENVIRONMENT: "unknown" },
  ]) {
    assert(!review.enabled(e));
    const api = review.create({
      env: e,
      pool: {
        query() {
          throw Error("Must not query");
        },
      },
      me() {
        throw Error("Must not authenticate");
      },
    });
    assert.equal(
      await api.handle(
        { method: "POST" },
        {},
        new URL("https://review.invalid/api/music/upload/start"),
      ),
      false,
    );
  }
  let queries = 0;
  await assert.rejects(
    review.init(
      {
        connect: async () => ({
          query: async () => {
            queries++;
            return {
              rows: [{ name: "production", host: "127.0.0.1", port: 55432 }],
            };
          },
          release() {},
        }),
      },
      env,
    ),
    /connected database/,
  );
  assert.equal(queries, 1);
});
test("test files cannot escape the isolated media directory and seek ranges handle boundaries", () => {
  const root = "/tmp/review-unit";
  assert.equal(
    review.filePath(root, "review/7/" + "a".repeat(32) + ".mp3"),
    root + "/review/7/" + "a".repeat(32) + ".mp3",
  );
  for (const key of [
    "../secret",
    "review/7/../../secret",
    "music/live.mp3",
    "/etc/passwd",
    "review/0/" + "a".repeat(32) + ".mp3",
  ])
    assert.throws(() => review.filePath(root, key));
  assert.deepEqual(review.byteRange("bytes=0-63", 100), {
    start: 0,
    end: 63,
    status: 206,
  });
  assert.deepEqual(review.byteRange("bytes=-10", 100), {
    start: 90,
    end: 99,
    status: 206,
  });
  assert.deepEqual(review.byteRange("bytes=90-", 100), {
    start: 90,
    end: 99,
    status: 206,
  });
  for (const range of [
    "bytes=100-",
    "bytes=5-1",
    "bytes=0-1,3-4",
    "bytes=-0",
    "bad",
  ])
    assert.throws(
      () => review.byteRange(range, 100),
      (e) => e.status === 416,
    );
});
test("shared provider capacity fails closed on malformed state and never invents extra paid capacity", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lae-review-budget-unit-")),
    file = path.join(dir, "budget.json");
  try {
    assert.equal(review.providerRemaining(file), 1);
    fs.writeFileSync(file, JSON.stringify({ musicapi: 1 }));
    assert.equal(review.providerRemaining(file), 0);
    fs.writeFileSync(file, JSON.stringify({ musicapi: -1 }));
    assert.equal(review.providerRemaining(file), 0);
    fs.writeFileSync(file, "invalid");
    assert.equal(review.providerRemaining(file), 0);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("trial reservation is once-only, expiry-aware and separate from paid subscriptions", async () => {
  const calls = [];
  let used = false;
  const db = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      if (sql.startsWith("SELECT expires_at"))
        return { rows: [{ active: true, expires_at: "future" }] };
      if (sql.startsWith("INSERT INTO review_trial_usage")) {
        const exists = used;
        used = true;
        return { rowCount: exists ? 0 : 1 };
      }
      return { rows: [] };
    },
  };
  await review.reserve(db, 7, "trial-one");
  await assert.rejects(
    review.reserve(db, 7, "trial-two"),
    (e) => e.status === 402,
  );
  assert(
    !calls.some((x) =>
      /artist_subscriptions|finance_|generation_wallets|payment_/.test(x.sql),
    ),
  );
  const expired = {
    query: async (sql) =>
      sql.startsWith("SELECT expires_at")
        ? { rows: [{ active: false }] }
        : { rows: [] },
  };
  await assert.rejects(
    review.reserve(expired, 7, "expired"),
    (e) => e.status === 403,
  );
});
test("upload preparation requires sign-in, same origin, ownership rights and valid metadata before file writes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lae-review-upload-unit-"));
  try {
    for (const user of [null, { id: 7 }]) {
      let writes = 0;
      const service = review.create({
        env,
        pool: {
          query: async (sql) =>
            sql.startsWith("SELECT expires_at")
              ? { rows: [{ active: true }] }
              : { rows: [] },
          connect: async () => {
            writes++;
            throw Error("Must not reserve invalid file");
          },
        },
        root: dir,
        me: async () => user,
        validOrigin: () => true,
        body: async () => ({
          title: "Test",
          genre: "Highlife",
          audioMime: "text/html",
          audioBytes: 1024,
          rightsConfirmed: true,
        }),
        json() {},
      });
      await assert.rejects(
        service.handle(
          { method: "POST" },
          {},
          new URL("https://review.invalid/api/music/upload/start"),
        ),
        (e) => e.status === (user ? 400 : 401),
      );
      assert.equal(writes, 0);
    }
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
function sonicTrial(provider) {
  const vm = require("node:vm"),
    { createRequire } = require("node:module");
  let used = false,
    network = 0;
  const requests = new Map(),
    calls = [];
  const query = async (sql, args = []) => {
    calls.push({ sql, args });
    const row = (x) => ({ rows: [x], rowCount: 1 }),
      none = { rows: [], rowCount: 0 };
    if (sql.includes("SELECT payload_hash,task_reference,result"))
      return requests.has(args[1]) ? row(requests.get(args[1])) : none;
    if (sql.startsWith("SELECT count(*)::int AS total"))
      return row({ active: 0, total: 0 });
    if (sql.startsWith("SELECT id FROM creators")) return row({ id: 7 });
    if (sql.startsWith("SELECT COUNT(*)::int AS n")) return row({ n: 0 });
    if (sql.startsWith("SELECT id,plan FROM artist_subscriptions")) return none;
    if (sql.startsWith("SELECT expires_at")) return row({ active: true });
    if (sql.startsWith("INSERT INTO review_trial_usage")) {
      if (used) return none;
      used = true;
      return row({ artist_id: 7 });
    }
    if (sql.startsWith("DELETE FROM review_trial_usage")) {
      used = false;
      return none;
    }
    if (sql.startsWith("INSERT INTO studio_request_keys"))
      requests.set(args[1], { payload_hash: args[2], task_reference: args[3] });
    if (sql.startsWith("UPDATE studio_request_keys SET task_reference"))
      requests.get(args[1]).task_reference = args[2];
    if (sql.startsWith("UPDATE studio_request_keys SET result"))
      requests.get(args[1]).result = JSON.parse(args[2]);
    return row({ id: 1, task_id: "provider_trial_12345" });
  };
  const pool = { query, connect: async () => ({ query, release() {} }) },
    context = {
      module: { exports: {} },
      require: createRequire(path.resolve("musicapi-sonic.js")),
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      console,
      process: { env: { ...env, MUSICAPI_API_KEY: "mock-only" } },
      fetch: async (...args) => {
        network++;
        return provider(...args);
      },
    };
  vm.runInNewContext(fs.readFileSync("musicapi-sonic.js", "utf8"), context);
  return {
    calls,
    used: () => used,
    network: () => network,
    async run(key = "review_trial_key_12345") {
      const input = {
        title: "Original trial song",
        lyrics: "Original words for the isolated sandbox trial test.",
        style: "Highlife guitars",
      };
      const req = {
          method: "POST",
          url: "/api/music/sonic/create",
          headers: { "idempotency-key": key },
          async *[Symbol.asyncIterator]() {
            yield JSON.stringify(input);
          },
        },
        res = {
          writeHead(status) {
            this.status = status;
          },
          end(s) {
            this.data = JSON.parse(s);
          },
        };
      await context.module.exports(req, res, "/api/music/sonic/create", {
        pool,
        me: async () => ({ id: 7 }),
        validOrigin: () => true,
      });
      return res;
    },
  };
}
test("mocked real Sonic handler uses one separate trial and replays without a fake subscription or second provider call", async () => {
  const s = sonicTrial(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ task_id: "provider_trial_12345" }),
  }));
  const first = await s.run(),
    again = await s.run();
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.equal(first.data.task_id, again.data.task_id);
  assert.equal(s.network(), 1);
  assert(s.used());
  assert(
    !s.calls.some(
      (x) =>
        x.sql.startsWith("INSERT INTO artist_studio_usage") ||
        x.sql.startsWith("INSERT INTO artist_subscriptions"),
    ),
  );
});
test("mocked definitive provider rejection releases the trial once without issuing financial credits", async () => {
  const s = sonicTrial(async () => ({
    ok: false,
    status: 400,
    json: async () => ({ message: "Rejected fixture song" }),
  }));
  const r = await s.run();
  assert.equal(r.status, 502);
  assert.equal(s.used(), false);
  assert.equal(
    s.calls.filter((x) => x.sql.startsWith("DELETE FROM review_trial_usage"))
      .length,
    1,
  );
  assert(
    !s.calls.some((x) => /generation_wallets|finance_transfers/.test(x.sql)),
  );
});
test("mocked uncertain provider acceptance keeps the trial reserved and prevents a second charge attempt", async () => {
  const s = sonicTrial(async () => {
    throw Error("Uncertain fixture timeout");
  });
  const r = await s.run();
  assert.equal(r.status, 503);
  assert.equal(r.data.status, "verification_required");
  assert(s.used());
  const again = await s.run("review_other_trial_key_12345");
  assert.equal(again.status, 402);
  assert.equal(s.network(), 1);
  assert(
    !s.calls.some((x) => x.sql.startsWith("DELETE FROM review_trial_usage")),
  );
});
