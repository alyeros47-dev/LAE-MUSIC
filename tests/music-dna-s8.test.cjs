"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s8Output } = require("./music-dna-s8-output.cjs");
const cases = [
  ["S8-01", "Royal Fuji Celebration", 108, 136],
  ["S8-02", "Fuji Street Royalty", 116, 142],
  ["S8-03", "Wisdom of the Talking Drum", 100, 130],
  ["S8-04", "Golden Juju Guitar Orchestra", 100, 124],
  ["S8-05", "Evergreen Juju Heritage", 92, 116],
];
require("./music-dna-group-contract.cjs")({
  group: "S8",
  category_id: "secular-s8",
  cases,
  validOutput: s8Output,
  topic:
    "An original traditional song about family, wisdom and community celebration",
});
const actor = { artistId: 7, requestKey: "qa-s8-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S8 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S8-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S8").name,
    "Yoruba Fuji & Juju",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(!html.includes('<option value="secular-s8"'));
  assert.throws(() => dna.prepare(brief("secular-s8"), actor));
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
test("S8 preserves five distinct Fuji/Juju cores and validates percussion-led versus guitar-led roles", () => {
  const distinguishing = [
    ["percussion-led", "ceremonial", "talking-drum solo"],
    ["fast contemporary", "extended fuji dance", "heavy bass"],
    ["storytelling", "conversational", "social-responsibility"],
    ["guitar-led", "steel-guitar", "interlocking"],
    ["guitar-led", "gentle", "reflective bridge"],
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
      registry.styles.filter((s) => !s.id.startsWith("S8-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s8Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    const otherFamily = dna.prepare(brief(i < 3 ? "S8-04" : "S8-01"), actor);
    assert.throws(
      () =>
        dna.validateOutput({ ...out, style: s8Output(otherFamily).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /electric bass|bass/gi,
      /talking[- ]drum/gi,
      /shekere/gi,
      /guitars?/gi,
    ])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
    if (i < 3)
      for (const pattern of [/sakara/gi, /omele/gi, /agogo/gi])
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
test("S8 exact descriptions and supported languages preserve Yoruba music without forcing Yoruba lyrics", () => {
  const descriptions = [
    "Grand Yoruba Fuji with powerful talking drums and layered ceremonial percussion.",
    "Energetic modern Fuji with heavy dance bass and lively traditional drums.",
    "Storytelling-focused Fuji with intricate percussion and expressive melodies.",
    "Classic Yoruba Juju with interlocking guitars, melodic bass and traditional percussion.",
    "Warm traditional Juju with expressive guitars, organ and reflective storytelling.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces Yoruba/);
    for (const languages of [
      ["yo"],
      ["en"],
      ["pcm"],
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
});
test("S8 has its own selector group and retains traditional Fuji/Juju apart from S5 fusion", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S8").department_id,
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
      "Yoruba Fuji & Juju",
    ],
    labels = names.map(
      (name) => '<optgroup label="Secular and Afrobeats / ' + name + '">',
    );
  assert(labels.every((label) => html.includes(label)));
  for (let i = 1; i < labels.length; i++)
    assert(html.indexOf(labels[i - 1]) < html.indexOf(labels[i]));
  const segment = html.slice(
    html.indexOf(labels[7]),
    html.indexOf("</optgroup>", html.indexOf(labels[7])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[1234567]-/.test(segment));
  const royal = dna.prepare(brief("S8-01"), actor),
    fusion = dna.prepare({ ...brief("S8-01"), musicDnaStyle: "S5-01" }, actor);
  assert.match(
    royal.profile.drums_percussion,
    /Dominant talking-drum ensemble/,
  );
  assert.match(royal.profile.drums_percussion, /omele, agogo/);
  assert.match(fusion.profile.drums_percussion, /Heavy electronic kick/);
  assert.match(
    dna.prepare(brief("S8-03"), actor).profile.arrangement,
    /talking-drum instrumental conversation/,
  );
  assert.match(
    dna.prepare(brief("S8-04"), actor).profile.production_mix,
    /clean interlocking electric guitars lead/,
  );
});
test("S8 fixed moods and mature storytelling stay independent of gender and selected lead voice", () => {
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
        { ...s8Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S8-02"), actor).profile.production_mix,
    /Avoid replacing traditional drums with electronic dance beats/,
  );
  assert.match(
    dna.prepare(brief("S8-03"), actor).profile.production_mix,
    /Avoid generic party chants/,
  );
  assert.match(
    dna.prepare(brief("S8-05"), actor).profile.production_mix,
    /Avoid aggressive club drums/,
  );
});
