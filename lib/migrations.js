"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
async function migrate(pool) {
  if (!pool) return [];
  const db = await pool.connect();
  const applied = [];
  try {
    await db.query("BEGIN");
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('lae-platform-migrations'))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS platform_migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const inventory = fs
      .readdirSync(path.join(__dirname, "../migrations"))
      .filter((x) => /^\d+.*\.sql$/.test(x))
      .sort()
      .map((version) => {
        const sql = fs.readFileSync(
          path.join(__dirname, "../migrations", version),
          "utf8",
        );
        const checksum = crypto.createHash("sha256").update(sql).digest("hex");
        return { version, sql, checksum };
      });
    const history = new Map(
      (
        await db.query(
          "SELECT version,checksum FROM platform_migrations ORDER BY version",
        )
      ).rows.map((row) => [row.version, row.checksum]),
    );
    const versions = new Set(inventory.map((entry) => entry.version));
    for (const version of history.keys()) {
      if (!versions.has(version))
        throw new Error(
          "Database has an unknown migration; use the matching release: " +
            version,
        );
    }
    let missing = false;
    for (const { version, checksum } of inventory) {
      if (!history.has(version)) {
        missing = true;
        continue;
      }
      if (history.get(version) !== checksum)
        throw new Error("Applied migration checksum changed: " + version);
      if (missing)
        throw new Error(
          "Database migration history has a gap before: " + version,
        );
    }
    // Validate the complete history before attempting any new schema changes.
    for (const { version, sql, checksum } of inventory) {
      if (history.has(version)) {
        continue;
      }
      await db.query(sql);
      await db.query(
        "INSERT INTO platform_migrations(version,checksum) VALUES($1,$2)",
        [version, checksum],
      );
      applied.push(version);
    }
    await db.query("COMMIT");
    return applied;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
module.exports = { migrate };
