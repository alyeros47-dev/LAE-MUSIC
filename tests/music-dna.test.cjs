"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const dna = require("../lib/music-dna"),
  fixture = require("./music-dna-fixture.cjs");
const engine = () => dna.createEngine(fixture.catalogue());
const body = {
  musicDnaStyle: "qa-restrained",
  musicDnaLanguages: ["en", "yo"],
  voice: "neutral",
  idea: "An original account of finding hope",
};
const actor = { artistId: 7, requestKey: "qa-music-dna-request-0001" };
test("the unpublished 43-group inventory is preserved without fabricated customer styles", () => {
  const c = dna.catalogue();
  assert.equal(c.status, "awaiting_catalogue");
  assert.equal(
    c.departments.reduce((n, d) => n + d.research_groups, 0),
    43,
  );
  assert.deepEqual(
    c.departments.map((d) => d.research_groups),
    [14, 14, 7, 8],
  );
  assert.deepEqual(c.categories, []);
  assert.deepEqual(c.styles, []);
  assert.throws(
    () => dna.prepare(body, actor),
    (e) => e.status === 400,
  );
});
test("DNA validates each required production field, category membership and independent voice identity", () => {
  for (const field of [
    "rhythm",
    "drums_percussion",
    "bass",
    "melody_harmony",
    "vocal_delivery",
    "arrangement",
    "mood",
    "energy",
    "production_mix",
  ]) {
    const c = fixture.catalogue();
    delete c.styles[0][field];
    assert.throws(() => dna.createEngine(c));
  }
  for (const change of [
    (c) => (c.styles[0].tempo.min = 260),
    (c) => (c.styles[0].category_id = "other"),
    (c) => (c.styles[0].vocal_delivery = "Female alto only"),
    (c) => c.styles.push({ ...c.styles[0] }),
    (c) => (c.styles[0].variations.melody = ["Only one"]),
    (c) => (c.styles[0].name = "INTERNAL_QA_RESEARCH_NAME copy"),
    (c) => (c.departments[0].research_groups = 15),
    (c) => (c.status = "awaiting_catalogue"),
  ]) {
    const c = fixture.catalogue();
    change(c);
    assert.throws(() => dna.createEngine(c));
  }
  const c = fixture.catalogue();
  c.styles.push({ ...c.styles[0], id: "qa-duplicate", name: "Another label" });
  assert.throws(() => dna.createEngine(c), /Duplicate Music DNA core/);
});
test("public categories are headings only and private research names never reach the client or provider prompt", async () => {
  const e = engine(),
    c = e.catalogue(),
    context = e.prepare(body, actor);
  assert.throws(() =>
    e.prepare({ ...body, musicDnaStyle: "qa-prayer" }, actor),
  );
  assert(!JSON.stringify(c).includes("INTERNAL_QA"));
  assert(!e.instructions(context).includes("INTERNAL_QA"));
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, (s) =>
    String(s).replaceAll('"', "&quot;"),
  );
  assert(
    html.includes('<optgroup label="Gospel Music / QA restrained category">'),
  );
  assert(!html.includes('<option value="qa-prayer"'));
  assert(html.includes('<option value="qa-restrained"'));
  assert.equal(ui.musicDNAControls(dna.catalogue(), String), "");
});
test("profile mood and instruments are unaffected by voice, language, customer mood or conflicting legacy percussion", () => {
  const e = engine(),
    base = e.prepare(body, actor);
  for (const voice of ["neutral", "male", "female", "duet", "custom"]) {
    const x = e.prepare(
      {
        ...body,
        voice,
        mood: "Party",
        beat: "club",
        musicDnaLanguages: ["ig", "ha", "fr"],
      },
      actor,
    );
    assert.deepEqual(x.profile, base.profile);
    assert.equal(x.tempo, base.tempo);
    assert.deepEqual(x.choices, base.choices);
    assert.equal(x.voice, voice);
    assert.deepEqual(x.languages, ["ig", "ha", "fr"]);
    assert.equal(x.profile.mood, "Reflective");
    assert(!Object.hasOwn(x, "mood"));
  }
  for (const input of [
    { voice: "celebrity clone" },
    { musicDnaLanguages: ["xx"] },
    { musicDnaLanguages: "en" },
    { musicDnaLanguages: ["en", "en"] },
  ])
    assert.throws(
      () => e.prepare({ ...body, ...input }, actor),
      (e) => e.status === 400,
    );
});
test("variation is retry-stable, changes across artists/new requests and stays within approved bounds", () => {
  const e = engine(),
    first = e.prepare(body, actor);
  assert.deepEqual(e.prepare(body, actor), first);
  const seen = new Set();
  for (let n = 0; n < 20; n++) {
    const x = e.prepare(body, {
      artistId: n + 1,
      requestKey: "qa-music-dna-request-" + n,
    });
    assert.notEqual(x.variation_id, first.variation_id);
    assert(x.tempo >= 62 && x.tempo <= 76);
    for (const [k, v] of Object.entries(x.choices))
      assert(first.profile.variations[k].includes(v));
    seen.add(JSON.stringify([x.tempo, x.choices]));
  }
  assert(seen.size > 1);
  assert.equal(e.catalogue().unique_output_guaranteed, false);
});
test("mismatched style, mood, energy, tempo, language declaration and overlong prompts are rejected", () => {
  const e = engine(),
    context = e.prepare(body, actor),
    out = fixture.output(context);
  e.validateOutput(out, context);
  for (const value of [
    { dna_style_id: "other" },
    { dna_mood: "Party" },
    { dna_energy: "High" },
    { tempo_bpm: 200 },
    { language_codes: ["en"] },
    { variation_id: "changed" },
    { style: "x".repeat(951) },
    { lyrics: { untrusted: "object" } },
    { style: "" },
    { lyrics: "INTERNAL_QA_RESEARCH_NAME" },
  ])
    assert.throws(() => e.validateOutput({ ...out, ...value }, context));
  assert.equal(
    dna.fingerprint("[Verse]\nHello, WORLD!"),
    dna.fingerprint("hello world"),
  );
});
async function handler({
  payload = body,
  response,
  prepareOnly = false,
  transportError = false,
} = {}) {
  const src = fs.readFileSync("server.js", "utf8"),
    start = src.indexOf("if(p==='/api/music/lyrics-generate'"),
    end = src.indexOf("if(p===", start + 10);
  const Fn = Object.getPrototypeOf(async function () {}).constructor,
    load = require("node:module").createRequire(path.resolve("server.js"));
  const e = engine(),
    counts = { reserve: 0, complete: 0, refund: 0, post: 0 },
    context = e.prepare(payload, actor);
  let request;
  const req = {
      method: "POST",
      headers: { "idempotency-key": actor.requestKey },
    },
    process = { env: { OPENAI_API_KEY: "qa-mocked-only" } };
  const run = new Fn(
    "req",
    "res",
    "p",
    "validOrigin",
    "process",
    "body",
    "authAdmin",
    "me",
    "pool",
    "json",
    "grantWelcomeCredits",
    "credits",
    "fetch",
    "AbortSignal",
    "ensureCoinTables",
    "require",
    src.slice(start, end),
  );
  let reserved;
  const result = await run(
    req,
    {},
    "/api/music/lyrics-generate",
    () => true,
    process,
    async () => ({
      ...payload,
      model: "gpt-6.1-sol",
      idea: body.idea,
      mood: "Party dance",
    }),
    () => false,
    async () => ({ id: 7 }),
    {},
    (_r, status, data) => ({ status, data }),
    async () => {},
    {
      reserveLyrics: async (_pool, _id, _key, b) => {
        counts.reserve++;
        reserved = b;
        return { reference: "qa-reservation" };
      },
      completeLyrics: async (_pool, _id, _ref, _key, out) => {
        counts.complete++;
        return out;
      },
      refundLyrics: async () => {
        counts.refund++;
      },
    },
    async (url, o) => {
      if (o.method === "GET") return Response.json({ id: "gpt-6.1-sol" });
      counts.post++;
      request = JSON.parse(o.body);
      if (transportError) throw Error("ambiguous transport");
      return Response.json({
        output_text: JSON.stringify(response || fixture.output(context)),
      });
    },
    AbortSignal,
    async () => {},
    (name) => (name === "./lib/music-dna" ? { ...dna, ...e } : load(name)),
  );
  return { result, counts, request, reserved };
}
test("the actual lyrics handler sends authoritative DNA through existing GPT flow and spends one existing reservation", async () => {
  const x = await handler();
  assert.equal(x.result.status, 200);
  assert.deepEqual(x.counts, { reserve: 1, complete: 1, refund: 0, post: 1 });
  assert.equal(x.result.data.music_dna.style_id, body.musicDnaStyle);
  assert(x.request.input[0].content.includes("AUTHORITATIVE MUSICAL IDENTITY"));
  assert(!x.request.input[0].content.includes("INTERNAL_QA"));
  assert.equal(x.reserved.musicDnaStyle, body.musicDnaStyle);
  assert.deepEqual(JSON.parse(x.request.input[1].content).musicDna.languages, [
    "en",
    "yo",
  ]);
});
test("failed DNA output restores once while ambiguous upstream acceptance retains the existing reconciliation hold", async () => {
  const e = engine(),
    context = e.prepare(body, actor);
  const x = await handler({
    response: { ...fixture.output(context), dna_mood: "Party" },
  });
  assert.equal(x.result.status, 502);
  assert.deepEqual(x.counts, { reserve: 1, complete: 0, refund: 1, post: 1 });
  const unresolved = await handler({ transportError: true });
  assert.equal(unresolved.result.status, 503);
  assert.equal(unresolved.result.data.status, "verification_required");
  assert.equal(unresolved.counts.refund, 0);
});
test("DNA public API is served without leaking profiles and history remains account-scoped", async () => {
  const app = await require("./runtime.cjs").runtime();
  const c = await app.request("/api/platform/studio/dna/catalog");
  assert.equal(c.status, 200);
  assert.deepEqual(c.json(), dna.catalogue());
  assert.equal(
    (await app.request("/api/platform/studio/dna/history")).status,
    401,
  );
  assert.equal((await app.request("/web/music-dna.js")).status, 200);
});

test("the frontend DNA request excludes stale mood and percussion fields but retains independent voice and language choices", async () => {
  const { lyricsRequest } = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/studio-engine.js").toString("base64")
  );
  const x = lyricsRequest({
    ...body,
    lyricsModel: "gpt-6.1-sol",
    voice: "duet",
    beat: "party percussion",
    mood: "Party",
    musicFamily: "gospel",
    musicProfile: "deep-0",
  });
  assert.equal(x.voice, "duet");
  assert.deepEqual(x.musicDnaLanguages, ["en", "yo"]);
  for (const k of ["mood", "beat", "gospelProfile", "secularProfile", "genre"])
    assert(!Object.hasOwn(x, k));
  assert(
    !fs.readFileSync("music-prompt-studio.html", "utf8").includes('id="mood"'),
  );
});
