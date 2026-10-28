"use strict";
const crypto = require("node:crypto"),
  fs = require("node:fs");
const { inventory } = require("./audit-existing-service.cjs");
const { ID } = require("../lib/production-release");
async function main() {
  if (
    process.env.LAE_LIVE_RELEASE_VERIFY !== "1" ||
    !process.env.RENDER_API_KEY
  )
    throw Error("Explicit live verification configuration is required");
  const ORIGIN = "https://lae-music.com";
  const check = (ok, label) => {
    if (!ok) throw Error("Live verification failed: " + label);
  };
  async function api(path, { cookie, body } = {}) {
    const r = await fetch(ORIGIN + path, {
      method: body ? "POST" : "GET",
      redirect: "error",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    });
    return {
      status: r.status,
      cookie: (r.headers.getSetCookie?.() || [r.headers.get("set-cookie")])
        .filter(Boolean)
        .map((x) => x.split(";")[0])
        .join("; "),
      data: await r.json(),
    };
  }
  let migrationsVerified = 0;
  let ready = false;
  for (let n = 0; n < 10; n++) {
    try {
      const r = await api("/api/platform/capabilities");
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  check(ready, "integrated capabilities route");
  const local = crypto
    .createHash("sha256")
    .update(fs.readFileSync("web/app.js"))
    .digest("hex");
  for (const origin of [ORIGIN, "https://lae-music.onrender.com"]) {
    const r = await fetch(
      origin + "/web/app.js?release=" + process.env.GITHUB_SHA,
      { redirect: "error", signal: AbortSignal.timeout(30000) },
    );
    check(r.ok, "served application");
    check(
      crypto
        .createHash("sha256")
        .update(Buffer.from(await r.arrayBuffer()))
        .digest("hex") === local,
      "exact live application assets",
    );
  }
  const artistBody = {
    name: "LAE Release QA Artist",
    country: "Nigeria",
    email:
      "lae-release-" +
      process.env.GITHUB_RUN_ID +
      "-" +
      crypto.randomBytes(4).toString("hex") +
      "@verification.invalid",
    password: crypto.randomBytes(24).toString("hex"),
    plan: "starter",
  };
  artistBody.confirmPassword = artistBody.password;
  for (const role of ["artist", "listener"]) {
    const prefix = role === "artist" ? "/api" : "/api/listener";
    const body = {
      ...artistBody,
      email: role + "-" + artistBody.email,
      name: role === "artist" ? artistBody.name : "LAE Release QA Listener",
    };
    const registration = await api(prefix + "/register", { body });
    check(
      registration.status === 201 && registration.cookie,
      "free " + role + " registration",
    );
    const id = registration.data.user.id;
    const session = await api("/api/platform/session", {
      cookie: registration.cookie,
    });
    check(
      String(session.data[role]?.id) === String(id),
      "registered " + role + " session",
    );
    check(
      (await api(prefix + "/logout", { cookie: registration.cookie, body: {} }))
        .status === 200,
      role + " logout",
    );
    check(
      !(await api("/api/platform/session", { cookie: registration.cookie }))
        .data[role],
      role + " session revocation",
    );
    const login = await api(prefix + "/login", {
      body: { email: body.email, password: body.password },
    });
    check(
      login.status === 200 && login.cookie,
      role + " same-password sign-in",
    );
    check(
      String(
        (await api("/api/platform/session", { cookie: login.cookie })).data[
          role
        ]?.id,
      ) === String(id),
      role + " account recognition",
    );
    if (role === "artist") {
      const policy = await api("/api/platform/partners/policy");
      check(policy.status === 200 && policy.data.team_rates.premium_listener === 5 && policy.data.team_rates.artist_subscription === 10 && policy.data.team_rates.studio_generation === 10, "approved separate team rates");
      const report = await api("/api/platform/partners/accounting?mode=test", {cookie:login.cookie});
      check(report.status === 200 && report.data.team_projection_minor === 0 && report.data.team_rate_breakdown.find(x=>x.product_group==="premium_listener").percent === 5, "owned empty partner report with Premium 5 percent");
      check((await api("/api/platform/admin/partners/accounting?artist_id="+id,{cookie:login.cookie})).status === 401, "ordinary artist cannot access financial administration");
      const wallet = await api("/api/generation/wallet", {
          cookie: login.cookie,
        }),
        allowance = await api("/api/artist/studio-allowance", {
          cookie: login.cookie,
        }),
        sub = await api("/api/artist/subscription", { cookie: login.cookie });
      check(
        wallet.status === 200 && wallet.data.credits === 2,
        "two persistent complimentary lyrics credits",
      );
      check(
        wallet.data.models.includes("gpt-6.1-sol") &&
          wallet.data.models.includes("gpt-6-astra"),
        "approved model choices",
      );
      check(
        allowance.status === 200 &&
          allowance.data.artist_test_access &&
          allowance.data.remaining_generations === 2,
        "free music-generation allowance",
      );
      check(
        sub.data.artist_features_active === false && !sub.data.subscription,
        "no fabricated paid subscription",
      );
    }
    await api(prefix + "/logout", { cookie: login.cookie, body: {} });
  }
  const catalog = await api("/api/music/tracks?limit=50");
  check(
    catalog.status === 200 &&
      Array.isArray(catalog.data.tracks) &&
      catalog.data.tracks.length >= 7,
    "existing published music",
  );
  let audio = 0;
  for (const track of catalog.data.tracks) {
    const stream = await api(
      "/api/music/tracks/" + encodeURIComponent(track.id) + "/stream",
    );
    check(stream.status === 200, "existing stream reference");
    const u = new URL(stream.data.url);
    check(
      u.protocol === "https:" &&
        u.hostname.endsWith(".r2.cloudflarestorage.com") &&
        !u.username &&
        !u.password &&
        !u.port,
      "existing storage origin",
    );
    const r = await fetch(u, {
      headers: { Range: "bytes=0-63" },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (r.status !== 206) {
      await r.body?.cancel();
      throw Error("Existing audio Range verification failed");
    }
    check((await r.arrayBuffer()).byteLength === 64, "existing audio bytes");
    audio++;
  }
  const envResponse = await fetch(
    "https://api.render.com/v1/services/" + ID + "/env-vars?limit=100",
    {
      headers: { Authorization: "Bearer " + process.env.RENDER_API_KEY },
      signal: AbortSignal.timeout(30000),
    },
  );
  check(envResponse.ok, "read-only production configuration");
  const env = inventory(await envResponse.json()),
    pool = new (require("pg").Pool)(
      require("../lib/database").databaseOptions(env),
    );
  try {
    const db = await pool.connect();
    try {
      await db.query("BEGIN READ ONLY");
      await db.query("SET LOCAL statement_timeout='15s'");
      const rows = (
        await db.query(
          "SELECT version,checksum FROM platform_migrations ORDER BY version",
        )
      ).rows;
      const differences = require("../lib/release-preflight").compareMigrations(
        rows,
      );
      check(
        !Object.values(differences).some((x) => x.length),
        "complete unchanged migration inventory",
      );
      migrationsVerified = rows.length;
      const minimums = {
        creators: 11,
        listeners: 5,
        music_tracks: 13,
        generation_records: 16,
        artist_voice_profiles: 3,
      };
      for (const [table, min] of Object.entries(minimums))
        check(
          Number(
            (await db.query("SELECT COUNT(*)::text AS n FROM " + table)).rows[0]
              .n,
          ) >= min,
          "existing " + table + " retained",
        );
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
  console.log(
    JSON.stringify({
      status: "live_release_verified",
      asset_origins_verified: 2,
      artist_registration_logout_login: true,
      listener_registration_logout_login: true,
      free_lyrics_credits: 2,
      free_music_requests: 2,
      existing_audio_ranges_passed: audio,
      migrations_verified: migrationsVerified,
      existing_core_records_retained: true,
      billed_generation_requests: 0,
      r2_writes: 0,
      payment_operations: 0,
      qa_accounts_retained_unpublished: true,
      voice_profile_generation_publishing: "owner_reported_live_acceptance",
    }),
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error("Live release verification stopped:", e.message);
    process.exitCode = 1;
  });
module.exports = { main };
