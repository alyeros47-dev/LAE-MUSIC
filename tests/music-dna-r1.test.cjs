"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r1Output } = require("./music-dna-r1-output.cjs");
const cases = [
  ["R1-01", "Island Freedom Roots", 72, 94],
  ["R1-02", "Rebel Roots Declaration", 70, 92],
  ["R1-03", "Ancient Drum Roots", 66, 86],
  ["R1-04", "Harmony of the People", 72, 96],
  ["R1-05", "Kingston Mystic Groove", 70, 94],
];
require("./music-dna-group-contract.cjs")({
  group: "R1",
  category_id: "reggae-r1",
  cases,
  validOutput: r1Output,
  topic:
    "An original roots reggae story about friendship and everyday resilience, without religious or political themes",
});
const actor = { artistId: 7, requestKey: "qa-r1-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R1 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R1");
  assert.deepEqual(cat, {
    id: "reggae-r1",
    name: "Classic Roots Reggae",
    department_id: "reggae-caribbean",
    group_id: "R1",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Warm Jamaican roots reggae with rolling bass, one-drop drums and uplifting melodies.",
    "Powerful roots reggae with commanding bass, sharp guitar and bold rhythms.",
    "Deep meditative reggae with hypnotic bass and traditional hand percussion.",
    "Traditional roots reggae with rich harmonies, warm organ and steady bass.",
    "Soulful Jamaican roots reggae with relaxed drums and expressive melodies.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(
    html.includes(
      '<optgroup label="Reggae & Caribbean Music / Classic Roots Reggae">',
    ),
  );
  assert(!html.includes('<option value="reggae-r1"'));
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
  assert(html.indexOf('value="R1-01"') > html.indexOf('value="S14-05"'));
});
test("R1 preserves five distinct roots drum/bass/guitar/organ identities and validates instrument omissions", () => {
  const identities = new Set(),
    markers = [
      ["beat three", "communal", "syncopated"],
      ["steppers", "blues", "declarative"],
      ["nyabinghi", "hypnotic", "hand-percussion"],
      ["passing notes", "backing harmonies only", "single voice"],
      ["slides", "soulful", "dub"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = r1Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    for (const term of markers[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(
      JSON.stringify([
        s.drums_percussion,
        s.bass,
        s.instruments,
        s.arrangement,
      ]),
    );
    assert.match(s.drums_percussion, /one-drop/i);
    assert.match(s.bass, /electric bass/i);
    assert.match(s.instruments.guitar, /skank/i);
    assert.match(s.instruments.keys, /organ/i);
    for (const key of [
      "rhythm",
      "drums_percussion",
      "bass",
      "arrangement",
      "production_mix",
    ])
      assert(dna.instructions(c).includes(s[key]));
    for (const pattern of [
      /electric bass/gi,
      /guitar/gi,
      /organ/gi,
      /one-drop|steppers/gi,
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
  const ancient = dna.prepare(brief("R1-03"), actor);
  assert.throws(
    () =>
      dna.validateOutput(
        {
          ...r1Output(ancient),
          style: r1Output(dna.prepare(brief("R1-01"), actor)).style,
        },
        ancient,
      ),
    /core instrumental identity/,
  );
  const rebel = dna.prepare(brief("R1-02"), actor);
  assert.throws(
    () =>
      dna.validateOutput(
        {
          ...r1Output(rebel),
          style: r1Output(dna.prepare(brief("R1-05"), actor)).style,
        },
        rebel,
      ),
    /core instrumental identity/,
  );
});
test("R1 supported languages stay independent; Jamaican Patois is not silently added or forced", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /Never force Jamaican Patois/);
    for (const languages of [
      ["en"],
      ["fr"],
      ["en", "fr"],
      ["pcm"],
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
  assert(!dna.catalogue().languages.some((x) => x.id === "jam"));
  assert.throws(() =>
    dna.prepare({ ...brief("R1-01"), musicDnaLanguages: ["jam"] }, actor),
  );
});
test("R1 moods remain authoritative; voice choices never change instrumental roots identity", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated party mood",
        beat: "generic Afrobeats club",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Afrobeats club"));
    assert.throws(() =>
      dna.validateOutput(
        { ...r1Output(c), dna_mood: "Unrelated party mood" },
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
});
test("R1 contemplative and communal profiles follow customer lyrical/vocal direction without imposed beliefs", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(c.profile.lyrics.structure, /Follow the customer song topic/);
    assert.match(
      c.profile.lyrics.vocabulary,
      /Never force Jamaican Patois, Rastafarian beliefs, religious themes or political messages/,
    );
    assert.match(
      c.profile.production_mix,
      /clearly audible without overpowering/,
    );
  }
  const ancient = dna.prepare(brief("R1-03"), actor).profile;
  assert.match(ancient.vocal_delivery, /never dictates beliefs/);
  assert.match(ancient.drums_percussion, /Nyabinghi/);
  const harmony = dna.prepare(brief("R1-04"), actor).profile;
  assert.match(
    harmony.vocal_delivery,
    /never force harmonies for a single-voice performance/,
  );
  assert.match(
    harmony.melody_harmony,
    /when the customer's vocal settings permit/,
  );
  assert.match(
    dna.prepare(brief("R1-01"), actor).profile.drums_percussion,
    /beat three/,
  );
  assert.match(
    dna.prepare(brief("R1-02"), actor).profile.drums_percussion,
    /steppers/,
  );
});
