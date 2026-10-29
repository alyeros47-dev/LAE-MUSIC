"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s9Output } = require("./music-dna-s9-output.cjs");
const cases = [
  ["S9-01", "Deep Ocean Afro-Soul", 78, 102],
  ["S9-02", "Starlight Afro-R&B", 96, 118],
  ["S9-03", "Honeyed African Soul", 84, 108],
  ["S9-04", "African Rhythm Empress", 104, 126],
  ["S9-05", "Acoustic Soul Heritage", 76, 102],
];
require("./music-dna-group-contract.cjs")({
  group: "S9",
  category_id: "secular-s9",
  cases,
  validOutput: s9Output,
  topic:
    "An original African soul song about resilience, relationships and personal growth",
});
const actor = { artistId: 7, requestKey: "qa-s9-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S9 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S9-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S9").name,
    "African Soul & Alternative R&B",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="secular-s9"'));
  assert.throws(() => dna.prepare(brief("secular-s9"), actor));
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
test("S9 preserves five distinct soul cores with bass, guitar and African percussion", () => {
  const distinguishing = [
    ["dark synth", "sub-bass", "wide expressive"],
    ["afro-r&b", "empowerment", "afropop bounce"],
    ["romantic", "fingerpicked", "rhodes"],
    ["energetic african", "highlife", "talking drum"],
    ["organic african", "jazz", "upright-style"],
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
      registry.styles.filter((s) => !s.id.startsWith("S9-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s9Output(c);
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
      () => dna.validateOutput({ ...out, style: s9Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /sub-bass|electric bass|bass/gi,
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
test("S9 exact descriptions and independently chosen supported languages preserve instrumental identity", () => {
  const descriptions = [
    "Atmospheric alternative soul with deep bass, rich harmony and emotional melodies.",
    "Modern, confident Afro-R&B with bright percussion and catchy melodies.",
    "Warm romantic Afro-soul with acoustic guitar, piano and gentle percussion.",
    "Energetic African pop-soul with powerful percussion and lively bass.",
    "Organic alternative soul with acoustic guitar, jazz harmony and reflective storytelling.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces a language/);
    for (const languages of [
      ["en"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["fr"],
      ["en", "yo"],
      ["en", "pcm"],
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
test("S9 has a separate selector group and retains African rhythm apart from earlier Fuji and Amapiano groups", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S9").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String),
    names = [
      "Party Afrobeats & Dance Hits",
      "Smooth Afropop & Romantic",
      "Street Pop & Street Anthems",
      "Afro-Fusion & Powerful Grooves",
      "Fuji-Influenced Street Afrobeats",
      "Amapiano & Afro-Dance",
      "Nigerian Highlife & Traditional Pop",
      "Yoruba Fuji & Juju",
      "African Soul & Alternative R&B",
    ],
    labels = names.map(
      (name) => '<optgroup label="Secular and Afrobeats / ' + name + '">',
    );
  assert(labels.every((label) => html.includes(label)));
  for (let i = 1; i < labels.length; i++)
    assert(html.indexOf(labels[i - 1]) < html.indexOf(labels[i]));
  const segment = html.slice(
    html.indexOf(labels[8]),
    html.indexOf("</optgroup>", html.indexOf(labels[8])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[12345678]-/.test(segment));
  for (const [id] of cases) {
    const x = dna.prepare(brief(id), actor);
    assert.match(x.profile.rhythm, /African|Afro-|Afropop/);
    assert(!x.profile.bass.includes("log-drum"));
  }
  assert.match(
    dna.prepare(brief("S9-03"), actor).profile.instruments.guitar,
    /Fingerpicked acoustic guitar/,
  );
  assert.match(
    dna.prepare(brief("S9-05"), actor).profile.instruments.keys,
    /jazz-influenced/,
  );
  assert.match(
    dna.prepare(brief("S9-04"), actor).profile.instruments.guitar,
    /highlife-inspired/,
  );
});
test("S9 fixed atmospheres and African Rhythm Empress voice remain independent of gender or register", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic Western ballad template",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Western ballad template"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s9Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S9-01"), actor).profile.production_mix,
    /Avoid overcrowded instrumentation, aggressive party drums/,
  );
  assert.match(
    dna.prepare(brief("S9-03"), actor).profile.production_mix,
    /Avoid heavy electronic bass overpowering guitar and piano/,
  );
  assert.match(
    dna.prepare(brief("S9-04"), actor).profile.production_mix,
    /Never assign a default lead voice or vocal register/,
  );
  assert.match(
    dna.prepare(brief("S9-05"), actor).profile.production_mix,
    /Avoid excessive electronic effects, aggressive club drums/,
  );
});
