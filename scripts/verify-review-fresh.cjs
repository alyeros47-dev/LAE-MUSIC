"use strict";
// Opt-in, hard-pinned review QA. Original synthetic media only; no provider calls.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs");
const ORIGIN = "https://lae-music-review-sandbox.onrender.com";
async function verify({ fetchImpl = fetch } = {}) {
  let cookie,
    id,
    published = false,
    phase = "signup";
  const password = " " + crypto.randomBytes(20).toString("hex") + " ",
    email = "review-fresh-" + crypto.randomUUID() + "@ci.invalid";
  async function request(
    path,
    { method = "GET", body, cookie: session = cookie } = {},
  ) {
    const r = await fetchImpl(ORIGIN + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        Origin: ORIGIN,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Cookie: session } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  try {
    const registration = await request("/api/register", {
      method: "POST",
      body: {
        name: "Review upload verification",
        country: "Nigeria",
        email,
        password,
        confirmPassword: password,
        plan: "starter",
      },
    });
    assert.equal(registration.status, 201);
    cookie = registration.cookie;
    assert(cookie);
    phase = "access";
    let session = await request("/api/platform/session");
    assert.equal(session.data.review_test_access, true);
    assert(session.data.artist);
    const subscription = await request("/api/artist/subscription");
    assert.equal(subscription.data.review_test_access, true);
    assert.equal(subscription.data.artist_features_active, false);
    const allowance = await request("/api/artist/studio-allowance");
    assert.equal(allowance.data.remaining_generations, 2);
    assert.equal(allowance.data.review_test_access, true);
    assert.equal(allowance.data.included_generations,2);
    const audio = Buffer.from(
        fs.readFileSync("tests/fixtures/review-tone.mp3.base64", "utf8").trim(),
        "base64",
      ),
      art = Buffer.from(
        fs.readFileSync("tests/fixtures/review-art.png.base64", "utf8").trim(),
        "base64",
      );
    phase = "prepare";
    const prepared = await request("/api/music/upload/start", {
      method: "POST",
      body: {
        title: "Sandbox verification tone · test only",
        genre: "Highlife",
        description: "Original synthetic QA audio, not a catalog release.",
        audioMime: "audio/mpeg",
        audioBytes: audio.length,
        coverMime: "image/png",
        coverBytes: art.length,
        rightsConfirmed: true,
      },
    });
    assert.equal(prepared.status, 200);
    assert.equal(prepared.data.temporary_review_storage, true);
    id = prepared.data.id;
    for (const [kind, bytes, mime] of [
      ["audio", audio, "audio/mpeg"],
      ["cover", art, "image/png"],
    ]) {
      phase = "upload_" + kind;
      const r = await fetchImpl(
        ORIGIN + "/api/music/upload/file?id=" + id + "&kind=" + kind,
        {
          method: "PUT",
          redirect: "error",
          signal: AbortSignal.timeout(60000),
          headers: { Origin: ORIGIN, Cookie: cookie, "Content-Type": mime },
          body: bytes,
        },
      );
      assert.equal(r.status, 200);
    }
    phase = "publish";
    const finish = await request("/api/music/upload/finish", {
      method: "POST",
      body: { id },
    });
    assert.equal(finish.status, 200);
    published = true;
    phase = "stream";
    const stream = await request("/api/music/tracks/" + id + "/stream", {
      cookie: null,
    });
    assert.equal(new URL(stream.data.url).origin, ORIGIN);
    const range = await fetchImpl(stream.data.url, {
      method: "GET",
      redirect: "error",
      headers: { Range: "bytes=0-63" },
      signal: AbortSignal.timeout(45000),
    });
    assert.equal(range.status, 206);
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      audio.subarray(0, 64),
    );
    const full = await fetchImpl(stream.data.url, {
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), audio);
    const image = await fetchImpl(
      ORIGIN + "/api/music/tracks/" + id + "/cover-image",
      { redirect: "error", signal: AbortSignal.timeout(45000) },
    );
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), art);
    phase = "session_relogin";
    const logout = await request("/api/logout", { method: "POST", body: {} });
    assert.equal(logout.status, 200);
    const login = await request("/api/platform/account/login", {
      method: "POST",
      cookie: null,
      body: { email, password, role: "artist" },
    });
    assert.equal(login.status, 200);
    cookie = login.cookie;
    session = await request("/api/platform/session");
    assert(session.data.artist);
    const own = await request("/api/music/mine");
    assert(
      own.data.tracks.some(
        (x) => String(x.id) === String(id) && x.status === "published",
      ),
    );
    const sub = await request("/api/artist/subscription");
    assert.equal(sub.data.artist_features_active, false);
    return {
      fresh_registration_verified: true,
      session_and_relogin_verified: true,
      free_upload_verified: true,
      mp3_bytes_verified: audio.length,
      png_bytes_verified: art.length,
      anonymous_range_stream_verified: true,
      owned_catalog_verified: true,
      paid_subscription_created: false,
      music_test_capacity_remaining:
        allowance.data.remaining_generations,
      music_generation_verified: false,
      provider_calls: 0,
      production_writes: 0,
      live_r2_operations: 0,
    };
  } catch {
    throw Error(
      "Fresh sandbox verification failed at " +
        phase +
        ". No provider calls or production writes were attempted.",
    );
  } finally {
    if (cookie && id) {
      const removed = await request(
        published
          ? "/api/music/tracks/" + id + "/remove"
          : "/api/platform/review-upload/cancel",
        { method: "POST", body: { id } },
      );
      if (removed.status !== 200)
        throw Error("Synthetic review upload cleanup requires review");
    }
    if (cookie)
      await request("/api/logout", { method: "POST", body: {} }).catch(
        () => {},
      );
  }
}
module.exports = { verify };
if (require.main === module) {
  if (process.env.LAE_REVIEW_FRESH_VERIFY !== "1")
    throw Error("Opt in only to the owned review verification");
  verify()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
