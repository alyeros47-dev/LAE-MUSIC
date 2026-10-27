"use strict";
const { databaseOptions } = require("../lib/database");
const { validateSnapshot } = require("../lib/review-accounts");
function snapshotOptions(value, production) {
  function parse(x) {
    let u;
    try {
      u = new URL(x);
    } catch {
      throw Error(
        "Use a PostgreSQL connection string for the isolated Neon review branch",
      );
    }
    if (
      !["postgres:", "postgresql:"].includes(u.protocol) ||
      !u.hostname.endsWith(".neon.tech") ||
      (u.port && u.port !== "5432") ||
      !u.username ||
      !u.password ||
      u.pathname === "/"
    )
      throw Error(
        "Only an authenticated Neon PostgreSQL review endpoint is accepted",
      );
    return u;
  }
  const review = parse(value),
    live = parse(production);
  for (const k of review.searchParams.keys())
    if (!["sslmode", "channel_binding", "connect_timeout"].includes(k))
      throw Error("Review connection string contains unsupported options");
  const normal = (u) => u.hostname.replace(/-pooler(?=\.)/, "").toLowerCase();
  if (normal(review) === normal(live))
    throw Error(
      "The Neon review secret points to the production endpoint; import refused",
    );
  return {
    ...databaseOptions({
      DATABASE_URL: review.toString(),
      DATABASE_SSL_MODE: "verify-full",
    }),
    max: 1,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000",
  };
}
async function exportArtists({
  connectionString,
  productionConnectionString,
  Pool = require("pg").Pool,
  now = () => new Date(),
} = {}) {
  const options = snapshotOptions(connectionString, productionConnectionString),
    pool = new Pool(options);
  let db,
    begun = false;
  try {
    db = await pool.connect();
    await db.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    begun = true;
    const read = await db.query("SHOW transaction_read_only");
    if (read.rows[0]?.transaction_read_only !== "on")
      throw Error("Snapshot connection is not read-only");
    const columns = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='creators'",
      )
    ).rows.map((x) => x.column_name);
    if (!columns.includes("id") || !columns.includes("display_name"))
      throw Error("Artist schema missing");
    const allowed = ["id", "display_name", "country", "bio", "plan"].filter(
      (x) => columns.includes(x),
    );
    const q = await db.query(
      "SELECT " +
        allowed.map((x) => '"' + x + '"').join(",") +
        " FROM public.creators ORDER BY id LIMIT 1001",
    );
    if (!q.rows.length || q.rows.length > 1000)
      throw Error(
        "Review snapshot artist count is outside the supported range",
      );
    const s = validateSnapshot({
      version: 1,
      scope: "artist_profiles_without_credentials",
      captured_at: now().toISOString(),
      artists: q.rows.map((x) => ({
        source_id: String(x.id),
        display_name: x.display_name,
        country: x.country || "Nigeria",
        bio: x.bio || "",
        plan: x.plan || "starter",
      })),
    });
    await db.query("COMMIT");
    begun = false;
    return s;
  } catch (e) {
    if (begun) await db.query("ROLLBACK").catch(() => {});
    if (
      /production endpoint|read-only|Only an authenticated|connection string/.test(
        e.message,
      )
    )
      throw e;
    const code=typeof e.code==='string'&&(/^[A-Z0-9]{5}$/.test(e.code)||['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(e.code))?' ['+e.code+']':'';
    throw Error('Could not read the isolated Neon snapshot'+code+'. Check its secret, availability and artist schema. No source data was changed.');
  } finally {
    db?.release();
    await pool.end();
  }
}
module.exports = { snapshotOptions, exportArtists };
