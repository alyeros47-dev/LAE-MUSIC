"use strict";
// Real Music DNA UI/adapters and actual handlers, hosted only on loopback with synthetic services.
const http = require("node:http"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright"),
  AxeBuilder = require("@axe-core/playwright").default;
const dna = require("../lib/music-dna"),
  { handler } = require("./lyrics-handler-fixture.cjs"),
  { fixture, sonicFlow } = require("./music-dna-audit-support.cjs");
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
(async () => {
  const catalog = dna.catalogue(),
    { musicDNAControls } = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const legacy = [
    "musicFamily",
    "musicCountry",
    "musicProfile",
    "genre",
    "beat",
    "language",
    "extraLanguage",
  ]
    .map(
      (n) =>
        `<label>${n}<select name="${n}"><option value="">Neutral</option></select></label>`,
    )
    .join("");
  const pageHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated Music DNA audit</title><link rel="stylesheet" href="/web/ui.css"></head><body><main style="max-width:960px;margin:auto;padding:16px"><h1>Music DNA integration audit</h1><h2>Lyrics studio</h2><form id="brief">${musicDNAControls(catalog, escape)}<label>Voice<select name="voice">${catalog.voices.map((v) => `<option value="${v.id}">${escape(v.name)}</option>`).join("")}</select></label><label>Song topic<textarea name="idea">An original song about friendship and finding hope</textarea></label><label>Model<select name="lyricsModel"><option value="gpt-6.1-sol">GPT-6.1 Sol</option></select></label><label>Duration<select name="duration"><option>3 minutes</option></select></label>${legacy}<button>Generate mock lyrics</button></form><section><h2>Validated output</h2><label>Lyrics<textarea id="lyrics" readonly></textarea></label><label>Music style<textarea id="style" readonly></textarea></label><button id="music">Send mock music request</button><p id="result" role="status"></p></section></main><script type="module">
 import {bindMusicDNA} from '/web/music-dna.js';import {lyricsRequest,musicRequest} from '/web/studio-engine.js';
 const c=await (await fetch('/catalog')).json(),f=document.querySelector('#brief');window.update=bindMusicDNA(f,JSON.parse(localStorage.getItem('draft')||'null'),c);window.lastResult=null;
 function brief(){const b=Object.fromEntries(new FormData(f));b.musicDnaLanguages=Array.from(f.elements.musicDnaLanguages.selectedOptions,o=>o.value);return b;}
 f.addEventListener('input',()=>localStorage.setItem('draft',JSON.stringify(brief())));window.getPayload=()=>lyricsRequest(brief());
 f.onsubmit=async e=>{e.preventDefault();const p=window.getPayload();window.lastPayload=p;const r=await fetch('/lyrics',{method:'POST',body:JSON.stringify(p)});const out=await r.json();window.lastResult=out;document.querySelector('#lyrics').value=out.lyrics;document.querySelector('#style').value=out.style;};
 document.querySelector('#music').onclick=async()=>{const payload=musicRequest({...window.lastResult,duration:'3 minutes',useVoice:f.elements.voice.value==='custom'},{hasVoice:true,status:'ready'});const r=await fetch('/music',{method:'POST',body:JSON.stringify(payload)});window.musicResult=await r.json();document.querySelector('#result').textContent='Mock music request accepted';};window.ready=true;
 </script></body></html>`;
  const calls = [];
  let serverError;
  const server = http.createServer(async (req, res) => {
    try {
      const json = (v) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(v));
      };
      if (req.url === "/") return res.end(pageHTML);
      if (
        ["/web/music-dna.js", "/web/studio-engine.js", "/web/ui.css"].includes(
          req.url,
        )
      ) {
        res.writeHead(200, {
          "Content-Type": req.url.endsWith(".css")
            ? "text/css"
            : "text/javascript",
        });
        return res.end(fs.readFileSync("." + req.url));
      }
      if (req.url === "/catalog") return json(catalog);
      const chunks = [];
      for await (const b of req) chunks.push(b);
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      calls.push({ path: req.url, payload });
      if (req.url === "/lyrics") {
        const actor = {
            artistId: 7,
            requestKey: "qa-dna-browser-request-00001",
          },
          c = dna.prepare(payload, actor),
          r = await handler({
            payload,
            actor,
            engine: dna,
            response: fixture(c),
            voiceReady: payload.voice === "custom",
          });
        assert.equal(r.result.status, 200);
        return json(r.result.data);
      }
      if (req.url === "/music") {
        const r = await sonicFlow(payload);
        assert.equal(r.status, 200);
        assert.equal(r.sent.tags, payload.style);
        return json({
          status: r.status,
          provider_tags: r.sent.tags,
          task_type: r.sent.task_type,
        });
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      serverError = e;
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Isolated audit failed" }));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.LAE_CHROMIUM_PATH
      ? { executablePath: process.env.LAE_CHROMIUM_PATH }
      : fs.existsSync("/usr/bin/chromium")
        ? { executablePath: "/usr/bin/chromium" }
        : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const evidence = [];
  try {
    for (const [name, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({
          viewport,
          reducedMotion: "reduce",
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) =>
        route.request().url().startsWith(origin)
          ? route.continue()
          : route.abort(),
      );
      await page.goto(origin);
      await page.waitForFunction(() => window.ready);
      assert.equal(
        await page.locator("[name=musicDnaStyle] optgroup").count(),
        43,
      );
      assert.equal(
        await page.locator("[name=musicDnaStyle] option").count(),
        216,
      );
      for (const s of catalog.styles) {
        await page.locator("[name=musicDnaStyle]").selectOption(s.id);
        assert(
          (await page.locator("#music-dna-status").textContent()).includes(
            s.description,
          ),
        );
        const p = await page.evaluate(() => window.getPayload());
        assert.equal(p.musicDnaStyle, s.id);
        assert(!Object.hasOwn(p, "beat"));
        assert(!Object.hasOwn(p, "mood"));
        assert.equal(await page.locator("[name=genre]").isDisabled(), true);
      }
      await page.locator("[name=musicDnaStyle]").selectOption("");
      assert.equal(await page.locator("[name=genre]").isDisabled(), false);
      assert.equal(
        await page.locator("[name=musicDnaLanguages]").isDisabled(),
        true,
      );
      for (const [id, voice, languages] of [
        ["G2-04", "female", ["en", "ha"]],
        ["S6-01", "male", ["en", "pcm"]],
        ["R7-05", "duet", ["en", "yo"]],
        ["W8-05", "custom", ["en", "fr"]],
      ]) {
        await page.locator("[name=musicDnaStyle]").selectOption(id);
        await page.locator("[name=voice]").selectOption(voice);
        await page.locator("[name=musicDnaLanguages]").selectOption(languages);
        await page
          .locator("[name=idea]")
          .fill("An original hopeful story about friendship and recovery");
        await page.reload();
        await page.waitForFunction(() => window.ready);
        assert.equal(
          await page.locator("[name=musicDnaStyle]").inputValue(),
          id,
        );
        // Voice/topic are ordinary form values; the actual app owns their persistence, while this component restores DNA/languages only.
        await page.locator("[name=voice]").selectOption(voice);
        assert.deepEqual(
          await page
            .locator("[name=musicDnaLanguages]")
            .evaluate((s) => Array.from(s.selectedOptions, (o) => o.value)),
          languages,
        );
        await page
          .getByRole("button", { name: "Generate mock lyrics" })
          .click();
        await page.waitForFunction(
          (id) => window.lastResult?.music_dna?.style_id === id,
          id,
        );
        const out = await page.evaluate(() => window.lastResult);
        assert.equal(out.music_dna.voice, voice);
        assert.deepEqual(out.music_dna.languages, languages);
        await page.evaluate(() => (window.musicResult = null));
        await page
          .getByRole("button", { name: "Send mock music request" })
          .click();
        await page.waitForFunction(() => window.musicResult?.status === 200);
        const music = await page.evaluate(() => window.musicResult);
        assert.equal(music.provider_tags, out.style);
        assert.equal(
          music.task_type,
          voice === "custom" ? "persona_music" : "create_music",
        );
      }
      const axe = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(
        axe.violations.map((v) => ({ id: v.id, impact: v.impact })),
        [],
      );
      const bounds = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert(bounds.scroll <= bounds.width + 1);
      assert.deepEqual(errors, []);
      assert(!serverError);
      fs.mkdirSync("artifacts", { recursive: true });
      await page.screenshot({
        path: "artifacts/music-dna-audit-" + name + ".png",
        fullPage: true,
      });
      evidence.push({
        viewport: name,
        styles_selected: 215,
        groups: 43,
        representative_workflows: 4,
        accessibility_violations: axe.violations.length,
        horizontal_overflow: false,
        page_errors: errors,
      });
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
  fs.writeFileSync(
    "artifacts/music-dna-browser-audit.json",
    JSON.stringify(
      {
        browser: "chromium",
        scope:
          "Real DNA components/adapters and actual mocked handlers in an isolated local harness, not the complete website",
        evidence,
        handler_requests: calls.length,
        paid_provider_calls: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ status: "passed", evidence, paid_provider_calls: 0 }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
