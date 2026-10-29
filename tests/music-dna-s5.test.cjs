"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s5Output } = require("./music-dna-s5-output.cjs");
const cases = [
  ["S5-01", "Fuji Street Orchestra", 112, 132],
  ["S5-02", "Street Prayer Melody", 98, 118],
  ["S5-03", "Street Soul Rebellion", 104, 124],
  ["S5-04", "Heritage Street Testimony", 92, 114],
  ["S5-05", "Fuji Dance Carnival", 118, 144],
];
require("./music-dna-group-contract.cjs")({
  group: "S5",
  category_id: "secular-s5",
  cases,
  validOutput: s5Output,
  topic:
    "An original Fuji-street song about perseverance, family and personal progress",
});
const actor = { artistId: 7, requestKey: "qa-s5-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S5 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S5-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S5").name,
    "Fuji-Influenced Street Afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s5"'));
  assert.throws(() => dna.prepare(brief("secular-s5"), actor));
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
test("S5 preserves five distinct Fuji cores and requires bass, talking drum and shekere in prompts", () => {
  const distinguishing = [
    ["sakara", "sub-bass", "crowd harmonies"],
    ["reflective", "restrained", "group responses"],
    ["melodic", "electric guitar", "dynamic bridge"],
    ["highlife", "electric bass", "soft strings"],
    ["fast fuji", "talking drum rolls", "instrumental climax"],
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
      registry.styles.filter((s) => !s.id.startsWith("S5-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s5Output(c);
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
      () => dna.validateOutput({ ...out, style: s5Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [/sub-bass|bass/gi, /talking[- ]drum/gi, /shekere/gi])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
  }
  assert.equal(identities.size, 5);
});
test("S5 exact descriptions and independent supported languages preserve Yoruba-influenced instrumentation", () => {
  const descriptions = [
    "Powerful modern Fuji-Afrobeats with heavy bass, bright piano and layered percussion.",
    "Emotional street Afrobeats with Fuji percussion and reflective melodies.",
    "Melodic street-pop fusion with expressive hooks and lively African rhythms.",
    "Soulful Yoruba-influenced Afropop with highlife guitar and traditional percussion.",
    "Fast Fuji-street dance music with powerful talking drums and heavy bass.",
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
      /never forces Yoruba, Nigerian Pidgin/,
    );
    for (const languages of [
      ["yo"],
      ["en"],
      ["pcm"],
      ["ig"],
      ["ha"],
      ["fr"],
      ["en", "pcm"],
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
test("S5 has its own selector group and distinct deeper Fuji direction compared with S3", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S5").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    names = [
      "Party Afrobeats & Dance Hits",
      "Smooth Afropop & Romantic",
      "Street Pop & Street Anthems",
      "Afro-Fusion & Powerful Grooves",
      "Fuji-Influenced Street Afrobeats",
    ],
    labels = names.map(
      (name) => '<optgroup label="Afrobeats & African Music / ' + name + '">',
    );
  assert(labels.every((label) => html.includes(label)));
  for (let i = 1; i < labels.length; i++)
    assert(html.indexOf(labels[i - 1]) < html.indexOf(labels[i]));
  const segment = html.slice(
    html.indexOf(labels[4]),
    html.indexOf("</optgroup>", html.indexOf(labels[4])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[1234]-/.test(segment));
  const orchestra = dna.prepare(brief("S5-01"), actor),
    street = dna.prepare({ ...brief("S5-01"), musicDnaStyle: "S3-01" }, actor);
  assert.match(orchestra.profile.instruments.other, /sakara-inspired/);
  assert(!street.profile.instruments.other.includes("sakara"));
  assert.match(orchestra.profile.arrangement, /Fuji percussion break/);
  assert.match(
    dna.prepare(brief("S5-02"), actor).profile.drums_percussion,
    /restrained Fuji percussion/i,
  );
  assert.match(
    dna.prepare(brief("S5-04"), actor).profile.instruments.other,
    /soft strings/,
  );
  assert.match(
    dna.prepare(brief("S5-05"), actor).profile.drums_percussion,
    /rapid Fuji percussion/,
  );
});
test("S5 fixed moods, original material and secular storytelling remain voice-independent", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic slow worship beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic slow worship beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s5Output(c), dna_mood: "Unrelated solemn worship" },
        c,
      ),
    );
    assert(
      !/divine|prayer|worship/.test(c.profile.lyrics.structure.toLowerCase()),
    );
    for (const voice of ["neutral", "male", "female", "duet", "custom"]) {
      const x = dna.prepare({ ...brief(id), voice }, actor);
      assert.equal(x.voice, voice);
      assert.deepEqual(x.profile, c.profile);
      assert(
        !/\b(male|female|tenor|soprano|alto|baritone)\b/i.test(
          x.profile.vocal_delivery,
        ),
      );
    }
  }
  assert.match(
    dna.prepare(brief("S5-01"), actor).profile.production_mix,
    /maintain mix clarity/i,
  );
  assert.match(
    dna.prepare(brief("S5-02"), actor).profile.lyrics.structure,
    /Life struggles/,
  );
  assert.match(
    dna.prepare(brief("S5-05"), actor).profile.production_mix,
    /generic electronic beats that erase Fuji identity/,
  );
});
