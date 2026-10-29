"use strict";
// Disposable loopback CI database only. Never accepts a production or remote URL.
const test = require("node:test"),
  assert = require("node:assert/strict");
const target = require("./ci-database.cjs").ciDatabase();
const { Pool } = require("pg"),
  { bootstrap } = require("./legacy-bootstrap.cjs"),
  { migrate } = require("../lib/migrations");
test("Music DNA disposable PostgreSQL migration, credits and provenance audit", async (t) => {
  const pool = new Pool({ connectionString: target.href, ssl: false });
  try {
    await t.test(
      "preserved bootstrap and additive migrations initialize provenance, with safe checksummed replay",
      async () => {
        await bootstrap(pool);
        await migrate(pool);
        assert.deepEqual(await migrate(pool), []);
        const r = await pool.query(
          "SELECT version FROM platform_migrations WHERE version='023-music-dna-provenance.sql'",
        );
        assert.equal(r.rowCount, 1);
      },
    );
    await require("./music-dna-postgres.cjs")(t, { pool });
  } finally {
    await pool.end();
  }
});
