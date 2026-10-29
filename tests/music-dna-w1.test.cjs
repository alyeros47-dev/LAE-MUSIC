"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w1Output } = require("./music-dna-w1-output.cjs");
const cases = [
  ["W1-01", "Majestic Soul Power Ballad", 64, 84],
  ["W1-02", "Cinematic Heart Ballad", 60, 82],
  ["W1-03", "Velvet R&B Vocal Symphony", 66, 90],
  ["W1-04", "Gospel-Soul Powerhouse", 62, 86],
  ["W1-05", "Midnight Deep Soul Ballad", 58, 82],
];
require("./music-dna-group-contract.cjs")({
  group: "W1",
  category_id: "western-w1",
  cases,
  validOutput: w1Output,
  topic:
    "An original secular soul ballad about rebuilding confidence after a difficult year",
});
const actor = { artistId: 7, requestKey: "qa-w1-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W1 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W1");
  assert.deepEqual(cat, {
    id: "western-w1",
    name: "Powerful Soul & R&B Ballads",
    department_id: "western-international",
    group_id: "W1",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Grand emotional soul with powerful piano, rich bass and dramatic choruses.",
    "Sweeping romantic ballad with emotional piano, orchestral strings and cinematic depth.",
    "Sophisticated smooth R&B with lush keyboards, deep bass and expressive melodies.",
    "Powerful contemporary soul with Hammond organ, live drums and dramatic emotion.",
    "Intimate, mature R&B with warm low bass, soft drums and reflective melodies.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Western and International / Powerful Soul & R&B Ballads">',
    ),
  );
  assert(!html.includes('<option value="western-w1"'));
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
  assert(html.indexOf('value="W1-01"') > html.indexOf('value="R7-05"'));
});
test("W1 five soul/R&B fingerprints retain piano/bass/drum/guitar detail and reject missing core terms", () => {
  const identities = new Set(),
    markers = [
      ["grand piano", "gradually", "gentle ending"],
      ["cello", "violin", "orchestral resolution"],
      ["seventh", "ninth", "fingerpicked"],
      ["hammond", "half-time", "brass swells"],
      ["dark rhodes", "restrained", "soft ending"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w1Output(c);
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
      () => dna.validateOutput({ ...out, style: w1Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W1 supported languages remain independent and unsupported custom codes are rejected", () => {
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
      { ...brief("W1-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W1 embedded mood and independent voice settings never force a singer identity, register or extreme intensity", () => {
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
        { ...w1Output(c), dna_mood: "Unrelated dancehall party" },
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
    dna.prepare(brief("W1-01"), actor).profile.vocal_delivery,
    /without requiring extreme high notes/,
  );
  assert.match(
    dna.prepare(brief("W1-03"), actor).profile.vocal_delivery,
    /no mandatory whistle-register notes/,
  );
  assert.match(
    dna.prepare(brief("W1-04"), actor).profile.vocal_delivery,
    /without forcing extreme belting/,
  );
  assert.match(
    dna.prepare(brief("W1-05"), actor).profile.vocal_delivery,
    /never force low-pitched vocals/,
  );
});
test("W1 topic authority, secular-capable gospel harmony, dynamics and bass alternatives remain explicit", () => {
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
      c.profile.production_mix,
      /Western soul\/R&B foundations, not reggae offbeats/,
    );
  }
  assert.match(
    dna.prepare(brief("W1-04"), actor).profile.production_mix,
    /secular-capable soul style/,
  );
  assert.match(
    dna.prepare(brief("W1-01"), actor).profile.drums_percussion,
    /Build drum intensity gradually/,
  );
  assert.match(
    dna.prepare(brief("W1-02"), actor).profile.instruments.other,
    /cello, violin/,
  );
  assert.match(
    dna.prepare(brief("W1-03"), actor).profile.instruments.keys,
    /seventh and ninth/,
  );
  assert.match(
    dna.prepare(brief("W1-05"), actor).profile.production_mix,
    /emotional restraint and intimacy rather than a huge vocal climax/,
  );
  for (const id of ["W1-03", "W1-05"]) {
    const c = dna.prepare(brief(id), actor),
      out = w1Output(c);
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
test("W1 remains separate from Gospel/Secular/Reggae groups, all earlier styles stay available and no mood selector returns", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Western and International / Powerful Soul & R&B Ballads">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R\d+|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W1-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  assert(html.indexOf('value="R7-05"') < html.indexOf('value="W1-01"'));
});
