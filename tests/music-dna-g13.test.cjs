"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g13Output } = require("./music-dna-g13-output.cjs");
const cases = [
  ["G13-01", "Urban Gospel Celebration", 100, 126],
  ["G13-02", "Praise Fire Orchestra", 124, 150],
  ["G13-03", "Soulful Kingdom Groove", 84, 110],
  ["G13-04", "Cathedral Choir Victory", 104, 132],
  ["G13-05", "Global Praise Fusion", 108, 136],
];
require("./music-dna-group-contract.cjs")({
  group: "G13",
  category_id: "gospel-g13",
  cases,
  validOutput: g13Output,
  topic:
    "An original reflective prayer of gratitude, hope and spiritual renewal",
});
const actor = { artistId: 7, requestKey: "qa-g13-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G13 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G13-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G13").name,
    "Western Gospel Choir & Praise",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="gospel-g13"'));
  assert.throws(() => dna.prepare(brief("gospel-g13"), actor));
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
test("G13 preserves five distinct rhythmic, bass and choir identities beyond earlier worship cores", () => {
  const distinguishing = [
    ["r&b", "satb", "rhodes"],
    ["funk", "rapid tom", "breakdown"],
    ["soul/r&b", "melodic funk bass", "bass-led"],
    ["walking", "vamp", "satb"],
    ["latin", "timbales", "multicultural"],
  ];
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.melody_harmony,
      s.arrangement,
    ]);
  const earlier = new Set(
      registry.styles.filter((s) => !s.id.startsWith("G13-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g13Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    assert(dna.instructions(c).includes(c.profile.melody_harmony));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: g13Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G13 retains exact descriptions and independently selected supported language combinations", () => {
  const descriptions = [
    "Contemporary Gospel R&B with powerful choir and modern rhythms.",
    "Explosive Gospel funk with strong drums, bass and brass.",
    "Smooth Gospel soul with melodic bass and rich harmonies.",
    "Traditional church Gospel with Hammond organ and powerful choir.",
    "Multicultural Gospel praise with funk bass and Latin percussion.",
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
test("G13 fixed mood and multi-part choir guidance remain independent of lead voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn ambient drone",
        beat: "generic slow worship beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic slow worship beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g13Output(c), dna_mood: "Unrelated solemn ambient drone" },
        c,
      ),
    );
  }
  for (const voice of ["neutral", "male", "female", "duet", "custom"]) {
    const c = dna.prepare({ ...brief("G13-04"), voice }, actor);
    assert.equal(c.voice, voice);
    assert.match(c.profile.melody_harmony, /SATB choir harmonies/);
    assert.match(c.profile.arrangement, /traditional Gospel vamp/);
  }
  assert.match(
    dna.prepare(brief("G13-02"), actor).profile.production_mix,
    /Avoid slow worship pacing/,
  );
  assert.match(
    dna.prepare(brief("G13-03"), actor).profile.bass,
    /Prominent melodic/,
  );
  assert.match(
    dna.prepare(brief("G13-05"), actor).profile.instruments.other,
    /Congas, timbales/,
  );
});
