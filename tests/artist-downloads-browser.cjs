"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { launchBrowser, engine } = require("./browser-engine.cjs");
(async () => {
  const bytes = Buffer.from(
    fs.readFileSync("tests/fixtures/review-tone.mp3.base64", "utf8"),
    "base64",
  );
  let requests = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/artist-downloads.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(fs.readFileSync("web/artist-downloads.js"));
      return;
    }
    if (req.url.startsWith("/api/music/sonic/output")) {
      if (req.url.includes("error")) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Owned song required" }));
        return;
      }
      requests++;
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": bytes.length,
        "Content-Disposition": "attachment; filename*=UTF-8''Owned%20song.mp3",
      });
      res.end(bytes);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<a download href="/api/music/sonic/output?case=audio" id="audio">Download own audio</a><a download href="/api/music/sonic/output?case=error" id="error">Download unavailable</a><script type="module">import {bindArtistDownloads} from "/artist-downloads.js";window.messages=[];bindArtistDownloads({toast:m=>window.messages.push(m)});window.ready=true;</script>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.waitForFunction(() => window.ready);
    const event = page.waitForEvent("download");
    await page.locator("#audio").click();
    const file = await event;
    assert.equal(await file.failure(), null);
    assert.equal(file.suggestedFilename(), "Owned song.mp3");
    assert(fs.readFileSync(await file.path()).equals(bytes));
    assert.equal(requests, 1);
    const again = page.waitForEvent("download");
    await page.locator("#audio").click();
    assert.equal(await (await again).failure(), null);
    assert.equal(requests, 1);
    await page.locator("#error").click();
    await page.waitForFunction(() =>
      window.messages.includes("Owned song required"),
    );
    console.log(
      "PASS " +
        engine +
        " artist download: real saved file/filename, ready-file retry without another request, and readable authorization failure. No providers or production used.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
