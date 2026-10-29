"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g9Output } = require("./music-dna-g9-output.cjs");
const cases = [
  ["G9-01", "Covenant Celebration", 100, 124],
  ["G9-02", "Royal Praise Assembly", 108, 132],
  ["G9-03", "Glory Rising Live", 92, 118],
  ["G9-04", "Highlife Thanksgiving", 110, 136],
  ["G9-05", "Breakthrough Praise", 115, 140],
];
require("./music-dna-group-contract.cjs")({
  group: "G9",
  category_id: "gospel-g9",
  cases,
  validOutput: g9Output,
  topic: "An original heartfelt testimony of hope, grace and restoration",
});
const actor = { artistId: 7, requestKey: "qa-g9-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G9 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G9-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G9").name,
    "Ghanaian Gospel Praise",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="gospel-g9"'));
  assert.throws(() => dna.prepare(brief("gospel-g9"), actor));
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
test("G9 retains distinctive Ghanaian highlife and live-praise instrumental cores", () => {
  const distinguishing = [
    ["highlife", "interlocking", "passing notes"],
    ["ghanaian", "call-and-response", "full choir"],
    ["ghanaian", "cinematic", "climactic bridge"],
    ["highlife", "bouncy", "extended celebratory"],
    ["fast ghanaian", "rolling toms", "drum-and-bass"],
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
    registry.styles.filter((s) => !s.id.startsWith("G9-")).map(core),
  );
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g9Output(c);
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
      () => dna.validateOutput({ ...out, style: g9Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G9 retains exact descriptions and selected supported languages without forcing Twi", () => {
  const descriptions = [
    "Uplifting Ghanaian Gospel with melodic highlife guitars and rich harmonies.",
    "Powerful live Gospel praise with energetic drums and choir responses.",
    "Expansive contemporary Gospel with expressive melodies and dramatic instrumental builds.",
    "Joyful Ghanaian highlife Gospel with flowing guitars and bouncy bass.",
    "Fast, energetic Gospel celebration with strong drums, bass and choir.",
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
      /does not automatically force Twi/,
    );
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
  // No new shared language capability is claimed by this catalogue-only package.
  assert(!dna.catalogue().languages.some((l) => l.id === "tw"));
  assert.throws(() =>
    dna.prepare({ ...brief("G9-01"), musicDnaLanguages: ["tw"] }, actor),
  );
});
test("G9 fixed atmosphere and highlife production instructions resist unrelated overrides", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn drone",
        beat: "generic nightclub beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic nightclub beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g9Output(c), dna_mood: "Unrelated solemn drone" },
        c,
      ),
    );
  }
  const highlife = dna.prepare(brief("G9-04"), actor);
  assert.match(
    highlife.profile.production_mix,
    /Preserve the Ghanaian highlife guitar-and-bass identity/,
  );
  assert.match(
    highlife.profile.production_mix,
    /Do not replace it with generic electronic Afrobeats/,
  );
  assert.match(
    highlife.profile.arrangement,
    /extended celebratory closing chorus/,
  );
  assert.match(
    dna.prepare(brief("G9-03"), actor).profile.arrangement,
    /climactic bridge/,
  );
});
