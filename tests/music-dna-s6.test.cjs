"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s6Output } = require("./music-dna-s6-output.cjs");
const cases = [
  ["S6-01", "Royal Piano Groove", 110, 115],
  ["S6-02", "Midnight Amapiano Pressure", 112, 118],
  ["S6-03", "Township Dance Anthem", 112, 120],
  ["S6-04", "Sunrise Piano Celebration", 110, 118],
  ["S6-05", "Log Drum Dance Machine", 113, 120],
];
require("./music-dna-group-contract.cjs")({
  group: "S6",
  category_id: "secular-s6",
  cases,
  validOutput: s6Output,
  topic:
    "An original Amapiano song about friendship and celebration with generous instrumental space",
});
const actor = { artistId: 7, requestKey: "qa-s6-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S6 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S6-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S6").name,
    "Amapiano & Afro-Dance",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="secular-s6"'));
  assert.throws(() => dna.prepare(brief("secular-s6"), actor));
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
test("S6 requires musical pitched log-drum bass and five distinct piano/percussion arrangements", () => {
  const distinguishing = [
    ["jazz/deep-house", "deliberate spaces", "extended"],
    ["sparse and dense", "dark piano", "club"],
    ["township", "rhythmic stops", "bouncy"],
    ["soulful electric piano", "soft brass", "melodic breakdown"],
    ["leading", "glides", "silences"],
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
      registry.styles.filter((s) => !s.id.startsWith("S6-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s6Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    assert.match(c.profile.bass, /tuned log-drum/);
    assert.match(c.profile.bass, /musical/);
    assert.match(c.profile.bass, /kick/);
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: s6Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /log[- ]drums?/gi,
      /tuned|pitched/gi,
      /piano/gi,
      /shakers?/gi,
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
test("S6 exact descriptions and available languages preserve style without forcing South African language", () => {
  const descriptions = [
    "Soulful deep Amapiano with rich piano chords and rolling log-drum bass.",
    "Heavy club Amapiano with deep log drums and dark rhythmic textures.",
    "Energetic township Amapiano with bright piano stabs and street-dance rhythms.",
    "Melodic, uplifting Amapiano with warm harmonies and joyful grooves.",
    "Powerful percussion-driven Amapiano with intricate log-drum sequences.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces a language/);
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
  for (const language of ["zu", "xh", "st"])
    if (!dna.catalogue().languages.some((l) => l.id === language))
      assert.throws(() =>
        dna.prepare(
          { ...brief("S6-01"), musicDnaLanguages: [language] },
          actor,
        ),
      );
});
test("S6 has its own selector group and log-drum identity distinct from S1–S5", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S6").department_id,
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
    ],
    labels = names.map(
      (name) => '<optgroup label="Secular and Afrobeats / ' + name + '">',
    );
  assert(labels.every((label) => html.includes(label)));
  for (let i = 1; i < labels.length; i++)
    assert(html.indexOf(labels[i - 1]) < html.indexOf(labels[i]));
  const segment = html.slice(
    html.indexOf(labels[5]),
    html.indexOf("</optgroup>", html.indexOf(labels[5])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[12345]-/.test(segment));
  const township = dna.prepare(brief("S6-03"), actor),
    street = dna.prepare({ ...brief("S6-03"), musicDnaStyle: "S3-03" }, actor);
  assert.match(
    township.profile.production_mix,
    /Do not turn this into Nigerian street-pop/,
  );
  assert.match(township.profile.bass, /tuned log-drum/);
  assert(!street.profile.bass.includes("log-drum"));
  const leading = dna.prepare(brief("S6-05"), actor);
  assert.match(
    leading.profile.production_mix,
    /leading musical bass instrument/,
  );
  assert.match(
    leading.profile.production_mix,
    /Vary patterns rather than constant identical loops/,
  );
});
test("S6 fixed moods and original instrumental variation remain independent of lead voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "unrelated salsa brass override",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("unrelated salsa brass override"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s6Output(c), dna_mood: "Unrelated solemn worship" },
        c,
      ),
    );
    assert(
      !/divine|prayer|worship/.test(c.profile.lyrics.structure.toLowerCase()),
    );
    assert.match(c.profile.production_mix, /compression/);
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
    dna.prepare(brief("S6-01"), actor).profile.arrangement,
    /Extended piano-and-shaker introduction/,
  );
  assert.match(
    dna.prepare(brief("S6-02"), actor).profile.bass,
    /sparse\/dense/,
  );
  assert.match(
    dna.prepare(brief("S6-05"), actor).profile.arrangement,
    /new log-drum variation/,
  );
});
