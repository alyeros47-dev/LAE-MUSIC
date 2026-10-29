"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s14Output } = require("./music-dna-s14-output.cjs");
const cases = [
  ["S14-01", "Dar es Salaam Dance Royalty", 104, 126],
  ["S14-02", "East African Street Fusion", 108, 130],
  ["S14-03", "Coastal Bongo Romance", 96, 118],
  ["S14-04", "Zanzibar Velvet Bongo Soul", 88, 110],
  ["S14-05", "Swahili Golden Melody", 100, 122],
];
require("./music-dna-group-contract.cjs")({
  group: "S14",
  category_id: "secular-s14",
  cases,
  validOutput: s14Output,
  topic:
    "An original East African Bongo Flava song about family, relationships and life lessons",
});
const actor = { artistId: 7, requestKey: "qa-s14-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S14 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S14-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S14").name,
    "East African Bongo Flava",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s14"'));
  assert.throws(() => dna.prepare(brief("secular-s14"), actor));
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
test("S14 preserves five distinct Tanzanian Bongo cores with bass, coastal guitar and percussion", () => {
  const distinguishing = [
    ["energetic tanzanian", "interlocking", "electric-bass accents"],
    ["street bongo", "stop-start", "punchy pulses"],
    ["romantic tanzanian", "coastal guitar passage", "commitment"],
    ["sophisticated tanzanian", "rhodes", "fingerpicked"],
    ["bright tanzanian", "taarab", "melodic bridge"],
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
      registry.styles.filter((s) => !s.id.startsWith("S14-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s14Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    const contrast = dna.prepare(brief(cases[[1, 2, 1, 2, 3][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: s14Output(contrast).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /electronic bass|electric[- ]bass|bass/gi,
      /guitars?/gi,
      /congas?/gi,
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
test("S14 exact descriptions and available languages never force Swahili", () => {
  const descriptions = [
    "Energetic Tanzanian Bongo Flava with powerful bass, bright guitars and lively dance rhythms.",
    "Bold Bongo street-pop with heavy drums, deep bass and energetic melodic hooks.",
    "Smooth romantic Bongo Flava with warm bass and flowing coastal guitars.",
    "Sophisticated East African Bongo soul with rich piano harmony and expressive guitars.",
    "Bright melodic Bongo Flava with coastal influences and playful dance percussion.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never force Swahili/);
    for (const languages of [
      ["en"],
      ["fr"],
      ["en", "fr"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
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
  if (!dna.catalogue().languages.some((l) => l.id === "sw"))
    assert.throws(() =>
      dna.prepare({ ...brief("S14-01"), musicDnaLanguages: ["sw"] }, actor),
    );
});
test("S14 is separate from previous groups and preserves core Tanzanian rather than crossover identity", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S14").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Afrobeats & African Music / East African Bongo Flava">';
  assert(html.includes(label));
  for (let n = 1; n <= 13; n++) {
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
  assert(!/value="S(?:[1-9]|1[0-3])-/.test(segment));
  for (const [id] of cases) {
    const x = dna.prepare(brief(id), actor);
    assert.match(x.profile.rhythm, /Tanzanian.*Bongo/);
  }
  assert.match(
    dna.prepare(brief("S14-01"), actor).profile.instruments.guitar,
    /East African coastal/,
  );
  assert.match(
    dna.prepare({ ...brief("S14-01"), musicDnaStyle: "S12-02" }, actor).profile
      .rhythm,
    /cross-regional fusion/,
  );
  assert.match(
    dna.prepare(brief("S14-05"), actor).profile.instruments.other,
    /Subtle taarab-influenced/,
  );
});
test("S14 fixed moods and Swahili Golden Melody voice stay independent of gender, language and register", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic Western R&B loop",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Western R&B loop"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s14Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S14-03"), actor).profile.production_mix,
    /Avoid heavy club aggression/,
  );
  assert.match(
    dna.prepare(brief("S14-04"), actor).profile.instruments.keys,
    /Rhodes-style/,
  );
  assert.match(
    dna.prepare(brief("S14-05"), actor).profile.production_mix,
    /Respect selected voice\/language/,
  );
});
test("Secular registration completeness: S1–S14 have five unique selectable styles each in numeric UI order", async () => {
  const c = dna.catalogue(),
    expected = Array.from({ length: 14 }, (_, i) => "S" + (i + 1));
  const groups = c.categories.filter(
    (x) => x.department_id === "secular-afrobeats",
  );
  assert.deepEqual(
    groups.map((x) => x.group_id),
    expected,
  );
  assert.equal(
    c.styles.filter((x) => x.department_id === "secular-afrobeats").length,
    70,
  );
  const expectedIds = [];
  for (const group of groups) {
    const styles = c.styles.filter((x) => x.category_id === group.id),
      ids = Array.from(
        { length: 5 },
        (_, i) => group.group_id + "-" + String(i + 1).padStart(2, "0"),
      );
    assert.deepEqual(
      styles.map((x) => x.id),
      ids,
    );
    for (const s of styles) assert.equal(s.department_id, "secular-afrobeats");
    expectedIds.push(...ids);
  }
  assert.equal(new Set(expectedIds).size, 70);
  const ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    ),
    html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  const visibleIds = [
    ...html.matchAll(/<option value="(S\d{1,2}-\d{2})">/g),
  ].map((x) => x[1]);
  assert.deepEqual(visibleIds, expectedIds);
  assert.equal(
    (html.match(/<optgroup label="Afrobeats & African Music \/ /g) || []).length,
    14,
  );
  for (const group of groups)
    assert(!html.includes('<option value="' + group.id + '"'));
  assert.equal(c.styles.filter((x) => x.department_id === "gospel").length, 70);
});
