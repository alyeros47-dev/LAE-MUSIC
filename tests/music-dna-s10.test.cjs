"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s10Output } = require("./music-dna-s10-output.cjs");
const cases = [
  ["S10-01", "Accra Golden Afropop", 98, 116],
  ["S10-02", "Sweet Accra Dance", 104, 122],
  ["S10-03", "Ghana Highlife Pop Celebration", 106, 126],
  ["S10-04", "Accra Hiplife Royalty", 92, 112],
  ["S10-05", "Ghana Dancehall Fire", 100, 124],
];
require("./music-dna-group-contract.cjs")({
  group: "S10",
  category_id: "secular-s10",
  cases,
  validOutput: s10Output,
  topic:
    "An original Ghanaian song about resilience, friendship and personal growth",
});
const actor = { artistId: 7, requestKey: "qa-s10-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S10 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S10-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S10").name,
    "Ghanaian Afrobeats & Hiplife",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s10"'));
  assert.throws(() => dna.prepare(brief("secular-s10"), actor));
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
test("S10 preserves five distinct Ghanaian Highlife, Hiplife and Afro-dancehall identities", () => {
  const distinguishing = [
    ["smooth ghanaian", "muted highlife", "romantic pre-chorus"],
    ["ghanaian afro-dance", "bouncy electronic bass", "immediate"],
    ["ghanaian highlife-pop", "interlocking", "guitar-led"],
    ["hiplife", "hip-hop", "customer-directed"],
    ["dancehall", "reggae organ bubbles", "caribbean"],
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
      registry.styles.filter((s) => !s.id.startsWith("S10-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s10Output(c);
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
      () => dna.validateOutput({ ...out, style: s10Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /sub-bass|electronic bass|electric bass|bass/gi,
      /guitars?/gi,
      /highlife|reggae/gi,
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
test("S10 exact descriptions and available languages never force Twi or claim unsupported Ghanaian languages", () => {
  const descriptions = [
    "Smooth Ghanaian Afropop with warm bass, Highlife guitar and romantic melodies.",
    "Bright Ghanaian Afro-dance with bouncy bass and catchy hooks.",
    "Lively Highlife-pop with melodic guitars, warm bass and festive percussion.",
    "Ghanaian Hiplife with powerful hip-hop drums and Highlife influences.",
    "Energetic Afro-dancehall with heavy bass, reggae guitar and African percussion.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(
      base.profile.lyrics.vocabulary,
      /never forces Twi, Ghanaian Pidgin/,
    );
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
  for (const lang of ["tw", "gaa", "ee", "gpe"])
    if (!dna.catalogue().languages.some((l) => l.id === lang))
      assert.throws(() =>
        dna.prepare({ ...brief("S10-01"), musicDnaLanguages: [lang] }, actor),
      );
  assert.equal(
    dna.catalogue().languages.find((l) => l.id === "pcm").name,
    "Nigerian Pidgin",
  );
});
test("S10 has a separate Ghanaian selector group while preserving existing Nigerian groups", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S10").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    ghana =
      '<optgroup label="Afrobeats & African Music / Ghanaian Afrobeats & Hiplife">';
  assert(html.includes(ghana));
  for (let n = 1; n <= 9; n++) {
    const previous = c.categories.find((x) => x.group_id === "S" + n);
    assert(previous);
    const label =
      '<optgroup label="Afrobeats & African Music / ' + previous.name + '">';
    assert(html.includes(label));
    assert(html.indexOf(label) < html.indexOf(ghana));
  }
  const segment = html.slice(
    html.indexOf(ghana),
    html.indexOf("</optgroup>", html.indexOf(ghana)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[1-9]-/.test(segment));
  assert.match(
    dna.prepare(brief("S10-03"), actor).profile.instruments.guitar,
    /Interlocking Ghanaian Highlife/,
  );
  assert.match(
    dna.prepare(brief("S10-04"), actor).profile.rhythm,
    /Ghanaian Hiplife blending hip-hop/,
  );
  assert.match(
    dna.prepare(brief("S10-05"), actor).profile.instruments.guitar,
    /Offbeat reggae guitar/,
  );
  const nigerian = dna.prepare(
    { ...brief("S10-01"), musicDnaStyle: "S1-01" },
    actor,
  );
  assert.match(nigerian.profile.rhythm, /Nigerian Afropop/);
});
test("S10 fixed moods and optional Hiplife rap passages remain voice-independent", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic Nigerian party template",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Nigerian party template"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s10Output(c), dna_mood: "Unrelated solemn worship" },
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
  const hiplife = dna.prepare(brief("S10-04"), actor);
  assert.match(
    hiplife.profile.vocal_delivery,
    /Do not automatically force rap vocals/,
  );
  assert.match(hiplife.profile.melody_harmony, /optional rap-oriented/);
  assert.match(
    dna.prepare(brief("S10-01"), actor).profile.production_mix,
    /without forbidding legitimate fusion/,
  );
  assert.match(
    dna.prepare(brief("S10-05"), actor).profile.production_mix,
    /removes dancehall and reggae character/,
  );
});
