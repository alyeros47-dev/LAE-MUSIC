"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w7Output } = require("./music-dna-w7-output.cjs");
const cases = [
  ["W7-01", "Moonlight Funk Machine", 108, 126],
  ["W7-02", "Purple Electric Funk", 100, 124],
  ["W7-03", "Golden Retro Funk Party", 104, 126],
  ["W7-04", "Celestial Disco Soul Orchestra", 112, 130],
  ["W7-05", "Celebration Funk Orchestra", 106, 128],
];
require("./music-dna-group-contract.cjs")({
  group: "W7",
  category_id: "western-w7",
  cases,
  validOutput: w7Output,
  topic: "An original funk song about friendship and rebuilding confidence",
});
const actor = { artistId: 7, requestKey: "qa-w7-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W7 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W7");
  assert.deepEqual(cat, {
    id: "western-w7",
    name: "Classic Funk & Dance Soul",
    department_id: "western-international",
    group_id: "W7",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Precision-driven dance funk combining powerful bass, tight drums, sharp rhythm guitar, bright synths and dramatic pop-soul arrangements.",
    "Bold Minneapolis-inspired electric funk combining deep synth bass, sharp drum-machine grooves, expressive electric guitar, bright synthesizers and adventurous pop-funk arrangements.",
    "Modern retro-funk and dance soul combining live drums, thick bass guitar, bright brass, funky rhythm guitar and polished contemporary production.",
    "Rich orchestral disco-soul combining melodic bass guitar, energetic drums, layered brass, disco strings, rhythmic guitar and sophisticated soul harmonies.",
    "High-energy classic funk and party soul combining thick bass guitar, powerful live drums, bright brass riffs, rhythmic guitar and joyful dance arrangements.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Western and International / Classic Funk & Dance Soul">',
    ),
  );
  assert(!html.includes('<option value="western-w7"'));
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
  assert(html.indexOf('value="W7-01"') > html.indexOf('value="W6-05"'));
});
test("W7 five funk fingerprints retain specific bass/drums/guitar/keys/brass instructions", () => {
  const identities = new Set(),
    markers = [
      ["precision", "sixteenth", "dramatic stops"],
      ["minneapolis", "drum-machine", "overdriven"],
      ["rhodes", "trumpet", "live-band retro"],
      ["grand piano", "disco-soul", "orchestral bridge"],
      ["clavinet", "percussion breakdown", "party funk"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w7Output(c);
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
      /kick/gi,
      /snare/gi,
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
      () => dna.validateOutput({ ...out, style: w7Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W7 supported languages remain independent and unsupported custom codes are rejected", () => {
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
      { ...brief("W7-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W7 embedded moods and independent voices do not infer a performer identity or require group vocals", () => {
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
        { ...w7Output(c), dna_mood: "Unrelated solemn prayer" },
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
  for (const id of ["W7-03", "W7-05"])
    assert.match(
      dna.prepare(brief(id), actor).profile.vocal_delivery,
      /only when compatible/,
    );
});
test("W7 topic control, precision bass, machine/live contrast and orchestral depth remain explicit", () => {
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
      /rather than generic EDM, disco loops or repeated static funk backing/,
    );
  }
  assert.match(
    dna.prepare(brief("W7-01"), actor).profile.bass,
    /controlled note lengths/,
  );
  const electric = dna.prepare(brief("W7-02"), actor);
  assert.match(electric.profile.drums_percussion, /drum-machine/i);
  for (const pattern of [/drum-machine/gi, /overdriv/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w7Output(electric),
            style: w7Output(electric).style.replace(pattern, "generic texture"),
          },
          electric,
        ),
      /core instrumental identity/,
    );
  assert.match(
    dna.prepare(brief("W7-03"), actor).profile.drums_percussion,
    /live kick/,
  );
  const orchestra = dna.prepare(brief("W7-04"), actor);
  for (const pattern of [/string/gi, /grand piano/gi, /conga/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w7Output(orchestra),
            style: w7Output(orchestra).style.replace(
              pattern,
              "generic texture",
            ),
          },
          orchestra,
        ),
      /core instrumental identity/,
    );
  for (const id of ["W7-01", "W7-02"]) {
    const c = dna.prepare(brief(id), actor),
      out = w7Output(c);
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
test("W7 remains separate from W1–W6 and prior departments, preserving every earlier option with no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Western and International / Classic Funk & Dance Soul">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W[123456]|R\d+|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W7-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (const group of ["W1", "W2", "W3", "W4", "W5", "W6"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="W7-01"'),
    );
});
