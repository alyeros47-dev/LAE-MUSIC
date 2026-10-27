"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { runtime } = require("./runtime.cjs");
test("every static sidebar/header/footer page link and legacy account/studio entry opens the shared frontend", async () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const links = new Set(
    [...html.matchAll(/<a\b[^>]*href="(\/[^"$]*)"/g)].map((x) => x[1]),
  );
  for (const p of [
    "/index.html",
    "/discover",
    "/artist",
    "/artist.html",
    "/artist/profile-photo",
    "/music",
    "/music.html",
    "/listen",
    "/start",
    "/get-started",
    "/dashboard",
    "/earnings",
    "/affiliate-links",
    "/music-prompt-studio",
    "/music-prompt-studio.html",
    "/listener/account",
    "/listener/dashboard",
    "/admin",
    "/admin.html",
    "/admin/login",
    "/admin/studio",
    "/admin/withdrawals",
    "/admin-withdrawals",
  ])
    links.add(p);
  const app = await runtime();
  for (const link of links) {
    const r = await app.request(link);
    assert.equal(r.status, 200, link);
    assert.match(r.headers["content-type"], /text\/html/, link);
    assert(
      r.text.includes(
        link === "/offline" ? "/web/offline-app.js" : "/web/app.js",
      ),
      link + " must open the integrated frontend",
    );
  }
  assert(links.size >= 30);
});
