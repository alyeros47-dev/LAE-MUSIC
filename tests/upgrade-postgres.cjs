"use strict";
// Populated historical-release fixtures, never a production clone or migration reset.
const assert = require("node:assert/strict"),
  test = require("node:test");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { Pool } = require("pg"),
  { bootstrap } = require("./legacy-bootstrap.cjs");
const { migrate } = require("../lib/migrations"),
  { hashPassword, verifyPassword } = require("../lib/passwords");
const finance = require("../lib/finance"),
  { transaction } = require("../lib/transactions");
const target = require("./ci-database.cjs").ciDatabase();
const control = new Pool({ connectionString: target.href, ssl: false });
const migrations = fs
  .readdirSync(path.join(__dirname, "../migrations"))
  .filter((x) => /^\d+.*\.sql$/.test(x))
  .sort();
async function historical(pool, count) {
  await transaction(pool, async (db) => {
    await db.query(
      "CREATE TABLE platform_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    for (const version of migrations.slice(0, count)) {
      const sql = fs.readFileSync(
        path.join(__dirname, "../migrations", version),
        "utf8",
      );
      await db.query(sql);
      await db.query(
        "INSERT INTO platform_migrations(version,checksum) VALUES($1,$2)",
        [version, crypto.createHash("sha256").update(sql).digest("hex")],
      );
    }
  });
}
async function seed(pool, checkpoint) {
  const password = await hashPassword("HistoricalFixturePassword123");
  const artist = (
    await pool.query(
      "INSERT INTO creators(display_name,email,password_salt,password_hash,plan,membership_status) VALUES('Preserved artist','artist@upgrade.invalid',$1,$2,'professional','active') RETURNING id",
      [password.salt, password.hash],
    )
  ).rows[0].id;
  const listener = (
    await pool.query(
      "INSERT INTO listeners(display_name,email,password_salt,password_hash) VALUES('Preserved listener','listener@upgrade.invalid',$1,$2) RETURNING id",
      [password.salt, password.hash],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO sessions(token_hash,creator_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 year')",
    ["a".repeat(64), artist],
  );
  await pool.query(
    "INSERT INTO listener_sessions(token_hash,listener_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 year')",
    ["b".repeat(64), listener],
  );
  await pool.query(
    "INSERT INTO listener_coin_wallets(listener_id,balance) VALUES($1,1234)",
    [listener],
  );
  await pool.query(
    "INSERT INTO artist_gift_wallets(artist_id,earned_kobo) VALUES($1,5678)",
    [artist],
  );
  await pool.query(
    "INSERT INTO generation_wallets(creator_id,credits) VALUES($1,6)",
    [artist],
  );
  await pool.query(
    "INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'professional',2000,'historical-fixture-only','paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year')",
    [artist],
  );
  const track = (
    await pool.query(
      "INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,plays,published_at) VALUES($1,'Preserved Highlife','Highlife','fixture/private/original.mp3','audio/mpeg',1024,'published',42,NOW()) RETURNING id",
      [artist],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO song_likes(track_id,listener_id) VALUES($1,$2)",
    [track, listener],
  );
  await pool.query(
    "INSERT INTO song_comments(track_id,listener_id,body) VALUES($1,$2,'Preserve this comment')",
    [track, listener],
  );
  await pool.query(
    "INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES('preserved-completed-task',$1,'succeeded')",
    [artist],
  );
  const tables = {
    creators:
      "id,display_name,email,password_salt,password_hash,plan,membership_status",
    listeners: "id,display_name,email,password_salt,password_hash",
    sessions: "token_hash,creator_id,expires_at",
    listener_sessions: "token_hash,listener_id,expires_at",
    listener_coin_wallets: "listener_id,balance",
    artist_gift_wallets: "artist_id,earned_kobo",
    generation_wallets: "creator_id,credits",
    artist_subscriptions:
      "id,artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at",
    music_tracks:
      "id,creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,plays",
    song_likes: "track_id,listener_id",
    song_comments: "id,track_id,listener_id,body,status",
    sonic_test_tasks: "task_id,creator_id,status",
    platform_migrations: "version,checksum,applied_at",
  };
  if (checkpoint >= 1) {
    for (const currency of ["USD", "NGN"])
      await transaction(pool, (db) =>
        finance.transfer(
          db,
          "historical-fixture-" + currency,
          "isolated_test_funding",
          currency,
          currency === "USD" ? 1200 : 80000,
          "platform:fixture:" + currency,
          finance.earnedAccount(artist, currency),
          artist,
        ),
      );
    tables.finance_accounts = "id,currency,artist_id";
    tables.finance_journals = "id,reference,kind,payload_hash";
    tables.finance_transfers =
      "id,journal_id,debit_account,credit_account,currency,amount_minor";
  }
  if (checkpoint >= 3) {
    await pool.query(
      "INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,'artist_subscription','professional','USD',2000,60,25,NOW()+INTERVAL '30 minutes')",
      [crypto.randomUUID(), artist],
    );
    tables.commerce_orders =
      "id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,status,expires_at";
  }
  if (checkpoint >= 13) {
    const order = crypto.randomUUID(),
      attempt = crypto.randomUUID();
    await pool.query(
      "INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,expires_at) VALUES($1,$2,'monthly','NGN',80000,30,NOW()+INTERVAL '30 minutes')",
      [order, listener],
    );
    await pool.query(
      "INSERT INTO premium_attempts(id,order_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,'paystack','historical-fixture-merchant','test','historical-premium-fixture','paid')",
      [attempt, order],
    );
    await pool.query(
      "INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'paystack','historical-fixture-merchant','historical-fixture-payment','test','NGN',80000)",
      [order],
    );
    await pool.query(
      "INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,NOW()-INTERVAL '1 day',NOW()+INTERVAL '29 days')",
      [order, listener],
    );
    tables.premium_orders =
      "id,listener_id,plan,currency,amount_minor,days,expires_at";
    tables.premium_attempts =
      "id,order_id,provider,merchant_id,mode,reference,status";
    tables.premium_receipts =
      "order_id,provider,merchant_id,payment_id,mode,currency,amount_minor";
    tables.premium_entitlements =
      "id,order_id,listener_id,starts_at,expires_at";
  }
  return { tables, artist, listener };
}
async function snapshot(pool, tables) {
  const result = {};
  for (const [table, columns] of Object.entries(tables))
    result[table] = (
      await pool.query(`SELECT ${columns} FROM ${table} ORDER BY 1`)
    ).rows;
  return result;
}
async function ownedDatabase(run) {
  const name = "lae_music_upgrade_ci_" + crypto.randomBytes(8).toString("hex");
  assert(/^lae_music_upgrade_ci_[a-f0-9]{16}$/.test(name));
  await control.query(`CREATE DATABASE ${name}`);
  const url = new URL(target.href);
  url.pathname = "/" + name;
  const pool = new Pool({ connectionString: url.href, ssl: false, max: 4 });
  try {
    await run(pool);
  } finally {
    await pool.end();
    await control.query(`DROP DATABASE ${name}`);
  }
}
test("populated historical upgrades preserve accounts, catalog and separate currency books", async (t) => {
  try {
    for (const checkpoint of [0, 7, 13, 17])
      await t.test("upgrade from checkpoint " + checkpoint, () =>
        ownedDatabase(async (pool) => {
          await bootstrap(pool);
          await historical(pool, checkpoint);
          const { tables } = await seed(pool, checkpoint),
            before = await snapshot(pool, tables);
          const applied = await Promise.all([migrate(pool), migrate(pool)]);
          assert.equal(applied.flat().length, migrations.length - checkpoint);
          await bootstrap(pool);
          assert.deepEqual(await migrate(pool), []);
          const after = await snapshot(pool, tables);
          assert.deepEqual(
            after.platform_migrations.slice(0, checkpoint),
            before.platform_migrations,
          );
          delete before.platform_migrations;
          delete after.platform_migrations;
          assert.deepEqual(
            after,
            before,
            "upgrades must preserve exact existing records",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT usable_output_seen FROM sonic_test_tasks WHERE task_id='preserved-completed-task'",
              )
            ).rows[0].usable_output_seen,
            true,
          );
          for (const table of ["creators", "listeners"])
            assert(
              await verifyPassword(
                "HistoricalFixturePassword123",
                (await pool.query("SELECT * FROM " + table)).rows[0],
              ),
            );
          assert.equal(
            (
              await pool.query(
                "SELECT COUNT(*)::int AS n FROM platform_migrations",
              )
            ).rows[0].n,
            migrations.length,
          );
          if (checkpoint >= 1)
            assert.deepEqual(
              (
                await pool.query(
                  "SELECT currency,SUM(amount_minor)::text AS amount FROM finance_transfers GROUP BY currency ORDER BY currency",
                )
              ).rows,
              [
                { currency: "NGN", amount: "80000" },
                { currency: "USD", amount: "1200" },
              ],
            );
        }),
      );
    await t.test(
      "a failed real SQL migration rolls back all pending DDL and history",
      () =>
        ownedDatabase(async (pool) => {
          await bootstrap(pool);
          await historical(pool, 7);
          const { tables } = await seed(pool, 7),
            before = await snapshot(pool, tables);
          const faulty = {
            async connect() {
              const db = await pool.connect();
              return {
                release: () => db.release(),
                query(sql, args) {
                  if (sql.startsWith("-- Additive: separate NGN"))
                    return db.query("SELECT 1/0");
                  return db.query(sql, args);
                },
              };
            },
          };
          await assert.rejects(migrate(faulty), /division by zero/);
          assert.deepEqual(await snapshot(pool, tables), before);
          assert.equal(
            (
              await pool.query(
                "SELECT to_regclass('premium_orders') AS name,to_regclass('account_security_rates') AS earlier",
              )
            ).rows[0].name,
            null,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT to_regclass('account_security_rates') AS name",
              )
            ).rows[0].name,
            null,
          );
          assert.equal((await migrate(pool)).length, migrations.length - 7);
        }),
    );
    await t.test(
      "future and incomplete migration histories fail closed against real PostgreSQL",
      () =>
        ownedDatabase(async (pool) => {
          await bootstrap(pool);
          await historical(pool, 7);
          await pool.query(
            "INSERT INTO platform_migrations(version,checksum) VALUES('999-future.sql','fixture')",
          );
          await assert.rejects(migrate(pool), /unknown migration/);
          await pool.query(
            "DELETE FROM platform_migrations WHERE version='999-future.sql'",
          );
          await pool.query(
            "UPDATE platform_migrations SET checksum='corrupt-fixture' WHERE version=$1",
            [migrations[0]],
          );
          await assert.rejects(migrate(pool), /checksum changed/);
          await pool.query("DELETE FROM platform_migrations WHERE version=$1", [
            migrations[0],
          ]);
          await assert.rejects(migrate(pool), /history has a gap/);
          assert.equal(
            (await pool.query("SELECT to_regclass('premium_orders') AS name"))
              .rows[0].name,
            null,
          );
        }),
    );
  } finally {
    await control.end();
  }
});
