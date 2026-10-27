"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  snapshotOptions,
  exportArtists,
} = require("../scripts/export-review-artists.cjs");
const accounts = require("../lib/review-accounts"),
  { MODE } = require("../lib/review-catalog");
const env = {
  NODE_ENV: "staging",
  LAE_REVIEW_ENVIRONMENT: MODE,
  DATABASE_URL: "postgres://review@127.0.0.1:55432/lae_music_review",
};
const fixture = () => ({
  version: 1,
  scope: "artist_profiles_without_credentials",
  captured_at: "2026-10-27T00:00:00.000Z",
  artists: [
    {
      source_id: "7",
      display_name: "Owned artist",
      country: "Nigeria",
      bio: "Original biography",
      plan: "growth",
    },
  ],
});
const live =
    "postgresql://owner:fixture-live@ep-live.us-east-2.aws.neon.tech/neondb?sslmode=require",
  copy =
    "postgresql://owner:fixture-copy@ep-copy.us-east-2.aws.neon.tech/neondb?sslmode=require";
test("Neon artist exporter rejects production, pooler aliases and non-Neon/overridden connections before connecting", () => {
  const good = snapshotOptions(copy, live);
  assert.equal(good.ssl.rejectUnauthorized, true);
  assert.equal(good.options,undefined);
  assert.equal(good.max, 1);
  for (const x of [
    live,
    live.replace("ep-live.", "ep-live-pooler."),
    "postgres://user:secret@localhost/test",
    "https://owner:secret@ep-copy.neon.tech/a",
    copy + "&host=attacker.invalid",
  ])
    assert.throws(
      () => snapshotOptions(x, live),
      (e) =>
        !e.message.includes("fixture-live") &&
        !e.message.includes("fixture-copy"),
    );
});
test("Neon export uses read-only repeatable snapshot, exact projection and never returns credentials or email", async () => {
  const queries = [];
  let ended = false;
  class Pool {
    async connect() {
      return {
        query: async (sql) => {
          queries.push(sql);
          if (sql === "SHOW transaction_read_only")
            return { rows: [{ transaction_read_only: "on" }] };
          if (sql.includes("information_schema"))
            return {
              rows: [
                "id",
                "display_name",
                "country",
                "bio",
                "plan",
                "email",
                "password_salt",
                "password_hash",
              ].map((column_name) => ({ column_name })),
            };
          if (sql.startsWith('SELECT "'))
            return {
              rows: [
                {
                  id: "7",
                  display_name: "Owned artist",
                  country: "Nigeria",
                  bio: "Original biography",
                  plan: "growth",
                  email: "never-copy@example.com",
                  password_hash: "must-not-copy",
                },
              ],
            };
          return { rows: [] };
        },
        release() {},
      };
    }
    async end() {
      ended = true;
    }
  }
  const result = await exportArtists({
    connectionString: copy,
    productionConnectionString: live,
    Pool,
    now: () => new Date(fixture().captured_at),
  });
  assert.deepEqual(result, fixture());
  assert(ended);
  assert.equal(
    queries[0],
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  const sql = queries.find((x) => x.startsWith('SELECT "'));
  assert(!/password|email|session|bank/.test(sql));
  assert(!JSON.stringify(result).includes("never-copy"));
  assert.equal(queries.at(-1), "COMMIT");
});
test("uncertain source failures roll back, close and redact database error contents", async () => {
  const queries = [];
  let ended = false;
  class Pool {
    async connect() {
      return {
        query: async (sql) => {
          queries.push(sql);
          if (sql === "SHOW transaction_read_only")
            throw Error("secret postgres://private-password");
          return {};
        },
        release() {},
      };
    }
    async end() {
      ended = true;
    }
  }
  await assert.rejects(
    exportArtists({
      connectionString: copy,
      productionConnectionString: live,
      Pool,
    }),
    (e) =>
      !e.message.includes("private-password") &&
      e.message.includes("No source data was changed"),
  );
  assert(ended);
  assert.equal(queries.at(-1), "ROLLBACK");
});
test("snapshot validation rejects all private/unknown data, duplicate identities and oversized payloads", () => {
  for (const mutate of [
    (x) => (x.artists[0].email = "private"),
    (x) => (x.artists[0].password_hash = "private"),
    (x) => (x.artists[0].balance = 12),
    (x) => x.artists.push({ ...x.artists[0] }),
    (x) => (x.artists[0].plan = "unapproved"),
    (x) => (x.database_url = "secret"),
  ]) {
    const s = fixture();
    mutate(s);
    assert.throws(() => accounts.validateSnapshot(s));
  }
  assert.equal(
    accounts.snapshotFromEnvironment({
      ...env,
      [accounts.KEY]: JSON.stringify(fixture()),
    }).artists.length,
    1,
  );
  assert.equal(
    accounts.snapshotFromEnvironment({
      NODE_ENV: "production",
      [accounts.KEY]: JSON.stringify(fixture()),
    }),
    null,
  );
});
function mockPool({ found = true, wrongDb = false, already = false } = {}) {
  const calls = [];
  return {
    calls,
    connect: async function () {
      return { query: this.query.bind(this), release() {} };
    },
    async query(sql, args = []) {
      calls.push({ sql, args });
      if (sql.startsWith("SELECT current_database"))
        return {
          rows: [
            {
              name: wrongDb ? "production" : "lae_music_review",
              host: "127.0.0.1",
              port: 55432,
            },
          ],
        };
      if (sql.startsWith("SELECT artist_id FROM review_imported_artists"))
        return {
          rowCount: already ? 1 : 0,
          rows: already ? [{ artist_id: "17" }] : [],
        };
      if (sql.startsWith("SELECT artist_id FROM review_public_artists"))
        return { rowCount: 1, rows: [{ artist_id: "17" }] };
      if (sql.startsWith("SELECT c.id,c.email"))
        return {
          rowCount: found ? 1 : 0,
          rows: found
            ? [{ id: "17", email: "public-artist-7@review-catalog.invalid" }]
            : [],
        };
      return { rows: [], rowCount: 1 };
    },
  };
}
test("artist seeding attaches only mapped profiles and never copies passwords, subscriptions or balances", async () => {
  const p = mockPool();
  const r = await accounts.seed(p, { env, snapshot: fixture() });
  assert.equal(r.imported, 1);
  assert.equal(r.credentials_copied, false);
  assert(
    p.calls.some((x) => x.sql.includes("membership_status='review_imported'")),
  );
  assert(
    !p.calls.some((x) =>
      /INSERT INTO (artist_subscriptions|generation_wallets|finance_|sessions)|DELETE|password_salt/.test(
        x.sql,
      ),
    ),
  );
  assert.equal(p.calls.at(-1).sql, "COMMIT");
  const repeat = mockPool({ already: true });
  assert.equal(
    (await accounts.seed(repeat, { env, snapshot: fixture() })).imported,
    0,
  );
  assert(!repeat.calls.some((x) => x.sql.startsWith("UPDATE creators")));
});
test("artist seeding refuses production and verifies connected database before writes", async () => {
  await assert.rejects(
    accounts.seed(mockPool(), {
      env: { ...env, NODE_ENV: "production" },
      snapshot: fixture(),
    }),
  );
  const p = mockPool({ wrongDb: true });
  await assert.rejects(
    accounts.seed(p, { env, snapshot: fixture() }),
    /connected database identity/,
  );
  assert.equal(p.calls.length, 1);
  assert(p.calls[0].sql.startsWith("SELECT"));
});
test("test password changes hash a new password, revoke only copied account sessions and audit without credentials", async () => {
  const p = mockPool(),
    e = { ...env, [accounts.KEY]: JSON.stringify(fixture()) };
  const result = await accounts.setPassword(
    p,
    e,
    { id: "owner" },
    {
      artist_id: "17",
      password: "IsolatedTestPassword123",
      confirmPassword: "IsolatedTestPassword123",
    },
  );
  assert.equal(result.live_accounts_changed, false);
  const update = p.calls.find((x) =>
    x.sql.startsWith("UPDATE creators SET password_salt"),
  );
  assert.equal(update.args[0], "17");
  assert(
    await require("../lib/passwords").verifyPassword(
      "IsolatedTestPassword123",
      { password_salt: update.args[1], password_hash: update.args[2] },
    ),
  );
  assert(
    p.calls.some((x) => x.sql === "DELETE FROM sessions WHERE creator_id=$1"),
  );
  assert(
    !p.calls
      .filter((x) => x.sql.includes("platform_audit"))
      .some((x) => JSON.stringify(x.args).includes("IsolatedTestPassword")),
  );
  const absent = mockPool({ found: false });
  await assert.rejects(
    accounts.setPassword(
      absent,
      e,
      { id: "owner" },
      {
        artist_id: "99",
        password: "IsolatedTestPassword123",
        confirmPassword: "IsolatedTestPassword123",
      },
    ),
    (x) => x.status === 404,
  );
  assert(!absent.calls.some((x) => x.sql.startsWith("UPDATE creators")));
  assert.equal(absent.calls.at(-1).sql, "ROLLBACK");
});
test("non-owner administrators cannot reach review account controls", () => {
  const { routePermission } = require("../lib/admin-auth");
  for (const role of ["finance", "content", "support"])
    for (const path of [
      "/api/platform/admin/review-accounts",
      "/api/platform/admin/review-accounts/password",
    ])
      assert.equal(
        routePermission(role, new URL("https://review.invalid" + path), "POST")
          .allowed,
        false,
      );
});
test("hosted copied-account verifier uses the existing owner login contract and destroys its temporary credential", async () => {
  const { verify } = require("../scripts/verify-review-accounts.cjs");
  const calls = [];
  const r = await verify({
    adminKey: "isolated-owner-key",
    fetchImpl: async (value, o) => {
      const u = new URL(value),
        p = u.pathname,
        b = o.body ? JSON.parse(o.body) : {};
      calls.push({ p, o, b });
      const response = (x, status = 200, cookie) =>
        new Response(JSON.stringify(x), {
          status,
          headers: cookie ? { "set-cookie": cookie } : {},
        });
      assert.equal(u.origin, "https://lae-music-review-sandbox.onrender.com");
      if (p === "/api/admin/login") {
        assert.deepEqual(b, { password: "isolated-owner-key" });
        return response({}, 200, "lae_admin=fixture; Secure");
      }
      if (p === "/api/platform/admin/review-accounts") {
        if (!o.headers.Cookie || o.headers.Cookie === "lae_session=fixture")
          return response({}, 401);
        return response({
          configured: true,
          artists: [
            { id: "17", email: "public-artist-7@review-catalog.invalid" },
          ],
        });
      }
      if (p === "/api/music/artists")
        return response({ artists: [{ id: "17" }] });
      if (p === "/api/platform/admin/review-accounts/password") {
        assert.equal(b.password, b.confirmPassword);
        return response({ live_accounts_changed: false });
      }
      if (p === "/api/platform/account/login")
        return response({}, 200, "lae_session=fixture; Secure");
      if (p === "/api/platform/session")
        return response({
          artist: { id: "17", membership_status: "review_imported" },
        });
      if (p === "/api/music/mine")
        return response({ tracks: [{ artist_id: "17" }] });
      if (p === "/api/artist/studio-allowance")
        return response({ active: false });
      if (p === "/api/logout" || p === "/api/admin/logout")
        return response({ ok: true });
      throw Error("Unexpected route");
    },
  });
  assert.equal(r.verified, true);
  assert.equal(r.artist_login_verified, true);
  const resets = calls.filter((x) => x.p.endsWith("/review-accounts/password"));
  assert.equal(resets.length, 2);
  assert.notEqual(resets[0].b.password, resets[1].b.password);
  assert(!JSON.stringify(r).includes("isolated-owner-key"));
  assert(!JSON.stringify(r).includes("public-artist"));
});
