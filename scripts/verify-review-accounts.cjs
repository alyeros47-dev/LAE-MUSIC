"use strict";
const ORIGIN = "https://lae-music-review-sandbox.onrender.com";
async function verify({ adminKey, fetchImpl = fetch } = {}) {
  let adminCookie, artistCookie, chosen;
  const password = require("node:crypto").randomBytes(24).toString("hex");
  async function request(path, { method = "GET", body, cookie } = {}) {
    const r = await fetchImpl(ORIGIN + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
      headers: {
        Origin: ORIGIN,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const ensure = (x, message) => {
    if (!x) throw Error(message);
  };
  try {
    const denied = await request("/api/platform/admin/review-accounts");
    ensure(denied.status === 401, "Anonymous import access was not denied");
    const login = await request("/api/admin/login", {
      method: "POST",
      body: { password: adminKey },
    });
    if (login.status !== 200)
      return { verified: false, reason: "owner_login_required" };
    adminCookie = login.cookie;
    ensure(adminCookie, "Owner session missing");
    const list = await request("/api/platform/admin/review-accounts", {
      cookie: adminCookie,
    });
    ensure(
      list.status === 200 && list.data.configured && list.data.artists?.length,
      "Imported artist profiles are missing",
    );
    const published = await request("/api/music/artists");
    const owners = new Set(
      (published.data.artists || []).map((x) => String(x.id)),
    );
    chosen =
      list.data.artists.find((x) => owners.has(String(x.id))) ||
      list.data.artists[0];
    ensure(
      chosen.email.endsWith("@review-catalog.invalid"),
      "Imported address is not isolated",
    );
    const reset = await request(
      "/api/platform/admin/review-accounts/password",
      {
        method: "POST",
        cookie: adminCookie,
        body: {
          artist_id: String(chosen.id),
          password,
          confirmPassword: password,
        },
      },
    );
    ensure(reset.status === 200, "Sandbox test-password check failed");
    const artist = await request("/api/platform/account/login", {
      method: "POST",
      body: { email: chosen.email, password, role: "artist" },
    });
    ensure(
      artist.status === 200 && artist.cookie,
      "Copied artist sign-in failed",
    );
    artistCookie = artist.cookie;
    const session = await request("/api/platform/session", {
      cookie: artistCookie,
    });
    ensure(
      session.status === 200 &&
        String(session.data.artist?.id) === String(chosen.id),
      "Copied artist session mismatch",
    );
    const own = await request("/api/music/mine", { cookie: artistCookie });
    ensure(
      own.status === 200 &&
        (!owners.has(String(chosen.id)) || own.data.tracks.length > 0) &&
        own.data.tracks.every((x) => String(x.artist_id) === String(chosen.id)),
      "Copied artist catalog ownership failed",
    );
    const allowance = await request("/api/artist/studio-allowance", {
      cookie: artistCookie,
    });
    if(allowance.data.review_test_access){const sub=await request('/api/artist/subscription',{cookie:artistCookie});ensure(sub.status===200&&sub.data.artist_features_active===false,'Import unexpectedly granted paid entitlement');}
    else ensure(allowance.status===200&&allowance.data.active===false,'Import unexpectedly granted paid entitlement');
    const cross = await request("/api/platform/admin/review-accounts", {
      cookie: artistCookie,
    });
    ensure(cross.status === 401, "Artist received owner access");
    return {
      verified: true,
      imported_artists: list.data.artists.length,
      owner_controls_verified: true,
      artist_login_verified: true,
      artist_session_verified: true,
      owned_catalog_verified: true,
      paid_entitlements_granted: false,
      production_credentials_copied: false,
    };
  } finally {
    if (adminCookie && chosen) {
      const unknown = require("node:crypto").randomBytes(32).toString("hex");
      const locked = await request(
        "/api/platform/admin/review-accounts/password",
        {
          method: "POST",
          cookie: adminCookie,
          body: {
            artist_id: String(chosen.id),
            password: unknown,
            confirmPassword: unknown,
          },
        },
      );
      ensure(
        locked.status === 200,
        "Sandbox verification credential cleanup requires review",
      );
    }
    if (artistCookie)
      await request("/api/logout", {
        method: "POST",
        cookie: artistCookie,
        body: {},
      }).catch(() => {});
    if (adminCookie)
      await request("/api/admin/logout", {
        method: "POST",
        cookie: adminCookie,
        body: {},
      }).catch(() => {});
  }
}
module.exports = { verify };
