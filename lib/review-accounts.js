"use strict";
const crypto = require("node:crypto");
const { enabled, isolated } = require("./review-catalog");
const { fail, audit } = require("./transactions");
const { hashPassword } = require("./passwords");
const KEY = "LAE_REVIEW_ARTIST_SNAPSHOT";
function validateSnapshot(s) {
  if (
    !s ||
    s.version !== 1 ||
    s.scope !== "artist_profiles_without_credentials" ||
    !Array.isArray(s.artists) ||
    s.artists.length < 1 ||
    s.artists.length > 1000 ||
    !Number.isFinite(Date.parse(s.captured_at)) ||
    Object.keys(s).some(
      (k) => !["version", "scope", "captured_at", "artists"].includes(k),
    )
  )
    throw Error("Invalid isolated artist snapshot");
  const ids = new Set();
  for (const a of s.artists) {
    if (
      !a ||
      Object.keys(a).some(
        (k) =>
          !["source_id", "display_name", "country", "bio", "plan"].includes(k),
      ) ||
      !/^[1-9][0-9]{0,15}$/.test(a.source_id) ||
      ids.has(a.source_id) ||
      typeof a.display_name !== "string" ||
      a.display_name.length < 2 ||
      a.display_name.length > 100 ||
      typeof a.bio !== "string" ||
      a.bio.length > 1200 ||
      typeof a.country !== "string" ||
      a.country.length > 80 ||
      ![a.display_name, a.bio, a.country].every((x) => !x.includes("\0")) ||
      !["starter", "growth", "professional"].includes(a.plan)
    )
      throw Error("Invalid isolated artist profile");
    ids.add(a.source_id);
  }
  if (Buffer.byteLength(JSON.stringify(s)) > 48000)
    throw Error("Artist snapshot exceeds safe review environment capacity");
  return s;
}
function snapshotFromEnvironment(env) {
  if (!enabled(env) || !env[KEY]) return null;
  try {
    return validateSnapshot(JSON.parse(env[KEY]));
  } catch {
    throw Error(
      "Review artist snapshot is invalid; original accounts were not changed",
    );
  }
}
async function connected(db) {
  const q = await db.query(
    "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port",
  );
  const x = q.rows[0];
  if (
    x?.name !== "lae_music_review" ||
    x?.host !== "127.0.0.1" ||
    x?.port !== 55432
  )
    throw Error("Artist import refuses the connected database identity");
}
async function seed(
  pool,
  { env = process.env, snapshot = snapshotFromEnvironment(env) } = {},
) {
  if (!snapshot) return { imported: 0, configured: false };
  isolated(env);
  validateSnapshot(snapshot);
  const db = await pool.connect();
  let begun = false,
    added = 0;
  try {
    await connected(db);
    await db.query("BEGIN");
    begun = true;
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('lae-review-public-catalog'))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS review_imported_artists(source_id BIGINT PRIMARY KEY,artist_id BIGINT NOT NULL UNIQUE REFERENCES creators(id),source_plan TEXT NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),test_password_set_at TIMESTAMPTZ)",
    );
    for (const a of snapshot.artists) {
      const done = await db.query(
        "SELECT artist_id FROM review_imported_artists WHERE source_id=$1",
        [a.source_id],
      );
      if (done.rowCount) continue;
      let q = await db.query(
        "SELECT artist_id FROM review_public_artists WHERE source_id=$1",
        [a.source_id],
      );
      let artistId = q.rows[0]?.artist_id;
      if (artistId) {
        await db.query(
          "UPDATE creators SET country=$2,bio=$3,plan=$4,membership_status='review_imported' WHERE id=$1 AND membership_status='review_public_profile'",
          [artistId, a.country, a.bio, a.plan],
        );
      } else {
        q = await db.query(
          "INSERT INTO creators(display_name,email,password_salt,password_hash,country,bio,plan,membership_status) VALUES($1,$2,$3,$4,$5,$6,$7,'review_imported') RETURNING id",
          [
            a.display_name,
            "public-artist-" + a.source_id + "@review-catalog.invalid",
            crypto.randomBytes(32).toString("hex"),
            crypto.randomBytes(64).toString("hex"),
            a.country,
            a.bio,
            a.plan,
          ],
        );
        artistId = q.rows[0].id;
      }
      await db.query(
        "INSERT INTO review_imported_artists(source_id,artist_id,source_plan) VALUES($1,$2,$3)",
        [a.source_id, artistId, a.plan],
      );
      added++;
    }
    await audit(
      db,
      { type: "system", id: "review-import" },
      "review.artists.import",
      "isolated-snapshot",
      { added, total: snapshot.artists.length, credentials_copied: false },
    );
    await db.query("COMMIT");
    return {
      configured: true,
      imported: added,
      total: snapshot.artists.length,
      credentials_copied: false,
    };
  } catch (e) {
    if (begun) await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}
async function list(pool, env) {
  isolated(env);
  if (!env[KEY]) return { configured: false, artists: [] };
  return {
    configured: true,
    artists: (
      await pool.query(
        "SELECT c.id,c.display_name,c.email,m.source_id,m.source_plan,m.test_password_set_at FROM review_imported_artists m JOIN creators c ON c.id=m.artist_id ORDER BY m.source_id LIMIT 1000",
      )
    ).rows,
  };
}
async function setPassword(pool, env, actor, b) {
  isolated(env);
  if (!env[KEY]) throw fail(409, "Artist snapshot is not configured");
  if (
    !b ||
    !/^[1-9][0-9]{0,15}$/.test(String(b.artist_id)) ||
    typeof b.password !== "string" ||
    b.password !== b.confirmPassword
  )
    throw fail(400, "Choose an imported artist and matching test passwords");
  const password = await hashPassword(b.password),
    db = await pool.connect();
  let begun = false;
  try {
    await connected(db);
    await db.query("BEGIN");
    begun = true;
    const q = await db.query(
      "SELECT c.id,c.email FROM review_imported_artists m JOIN creators c ON c.id=m.artist_id WHERE m.artist_id=$1 FOR UPDATE OF c,m",
      [String(b.artist_id)],
    );
    if (!q.rowCount) throw fail(404, "Imported sandbox artist not found");
    await db.query(
      "UPDATE creators SET password_salt=$2,password_hash=$3 WHERE id=$1",
      [String(b.artist_id), password.salt, password.hash],
    );
    await db.query("DELETE FROM sessions WHERE creator_id=$1", [
      String(b.artist_id),
    ]);
    await db.query(
      "UPDATE review_imported_artists SET test_password_set_at=NOW() WHERE artist_id=$1",
      [String(b.artist_id)],
    );
    await audit(
      db,
      { type: "admin", id: String(actor.id) },
      "review.artist.test_password",
      String(b.artist_id),
    );
    await db.query("COMMIT");
    return { ok: true, email: q.rows[0].email, live_accounts_changed: false };
  } catch (e) {
    if (begun) await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}
module.exports = {
  KEY,
  validateSnapshot,
  snapshotFromEnvironment,
  seed,
  list,
  setPassword,
};
