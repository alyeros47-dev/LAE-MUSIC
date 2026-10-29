"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w2Output } = require("./music-dna-w2-output.cjs");
const cases = [
  ["W2-01", "Midnight R&B Slow Jam", 64, 84],
  ["W2-02", "Urban R&B Dance Groove", 92, 116],
  ["W2-03", "Velvet Heart R&B", 68, 90],
  ["W2-04", "Piano Soul Romance", 62, 86],
  ["W2-05", "Modern Gentleman R&B", 88, 112],
];
require("./music-dna-group-contract.cjs")({
  group: "W2",
  category_id: "western-w2",
  cases,
  validOutput: w2Output,
  topic:
    "An original secular soul ballad about rebuilding confidence after a difficult year",
});
const actor = { artistId: 7, requestKey: "qa-w2-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W2 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W2");
  assert.deepEqual(cat, {
    id: "western-w2",
    name: "Classic Contemporary R&B",
    department_id: "western-international",
    group_id: "W2",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Intimate slow R&B with deep bass, warm electric piano and romantic melodies.",
    "Energetic contemporary R&B with punchy drums, funky guitar and catchy hooks.",
    "Smooth mature romantic R&B with warm bass and soulful piano.",
    "Elegant piano-led R&B with rich harmonies and heartfelt melodies.",
    "Stylish midtempo pop-R&B with polished drums, deep bass and memorable hooks.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(
    html.includes(
      '<optgroup label="Western & International Music / Classic Contemporary R&B">',
    ),
  );
  assert(!html.includes('<option value="western-w2"'));
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
  assert(html.indexOf('value="W2-01"') > html.indexOf('value="W1-05"'));
});
test("W2 five R&B fingerprints retain specific bass/drums/keys/guitar and reject missing core terms", () => {
  const identities = new Set(),
    markers = [
      ["1990s", "swing", "fingerpicked"],
      ["sixteenth", "synth plucks", "dance groove"],
      ["mature", "rhodes", "gentle passage"],
      ["jazz/soul", "substitutions", "solo piano"],
      ["octave", "midtempo", "rhythmic piano"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w2Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    for (const marker of markers[i])
      assert(out.style.toLowerCase().includes(marker), marker);
    identities.add(
      JSON.stringify([
        s.drums_percussion,
        s.bass,
        s.instruments,
        s.arrangement,
      ]),
    );
    for (const key of [
      "rhythm",
      "drums_percussion",
      "bass",
      "arrangement",
      "production_mix",
    ])
      assert(dna.instructions(c).includes(s[key]));
    for (const pattern of [
      /electric bass|synth bass/gi,
      /guitar/gi,
      /piano|rhodes/gi,
      /kick/gi,
    ])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
    const contrast = dna.prepare(brief(cases[[1, 2, 3, 4, 0][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: w2Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W2 supported languages remain independent and unsupported custom codes are rejected", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    for (const languages of [
      ["en"],
      ["en", "pcm"],
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
  assert.throws(() =>
    dna.prepare(
      { ...brief("W2-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W2 embedded mood and independent voices do not infer gender from private references or Modern Gentleman", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated dancehall party",
        beat: "generic Caribbean riddim",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Caribbean riddim"));
    assert.throws(() =>
      dna.validateOutput(
        { ...w2Output(c), dna_mood: "Unrelated dancehall party" },
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
  assert.match(
    dna.prepare(brief("W2-05"), actor).profile.vocal_delivery,
    /independent of style name or research references/,
  );
});
test("W2 topic control, historical slow-jam scope, bass alternatives and distinctive harmonic techniques remain explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Do not automatically introduce explicit sexual content/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect selected single-singer, duet and supported harmony settings/,
    );
    assert.match(
      c.profile.production_mix,
      /authentic contemporary R&B harmony/,
    );
  }
  assert.match(
    dna.prepare(brief("W2-01"), actor).profile.rhythm,
    /1990s-style/,
  );
  assert.match(
    dna.prepare(brief("W2-02"), actor).profile.instruments.guitar,
    /sixteenth-note/,
  );
  assert.match(
    dna.prepare(brief("W2-03"), actor).profile.instruments.keys,
    /seventh and ninth/,
  );
  assert.match(
    dna.prepare(brief("W2-04"), actor).profile.instruments.keys,
    /harmonic substitutions/,
  );
  assert.match(dna.prepare(brief("W2-05"), actor).profile.bass, /octave jumps/);
  for (const id of ["W2-01", "W2-02", "W2-05"]) {
    const c = dna.prepare(brief(id), actor),
      out = w2Output(c);
    for (const bass of ["electric bass", "synth bass"])
      dna.validateOutput(
        {
          ...out,
          style: out.style.replace("electric bass or synth bass", bass),
        },
        c,
      );
  }
});
test("W2 remains separate from W1 and previous departments, preserves earlier options and adds no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Western & International Music / Classic Contemporary R&B">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W1|R\d+|G\d+|S\d+)-/.test(segment));
  assert(
    !/<(?:select|input)[^>]*name=["'](?:mood|musicDnaMood)["']/i.test(html),
  );
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W2-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  assert(html.indexOf('value="W1-05"') < html.indexOf('value="W2-01"'));
});
