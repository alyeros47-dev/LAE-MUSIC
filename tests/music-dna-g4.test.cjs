"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g4Output } = require("./music-dna-g4-output.cjs");
const cases = [
  ["G4-01", "Victory Explosion", 125, 145],
  ["G4-02", "Praise Without Limits", 118, 140],
  ["G4-03", "Fire of Thanksgiving", 112, 138],
  ["G4-04", "Street Praise Carnival", 115, 138],
  ["G4-05", "Glory Dance Anthem", 108, 132],
];
require("./music-dna-group-contract.cjs")({
  group: "G4",
  category_id: "gospel-g4",
  cases,
  validOutput: g4Output,
  topic:
    "An original joyful testimony of victory, gratitude and positive change",
});
const actor = { artistId: 7, requestKey: "qa-g4-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G4 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G4-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G4").name,
    "High-Energy Gospel Dance & Praise",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g4"'));
  assert.throws(() => dna.prepare(brief("gospel-g4"), actor));
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
test("five G4 identities require distinct instruments and preserve their approved dance arrangements", () => {
  const distinguishing = [
    ["brass", "talking drum", "choir"],
    ["shekere", "bouncy", "talking drum"],
    ["hand percussion", "communal", "organ"],
    ["afrobeat", "hi-hat", "crowd"],
    ["backbeat", "pad", "bridge"],
  ];
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g4Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(!c.profile.production_exclusions?.includes("party-dance"));
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(
      JSON.stringify([
        c.profile.rhythm,
        c.profile.drums_percussion,
        c.profile.bass,
        c.profile.arrangement,
      ]),
    );
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: g4Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("Yoruba and indigenous musical character never force lyric language or change when a voice is selected", () => {
  for (const id of ["G4-02", "G4-03"]) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(
      base.profile.lyrics.vocabulary,
      /does not|doesn't|not automatically/,
    );
    for (const languages of [
      ["en"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["pcm"],
      ["fr"],
      ["en", "yo"],
      ["en", "ig"],
    ]) {
      const c = dna.prepare(
        { ...brief(id), musicDnaLanguages: languages, voice: "duet" },
        actor,
      );
      assert.deepEqual(c.profile, base.profile);
      assert.deepEqual(c.languages, languages);
      assert.equal(c.voice, "duet");
    }
  }
});
test("G4 fixed mood resists stale selectors and street-pop production retains explicit Gospel direction", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Solemn ambient lament",
        beat: "unrelated slow prayer drone",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("Solemn ambient lament"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g4Output(c), dna_mood: "Solemn ambient lament" },
        c,
      ),
    );
  }
  const c = dna.prepare(brief("G4-04"), actor);
  assert.match(c.profile.production_mix, /must support Gospel lyrics/);
  assert.match(c.profile.lyrics.vocabulary, /without vulgarity/);
});
