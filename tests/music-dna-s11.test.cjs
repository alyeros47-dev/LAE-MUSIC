"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s11Output } = require("./music-dna-s11-output.cjs");
const cases = [
  ["S11-01", "Golden Highlife Celebration", 104, 128],
  ["S11-02", "Reggae Highlife Romance", 88, 110],
  ["S11-03", "Heritage Highlife Groove", 102, 122],
  ["S11-04", "Evergreen Ghanaian Heritage", 94, 116],
  ["S11-05", "Velvet Highlife Love", 88, 108],
];
require("./music-dna-group-contract.cjs")({
  group: "S11",
  category_id: "secular-s11",
  cases,
  validOutput: s11Output,
  topic:
    "An original Ghanaian Highlife song about family, relationships and life lessons",
});
const actor = { artistId: 7, requestKey: "qa-s11-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S11 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S11-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S11").name,
    "Ghanaian Highlife",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="secular-s11"'));
  assert.throws(() => dna.prepare(brief("secular-s11"), actor));
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
test("S11 preserves five distinct dance, reggae, contemporary, traditional and romantic Highlife cores", () => {
  const distinguishing = [
    ["classic ghanaian", "interlocking", "extended lead-guitar"],
    ["highlife-reggae", "organ bubbles", "offbeat"],
    ["contemporary ghanaian", "modern production", "percussion-led"],
    ["walking", "flute", "reflective bridge"],
    ["fingerpicked", "soft strings", "romantic"],
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
      registry.styles.filter((s) => !s.id.startsWith("S11-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s11Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    const contrast = dna.prepare(brief(cases[[1, 2, 1, 4, 3][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: s11Output(contrast).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [/electric bass/gi, /guitars?/gi, /congas?/gi])
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
test("S11 exact descriptions and available language choices do not force or advertise unconfigured Ghanaian languages", () => {
  const descriptions = [
    "Classic Ghanaian dance Highlife with bright guitars and melodic bass.",
    "Smooth Highlife-reggae fusion with soulful melodies and warm bass.",
    "Contemporary Ghanaian Highlife with lively guitars and modern production.",
    "Traditional live-band Highlife with reflective storytelling.",
    "Romantic Ghanaian Highlife with expressive guitars and rich piano harmony.",
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
        dna.prepare({ ...brief("S11-01"), musicDnaLanguages: [lang] }, actor),
      );
  assert.equal(
    dna.catalogue().languages.find((l) => l.id === "pcm").name,
    "Nigerian Pidgin",
  );
});
test("S11 has a separate selector group and retains live Highlife apart from S10 Afropop and Hiplife", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S11").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String),
    label = '<optgroup label="Secular and Afrobeats / Ghanaian Highlife">';
  assert(html.includes(label));
  for (let n = 1; n <= 10; n++) {
    const previous = c.categories.find((x) => x.group_id === "S" + n),
      previousLabel =
        '<optgroup label="Secular and Afrobeats / ' + previous.name + '">';
    assert(html.includes(previousLabel));
    assert(html.indexOf(previousLabel) < html.indexOf(label));
  }
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S(?:[1-9]|10)-/.test(segment));
  const live = dna.prepare(brief("S11-01"), actor),
    urban = dna.prepare({ ...brief("S11-01"), musicDnaStyle: "S10-04" }, actor);
  assert.match(live.profile.bass, /Warm melodic electric bass/);
  assert.match(
    live.profile.instruments.guitar,
    /Interlocking clean electric guitars/,
  );
  assert.match(urban.profile.rhythm, /hip-hop grooves/);
  assert.match(
    dna.prepare(brief("S11-02"), actor).profile.instruments.keys,
    /reggae organ bubbles/,
  );
  assert.match(
    dna.prepare(brief("S11-05"), actor).profile.instruments.guitar,
    /fingerpicked acoustic guitar/,
  );
});
test("S11 fixed moods and live instrumental balance remain independent of gender and lead voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic electronic party template",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic electronic party template"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s11Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S11-01"), actor).profile.production_mix,
    /Avoid generic electronic Afrobeats loops/,
  );
  assert.match(
    dna.prepare(brief("S11-02"), actor).profile.production_mix,
    /Avoid heavy dancehall aggression/,
  );
  assert.match(
    dna.prepare(brief("S11-03"), actor).profile.production_mix,
    /Avoid replacing Highlife guitars/,
  );
  assert.match(
    dna.prepare(brief("S11-04"), actor).profile.bass,
    /melodic walking patterns/,
  );
  assert.match(
    dna.prepare(brief("S11-05"), actor).profile.production_mix,
    /Avoid aggressive electronic drums/,
  );
});
