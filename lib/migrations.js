'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function migrate(pool) {
  if (!pool) return [];
  const db = await pool.connect();
  const applied = [];
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('lae-platform-migrations'))");
    await db.query('CREATE TABLE IF NOT EXISTS platform_migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for (const version of fs.readdirSync(path.join(__dirname, '../migrations')).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations', version), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const previous = await db.query('SELECT checksum FROM platform_migrations WHERE version=$1', [version]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw new Error('Applied migration checksum changed: ' + version);
        continue;
      }
      await db.query(sql);
      await db.query('INSERT INTO platform_migrations(version,checksum) VALUES($1,$2)', [version, checksum]);
      applied.push(version);
    }
    await db.query('COMMIT');
    return applied;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
module.exports = { migrate };
