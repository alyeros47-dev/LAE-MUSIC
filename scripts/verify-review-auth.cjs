"use strict";
// Opt-in HTTPS journeys on the pinned temporary review service, never production.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const origin = "https://lae-music-review-sandbox.onrender.com";
async function main() {
  if (process.env.LAE_REVIEW_AUTH_TEST !== "1")
    throw Error(
      "Set LAE_REVIEW_AUTH_TEST=1 to create isolated review accounts.",
    );
  async function request(path, { body, cookie } = {}) {
    const r = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json();
    return {
      status: r.status,
      data,
      cookie: r.headers.get("set-cookie")?.split(";")[0],
      cookie_flags: r.headers.get("set-cookie") || "",
    };
  }
  const results = [];
  for (const role of ["listener", "artist"]) {
    const password = " " + crypto.randomBytes(18).toString("hex") + " Aa7 ",
      email = "review-auth-" + crypto.randomUUID() + "@ci.invalid",
      name = "Review " + role + " authentication";
    const prefix = role === "listener" ? "/api/listener" : "/api";
    const registered = await request(prefix + "/register", {
      body: {
        name,
        email,
        password,
        confirmPassword: password,
        country: "Nigeria",
        plan: "starter",
      },
    });
    assert.equal(registered.status, 201, "Sandbox registration must succeed");
    assert(registered.cookie, "Registration must set a session cookie");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"])
      assert(
        registered.cookie_flags.includes(flag),
        "Missing secure session attribute",
      );
    if (role === "artist")
      assert.equal(registered.data.user.membership_status, "pending_payment");
    for (let i = 0; i < 3; i++) {
      const session = await request("/api/platform/session", {
        cookie: registered.cookie,
      });
      assert.equal(session.status, 200);
      assert.equal(
        String(session.data[role]?.id),
        String(registered.data.user.id),
      );
      assert.equal(session.data[role].display_name, name);
      assert.equal(
        session.data[role === "artist" ? "listener" : "artist"],
        null,
      );
      assert.equal(
        (
          await request("/api/platform/account/security?role=" + role, {
            cookie: registered.cookie,
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await request(prefix + "/logout", {
          body: {},
          cookie: registered.cookie,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/api/platform/session", { cookie: registered.cookie }))
        .data[role],
      null,
    );
    const wrong = await request("/api/platform/account/login", {
      body: {
        email,
        password: "Incorrect-review-password-123",
        role: role === "artist" ? "listener" : "artist",
      },
    });
    assert.equal(wrong.status, 401);
    assert(!wrong.cookie);
    const signed = await request("/api/platform/account/login", {
      body: {
        email,
        password,
        role: role === "artist" ? "listener" : "artist",
      },
    });
    assert.equal(signed.status, 200);
    assert.equal(signed.data.role, role);
    assert(signed.cookie, "Sign-in must set the matching role cookie");
    const session = await request("/api/platform/session", {
      cookie: signed.cookie,
    });
    assert.equal(
      String(session.data[role]?.id),
      String(registered.data.user.id),
    );
    assert.equal(
      (
        await request("/api/platform/account/security?role=" + role, {
          cookie: signed.cookie,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/platform/account/security?role=" +
            (role === "artist" ? "listener" : "artist"),
          { cookie: signed.cookie },
        )
      ).status,
      401,
    );
    await request(prefix + "/logout", { body: {}, cookie: signed.cookie });
    results.push({
      role,
      registration_session: true,
      repeat_navigation_session: true,
      logout_invalidates_session: true,
      wrong_password_rejected: true,
      opposite_entry_point_login: true,
      matching_role_only: true,
      password_spaces_preserved: true,
    });
  }
  console.log(
    JSON.stringify({
      url: origin,
      real_https_authentication: true,
      results,
      provider_generation_attempted: false,
      storage_test_attempted: false,
      production_modified: false,
    }),
  );
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Review authentication verification failed. Check the pinned sandbox logs; no password or session token is printed.",
    );
    process.exitCode = 1;
  });
module.exports = { main };
