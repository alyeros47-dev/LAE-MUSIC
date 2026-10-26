"use strict";
const definitions = [
  ["public_api", "Public catalog and account reads", 3000, 0, null],
  ["artist_login", "Artist sign-in", 20, 0, null],
  ["listener_login", "Listener sign-in", 20, 0, null],
  ["admin_login", "Administrator sign-in", 20, 0, null],
  ["artist_registration", "Artist registration", 20, 0, null],
  ["listener_registration", "Listener registration", 20, 0, null],
  ["account_recovery", "Account recovery and verification", 120, 0, null],
  ["admin_identity", "Administrator identity operations", 120, 60, "admin"],
  ["public_comments", "Comments and catalog reports", 120, 30, "listener"],
  [
    "studio_write",
    "Studio requests and release operations",
    600,
    120,
    "artist",
  ],
  ["upload_write", "Audio and artwork upload operations", 600, 120, "artist"],
  [
    "offline_write",
    "Premium offline saves and synchronization",
    2400,
    900,
    "listener",
  ],
  [
    "listener_write",
    "Listener collections and Premium operations",
    1200,
    240,
    "listener",
  ],
  [
    "artist_write",
    "Artist, partner and financial account operations",
    1200,
    240,
    "artist",
  ],
  [
    "admin_write",
    "Administrative changes and verification",
    1200,
    240,
    "admin",
  ],
  ["other_write", "Other API changes", 600, 0, null],
];
const POLICIES = Object.freeze(
  Object.fromEntries(
    definitions.map(([id, label, client_max, actor_max, role]) => [
      id,
      Object.freeze({ id, label, client_max, actor_max, role, seconds: 60 }),
    ]),
  ),
);
const auth = new Map([
  ["/api/login", "artist_login"],
  ["/api/listener/login", "listener_login"],
  ["/api/admin/login", "admin_login"],
  ["/api/register", "artist_registration"],
  ["/api/listener/register", "listener_registration"],
]);
function requestPolicy(method, path) {
  if (!path.startsWith("/api/") || method === "OPTIONS") return null;
  // Delivery and signature/independent-receipt verification retain their existing provider-specific controls.
  if (
    method === "POST" &&
    /^\/api\/platform\/payments\/webhooks\/(paystack|flutterwave)$/.test(path)
  )
    return null;
  if (method === "GET" || method === "HEAD") return POLICIES.public_api;
  if (auth.has(path)) return POLICIES[auth.get(path)];
  if (path.startsWith("/api/platform/account/"))
    return POLICIES.account_recovery;
  if (path.startsWith("/api/platform/admin/auth/"))
    return POLICIES.admin_identity;
  if (path.startsWith("/api/admin/") || path.startsWith("/api/platform/admin/"))
    return POLICIES.admin_write;
  if (path.startsWith("/api/platform/offline/")) return POLICIES.offline_write;
  if (path === "/api/artist/comment-moderation") return POLICIES.artist_write;
  if (
    [
      "/api/platform/listener-profile",
      "/api/platform/listener-password",
    ].includes(path)
  )
    return POLICIES.listener_write;
  if (/comment|\/song-report$|\/tracks\/\d+\/report$/.test(path))
    return POLICIES.public_comments;
  if (
    /\/sonic\/|\/lyrics-generate$|\/studio\/releases|\/artist\/voice/.test(path)
  )
    return POLICIES.studio_write;
  if (
    /\/upload\/(prepare|finish|cancel)$|\/platform\/track$|\/profile-photo$/.test(
      path,
    )
  )
    return POLICIES.upload_write;
  if (
    path.startsWith("/api/listener/") ||
    path.startsWith("/api/platform/premium/") ||
    path.startsWith("/api/platform/playlists/")
  )
    return POLICIES.listener_write;
  if (
    path.startsWith("/api/artist/") ||
    path.startsWith("/api/affiliate/") ||
    path.startsWith("/api/platform/") ||
    path.startsWith("/api/gifts/") ||
    path.startsWith("/api/generation/")
  )
    return POLICIES.artist_write;
  return POLICIES.other_write;
}
module.exports = { POLICIES, requestPolicy };
