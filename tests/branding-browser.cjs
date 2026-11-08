"use strict";
// Approved artwork through the actual static routes, responsive UI and app metadata.
// Public catalogue responses are fixtures; no accounts, providers or credits are used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const AxeBuilder = require("@axe-core/playwright").default;
const { runtime } = require("./runtime.cjs");
const { launchBrowser, artifactLabel } = require("./browser-engine.cjs");
const root = path.join(__dirname, "..");
(async () => {
  const app = await runtime();
  for (const [file, width, height] of [
    ["lae-logo-wide.png", 2048, 682],
    ["lae-logo-square.png", 1254, 1254],
  ]) {
    const response = await app.request("/web/" + file);
    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /^image\/png\b/);
    assert.deepEqual(response.body, fs.readFileSync(path.join(root, "web", file)));
    assert.equal(response.body.readUInt32BE(16), width);
    assert.equal(response.body.readUInt32BE(20), height);
    const head = await app.request("/web/" + file, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
  }
  const server = http.createServer(async (req, res) => {
    const r = await app.request(req.url, { method: req.method });
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await launchBrowser();
    for (const width of [320, 393, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      try {
        await context.addInitScript(() => localStorage.setItem("lae_listening_preferences_v1", JSON.stringify({ version: 1, selections: [] })));
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/**", route => {
          const endpoint = new URL(route.request().url()).pathname;
          const fixtures = {
            "/api/platform/session": { artist: null, listener: null, admin: false },
            "/api/platform/currencies": require("../lib/currency").options(),
            "/api/platform/discover": { tracks: [], artists: [], genres: [{ genre: "Gospel Praise", tracks: 0 }, { genre: "Gospel Worship", tracks: 0 }], next_cursor: null },
            "/api/platform/capabilities": { manual_bank_payments: true, offline_listening: true, database: true },
            "/api/platform/editorial": { promotions: [], featured_tracks: [], featured_artists: [] },
          };
          return route.fulfill({ contentType: "application/json", body: JSON.stringify(fixtures[endpoint] || {}) });
        });
        await page.goto(origin);
        await page.getByRole("heading", { name: "Fresh off the press", exact: true }).waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll(".brand-approved img,.brand-feature img")].every(image => image.complete && image.naturalWidth > 0));
        assert.deepEqual(await page.locator(".brand-approved img,.brand-feature img").evaluateAll(images => images.map(image => [image.naturalWidth, image.naturalHeight])), [[2048, 682], [1254, 1254]]);
        const layout = await page.evaluate(() => {
          const hero = document.querySelector(".hero").getBoundingClientRect();
          const logo = document.querySelector(".brand-feature img").getBoundingClientRect();
          const action = document.querySelector("#explore-play").getBoundingClientRect();
          return { overflow: document.documentElement.scrollWidth > innerWidth, contained: logo.left >= hero.left && logo.right <= hero.right && logo.top >= hero.top && logo.bottom <= hero.bottom, overlap: logo.left < action.right && logo.right > action.left && logo.top < action.bottom && logo.bottom > action.top };
        });
        assert.equal(layout.overflow, false, "no horizontal overflow at " + width);
        assert.equal(layout.contained, true, "complete feature logo stays inside hero at " + width);
        assert.equal(layout.overlap, false, "logo does not obscure main action at " + width);
        assert.equal(await page.locator('link[rel="icon"]').getAttribute("href"), "/web/lae-logo-square.png");
        if (width === 393 || width === 1440) {
          assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
          fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
          await page.screenshot({ path: path.join(root, "artifacts", artifactLabel("approved-brand-" + width) + ".png") });
        }
        if (width <= 700) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
        await page.getByRole("link", { name: "LAE-MUSIC home", exact: true }).waitFor({ state: "visible" });
        assert.equal(await page.getByRole("link", { name: "LAE-MUSIC home", exact: true }).getAttribute("href"), "/");
        assert.deepEqual(errors, []);
        console.log("PASS approved logo delivery, placement and navigation: " + width + "px");
      } finally { await context.close(); }
    }
    const manifest = (await app.request("/web/manifest.webmanifest")).json();
    assert.equal(manifest.icons[0].src, "/web/lae-logo-square.png");
    assert.equal(manifest.icons[0].purpose, "any");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
