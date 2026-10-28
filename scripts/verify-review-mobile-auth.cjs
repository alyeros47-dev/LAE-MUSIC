"use strict";
// Opt-in synthetic-account regression against the review site only.
// Browser requests use a loopback bridge; upstream HTTPS keeps certificate verification.
// No passwords/cookies are logged; no provider or production calls are made.
if (process.env.LAE_REVIEW_AUTH_VERIFY !== "1")
  throw Error(
    "Opt in with LAE_REVIEW_AUTH_VERIFY=1 for synthetic sandbox authentication checks",
  );
const http = require("node:http"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { launchBrowser } = require("../tests/browser-engine.cjs");
(async () => {
  const target = "https://lae-music-review-sandbox.onrender.com";
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const headers = {};
      for (const k of [
        "accept",
        "content-type",
        "cookie",
        "user-agent",
        "range",
      ])
        if (req.headers[k]) headers[k] = req.headers[k];
      if (req.method !== "GET" && req.method !== "HEAD")
        headers.Origin = target;
      const r = await fetch(target + req.url, {
        method: req.method,
        headers,
        body: body.length ? body : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(90000),
      });
      for (const k of [
        "content-type",
        "cache-control",
        "content-security-policy",
        "permissions-policy",
        "set-cookie",
        "accept-ranges",
        "content-range",
      ]) {
        const v = r.headers.get(k);
        if (v) res.setHeader(k, v);
      }
      if (r.headers.get("location"))
        res.setHeader(
          "location",
          r.headers.get("location").replace(target, ""),
        );
      res.writeHead(r.status);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.writeHead(502);
      res.end("Test proxy upstream unavailable");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await launchBrowser();
  try {
    for (const role of ["artist", "listener"]) {
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        page = await context.newPage();
      const email = "auth-ui-" + crypto.randomUUID() + "@ci.invalid",
        password = " Exact-" + crypto.randomBytes(12).toString("hex") + "-é! ";
      page.setDefaultTimeout(30000);
      await page.goto(origin + "/join?role=" + role + "&mode=register");
      await page
        .getByLabel("Display name", { exact: true })
        .fill("Mobile re-login test");
      await page.getByLabel("Email address", { exact: true }).fill(email);
      if (role === "artist")
        await page.getByLabel("Country", { exact: true }).fill("Nigeria");
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByLabel("Confirm password", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Create free account ↗", exact: true })
        .click();
      await page.waitForURL(role === "artist" ? "**/workspace" : "**/library");
      for (let n = 1; n <= 2; n++) {
        await page.goto(origin + "/account");
        await page.locator("#signout").click();
        await page.waitForURL(origin + "/");
        await page.goto(origin + "/join");
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill(password);
        const responsePromise = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/platform/account/login") &&
            r.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Sign in ↗", exact: true })
          .click();
        const response = await responsePromise;
        console.log(
          JSON.stringify({
            role,
            round: n,
            actual_mobile_ui: true,
            login_status: response.status(),
          }),
        );
        assert.equal(response.status(), 200);
        await page.waitForURL(
          role === "artist" ? "**/workspace" : "**/library",
        );
      }
      await context.close();
    }
    console.log(
      "PASS actual sandbox mobile signup → logout → default-role sign-in → dashboard twice for artists/listeners. No providers used.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
