"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s7Output } = require("./music-dna-s7-output.cjs");
const cases = [
  ["S7-01", "Eastern Highlife Celebration", 108, 132],
  ["S7-02", "Brothers Heritage Highlife", 96, 120],
  ["S7-03", "Eastern Urban Highlife", 100, 124],
  ["S7-04", "Vintage Palmwine Groove", 96, 118],
  ["S7-05", "Igbo Cultural Dance Festival", 112, 138],
];
require("./music-dna-group-contract.cjs")({
  group: "S7",
  category_id: "secular-s7",
  cases,
  validOutput: s7Output,
  topic:
    "An original Highlife song about family, community and personal growth",
});
const actor = { artistId: 7, requestKey: "qa-s7-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S7 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S7-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S7").name,
    "Nigerian Highlife & Traditional Pop",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="secular-s7"'));
  assert.throws(() => dna.prepare(brief("secular-s7"), actor));
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
test("S7 preserves five distinct Highlife guitar, melodic electric-bass and traditional percussion identities", () => {
  const distinguishing = [
    ["interlocking", "lead-guitar", "festive"],
    ["walking", "complementary", "extended guitar"],
    ["electronic bass", "melodic electric bass", "customer-directed"],
    ["vintage", "fingerpicking", "analog warmth"],
    ["cultural", "ogene/percussion", "extended final"],
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
      registry.styles.filter((s) => !s.id.startsWith("S7-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s7Output(c);
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
      () => dna.validateOutput({ ...out, style: s7Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [/electric bass/gi, /guitars?/gi, /ogene/gi])
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
test("S7 exact descriptions and supported languages never force Igbo because of Eastern musical origin", () => {
  const descriptions = [
    "Modern Igbo Highlife with bright guitars, lively bass and festive percussion.",
    "Traditional Eastern Highlife with interlocking guitars and warm live instrumentation.",
    "Contemporary Afro-urban music blending Highlife guitar with powerful modern drums.",
    "Organic, soulful Highlife with vintage guitars, live drums and warm bass.",
    "Energetic cultural Highlife with ogene, ekwe, lively guitar and powerful dance rhythms.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never force Igbo/);
    for (const languages of [
      ["ig"],
      ["en"],
      ["pcm"],
      ["yo"],
      ["ha"],
      ["fr"],
      ["en", "ig"],
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
});
test("S7 has a separate selector group and retains Highlife rather than Amapiano or generic Afrobeats bass", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S7").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String),
    names = [
      "Party Afrobeats & Dance Hits",
      "Smooth Afropop & Romantic",
      "Street Pop & Street Anthems",
      "Afro-Fusion & Powerful Grooves",
      "Fuji-Influenced Street Afrobeats",
      "Amapiano & Afro-Dance",
      "Nigerian Highlife & Traditional Pop",
    ],
    labels = names.map(
      (name) => '<optgroup label="Secular and Afrobeats / ' + name + '">',
    );
  assert(labels.every((label) => html.includes(label)));
  for (let i = 1; i < labels.length; i++)
    assert(html.indexOf(labels[i - 1]) < html.indexOf(labels[i]));
  const segment = html.slice(
    html.indexOf(labels[6]),
    html.indexOf("</optgroup>", html.indexOf(labels[6])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[123456]-/.test(segment));
  const highlife = dna.prepare(brief("S7-01"), actor),
    amapiano = dna.prepare(
      { ...brief("S7-01"), musicDnaStyle: "S6-01" },
      actor,
    );
  assert.match(highlife.profile.bass, /melodic electric bass/);
  assert(!highlife.profile.bass.includes("log-drum"));
  assert.match(amapiano.profile.bass, /tuned log-drum/);
  assert.match(
    dna.prepare(brief("S7-02"), actor).profile.instruments.guitar,
    /one melodic lead and another intricate rhythmic picking/,
  );
  assert.match(
    dna.prepare(brief("S7-04"), actor).profile.production_mix,
    /Avoid excessive electronic drums, synthetic bass dominance/,
  );
  assert.match(
    dna.prepare(brief("S7-05"), actor).profile.arrangement,
    /Ogene-and-percussion introduction/,
  );
});
test("S7 fixed moods and optional urban spoken passages remain independent of gender and voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic nightclub synth loop",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic nightclub synth loop"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s7Output(c), dna_mood: "Unrelated solemn worship" },
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
  const urban = dna.prepare(brief("S7-03"), actor);
  assert.match(
    urban.profile.vocal_delivery,
    /Do not automatically force rap vocals/,
  );
  assert.match(urban.profile.melody_harmony, /optional only/);
  assert.match(
    urban.profile.bass,
    /electronic bass carefully layered with melodic electric bass/,
  );
  assert.match(
    dna.instructions(urban),
    /Follow customer vocal approach and voice settings/,
  );
});
