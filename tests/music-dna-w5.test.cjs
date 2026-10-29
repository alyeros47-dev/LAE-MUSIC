"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w5Output } = require("./music-dna-w5-output.cjs");
const cases = [
  ["W5-01", "Royal Pop Rhythm", 100, 124],
  ["W5-02", "Caribbean Pop Fire", 98, 124],
  ["W5-03", "Neon Disco Revival", 112, 128],
  ["W5-04", "Electric Pop Spectacle", 116, 132],
  ["W5-05", "Starlight Pop R&B", 94, 118],
];
require("./music-dna-group-contract.cjs")({
  group: "W5",
  category_id: "western-w5",
  cases,
  validOutput: w5Output,
  topic:
    "An original pop dance song about friendship and rebuilding confidence",
});
const actor = { artistId: 7, requestKey: "qa-w5-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W5 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W5");
  assert.deepEqual(cat, {
    id: "western-w5",
    name: "Western Pop & Dance",
    department_id: "western-international",
    group_id: "W5",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Powerful pop-R&B with punchy drums, deep bass and funky rhythmic arrangements.",
    "Vibrant Caribbean-influenced dance-pop with tropical percussion and heavy bass.",
    "Modern disco-pop with funky bass, bright synths and energetic dance grooves.",
    "Bold theatrical electro-pop with powerful drums, heavy synth bass and dramatic hooks.",
    "Smooth melodic pop-R&B with polished electronic drums, deep bass and bright keyboards.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Western and International / Western Pop & Dance">',
    ),
  );
  assert(!html.includes('<option value="western-w5"'));
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
  assert(html.indexOf('value="W5-01"') > html.indexOf('value="W4-05"'));
});
test("W5 five pop/dance fingerprints retain specific bass/drum/guitar/synth instructions", () => {
  const identities = new Set(),
    markers = [
      ["marching-style", "brass stabs", "funky"],
      ["caribbean", "congas", "offbeat"],
      ["four-on-the-floor", "sixteenth", "disco string"],
      ["arpeggios", "brass-like", "theatrical"],
      ["electric piano", "soft strings", "melodic pop-r&b"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w5Output(c);
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
      /synth/gi,
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
      () => dna.validateOutput({ ...out, style: w5Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W5 supported languages remain independent and unsupported custom codes are rejected", () => {
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
      { ...brief("W5-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W5 embedded moods and independent voices never force an accent, gender or high pitch", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn prayer",
        beat: "generic Caribbean riddim",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Caribbean riddim"));
    assert.throws(() =>
      dna.validateOutput(
        { ...w5Output(c), dna_mood: "Unrelated solemn prayer" },
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
    dna.prepare(brief("W5-02"), actor).profile.vocal_delivery,
    /never force a Jamaican or regional accent/,
  );
  assert.match(
    dna.prepare(brief("W5-05"), actor).profile.vocal_delivery,
    /without mandatory high pitch or excessive runs/,
  );
});
test("W5 topic control, disco pulse, electro-pop builds and approved bass alternatives remain explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect single-singer, duet and supported harmony settings/,
    );
    assert.match(
      c.profile.production_mix,
      /rather than generic festival EDM or trap/,
    );
  }
  const disco = dna.prepare(brief("W5-03"), actor);
  assert.match(disco.profile.drums_percussion, /four-on-the-floor/);
  assert.match(disco.profile.instruments.guitar, /sixteenth-note/);
  for (const pattern of [/four-on-the-floor/gi, /octave/gi, /tambourine/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w5Output(disco),
            style: w5Output(disco).style.replace(pattern, "generic texture"),
          },
          disco,
        ),
      /core instrumental identity/,
    );
  const electro = dna.prepare(brief("W5-04"), actor);
  assert.match(electro.profile.drums_percussion, /build-ups and breakdowns/);
  for (const pattern of [/arpeggio/gi, /brass-like/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w5Output(electro),
            style: w5Output(electro).style.replace(pattern, "generic texture"),
          },
          electro,
        ),
      /core instrumental identity/,
    );
  for (const id of ["W5-01", "W5-05"]) {
    const c = dna.prepare(brief(id), actor),
      out = w5Output(c);
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
test("W5 remains separate from W1–W4 and prior departments, preserving every earlier option with no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Western and International / Western Pop & Dance">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W[1234]|R\d+|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W5-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (const group of ["W1", "W2", "W3", "W4"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="W5-01"'),
    );
});
