"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g8Output } = require("./music-dna-g8-output.cjs");
const cases = [
  ["G8-01", "Heaven's Celebration", 108, 132],
  ["G8-02", "Triumphant Praise Assembly", 115, 138],
  ["G8-03", "Throne Room Harmony", 65, 88],
  ["G8-04", "Sacred Encounter Live", 68, 92],
  ["G8-05", "Joyful Grace Choir", 96, 122],
];
require("./music-dna-group-contract.cjs")({
  group: "G8",
  category_id: "gospel-g8",
  cases,
  validOutput: g8Output,
  topic: "An original heartfelt testimony of hope, grace and restoration",
});
const actor = { artistId: 7, requestKey: "qa-g8-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G8 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G8-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G8").name,
    "African Gospel Choir & Live Worship",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g8"'));
  assert.throws(() => dna.prepare(brief("gospel-g8"), actor));
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
test("G8 has distinct instrumental and arrangement identities, including against earlier catalogue cores", () => {
  const distinguishing = [
    ["pop-rock", "4/4", "guitar instrumental"],
    ["tom rolls", "call-and-response", "explosive"],
    ["cinematic", "choir-supported", "majestic"],
    ["live worship", "climax", "peaceful resolution"],
    ["flowing", "african percussion", "expanded harmonies"],
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
    registry.styles.filter((s) => !s.id.startsWith("G8-")).map(core),
  );
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g8Output(c);
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
      () => dna.validateOutput({ ...out, style: g8Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G8 keeps exact customer descriptions and independent language combinations", () => {
  const descriptions = [
    "Bright Gospel pop-rock with electric guitars and joyful melodies.",
    "Powerful live-band praise with strong drums, bass and choir.",
    "Majestic worship with grand piano, strings and rich harmonies.",
    "Intense live worship with atmospheric keyboards and gradual instrumental builds.",
    "Melodic African Gospel with uplifting rhythms and warm choir harmonies.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
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
test("G8 mood is fixed and intense live worship retains a peaceful resolution", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated nightclub dance",
        beat: "unrelated party beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("unrelated party beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g8Output(c), dna_mood: "Unrelated nightclub dance" },
        c,
      ),
    );
  }
  const live = dna.prepare(brief("G8-04"), actor),
    pop = dna.prepare(brief("G8-01"), actor);
  assert.match(live.profile.arrangement, /climax → peaceful resolution/);
  assert.match(live.profile.drums_percussion, /Restrained.*gradually develop/);
  assert.match(
    pop.profile.instruments.guitar,
    /Prominent melodic electric guitar/,
  );
  assert.match(
    dna.prepare(brief("G8-03"), actor).profile.production_mix,
    /clear vocal placement/,
  );
});
