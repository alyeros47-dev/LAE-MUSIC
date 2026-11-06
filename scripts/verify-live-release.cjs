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
  const focused=process.env.LAE_LIVE_PAYMENT_UI_VERIFY==="1";
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
      if (r.status === 200 && r.data.public_artist_trials===false && r.data.manual_bank_payments===true && r.data.offline_listening===true) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  check(ready, "integrated capabilities route");
  const capabilities=await api('/api/platform/capabilities');
  check(capabilities.status===200&&capabilities.data.artist_access_mode==='paid_packages_only'&&capabilities.data.public_artist_trials===false,'paid artist access mode');
  check(capabilities.data.manual_bank_payments===true&&capabilities.data.guest_bank_payments===true,'manual and pre-registration bank checkout');
  check(capabilities.data.affiliate_allocations_pending===true&&capabilities.data.payouts===false,'unapproved allocations and payouts remain closed');
  check(capabilities.data.offline_listening===true,'offline listening configured');
  const offline=await api('/api/platform/offline/capabilities');
  check(offline.status===200&&offline.data.enabled&&offline.data.public_key?.kty==='EC'&&!offline.data.public_key.d,'public offline verification key');

  for (const origin of [ORIGIN, "https://lae-music.onrender.com"]) {
    for (const file of ["web/app.js","web/description-studio.js","web/music-dna.js","web/studio-engine.js","web/feature-visibility.js","web/ui.css","web/guest-bank-checkout.js","web/manual-bank-payments.js","web/artist-membership.js","web/offline-app.js","web/offline.js","web/offline-protocol.js","service-worker.js","web/artist-packages.js","web/business.js","web/financial-policy.js","web/premium.js"]) {
      const local = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      const r = await fetch(origin+"/"+file+"?release="+process.env.GITHUB_SHA,
        {redirect:"error",signal:AbortSignal.timeout(30000)});
      check(r.ok,"served studio asset");
      const asset=Buffer.from(await r.arrayBuffer());
      check(crypto.createHash("sha256").update(asset).digest("hex")===local,"exact live customer assets");
      if(focused&&['web/app.js','web/premium.js','web/manual-bank-payments.js','web/guest-bank-checkout.js'].includes(file))check(!/policy_accepted|refundConditions\(/.test(asset.toString('utf8')),'payment UI has no refund acceptance prompt or payload');
    }
  }
  const dnaCatalogue=await api("/api/platform/studio/dna/catalog");
  check(dnaCatalogue.status===200&&JSON.stringify(dnaCatalogue.data)===JSON.stringify(require("../lib/studio-launch").catalogue()),"exact public Music DNA catalogue and mood options");
  check(dnaCatalogue.data.styles.length===70&&dnaCatalogue.data.categories.length===14&&dnaCatalogue.data.moods.length===4,"complete studio selection inventory");
  if(focused){
    const policy=await api('/api/platform/financial-policy');check(policy.status===200&&JSON.stringify(policy.data)===JSON.stringify(require('../lib/financial-policy').disclosure()),'complete unchanged refund policy is available');
    const pricing=await api('/api/platform/pricing?country=NG');check(pricing.status===200&&pricing.data.conversion_available===true&&pricing.data.display_currency==='NGN','live Naira quotes available');
    for(const [plan,minor]of [['starter',600],['growth',1000],['professional',2000]])check(pricing.data.products['artist_subscription:'+plan]?.usd_minor===minor,'approved annual package price');
    check(pricing.data.products['premium_listener:quarterly']?.usd_minor===180,'unchanged quarterly Premium price');
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
  for (const role of (focused?[]:["artist", "listener"])) {
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
      const wallet = await api("/api/generation/wallet", {
          cookie: login.cookie,
        }),
        allowance = await api("/api/artist/studio-allowance", {
          cookie: login.cookie,
        }),
        sub = await api("/api/artist/subscription", { cookie: login.cookie });
      check(
        wallet.status === 200 && wallet.data.credits === 0,
        "unpaid account receives no complimentary lyrics credits",
      );
      check(
        wallet.data.models.includes("gpt-6.1-sol") &&
          wallet.data.models.includes("gpt-6-astra"),
        "approved model choices",
      );
      check(
        allowance.status === 200 &&
          allowance.data.active === false &&
          allowance.data.remaining_generations === 0,
        "unpaid artist production remains locked",
      );
      check(
        sub.data.artist_features_active === false && !sub.data.subscription,
        "no fabricated paid subscription",
      );
    }
    if(role==='artist')for(const path of ['/api/music/description/start','/api/music/sonic/create','/api/platform/studio/releases'])check((await api(path,{cookie:login.cookie,body:{}})).status===402,'unpaid creation API is protected');
    if(role==='listener'){
      const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),denied=await api('/api/platform/offline/register',{cookie:login.cookie,body:{device_id:crypto.randomUUID(),public_jwk:pair.publicKey.export({format:'jwk'})}});
      check(denied.status===403,'unpaid listener cannot obtain offline access');
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
  for (const track of (focused?catalog.data.tracks.slice(0,1):catalog.data.tracks)) {
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
    signer=require('../lib/offline-listening').signing(env.OFFLINE_LICENSE_PRIVATE_KEY),
    pool = new (require("pg").Pool)(
      require("../lib/database").databaseOptions(env),
    );
  check(signer&&signer.kid===offline.data.kid&&JSON.stringify(signer.jwk)===JSON.stringify(offline.data.public_key),'live offline key matches configured signer');
  const challenge=Buffer.from('LAE release key-pair check: not an offline license');
  check(crypto.verify('sha256',challenge,crypto.createPublicKey(signer.key),crypto.sign('sha256',challenge,signer.key)),'offline key-pair signing verification');
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
        creators: 50,
        listeners: 26,
        music_tracks: 23,
        generation_records: 60,
        artist_voice_profiles: 6,
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
    const integrity=await require('../lib/release-preflight').inspectDatabase(pool);
    check(integrity.status==='pass','migrated schema and financial integrity');
  } finally {
    await pool.end();
  }
  console.log(
    JSON.stringify({
      status: "live_release_verified",
      asset_origins_verified: 2,
      customer_assets_per_origin_verified: 17,
      music_dna_styles_verified: 70,
      music_dna_groups_verified: 14,
      customer_moods_verified: 4,
      artist_registration_logout_login: !focused,
      listener_registration_logout_login: !focused,
      free_lyrics_credits: 0,
      free_music_requests: 0,
      existing_audio_ranges_passed: audio,
      migrations_verified: migrationsVerified,
      existing_core_records_retained: true,
      billed_generation_requests: 0,
      r2_writes: 0,
      payment_operations: 0,
      qa_accounts_retained_unpublished: !focused,
      manual_bank_collection_enabled:true,
      paid_access_api_guards_verified:!focused,
      offline_signer_and_entitlement_guard_verified:!focused,
      offline_signer_verified:true,
      verification_scope:focused?"payment_ui_prices_policy_and_financial_integrity":"full_customer_release",
      refund_acceptance_removed:focused,
      voice_training:"deferred_by_owner_pending_MusicAPI_verification",
    }),
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error("Live release verification stopped:", e.message);
    process.exitCode = 1;
  });
module.exports = { main };
