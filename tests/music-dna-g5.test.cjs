"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g5Output } = require("./music-dna-g5-output.cjs");
const cases = [
  ["G5-01", "Heritage Worship", 72, 96],
  ["G5-02", "Yoruba Praise Procession", 112, 138],
  ["G5-03", "Gospel Juju Celebration", 108, 136],
  ["G5-04", "Wisdom and Grace", 68, 92],
  ["G5-05", "Heritage Praise Revival", 105, 132],
];
require("./music-dna-group-contract.cjs")({
  group: "G5",
  category_id: "gospel-g5",
  cases,
  validOutput: g5Output,
  topic:
    "An original joyful testimony of victory, gratitude and positive change",
});
const actor = { artistId: 7, requestKey: "qa-g5-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G5 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G5-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G5").name,
    "Indigenous Yoruba Gospel",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g5"'));
  assert.throws(() => dna.prepare(brief("gospel-g5"), actor));
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
test("G5 styles preserve distinct approved instrumental cores and full arrangements", () => {
  const distinguishing = [
    ["acoustic guitar", "reflective", "storytelling"],
    ["hand drums", "bouncy", "communal"],
    ["juju", "interlocking", "extended"],
    ["acoustic", "understated", "breathing"],
    ["steady", "brass", "second verse"],
  ];
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g5Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(
      JSON.stringify([
        c.profile.drums_percussion,
        c.profile.bass,
        c.profile.instruments,
        c.profile.arrangement,
      ]),
    );
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: g5Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("all five Yoruba-inspired profiles respect independent languages without forcing Yoruba", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /does not force Yoruba/);
    for (const languages of [
      ["en"],
      ["yo"],
      ["pcm"],
      ["ig"],
      ["ha"],
      ["fr"],
      ["en", "yo"],
      ["en", "pcm", "ig"],
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
test("Juju keeps its live identity and reflective soul resists stale party mood", () => {
  const juju = dna.prepare(brief("G5-03"), actor);
  assert.match(
    juju.profile.production_mix,
    /guitars, talking drums and melodic bass prominent/,
  );
  assert.match(
    juju.profile.production_mix,
    /Avoid replacing the live Juju identity with generic electronic Afrobeats/,
  );
  const soul = dna.prepare(
    { ...brief("G5-04"), mood: "Party dance", beat: "electronic nightclub" },
    actor,
  );
  assert.match(soul.profile.mood, /Peaceful/);
  assert(!dna.instructions(soul).includes("electronic nightclub"));
  assert.throws(() =>
    dna.validateOutput(
      { ...g5Output(soul), dna_mood: juju.profile.mood },
      soul,
    ),
  );
});
