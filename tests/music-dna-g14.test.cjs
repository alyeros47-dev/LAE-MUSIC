"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g14Output } = require("./music-dna-g14-output.cjs");
const cases = [
  ["G14-01", "Heavenly River Worship", 66, 92],
  ["G14-02", "Congo Glory Celebration", 104, 132],
  ["G14-03", "Kingdom Afro-Gospel Pulse", 102, 128],
  ["G14-04", "Graceful African Soul", 76, 104],
  ["G14-05", "Sacred Congo Encounter", 60, 86],
];
require("./music-dna-group-contract.cjs")({
  group: "G14",
  category_id: "gospel-g14",
  cases,
  validOutput: g14Output,
  topic:
    "An original reflective prayer of gratitude, hope and spiritual renewal",
});
const actor = { artistId: 7, requestKey: "qa-g14-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G14 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G14-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G14").name,
    "Francophone African Gospel",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g14"'));
  assert.throws(() => dna.prepare(brief("gospel-g14"), actor));
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
test("G14 preserves distinct Congolese, Ivorian urban and Afro-soul identities", () => {
  const distinguishing = [
    ["congolese", "passing notes", "choir-supported"],
    ["congolese", "soukous", "interlocking"],
    ["ivorian", "electronic", "synth hooks"],
    ["r&b", "rhodes", "gentle afro-pop"],
    ["congolese", "recurring refrain", "sustained bass"],
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
      registry.styles.filter((s) => !s.id.startsWith("G14-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g14Output(c);
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
      () => dna.validateOutput({ ...out, style: g14Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G14 retains exact descriptions and respects French, English and bilingual choices without forcing French", () => {
  const descriptions = [
    "Soulful Congolese worship with expressive piano and rich choir harmonies.",
    "Energetic Congolese Gospel with flowing guitars and powerful bass.",
    "Modern Ivorian urban Gospel with vibrant rhythms and contemporary synths.",
    "Smooth Francophone Gospel soul with R&B textures and gentle Afro-pop rhythms.",
    "Deep Congolese prayer worship with atmospheric keyboards and emotional harmonies.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(
      base.profile.lyrics.vocabulary,
      /never forces French, Lingala/,
    );
    for (const languages of [
      ["en"],
      ["fr"],
      ["fr", "en"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
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
  if (!dna.catalogue().languages.some((l) => l.id === "ln"))
    assert.throws(() =>
      dna.prepare({ ...brief("G14-01"), musicDnaLanguages: ["ln"] }, actor),
    );
});
test("G14 fixed mood preserves urban dance, gentle soul and restrained prayer distinctions", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated Western nightclub ambience",
        beat: "generic Western dance beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Western dance beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g14Output(c), dna_mood: "Unrelated Western nightclub ambience" },
        c,
      ),
    );
  }
  assert.match(
    dna.prepare(brief("G14-02"), actor).profile.instruments.guitar,
    /soukous-influenced/,
  );
  assert.match(
    dna.prepare(brief("G14-03"), actor).profile.bass,
    /electronic and electric/,
  );
  assert.match(
    dna.prepare(brief("G14-04"), actor).profile.production_mix,
    /without excessive dance percussion/,
  );
  assert.match(
    dna.prepare(brief("G14-05"), actor).profile.arrangement,
    /powerful but controlled final chorus/,
  );
});
