"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w6Output } = require("./music-dna-w6-output.cjs");
const cases = [
  ["W6-01", "Grand Piano Heartbreak", 60, 82],
  ["W6-02", "Broken Heart Anthem", 64, 88],
  ["W6-03", "Heavenly Pop Soul Ballad", 62, 88],
  ["W6-04", "Acoustic Storyteller Pop", 76, 108],
  ["W6-05", "Soulful Redemption Ballad", 66, 92],
];
require("./music-dna-group-contract.cjs")({
  group: "W6",
  category_id: "western-w6",
  cases,
  validOutput: w6Output,
  topic:
    "An original emotional pop song about friendship and rebuilding confidence",
});
const actor = { artistId: 7, requestKey: "qa-w6-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W6 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W6");
  assert.deepEqual(cat, {
    id: "western-w6",
    name: "Pop Ballads & Emotional Storytelling",
    department_id: "western-international",
    group_id: "W6",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Powerful emotional piano ballad with deep bass, cinematic strings and dramatic choruses.",
    "Emotionally direct pop ballad with expressive piano, warm bass and powerful live drums.",
    "Elegant pop-soul with rich piano harmony, smooth bass and heartfelt melodies.",
    "Warm acoustic pop with rhythmic guitar, melodic bass and relatable storytelling.",
    "Emotional acoustic pop-soul with powerful drums, expressive guitar and uplifting choruses.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Western and International / Pop Ballads & Emotional Storytelling">',
    ),
  );
  assert(!html.includes('<option value="western-w6"'));
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
  assert(html.indexOf('value="W6-01"') > html.indexOf('value="W5-05"'));
});
test("W6 five storytelling fingerprints retain piano/guitar/bass/drum/orchestral instructions", () => {
  const identities = new Set(),
    markers = [
      ["grand piano", "cello", "piano ending"],
      ["simple", "strong chorus snare", "building"],
      ["pop-soul", "rhodes", "strings/piano"],
      ["fingerpicked", "percussive", "tambourine"],
      ["pop-rock", "overdriven", "gradual"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w6Output(c);
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
      /electric bass|synth bass|acoustic bass/gi,
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
      () => dna.validateOutput({ ...out, style: w6Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W6 supported languages remain independent and unsupported custom codes are rejected", () => {
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
      { ...brief("W6-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W6 fixed mood and independent voices never force rasp, high register or a performer identity", () => {
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
        { ...w6Output(c), dna_mood: "Unrelated dancehall party" },
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
    dna.prepare(brief("W6-02"), actor).profile.vocal_delivery,
    /never force a particular rasp/,
  );
  assert.match(
    dna.prepare(brief("W6-03"), actor).profile.vocal_delivery,
    /never force a high register/,
  );
  assert.match(
    dna.prepare(brief("W6-05"), actor).profile.vocal_delivery,
    /never force raspy delivery/,
  );
});
test("W6 topic authority, dynamic builds, acoustic techniques and approved bass alternatives remain explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /not a required lyrical subject or religious message/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect single-singer, duet and supported harmony settings/,
    );
    assert.match(
      c.profile.production_mix,
      /natural drum dynamics, emotional progression/,
    );
  }
  assert.match(
    dna.prepare(brief("W6-01"), actor).profile.drums_percussion,
    /Build gradually toward the final chorus/,
  );
  assert.match(
    dna.prepare(brief("W6-02"), actor).profile.drums_percussion,
    /Gradually introduce fuller live drums/,
  );
  const acoustic = dna.prepare(brief("W6-04"), actor);
  assert.match(
    acoustic.profile.instruments.guitar,
    /Acoustic guitar is the central instrument/,
  );
  for (const pattern of [/fingerpick/gi, /percussive/gi, /tambourine/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w6Output(acoustic),
            style: w6Output(acoustic).style.replace(pattern, "generic texture"),
          },
          acoustic,
        ),
      /core instrumental identity/,
    );
  for (const [id, phrase, options] of [
    ["W6-03", "electric bass or synth bass", ["electric bass", "synth bass"]],
    [
      "W6-04",
      "electric bass or acoustic bass",
      ["electric bass", "acoustic bass"],
    ],
  ]) {
    const c = dna.prepare(brief(id), actor),
      out = w6Output(c);
    for (const bass of options)
      dna.validateOutput({ ...out, style: out.style.replace(phrase, bass) }, c);
  }
});
test("W6 stays separate from W1–W5 and prior departments, preserving every earlier style with no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Western and International / Pop Ballads & Emotional Storytelling">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W[12345]|R\d+|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W6-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (const group of ["W1", "W2", "W3", "W4", "W5"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="W6-01"'),
    );
});
