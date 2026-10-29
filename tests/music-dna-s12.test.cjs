"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s12Output } = require("./music-dna-s12-output.cjs");
const cases = [
  ["S12-01", "Congo Royal Rumba", 96, 118],
  ["S12-02", "Central African Dance Fusion", 104, 126],
  ["S12-03", "Abidjan Coupé-Décalé Celebration", 118, 138],
  ["S12-04", "Abidjan Street Dance Explosion", 124, 148],
  ["S12-05", "Ivory Coast Victory Groove", 110, 132],
];
require("./music-dna-group-contract.cjs")({
  group: "S12",
  category_id: "secular-s12",
  cases,
  validOutput: s12Output,
  topic:
    "An original Francophone African Dance song about family, relationships and life lessons",
});
const actor = { artistId: 7, requestKey: "qa-s12-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S12 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S12-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S12").name,
    "Francophone African Dance",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s12"'));
  assert.throws(() => dna.prepare(brief("secular-s12"), actor));
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
test("S12 preserves distinct rumba, crossover, polished/street coupé-décalé and melodic Ivorian cores", () => {
  const distinguishing = [
    ["congolese rumba", "interlocking", "soukous/sebene"],
    ["east/central", "crossover", "marimba"],
    ["polished ivorian", "coupé-décalé", "rhythmic piano"],
    ["street coupé-décalé", "controlled slides", "stop-start"],
    ["uplifting ivorian", "melodic guitar", "triumphant"],
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
      registry.styles.filter((s) => !s.id.startsWith("S12-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s12Output(c);
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
      () => dna.validateOutput({ ...out, style: s12Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /sub-bass|electric bass|bass/gi,
      /guitars?/gi,
      /kick/gi,
      /congas?|shakers?|whistles?|cowbell|marimba|shekere/gi,
    ])
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
test("S12 exact descriptions and available language choices respect French/English/bilingual selection", () => {
  const descriptions = [
    "Elegant Congolese rumba with interlocking guitars, melodic bass and energetic soukous breaks.",
    "Modern East/Central African crossover with lively guitars, deep bass and catchy melodies.",
    "Polished Ivorian dance music with heavy bass and bright electronic hooks.",
    "High-energy coupé-décalé with aggressive percussion and powerful dance breaks.",
    "Uplifting Ivorian Afro-dance with melodic guitars and celebratory rhythms.",
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
      ["fr"],
      ["en"],
      ["fr", "en"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["fr", "ha"],
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
  if (!dna.catalogue().languages.some((l) => l.id === "ln"))
    assert.throws(() =>
      dna.prepare({ ...brief("S12-01"), musicDnaLanguages: ["ln"] }, actor),
    );
});
test("S12 has its own selector group and explicitly cross-regional fusion metadata", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S12").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Afrobeats & African Music / Francophone African Dance">';
  assert(html.includes(label));
  for (let n = 1; n <= 11; n++) {
    const previous = c.categories.find((x) => x.group_id === "S" + n),
      previousLabel =
        '<optgroup label="Afrobeats & African Music / ' + previous.name + '">';
    assert(html.includes(previousLabel));
    assert(html.indexOf(previousLabel) < html.indexOf(label));
  }
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S(?:[1-9]|10|11)-/.test(segment));
  const fusion = dna.prepare(brief("S12-02"), actor);
  assert.match(
    fusion.profile.rhythm,
    /cross-regional fusion rather than a Francophone-origin claim/,
  );
  assert.match(
    fusion.profile.production_mix,
    /not traditional Congolese rumba or authentic Ivorian/,
  );
  assert.match(fusion.profile.instruments.guitar, /East\/Central African/);
  assert.match(
    dna.prepare(brief("S12-01"), actor).profile.instruments.guitar,
    /soukous-style sebene/,
  );
});
test("S12 fixed atmosphere and varied dance intensity remain independent of gender and selected voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic slow Western ballad",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic slow Western ballad"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s12Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S12-03"), actor).profile.production_mix,
    /polished Abidjan/,
  );
  assert.match(
    dna.prepare(brief("S12-04"), actor).profile.production_mix,
    /Avoid uncontrolled distortion, muddy bass/,
  );
  assert.match(
    dna.prepare(brief("S12-05"), actor).profile.mood,
    /Hopeful, triumphant/,
  );
});
test("S12 rumba base stays 96–118 BPM while optional 120–136 dance transitions remain conditional instructions", () => {
  const source = registry.styles.find((s) => s.id === "S12-01");
  assert.deepEqual(source.tempo, { min: 96, max: 118 });
  for (let n = 0; n < 24; n++) {
    const c = dna.prepare(brief("S12-01"), {
      artistId: n + 10,
      requestKey: "qa-s12-tempo-request-" + n,
    });
    assert(c.tempo >= 96 && c.tempo <= 118);
    assert.match(c.profile.arrangement, /120–136 BPM where supported/);
    assert.match(
      c.profile.production_mix,
      /only if section-tempo changes are supported/,
    );
    assert.match(c.profile.arrangement, /otherwise keep the chosen rumba base/);
    const out = s12Output(c);
    dna.validateOutput(out, c);
    assert.equal(out.tempo_bpm, c.tempo);
  }
});
