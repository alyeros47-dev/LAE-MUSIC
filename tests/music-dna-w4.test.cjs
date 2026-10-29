"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w4Output } = require("./music-dna-w4-output.cjs");
const cases = [
  ["W4-01", "Electric Midnight Soul", 68, 92],
  ["W4-02", "Dreamscape Alternative R&B", 66, 94],
  ["W4-03", "Velvet Bedroom R&B", 60, 86],
  ["W4-04", "Golden Alternative Soul", 62, 88],
  ["W4-05", "Deep Baritone Soul", 58, 82],
];
require("./music-dna-group-contract.cjs")({
  group: "W4",
  category_id: "western-w4",
  cases,
  validOutput: w4Output,
  topic:
    "An original secular soul ballad about rebuilding confidence after a difficult year",
});
const actor = { artistId: 7, requestKey: "qa-w4-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W4 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W4");
  assert.deepEqual(cat, {
    id: "western-w4",
    name: "Modern R&B & Alternative Soul",
    department_id: "western-international",
    group_id: "W4",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Guitar-driven modern R&B with expressive electric guitar, warm Rhodes and deep bass.",
    "Atmospheric alternative R&B with deep sub-bass, textured synths and unconventional melodies.",
    "Intimate minimalist R&B with warm keyboards, soft guitar and deep bass.",
    "Organic alternative soul with expressive piano, jazz-influenced harmony and gentle guitar.",
    "Dark cinematic R&B with warm piano, deep bass and emotional strings.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Western and International / Modern R&B & Alternative Soul">',
    ),
  );
  assert(!html.includes('<option value="western-w4"'));
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
  assert(html.indexOf('value="W4-01"') > html.indexOf('value="W3-05"'));
});
test("W4 five alternative-soul fingerprints retain specific bass/drum/keyboard/guitar instructions", () => {
  const identities = new Set(),
    markers = [
      ["guitar-driven", "blues", "bends"],
      ["detuned", "half-time", "reversed"],
      ["minimal", "fingerpicked", "seventh/ninth"],
      ["jazz-soul", "acoustic guitar", "organic"],
      ["cinematic", "cello", "sub-bass"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w4Output(c);
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
      /electric bass|synth bass|sub-bass/gi,
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
      () => dna.validateOutput({ ...out, style: w4Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W4 supported languages remain independent and unsupported custom codes are rejected", () => {
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
      { ...brief("W4-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W4 fixed moods and independent voices do not infer breathiness, gender, pitch or range from the label", () => {
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
        { ...w4Output(c), dna_mood: "Unrelated dancehall party" },
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
    dna.prepare(brief("W4-03"), actor).profile.vocal_delivery,
    /never force breathiness/,
  );
  assert.match(
    dna.prepare(brief("W4-05"), actor).profile.vocal_delivery,
    /style label never overrides selected voice gender, pitch or range/,
  );
});
test("W4 approved atmosphere-label exception is exact and never permits voice constraints", () => {
  const original = {
    ...structuredClone(registry),
    categories: [
      structuredClone(registry.categories.find((c) => c.id === "western-w4")),
    ],
    styles: [structuredClone(registry.styles.find((s) => s.id === "W4-05"))],
  };
  assert.equal(
    dna.createEngine(original).catalogue().styles[0].name,
    "Deep Baritone Soul",
  );
  for (const mutate of [
    (c) => {
      c.styles[0].id = "W4-99";
    },
    (c) => {
      c.styles[0].name = "Deep Baritone Soul Solo";
    },
    (c) => {
      c.styles[0].name = "Female Baritone Soul";
    },
    (c) => {
      c.categories[0].id = "western-other";
      c.styles[0].category_id = "western-other";
    },
    (c) => {
      c.categories[0].group_id = "W5";
    },
    (c) => {
      c.styles[0].department_id = c.categories[0].department_id = "gospel";
    },
    (c) => {
      c.styles[0].vocal_delivery = "Baritone voice required";
    },
    (c) => {
      c.styles[0].production_terms.push(["baritone"]);
    },
  ]) {
    const c = structuredClone(original);
    mutate(c);
    assert.throws(() => dna.createEngine(c));
  }
});
test("W4 topic authority, organic secular harmony and approved bass alternatives remain explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /never automatically requires Christian lyrics/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect single-singer, duet and supported harmony settings/,
    );
    assert.match(
      c.profile.production_mix,
      /rather than generic slow trap or EDM/,
    );
  }
  assert.match(
    dna.prepare(brief("W4-04"), actor).profile.production_mix,
    /must not automatically generate Christian lyrics/,
  );
  for (const [id, phrase, alternatives] of [
    ["W4-01", "electric bass or synth bass", ["electric bass", "synth bass"]],
    ["W4-03", "sub-bass or electric bass", ["sub-bass", "electric bass"]],
    ["W4-05", "electric bass or synth bass", ["electric bass", "synth bass"]],
  ]) {
    const c = dna.prepare(brief(id), actor),
      out = w4Output(c);
    for (const bass of alternatives)
      dna.validateOutput({ ...out, style: out.style.replace(phrase, bass) }, c);
  }
  const dreamy = dna.prepare(brief("W4-02"), actor);
  for (const pattern of [/detuned/gi, /reversed/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w4Output(dreamy),
            style: w4Output(dreamy).style.replace(pattern, "generic texture"),
          },
          dreamy,
        ),
      /core instrumental identity/,
    );
});
test("W4 remains separate from W1–W3 and prior departments, preserving earlier options with no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Western and International / Modern R&B & Alternative Soul">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W[123]|R\d+|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W4-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (const group of ["W1", "W2", "W3"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="W4-01"'),
    );
});
