"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w3Output } = require("./music-dna-w3-output.cjs");
const cases = [
  ["W3-01", "Golden Velvet Soul", 68, 92],
  ["W3-02", "Timeless Heart Soul", 72, 98],
  ["W3-03", "Piano Heart Soul", 66, 92],
  ["W3-04", "Silken R&B Romance", 70, 96],
  ["W3-05", "Neo-Soul Midnight Groove", 72, 98],
];
require("./music-dna-group-contract.cjs")({
  group: "W3",
  category_id: "western-w3",
  cases,
  validOutput: w3Output,
  topic:
    "An original secular soul ballad about rebuilding confidence after a difficult year",
});
const actor = { artistId: 7, requestKey: "qa-w3-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W3 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W3");
  assert.deepEqual(cat, {
    id: "western-w3",
    name: "Smooth Romantic Soul",
    department_id: "western-international",
    group_id: "W3",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Luxurious classic soul with deep melodic bass, elegant piano and rich strings.",
    "Warm romantic pop-soul with gentle guitar, smooth bass and memorable melodies.",
    "Expressive piano-led contemporary soul with rich harmony and heartfelt emotion.",
    "Smooth intimate R&B-soul with warm keyboards, deep bass and elegant melodies.",
    "Sophisticated neo-soul with laid-back drums, deep bass and lush electric piano.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(
    html.includes(
      '<optgroup label="Western & International Music / Smooth Romantic Soul">',
    ),
  );
  assert(!html.includes('<option value="western-w3"'));
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
  assert(html.indexOf('value="W3-01"') > html.indexOf('value="W2-05"'));
});
test("W3 five mature soul fingerprints preserve piano/bass/drum/guitar/harmonic instructions", () => {
  const identities = new Set(),
    markers = [
      ["suspended", "elegant strings", "luxurious"],
      ["pop-soul", "acoustic guitar", "tambourine"],
      ["grand piano", "gospel", "piano passage"],
      ["fingerpicked", "seventh/ninth", "understated"],
      ["neo-soul", "octave", "swing"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w3Output(c);
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
      () => dna.validateOutput({ ...out, style: w3Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W3 supported languages remain independent and unsupported custom codes are rejected", () => {
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
      { ...brief("W3-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W3 embedded mood and independent voices never infer gender or demand a neo-soul high register", () => {
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
        { ...w3Output(c), dna_mood: "Unrelated dancehall party" },
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
    dna.prepare(brief("W3-05"), actor).profile.vocal_delivery,
    /never force high-register vocals/,
  );
});
test("W3 topic authority, secular-capable piano harmony, neo-soul detail and bass alternatives remain explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /never automatically require Christian lyrics/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect single-singer, duet and supported harmony settings/,
    );
    assert.match(
      c.profile.production_mix,
      /authentic mature soul\/pop-soul\/neo-soul identity/,
    );
  }
  assert.match(
    dna.prepare(brief("W3-01"), actor).profile.instruments.keys,
    /seventh, ninth and suspended/,
  );
  assert.match(
    dna.prepare(brief("W3-02"), actor).profile.instruments.guitar,
    /acoustic strumming/,
  );
  assert.match(
    dna.prepare(brief("W3-03"), actor).profile.production_mix,
    /Automatically generating Christian lyrics/,
  );
  const neo = dna.prepare(brief("W3-05"), actor);
  assert.match(neo.profile.drums_percussion, /dry snare/);
  assert.match(neo.profile.bass, /octave movement/);
  for (const pattern of [/octave/gi, /swing/gi, /slide/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w3Output(neo),
            style: w3Output(neo).style.replace(pattern, "generic texture"),
          },
          neo,
        ),
      /core instrumental identity/,
    );
  const silky = dna.prepare(brief("W3-04"), actor),
    out = w3Output(silky);
  for (const bass of ["electric bass", "synth bass"])
    dna.validateOutput(
      { ...out, style: out.style.replace("electric bass or synth bass", bass) },
      silky,
    );
});
test("W3 remains separate from W1–W2 and prior departments, preserving every earlier option without a mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Western & International Music / Smooth Romantic Soul">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W[12]|R\d+|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W3-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (const group of ["W1", "W2"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="W3-01"'),
    );
});
