"use strict";
// Real service worker, IndexedDB, nonextractable Web Crypto keys and audio with an isolated HTTP/provider fixture.
const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const AxeBuilder = require("@axe-core/playwright").default;
const {
  engine,
  launchBrowser,
  artifactLabel,
} = require("./browser-engine.cjs");
const { canonical, message, LIMITS } = require("../web/offline-protocol"),
  { signing, deviceKey } = require("../lib/offline-listening");
async function waitForOfflineEvents(page, count) {
  // Evaluate imports in the page's main realm. An isolated polling realm can
  // instantiate the application's module again and replace its event handlers.
  const deadline = Date.now() + 15000;
  let actual;
  do {
    actual = await page.evaluate(async () => {
      const { offline } = await import("/web/offline-app.js");
      return (await offline.all("events")).length;
    });
    if (actual === count) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(
    actual,
    count,
    "offline reports must reach the expected durable state",
  );
}
function wav() {
  const length = 8000 * 90 * 2,
    b = Buffer.alloc(44 + length);
  b.write("RIFF");
  b.writeUInt32LE(36 + length, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(length, 40);
  return b;
}
(async () => {
  const audio = wav(),
    key = signing(
      crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey,
    ),
    state = {
      signedIn: true,
      devices: new Map(),
      challenges: new Map(),
      grants: new Map(),
      tickets: new Map(),
      events: new Map(),
      qualified: 0,
      requests: [],
    };
  let origin;
  const song = {
    id: "1",
    title: "Website offline fixture",
    artist: "Offline test artist",
    artist_id: "12",
    genre: "Highlife",
    plays: 0,
    published_at: new Date().toISOString(),
    description: "Isolated PWA verification audio.",
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin),
      p = url.pathname;
    state.requests.push({ path: p, method: req.method });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (x, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(x));
    };
    try {
      if (p === "/" || p === "/offline" || p === "/discover") {
        let html = fs.readFileSync("web/index.html", "utf8");
        if (p === "/offline")
          html = html.replace("/web/app.js", "/web/offline-app.js");
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; media-src 'self' https: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'",
        });
        return res.end(html);
      }
      if (p === "/service-worker.js") {
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Service-Worker-Allowed": "/",
          "Cache-Control": "no-cache",
        });
        return res.end(fs.readFileSync("service-worker.js"));
      }
      if (p.startsWith("/web/") && !p.includes("..")) {
        const file = path.join("web", p.slice(5));
        if (fs.existsSync(file)) {
          const ext = path.extname(file);
          res.writeHead(200, {
            "Content-Type":
              {
                ".js": "application/javascript",
                ".css": "text/css",
                ".svg": "image/svg+xml",
                ".webmanifest": "application/manifest+json",
              }[ext] || "application/octet-stream",
          });
          return res.end(fs.readFileSync(file));
        }
      }
      if(p === "/api/platform/capabilities")return send({offline_listening:true,payments:false,payouts:false,review_tools:false});
      if (p === "/api/platform/session")
        return send({
          artist: null,
          admin: false,
          admin_user: null,
          listener: state.signedIn
            ? {
                id: "7",
                display_name: "Offline browser listener",
                premium: {
                  id: "99",
                  expires_at: new Date(Date.now() + 7200000).toISOString(),
                },
              }
            : null,
        });
      if (p === "/api/platform/currencies")
        return send(require("../lib/currency").options());
      if (p === "/api/platform/pricing")
        return send(
          await require("../lib/exchange-rates")
            .createExchangeRates({ env: { FX_RATE_SOURCE: "disabled" } })
            .pricing({ currency: "USD" }),
        );
      if (p === "/api/music/track/1") return send({ track: song });
      if (p === "/api/listener/song-engagement")
        return send({ liked: false, likes: 0 });
      if (p === "/api/listener/comments") return send({ comments: [] });
      if (p === "/api/platform/listening-ad")
        return send({ premium: true, ad: null });
      if (p === "/api/platform/offline/capabilities")
        return send({
          enabled: true,
          public_key: key.jwk,
          kid: key.kid,
          limits: LIMITS,
        });
      if (!p.startsWith("/api/platform/offline/"))
        return send({ error: "Unexpected isolated fixture route " + p }, 404);
      if (!state.signedIn) return send({ error: "Sign in again" }, 401);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const b = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      if (p.endsWith("/register")) {
        deviceKey(b.public_jwk);
        state.devices.set(b.device_id, b.public_jwk);
        return send({ device_id: b.device_id });
      }
      if (p.endsWith("/devices"))
        return send({
          devices: [...state.devices.keys()].map((id) => ({
            id,
            label: "This browser",
          })),
        });
      if (p.endsWith("/challenge")) {
        assert(state.devices.has(b.device_id));
        const nonce = crypto.randomBytes(24).toString("hex");
        state.challenges.set(nonce, { device: b.device_id, action: b.action });
        return send({ nonce, server_ms: Date.now() });
      }
      if (p.endsWith("/media")) {
        const grant = state.grants.get(b.grant_id);
        assert(grant);
        assert.equal(state.tickets.get(b.media_ticket), b.grant_id);
        state.tickets.delete(b.media_ticket);
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(audio.length),
          "Cache-Control": "no-store",
          "Content-Disposition": "inline",
        });
        return res.end(audio);
      }
      if (p.endsWith("/remove")) return send({ ok: true });
      if (p.endsWith("/revoke")) {
        state.devices.delete(b.device_id);
        return send({ ok: true });
      }
      const action = p.endsWith("/grant") ? "grant" : "sync",
        challenge = state.challenges.get(b.nonce);
      assert.equal(challenge?.device, b.device_id);
      assert.equal(challenge.action, action);
      assert(
        crypto.verify(
          "sha256",
          Buffer.from(message(b.device_id, b.nonce, action, b.payload)),
          {
            key: deviceKey(state.devices.get(b.device_id)),
            dsaEncoding: "ieee-p1363",
          },
          Buffer.from(b.signature, "base64url"),
        ),
      );
      state.challenges.delete(b.nonce);
      if (action === "grant") {
        const id = crypto.randomUUID(),
          now = Date.now(),
          payload = {
            v: 1,
            grant_id: id,
            listener_id: "7",
            device_id: b.device_id,
            track_id: "1",
            entitlement_id: "99",
            issued_ms: now,
            until_ms: now + 300000,
            asset_hash: "isolated-audio-v1",
            display_name: "Offline browser listener",
            title: song.title,
            artist: song.artist,
            artist_id: "12",
            genre: "Highlife",
            audio_mime: "audio/wav",
            audio_bytes: audio.length,
            kid: key.kid,
          },
          encoded = Buffer.from(canonical(payload)).toString("base64url"),
          token = {
            payload: encoded,
            signature: crypto
              .sign("sha256", Buffer.from(encoded), {
                key: key.key,
                dsaEncoding: "ieee-p1363",
              })
              .toString("base64url"),
            kid: key.kid,
          };
        state.grants.set(id, payload);
        const ticket = crypto.randomBytes(24).toString("hex");
        state.tickets.set(ticket, id);
        return send({
          token,
          media_ticket: ticket,
          public_key: key.jwk,
          server_ms: now,
        });
      }
      const results = b.payload.events.map((e) => {
        const grant = state.grants.get(e.grant_id);
        assert(grant);
        assert.equal(grant.device_id, b.device_id);
        assert(e.ended_ms <= grant.until_ms);
        assert(e.listened_ms >= 30000);
        const duplicate = state.events.has(e.id);
        if (!duplicate) {
          state.events.set(e.id, e);
          state.qualified++;
        }
        return { id: e.id, status: "qualified", duplicate };
      });
      return send({ results, server_ms: Date.now() });
    } catch (error) {
      console.error("Offline browser fixture:", error.message);
      if (!res.headersSent) send({ error: error.message }, 500);
      else res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  const browser = await launchBrowser();
  try {
    for (const [size, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const label = artifactLabel(size);
      state.signedIn = true;
      const context = await browser.newContext({
          viewport,
          reducedMotion: "reduce",
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install();
      await page.goto(origin + "/discover?track=1");
      await page
        .getByRole("heading", { name: song.title, exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Save offline", exact: true })
        .click();
      await page
        .getByText("Saved in your LAE-MUSIC offline library", { exact: true })
        .waitFor();
      await page.goto(origin + "/offline");
      await page
        .getByRole("button", { name: "Play saved song", exact: true })
        .waitFor();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      const stored = await page.evaluate(async () => {
        const { offline } = await import("/web/offline-app.js"),
          row = (await offline.rows())[0],
          raw = await offline.get("audio", row.id),
          device = await offline.get("devices", "7"),
          cacheNames = await caches.keys(),
          keys = [];
        for (const name of cacheNames)
          for (const request of await (await caches.open(name)).keys())
            keys.push(new URL(request.url).pathname);
        return {
          cipherSize: raw.cipher.byteLength,
          header: new TextDecoder().decode(raw.cipher.slice(0, 4)),
          aesExtractable: device.aes.extractable,
          signExtractable: device.private_key.extractable,
          cacheKeys: keys,
        };
      });
      assert(stored.cipherSize > audio.length);
      assert.notEqual(stored.header, "RIFF");
      assert.equal(stored.aesExtractable, false);
      assert.equal(stored.signExtractable, false);
      assert(
        !stored.cacheKeys.some(
          (p) => p.startsWith("/api/") || p.endsWith(".wav"),
        ),
      );
      const protection = await page.evaluate(async () => {
        const { offline } = await import("/web/offline-app.js"),
          row = (await offline.rows())[0],
          stored = await offline.get("audio", row.id),
          device = await offline.get("devices", "7");
        let exportRejected = false,
          corruptionRejected = false;
        try {
          await crypto.subtle.exportKey("raw", device.aes);
        } catch {
          exportRejected = true;
        }
        const original = stored.cipher,
          changed = original.slice(0);
        new Uint8Array(changed)[0] ^= 255;
        await offline.write("audio", { ...stored, cipher: changed });
        try {
          await offline.media({ id: row.track_id });
        } catch {
          corruptionRejected = true;
        }
        await offline.write("audio", { ...stored, cipher: original });
        return { exportRejected, corruptionRejected };
      });
      assert.deepEqual(protection, {
        exportRejected: true,
        corruptionRejected: true,
      });
      await context.setOffline(true);
      await page.reload();
      await page
        .getByRole("button", { name: "Play saved song", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Play saved song", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          !document.getElementById("audio").paused &&
          document.getElementById("audio").currentTime > 0,
      );
      await page.waitForFunction(
        () => document.getElementById("audio").currentTime >= 31,
        {},
        { timeout: 45000 },
      );
      await page.evaluate(async () => {
        const { player } = await import("/web/offline-app.js");
        player.audio.pause();
      });
      assert(
        await page.evaluate(() =>
          document.getElementById("audio").src.startsWith("blob:"),
        ),
      );
      await waitForOfflineEvents(page, 1);
      const audit = await new AxeBuilder({ page }).analyze();
      fs.writeFileSync(
        "artifacts/accessibility-" + label + "-offline.json",
        JSON.stringify(
          {
            violations: audit.violations,
            incomplete: audit.incomplete,
            passed_rules: audit.passes.length,
          },
          null,
          2,
        ),
      );
      assert.deepEqual(
        audit.violations,
        [],
        label +
          " offline library must have no automated accessibility violations",
      );
      await page.screenshot({
        path: "artifacts/" + label + "-pwa-offline.png",
        fullPage: true,
      });
      const before = state.qualified;
      await context.setOffline(false);
      await page
        .getByRole("button", { name: "Verify & sync online", exact: true })
        .click();
      await waitForOfflineEvents(page, 0);
      assert.equal(
        state.qualified,
        before + 1,
        JSON.stringify({
          label,
          before,
          qualified: state.qualified,
          accepted: state.events.size,
          requests: state.requests
            .filter((r) => r.path.startsWith("/api/platform/offline/"))
            .slice(-20),
          browser: await page.evaluate(async () => {
            const { offline } = await import("/web/offline-app.js");
            return {
              online: navigator.onLine,
              owner: offline.owner,
              device: !!offline.device,
              syncing: offline.syncing,
              pending: (await offline.all("events")).length,
              toast: document.getElementById("toast").textContent,
            };
          }),
        }),
      );
      await page
        .getByRole("button", { name: "Verify & sync online", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.getElementById("offline-sync").disabled,
      );
      assert.equal(state.qualified, before + 1);
      await context.setOffline(true);
      await page.clock.fastForward(360000);
      await page
        .getByRole("button", { name: "Play saved song", exact: true })
        .click();
      await page.waitForFunction(() => document.getElementById("audio").paused);
      await page
        .getByText(/Reconnect to renew or verify your Premium offline access/)
        .waitFor();
      await context.setOffline(false);
      await page
        .getByRole("button", { name: "Verify & sync online", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.getElementById("offline-sync").disabled,
      );
      await context.setOffline(true);
      const rollback = await page.evaluate(async () => {
        const { offline } = await import("/web/offline-app.js"),
          old = Date.now;
        Date.now = () => old() - 3600000;
        try {
          offline.clock();
          return false;
        } catch {
          return true;
        } finally {
          Date.now = old;
        }
      });
      assert(rollback);
      await context.setOffline(false);
      await page
        .getByRole("button", { name: "Play saved song", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.getElementById("audio").paused,
      );
      const other = await context.newPage();
      await other.goto(origin + "/offline");
      await other
        .getByRole("button", { name: "Play saved song", exact: true })
        .waitFor();
      await other.evaluate(async () => {
        const { offline } = await import("/web/offline-app.js");
        await offline.forget();
      });
      await page.waitForFunction(
        () =>
          document.getElementById("audio").paused &&
          !document.getElementById("audio").getAttribute("src"),
      );
      assert.equal(
        await page.evaluate(async () => {
          const { offline } = await import("/web/offline-app.js");
          return (await offline.all("devices")).length;
        }),
        0,
      );
      await other.close();
      state.signedIn = false;
      await page.reload();
      await page
        .getByRole("heading", {
          name: "Set up your listening space.",
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator("[data-offline-play]").count(), 0);
      assert.equal(
        await page.evaluate(async () => {
          const { offline } = await import("/web/offline-app.js");
          return (await offline.all("audio")).length;
        }),
        0,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        "PASS real PWA " +
          label +
          ": encrypted storage, actual offline reload/playback, expiry, clock guard, cipher/key protection, exactly-once sync and cross-tab/account cleanup.",
      );
    }
    const unsupported = await browser.newContext();
    await unsupported.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        get: () => undefined,
      });
    });
    const p = await unsupported.newPage();
    await p.goto(origin + "/offline");
    await p
      .getByText(
        "This browser cannot provide offline listening. Use online streaming.",
        { exact: true },
      )
      .waitFor();
    await unsupported.close();
    console.log(
      "PASS " +
        engine +
        " 2 offline-library axe audits and unsupported-browser offline fallback. No external media or payment services used.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
