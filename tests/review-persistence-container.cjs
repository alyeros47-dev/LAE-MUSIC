"use strict";
// Two disposable containers, one named local volume. No Render, R2 or provider writes.
const { execFileSync } = require("node:child_process"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
if (process.env.LAE_REVIEW_PERSISTENCE_TESTS !== "1")
  throw Error("Opt in only for isolated review storage tests");
const suffix = crypto.randomBytes(6).toString("hex"),
  volume = "lae-review-state-test-" + suffix,
  names = [volume + "-a", volume + "-b"];
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const image = process.env.LAE_REVIEW_TEST_IMAGE || "lae-music-review:tested";
if (!/^lae-[a-z0-9:._-]+$/.test(image))
  throw Error("Only a named local LAE test image is accepted");
function docker(args) {
  return execFileSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", ...args],
    {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
    },
  );
}
const origin = "http://127.0.0.1:3117";
let cookie = "",
  phase = "prepare";
const email = "persistent-" + suffix + "@ci.invalid",
  password = " " + crypto.randomBytes(24).toString("hex") + " ";
async function api(path, { method = "GET", body, raw, mime } = {}) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(raw ? { "Content-Type": mime } : {}),
    },
    body: body ? JSON.stringify(body) : raw,
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function boot(name) {
  docker([
    "create",
    "--user",
    "0",
    "--name",
    name,
    "--memory",
    "512m",
    "--mount",
    "type=volume,source=" + volume + ",target=/var/lib/lae-review",
    "-p",
    "127.0.0.1:3117:10000",
    "-e",
    "NODE_ENV=staging",
    "-e",
    "LAE_REVIEW_ENVIRONMENT=pr6-ephemeral-review-v1",
    "-e",
    "LAE_REVIEW_TEST_ACCESS=1",
    "-e",
    "LAE_REVIEW_TEST_OPEN=1",
    "-e",
    "LAE_REVIEW_PERSISTENT_STORAGE=1",
    "-e",
    "ADMIN_KEY=isolated-state-fixture-only-key",
    "--entrypoint",
    "/bin/sh",
    image,
    "-c",
    "chmod -R a+rX /app && chmod 755 /app/deploy/review-entrypoint.sh && exec /app/deploy/review-entrypoint.sh",
  ]);
  for (const p of [
    "server.js",
    "music-prompt-studio.html",
    "lib",
    "web",
    "config",
    "data",
    "migrations",
    "deploy/review-entrypoint.sh",
    "deploy/review-provider-budget.cjs",
    "deploy/review-state.cjs",
  ])
    docker([
      "cp",
      fs.statSync(p).isDirectory() ? p + "/." : p,
      name + ":/app/" + p,
    ]);
  docker(["start", name]);
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(origin + "/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Isolated review startup timed out");
}
(async () => {
  docker(["volume", "create", volume]);
  try {
    phase = "first startup";
    await boot(names[0]);
    const signup = await api("/api/register", {
      method: "POST",
      body: {
        name: "Persistent review artist",
        country: "Nigeria",
        email,
        password,
        confirmPassword: password,
        plan: "starter",
      },
    });
    assert.equal(signup.status, 201);
    cookie = signup.cookie;
    const id = signup.data.user.id;
    const audio = Buffer.from(
      fs.readFileSync("tests/fixtures/review-tone.mp3.base64", "utf8"),
      "base64",
    );
    phase = "upload";
    const started = await api("/api/music/upload/start", {
      method: "POST",
      body: {
        title: "Persistent isolated QA tone",
        genre: "Highlife",
        audioMime: "audio/mpeg",
        audioBytes: audio.length,
        rightsConfirmed: true,
      },
    });
    assert.equal(started.status, 200);
    const track = started.data.id;
    assert.equal(
      (
        await api("/api/music/upload/file?id=" + track + "&kind=audio", {
          method: "PUT",
          raw: audio,
          mime: "audio/mpeg",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api("/api/music/upload/finish", {
          method: "POST",
          body: { id: track },
        })
      ).status,
      200,
    );
    phase = "persist provider budget";
    docker([
      "exec",
      "--user",
      "postgres",
      names[0],
      "node",
      "-e",
      "const {createBudget}=require('/app/deploy/review-provider-budget.cjs');createBudget({fetchImpl:async()=>new Response('{}')})('https://api.musicapi.ai/isolated-fixture',{method:'POST'}).then(r=>{if(!r.ok)process.exit(1)})",
    ]);
    const before = docker([
      "exec",
      "--user",
      "postgres",
      names[0],
      "node",
      "-e",
      "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync('/tmp/lae-review-password')).digest('hex'))",
    ]).trim();
    phase = "replace container";
    docker(["stop", "--time", "30", names[0]]);
    docker(["rm", "-v", names[0]]);
    cookie = "";
    await boot(names[1]);
    phase = "same account re-login";
    const login = await api("/api/platform/account/login", {
      method: "POST",
      body: { email, password, role: "listener" },
    });
    assert.equal(login.status, 200);
    assert.equal(String(login.data.user.id), String(id));
    assert.equal(login.data.role, "artist");
    cookie = login.cookie;
    const after = docker([
      "exec",
      "--user",
      "postgres",
      names[1],
      "node",
      "-e",
      "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync('/tmp/lae-review-password')).digest('hex'))",
    ]).trim();
    assert.equal(after, before);
    phase = "retained audio";
    const r = await fetch(
      origin + "/api/platform/review-media/" + track + "/audio",
      { headers: { Range: "bytes=0-63" } },
    );
    assert.equal(r.status, 206);
    assert(Buffer.from(await r.arrayBuffer()).equals(audio.subarray(0, 64)));
    const state = await api("/api/platform/session");
    assert.equal(state.data.review_environment, "persistent_review");
    assert.equal(
      (await api("/api/artist/studio-allowance")).data.remaining_generations,
      2,
    );
    assert.equal(
      (await api("/api/artist/subscription")).data.artist_features_active,
      false,
    );
    console.log(
      JSON.stringify({
        passed: true,
        account_survives_container_replacement: true,
        same_password_and_id: true,
        audio_survives: true,
        database_secret_unchanged: true,
        provider_budget_not_reset: true,
        paid_subscription_fabricated: false,
        real_provider_calls: 0,
        production_access: false,
      }),
    );
  } catch (error) {
    for (const n of names) {
      try {
        fs.writeFileSync(
          "/tmp/lae-review-persistence-failure.log",
          docker(["logs", n]),
        );
        break;
      } catch {}
    }
    throw error;
  } finally {
    for (const n of names) {
      try {
        docker(["rm", "-f", "-v", n]);
      } catch {}
    }
    try {
      docker(["volume", "rm", volume]);
    } catch {}
  }
})().catch(() => {
  console.error(
    "Review persistence test failed at " +
      phase +
      "; passwords/cookies omitted.",
  );
  process.exitCode = 1;
});
