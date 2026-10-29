"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g7Output } = require("./music-dna-g7-output.cjs");
const cases = [
  ["G7-01", "Everlasting Promise", 70, 94],
  ["G7-02", "Soulful Testimony", 64, 88],
  ["G7-03", "Mercy at Dawn", 60, 82],
  ["G7-04", "Grace in Harmony", 78, 104],
  ["G7-05", "Quiet Light", 56, 80],
];
require("./music-dna-group-contract.cjs")({
  group: "G7",
  category_id: "gospel-g7",
  cases,
  validOutput: g7Output,
  topic: "An original heartfelt testimony of hope, grace and restoration",
});
const actor = { artistId: 7, requestKey: "qa-g7-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G7 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G7-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G7").name,
    "Gospel Soul & Inspirational Ballads",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g7"'));
  assert.throws(() => dna.prepare(brief("gospel-g7"), actor));
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
test("G7 retains five distinct instrumental and arrangement identities", () => {
  const distinguishing = [
    ["4/4", "choir", "full-band"],
    ["soul", "storytelling", "powerful bridge"],
    ["intimate", "electric piano", "gentle bridge"],
    ["r&b", "rhodes", "extended chords"],
    ["cinematic", "minimal percussion", "peaceful"],
  ];
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g7Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(
      JSON.stringify([
        c.profile.rhythm,
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
      () => dna.validateOutput({ ...out, style: g7Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G7 applies selected language combinations without changing instrumental or voice identity", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
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
test("G7 keeps fixed atmosphere and distinguishes sparse cinematic pacing from the R&B pocket", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      { ...brief(id), mood: "Unrelated party dance", beat: "nightclub beat" },
      actor,
    );
    assert(!dna.instructions(c).includes("nightclub beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g7Output(c), dna_mood: "Unrelated party dance" },
        c,
      ),
    );
  }
  const quiet = dna.prepare(brief("G7-05"), actor),
    rhythm = dna.prepare(brief("G7-04"), actor);
  assert.match(quiet.profile.rhythm, /minimal rhythmic pressure/);
  assert.match(quiet.profile.bass, /sparse melodic movement/);
  assert.match(rhythm.profile.rhythm, /engaging rhythmic pocket/);
  assert.match(rhythm.profile.instruments.keys, /extended chords/);
  assert.match(
    dna.prepare(brief("G7-02"), actor).profile.lyrics.structure,
    /original believable storytelling/,
  );
});
