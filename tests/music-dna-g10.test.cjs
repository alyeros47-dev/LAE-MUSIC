"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g10Output } = require("./music-dna-g10-output.cjs");
const cases = [
  ["G10-01", "Intimate Mercy Worship", 62, 82],
  ["G10-02", "Heritage Devotion", 76, 100],
  ["G10-03", "Altar of Thanksgiving", 70, 94],
  ["G10-04", "Prayer of Restoration", 58, 80],
  ["G10-05", "Presence and Peace", 64, 86],
];
require("./music-dna-group-contract.cjs")({
  group: "G10",
  category_id: "gospel-g10",
  cases,
  validOutput: g10Output,
  topic:
    "An original reflective prayer of gratitude, hope and spiritual renewal",
});
const actor = { artistId: 7, requestKey: "qa-g10-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G10 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G10-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G10").name,
    "Ghanaian Deep Worship",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="gospel-g10"'));
  assert.throws(() => dna.prepare(brief("gospel-g10"), actor));
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
test("G10 retains distinct devotional instrumentation and arrangements without duplicating earlier cores", () => {
  const distinguishing = [
    ["soulful ghanaian", "intimate", "rounded"],
    ["highlife", "interlocking", "peaceful final"],
    ["ghanaian", "choir", "testimony"],
    ["prayer", "restrained toms", "controlled final"],
    ["acoustic ghanaian", "picking", "peaceful closing"],
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
      registry.styles.filter((s) => !s.id.startsWith("G10-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g10Output(c);
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
      () => dna.validateOutput({ ...out, style: g10Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G10 retains exact customer descriptions and independently selected supported languages", () => {
  const descriptions = [
    "Soulful Ghanaian worship with emotional piano and warm harmonies.",
    "Reflective highlife-inspired devotion with gentle guitars and melodic bass.",
    "Heartfelt worship with rich choir harmonies and expressive live instrumentation.",
    "Deep prayer worship with atmospheric keyboards and gradual musical intensity.",
    "Gentle contemporary worship with acoustic textures and peaceful melodies.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /does not force Twi/);
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
  if (!dna.catalogue().languages.some((l) => l.id === "tw"))
    assert.throws(() =>
      dna.prepare({ ...brief("G10-01"), musicDnaLanguages: ["tw"] }, actor),
    );
});
test("G10 fixed mood preserves gentle highlife and controlled prayer development", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated fast party dance",
        beat: "generic nightclub beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic nightclub beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g10Output(c), dna_mood: "Unrelated fast party dance" },
        c,
      ),
    );
  }
  const heritage = dna.prepare(brief("G10-02"), actor),
    prayer = dna.prepare(brief("G10-04"), actor);
  assert.match(
    heritage.profile.production_mix,
    /without turning the song into fast celebratory praise/,
  );
  assert.match(heritage.profile.rhythm, /restrained dance movement/);
  assert.match(
    prayer.profile.arrangement,
    /powerful but controlled final chorus/,
  );
  assert.match(prayer.profile.mood, /solemn/);
  assert.match(
    dna.prepare(brief("G10-05"), actor).profile.arrangement,
    /peaceful closing refrain/,
  );
});
