"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g12Output } = require("./music-dna-g12-output.cjs");
const cases = [
  ["G12-01", "Majestic Grace Worship", 66, 90],
  ["G12-02", "Covenant Acoustic Worship", 68, 94],
  ["G12-03", "Eternal Symphony Worship", 62, 88],
  ["G12-04", "Open Heaven Anthem", 90, 118],
  ["G12-05", "Sanctuary of Praise", 72, 100],
];
require("./music-dna-group-contract.cjs")({
  group: "G12",
  category_id: "gospel-g12",
  cases,
  validOutput: g12Output,
  topic:
    "An original reflective prayer of gratitude, hope and spiritual renewal",
});
const actor = { artistId: 7, requestKey: "qa-g12-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G12 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G12-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G12").name,
    "Western Contemporary Worship",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="gospel-g12"'));
  assert.throws(() => dna.prepare(brief("gospel-g12"), actor));
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
test("G12 preserves five distinct Western instrument and arrangement identities", () => {
  const distinguishing = [
    ["hammond", "soulful", "majestic choir-supported"],
    ["acoustic", "4/4", "simple accessible"],
    ["orchestral", "piano-and-strings", "cinematic"],
    ["worship-rock", "4/4", "strong bridge"],
    ["congregational", "climactic bridge", "layered synths"],
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
      registry.styles.filter((s) => !s.id.startsWith("G12-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g12Output(c);
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
      () => dna.validateOutput({ ...out, style: g12Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G12 keeps exact customer descriptions and never forces English from Western instrumentation", () => {
  const descriptions = [
    "Soulful Gospel worship with powerful piano, organ and choir harmonies.",
    "Gentle congregational worship with acoustic guitar and peaceful melodies.",
    "Cinematic worship with grand piano, orchestral strings and emotional melodies.",
    "Modern worship-rock with rhythmic guitars and uplifting choruses.",
    "Expansive contemporary worship with rich keyboards and powerful congregational singing.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces English/);
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
});
test("G12 fixed mood and Western production guidance resist stale unrelated selectors", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated carnival dance",
        beat: "unrelated African praise beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("unrelated African praise beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g12Output(c), dna_mood: "Unrelated carnival dance" },
        c,
      ),
    );
    assert.match(c.profile.production_mix, /Western/);
    assert(
      !/conga|talking drum|shekere/i.test(
        JSON.stringify(c.profile.instruments),
      ),
    );
  }
  assert.match(
    dna.prepare(brief("G12-01"), actor).profile.instruments.keys,
    /Hammond-style/,
  );
  assert.match(
    dna.prepare(brief("G12-02"), actor).profile.production_mix,
    /simple warm accessible/,
  );
  assert.match(
    dna.prepare(brief("G12-03"), actor).profile.production_mix,
    /expressive orchestral instrumentation/,
  );
  assert.match(
    dna.prepare(brief("G12-04"), actor).profile.rhythm,
    /steady 4\/4 pulse/,
  );
  assert.match(
    dna.prepare(brief("G12-05"), actor).profile.arrangement,
    /climactic bridge → majestic final chorus/,
  );
});
