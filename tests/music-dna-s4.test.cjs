"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s4Output } = require("./music-dna-s4-output.cjs");
const cases = [
  ["S4-01", "African Giant Groove", 100, 118],
  ["S4-02", "Dancehall Fire Fusion", 102, 124],
  ["S4-03", "Island Roots Afro-Fusion", 94, 116],
  ["S4-04", "Coastal Afro-Groove", 106, 126],
  ["S4-05", "Midnight Afro-Spirit", 90, 110],
];
require("./music-dna-group-contract.cjs")({
  group: "S4",
  category_id: "secular-s4",
  cases,
  validOutput: s4Output,
  topic:
    "An original Afro-fusion song about resilience, confidence and personal growth",
});
const actor = { artistId: 7, requestKey: "qa-s4-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S4 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S4-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S4").name,
    "Afro-Fusion & Powerful Grooves",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="secular-s4"'));
  assert.throws(() => dna.prepare(brief("secular-s4"), actor));
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
test("S4 preserves five distinct Afrobeat, dancehall, reggae, highlife and atmospheric fusion identities", () => {
  const distinguishing = [
    ["live afrobeat", "rounded electric bass", "brass-led"],
    ["afro-dancehall", "offbeat reggae", "sub-bass"],
    ["caribbean", "organ bubbles", "offbeat electric guitar"],
    ["highlife", "interlocking", "bouncy"],
    ["atmospheric", "gliding", "processed electric guitar"],
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
      registry.styles.filter((s) => !s.id.startsWith("S4-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s4Output(c);
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
      () => dna.validateOutput({ ...out, style: s4Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...out,
            style: out.style.replace(/sub-bass|bass/gi, "thin texture"),
          },
          c,
        ),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
  const reggae = dna.prepare(brief("S4-03"), actor),
    out = s4Output(reggae);
  assert.throws(
    () =>
      dna.validateOutput(
        { ...out, style: out.style.replace(/organ bubbles/gi, "generic keys") },
        reggae,
      ),
    /core instrumental identity/,
  );
});
test("S4 exact descriptions and supported bilingual choices preserve fusion identity", () => {
  const descriptions = [
    "Powerful live Afro-fusion with brass, deep bass and syncopated percussion.",
    "Energetic Afro-dancehall with heavy bass and punchy drums.",
    "Warm Afro-reggae with rolling bass, offbeat guitar and Caribbean rhythms.",
    "Bright, danceable Afro-fusion with highlife guitars and lively percussion.",
    "Atmospheric Afro-R&B fusion with deep bass and emotional melodies.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    for (const languages of [
      ["en"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["fr"],
      ["en", "pcm"],
      ["en", "yo"],
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
test("S1–S4 have separate selector groups and S4 retains its specified fusion rather than earlier formulas", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S4").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String),
    labels = [
      "Party Afrobeats & Dance Hits",
      "Smooth Afropop & Romantic",
      "Street Pop & Street Anthems",
      "Afro-Fusion & Powerful Grooves",
    ].map((name) => '<optgroup label="Secular and Afrobeats / ' + name + '">');
  assert(labels.every((label) => html.includes(label)));
  for (let i = 1; i < labels.length; i++)
    assert(html.indexOf(labels[i - 1]) < html.indexOf(labels[i]));
  const segment = html.slice(
    html.indexOf(labels[3]),
    html.indexOf("</optgroup>", html.indexOf(labels[3])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[123]-/.test(segment));
  assert.match(
    dna.prepare(brief("S4-03"), actor).profile.production_mix,
    /Avoid generic Afrobeats arrangements that remove the reggae influence/,
  );
  assert.match(
    dna.prepare(brief("S4-04"), actor).profile.instruments.guitar,
    /interlocking highlife/,
  );
  assert.match(
    dna.prepare({ ...brief("S4-01"), musicDnaStyle: "S1-01" }, actor).profile
      .rhythm,
    /Afropop/,
  );
  assert.match(
    dna.prepare({ ...brief("S4-01"), musicDnaStyle: "S2-01" }, actor).profile
      .mood,
    /Romantic/,
  );
  assert.match(
    dna.prepare({ ...brief("S4-01"), musicDnaStyle: "S3-01" }, actor).profile
      .rhythm,
    /Fuji-influenced/,
  );
});
test("S4 fixed moods and specified live versus electronic balance remain voice-independent", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic slow worship beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic slow worship beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s4Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S4-01"), actor).profile.production_mix,
    /Avoid thin bass, generic electronic Afropop loops/,
  );
  assert.match(
    dna.prepare(brief("S4-02"), actor).profile.production_mix,
    /Avoid slow romantic pacing/,
  );
  assert.match(
    dna.prepare(brief("S4-05"), actor).profile.production_mix,
    /Avoid explosive brass, excessive live percussion/,
  );
});
