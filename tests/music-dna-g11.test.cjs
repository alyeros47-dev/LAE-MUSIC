"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g11Output } = require("./music-dna-g11-output.cjs");
const cases = [
  ["G11-01", "Celebration Choir Explosion", 112, 138],
  ["G11-02", "Royal Worship Gathering", 72, 98],
  ["G11-03", "African Heritage Praise", 104, 130],
  ["G11-04", "Healing Presence Worship", 66, 90],
  ["G11-05", "Spirit of Harmony", 74, 102],
];
require("./music-dna-group-contract.cjs")({
  group: "G11",
  category_id: "gospel-g11",
  cases,
  validOutput: g11Output,
  topic:
    "An original reflective prayer of gratitude, hope and spiritual renewal",
});
const actor = { artistId: 7, requestKey: "qa-g11-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G11 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G11-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G11").name,
    "South African Gospel & Choir",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="gospel-g11"'));
  assert.throws(() => dna.prepare(brief("gospel-g11"), actor));
  for (const [id, name] of cases) {
    assert(html.includes('<option value="' + id + '">' + name + "</option>"));
    const s = registry.styles.find((s) => s.id === id);
    assert(s.description.length > 20 && s.description.length <= 240);
    for (const ref of s.research_references) {
      assert(!JSON.stringify(c).includes(ref));
      assert(!dna.instructions(dna.prepare(brief(id), actor)).includes(ref));
    }
  }
});
test("G11 has distinct South African instrumental and choir arrangements without duplicating earlier cores", () => {
  const distinguishing = [
    ["satb", "full", "choir-and-drum"],
    ["spacious", "majestic", "congregational"],
    ["traditional", "communal handclaps", "group-response"],
    ["gentle", "soulful", "gradually"],
    ["gospel soul", "sophisticated", "vocal harmony"],
  ];
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = new Set(
      registry.styles.filter((s) => !s.id.startsWith("G11-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g11Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: g11Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G11 retains exact descriptions and independent supported languages without advertising unavailable options", () => {
  const descriptions = [
    "Energetic South African Gospel with powerful choir and live-band rhythms.",
    "Majestic live worship with rich harmonies and expressive piano.",
    "Traditional South African Gospel with lively percussion and communal singing.",
    "Gentle contemporary worship with soulful piano and warm choir.",
    "Expressive Gospel soul with sophisticated harmonies and live instrumentation.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces a language/);
    for (const languages of [
      ["en"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["fr"],
      ["en", "yo"],
      ["en", "pcm", "ig"],
      ["fr", "ha"],
    ]) {
      const c = dna.prepare(
        { ...brief(id), musicDnaLanguages: languages, voice: "duet" },
        actor,
      );
      assert.deepEqual(c.profile, base.profile);
      assert.deepEqual(c.languages, languages);
      assert.equal(c.voice, "duet");
      assert.deepEqual(c.choices, base.choices);
    }
  }
  for (const lang of ["zu", "xh", "st"])
    if (!dna.catalogue().languages.some((l) => l.id === lang))
      assert.throws(() =>
        dna.prepare({ ...brief("G11-01"), musicDnaLanguages: [lang] }, actor),
      );
});
test("G11 fixed mood and ensemble choir direction remain independent of selected lead voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated nightclub ambience",
        beat: "generic electronic club beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic electronic club beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g11Output(c), dna_mood: "Unrelated nightclub ambience" },
        c,
      ),
    );
  }
  for (const voice of ["neutral", "male", "female", "duet", "custom"]) {
    const choir = dna.prepare({ ...brief("G11-01"), voice }, actor);
    assert.equal(choir.voice, voice);
    assert.match(choir.profile.instruments.other, /SATB-style choir/);
    assert.match(
      choir.profile.production_mix,
      /full ensemble with clear multi-part/,
    );
  }
  assert.match(
    dna.prepare(brief("G11-03"), actor).profile.production_mix,
    /rather than converting it into generic electronic dance music/,
  );
  assert.match(
    dna.prepare(brief("G11-05"), actor).profile.production_mix,
    /rich vocal harmony and expressive musicality central/,
  );
});
