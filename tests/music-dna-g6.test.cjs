"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { g6Output } = require("./music-dna-g6-output.cjs");
const cases = [
  ["G6-01", "Igbo Thanksgiving Highlife", 108, 134],
  ["G6-02", "Heritage Gospel Procession", 100, 126],
  ["G6-03", "Fire of Igbo Praise", 118, 145],
  ["G6-04", "Eastern Gospel Highlife Revival", 106, 132],
  ["G6-05", "Sacred Eastern Testimony", 78, 108],
];
require("./music-dna-group-contract.cjs")({
  group: "G6",
  category_id: "gospel-g6",
  cases,
  validOutput: g6Output,
  topic:
    "An original reflective prayer of gratitude, hope and spiritual renewal",
});
const actor = { artistId: 7, requestKey: "qa-g6-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("G6 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G6-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "G6").name,
    "Indigenous Igbo Gospel",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g6"'));
  assert.throws(() => dna.prepare(brief("gospel-g6"), actor));
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
test("G6 preserves distinct indigenous percussion, bass and storytelling identities", () => {
  const distinguishing = [
    ["bouncy", "interlocking", "extended celebratory"],
    ["measured", "narrative", "repeating ogene"],
    ["fast igbo", "powerful", "no slow pacing"],
    ["classic igbo", "walking", "extended guitar-and-bass"],
    ["reflective", "light ogene", "mature storytelling"],
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
      registry.styles.filter((s) => !s.id.startsWith("G6-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g6Output(c);
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
      () => dna.validateOutput({ ...out, style: g6Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("G6 retains exact descriptions and respects Igbo, English, Pidgin and bilingual choices", () => {
  const descriptions = [
    "Joyful Gospel highlife with melodic guitars, bass and traditional percussion.",
    "Traditional Igbo praise with ogene, ekwe and communal responses.",
    "Explosive live Gospel praise with powerful drums, bass and energetic percussion.",
    "Classic Igbo Gospel highlife with flowing guitars and bright organ.",
    "Reflective traditional Gospel with gentle highlife and heartfelt storytelling.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces Igbo lyrics/);
    for (const languages of [
      ["ig"],
      ["en"],
      ["pcm"],
      ["ig", "en"],
      ["ig", "pcm"],
      ["fr"],
      ["yo"],
      ["ha"],
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
test("G6 fixed mood retains deliberate percussion intensity differences and regional identity", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated Western nightclub ambience",
        beat: "generic Yoruba praise beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Yoruba praise beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...g6Output(c), dna_mood: "Unrelated Western nightclub ambience" },
        c,
      ),
    );
  }
  assert.match(
    dna.prepare(brief("G6-01"), actor).profile.instruments.other,
    /Ogene metal gong, ekwe wooden slit drum, udu clay drum/,
  );
  const fire = dna.prepare(brief("G6-03"), actor),
    quiet = dna.prepare(brief("G6-05"), actor);
  assert.match(
    fire.profile.production_mix,
    /No slow-motion musical pacing or weak percussion/,
  );
  assert(!fire.profile.instruments.other.includes("udu"));
  assert.match(quiet.profile.instruments.other, /Light ogene accents/);
  assert.match(
    quiet.profile.production_mix,
    /subtly beneath soft group harmonies/,
  );
});
test("Gospel completeness: G1–G14 each expose five styles, with G6 between G5 and G7 in actual UI", async () => {
  const c = dna.catalogue(),
    expected = Array.from({ length: 14 }, (_, i) => "G" + (i + 1));
  const groups = c.categories.filter((x) => x.department_id === "gospel");
  assert.deepEqual(
    groups.map((x) => x.group_id),
    expected,
  );
  assert.equal(c.styles.filter((x) => x.department_id === "gospel").length, 70);
  const ids = new Set();
  for (const g of groups) {
    const styles = c.styles.filter((x) => x.category_id === g.id);
    assert.deepEqual(
      styles.map((x) => x.id),
      Array.from(
        { length: 5 },
        (_, i) => g.group_id + "-" + String(i + 1).padStart(2, "0"),
      ),
    );
    for (const s of styles) {
      assert(!ids.has(s.id));
      ids.add(s.id);
      assert.equal(s.department_id, "gospel");
    }
  }
  assert.equal(ids.size, 70);
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    position = (name) => html.indexOf('<optgroup label="Gospel & Christian Music / ' + name + '"');
  assert(position("Indigenous Yoruba Gospel") >= 0);
  assert(
    position("Indigenous Yoruba Gospel") < position("Indigenous Igbo Gospel"),
  );
  assert(
    position("Indigenous Igbo Gospel") <
      position("Gospel Soul & Inspirational Ballads"),
  );
  assert(!html.includes('<option value="gospel-g6"'));
});
