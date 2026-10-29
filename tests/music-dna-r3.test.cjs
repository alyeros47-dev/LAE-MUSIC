"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r3Output } = require("./music-dna-r3-output.cjs");
const cases = [
  ["R3-01", "Midnight Lovers Rock", 68, 88],
  ["R3-02", "Golden Heart Reggae Soul", 72, 94],
  ["R3-03", "Sweet Island Romance", 74, 98],
  ["R3-04", "Evergreen Island Love", 70, 92],
  ["R3-05", "Caribbean Velvet Pop Reggae", 82, 106],
];
require("./music-dna-group-contract.cjs")({
  group: "R3",
  category_id: "reggae-r3",
  cases,
  validOutput: r3Output,
  topic:
    "An original roots reggae story about friendship and everyday resilience, without religious or political themes",
});
const actor = { artistId: 7, requestKey: "qa-r3-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R3 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R3");
  assert.deepEqual(cat, {
    id: "reggae-r3",
    name: "Romantic Reggae & Lovers Rock",
    department_id: "reggae-caribbean",
    group_id: "R3",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Intimate Jamaican lovers rock with deep bass, warm organ and tender romantic melodies.",
    "Soulful romantic reggae with rich piano harmony and emotionally powerful melodies.",
    "Classic melodic reggae with flowing bass and uplifting romantic choruses.",
    "Mature lovers rock with elegant keyboards, warm guitars and heartfelt storytelling.",
    "Smooth reggae-pop crossover with polished R&B harmony and catchy romantic hooks.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Reggae and Caribbean / Romantic Reggae & Lovers Rock">',
    ),
  );
  assert(!html.includes('<option value="reggae-r3"'));
  assert.throws(() => dna.prepare(brief(cat.id), actor));
  for (const [i, [id, name]] of cases.entries()) {
    const s = registry.styles.find((x) => x.id === id);
    assert.equal(s.description, descriptions[i]);
    assert(html.includes('<option value="' + id + '">' + name + "</option>"));
    for (const ref of s.research_references) {
      assert(!JSON.stringify(c).includes(ref));
      assert(!dna.instructions(dna.prepare(brief(id), actor)).includes(ref));
    }
  }
  assert(html.indexOf('value="R3-01"') > html.indexOf('value="R2-05"'));
});
test("R3 five lovers-rock identities preserve bass/skank/organ and reject missing core instructions", () => {
  const identities = new Set(),
    markers = [
      ["intimate", "sparse", "understated"],
      ["rhodes", "soulful", "expanded"],
      ["slides", "brass/guitar passage", "classic"],
      ["acoustic guitar", "mature", "thoughtful"],
      ["electronic bass", "sub-bass", "reggae-pop"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = r3Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    for (const term of markers[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(
      JSON.stringify([
        s.drums_percussion,
        s.bass,
        s.instruments,
        s.arrangement,
      ]),
    );
    assert.match(s.bass, /electric.*bass/i);
    assert.match(s.instruments.guitar, /skank/i);
    assert.match(s.instruments.keys, /organ/i);
    if (i < 4) assert.match(s.drums_percussion, /one-drop/);
    else {
      assert.match(s.drums_percussion, /reggae-pop/);
      assert.match(s.rhythm, /offbeat/);
    }
    for (const key of [
      "rhythm",
      "drums_percussion",
      "bass",
      "arrangement",
      "production_mix",
    ])
      assert(dna.instructions(c).includes(s[key]));
    for (const pattern of [
      /electric bass|electronic bass/gi,
      /guitar/gi,
      /organ/gi,
    ])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
    const contrast = dna.prepare(brief(cases[(i + 1) % 5][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: r3Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("R3 supported languages remain independent and Jamaican Patois is neither forced nor silently enabled", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /Never force Jamaican Patois/);
    for (const languages of [
      ["en"],
      ["fr"],
      ["pcm"],
      ["en", "fr"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["en", "pcm", "ig"],
    ]) {
      const c = dna.prepare(
        { ...brief(id), musicDnaLanguages: languages, voice: "duet" },
        actor,
      );
      assert.deepEqual(c.languages, languages);
      assert.deepEqual(c.profile, base.profile);
      assert.deepEqual(c.choices, base.choices);
    }
  }
  assert(!dna.catalogue().languages.some((x) => x.id === "jam"));
  assert.throws(() =>
    dna.prepare({ ...brief("R3-01"), musicDnaLanguages: ["jam"] }, actor),
  );
});
test("R3 fixed moods and independent voice choices preserve romantic instrumental identity", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated party mood",
        beat: "generic Afrobeats club",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Afrobeats club"));
    assert.throws(() =>
      dna.validateOutput(
        { ...r3Output(c), dna_mood: "Unrelated party mood" },
        c,
      ),
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
});
test("R3 soul harmony never requires gospel lyrics, customer topics remain free and single voices do not require harmonies", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /without forcing a fixed romantic lyrical subject/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /never force backing layers for a single voice/,
    );
    assert.match(c.profile.production_mix, /recognizable reggae foundation/);
  }
  const soul = dna.prepare(brief("R3-02"), actor).profile;
  assert.match(
    soul.lyrics.vocabulary,
    /Gospel-influenced harmony describes chords and arrangement only, never automatically religious lyrics/,
  );
  assert.match(
    soul.production_mix,
    /not automatically|never automatically religious lyrics/,
  );
  const c = dna.prepare(brief("R3-05"), actor),
    out = r3Output(c);
  dna.validateOutput(
    {
      ...out,
      style: out.style.replace(
        "electric bass or electronic bass",
        "electronic bass",
      ),
    },
    c,
  );
  dna.validateOutput(
    {
      ...out,
      style: out.style.replace(
        "electric bass or electronic bass",
        "electric bass",
      ),
    },
    c,
  );
  assert.match(c.profile.rhythm, /reggae offbeat/);
});
test("R3 separate selector group and distinct musical fingerprints preserve R1/R2 and earlier African groups", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Reggae and Caribbean / Romantic Reggae & Lovers Rock">';
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R[12]|S\d+)-/.test(segment));
  for (const group of ["R1", "R2"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="R3-01"'),
    );
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = new Set(
    registry.styles.filter((s) => !s.id.startsWith("R3-")).map(core),
  );
  for (const [id] of cases)
    assert(!earlier.has(core(registry.styles.find((x) => x.id === id))));
});
