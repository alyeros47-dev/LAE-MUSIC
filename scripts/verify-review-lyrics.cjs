"use strict";
// Explicitly opt-in: one actual lyrics request, then an idempotent replay on the isolated sandbox.
const crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const origin = "https://lae-music-review-sandbox.onrender.com";
(async () => {
  if (process.env.LAE_REVIEW_LYRICS_TEST !== "1")
    throw Error("This real provider test requires LAE_REVIEW_LYRICS_TEST=1.");
  async function request(path, { method = "GET", body, cookie, key } = {}) {
    const r = await fetch(origin + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(145000),
      headers: {
        Origin: origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const caps = await request("/api/platform/capabilities");
  assert.equal(caps.status, 200);
  assert.equal(
    caps.data.lyrics_configured,
    true,
    "Sandbox lyrics key must be configured before an actual request.",
  );
  const password = crypto.randomBytes(20).toString("hex");
  const account = await request("/api/register", {
    method: "POST",
    body: {
      name: "Sandbox lyrics verification",
      email: "sandbox-lyrics-" + crypto.randomUUID() + "@ci.invalid",
      country: "Nigeria",
      password,
      confirmPassword: password,
      plan: "starter",
    },
  });
  assert.equal(account.status, 201);
  assert.equal(account.data.user.membership_status, "pending_payment");
  const cookie = account.cookie;
  const before = await request("/api/generation/wallet", { cookie });
  assert.equal(before.status, 200);
  assert(
    before.data.credits >= 1,
    "Use only an existing approved welcome credit.",
  );
  const key = crypto.randomUUID(),
    body = {
      idea: "An original short hopeful song about starting again, with a four-line verse and concise chorus.",
      genre: "Highlife",
      mood: "Hopeful",
      language: "English",
      duration: "45 seconds",
      tradition: "gh-highlife",
      voice: "Expressive lead",
    };
  const generated = await request("/api/music/lyrics-generate", {
    method: "POST",
    cookie,
    key,
    body,
  });
  if (generated.status !== 200)
    throw Error(
      "Sandbox lyrics request returned HTTP " +
        generated.status +
        "; request reference " +
        key +
        ". Do not submit a new generation until this outcome is reconciled.",
    );
  assert(
    typeof generated.data.title === "string" && generated.data.title.length > 0,
  );
  assert(
    typeof generated.data.lyrics === "string" &&
      generated.data.lyrics.length >= 20,
  );
  assert(
    typeof generated.data.style === "string" && generated.data.style.length > 0,
  );
  const after = await request("/api/generation/wallet", { cookie });
  assert.equal(after.data.credits, before.data.credits - 1);
  const replay = await request("/api/music/lyrics-generate", {
    method: "POST",
    cookie,
    key,
    body,
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.lyrics, generated.data.lyrics);
  const replayWallet = await request("/api/generation/wallet", { cookie });
  assert.equal(replayWallet.data.credits, after.data.credits);
  const history = await request("/api/generation/history", { cookie });
  assert.equal(history.status, 200);
  assert(history.data.records.length >= 1);
  const voice = await request("/api/voice/profile", { cookie });
  assert.equal(voice.status, 200);
  assert.equal(voice.data.hasVoice, false);
  console.log(
    JSON.stringify({
      url: origin,
      real_lyrics_generation: true,
      owned_history_verified: true,
      credit_deducted_once: true,
      idempotent_replay_verified: true,
      artist_remains_unpaid: true,
      voice_profile_route_verified: true,
      voice_training_verified: false,
      music_generation_verified: false,
      production_ready: false,
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
