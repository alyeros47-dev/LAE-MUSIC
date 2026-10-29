"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s13Output } = require("./music-dna-s13-output.cjs");
const cases = [
  ["S13-01", "Dakar Royal Mbalax", 108, 136],
  ["S13-02", "Modern Dakar Dance Mbalax", 116, 140],
  ["S13-03", "Senegalese Festival Fire", 112, 138],
  ["S13-04", "Sabar Street Celebration", 122, 148],
  ["S13-05", "Sahel Golden Afro-Soul", 86, 112],
];
require("./music-dna-group-contract.cjs")({
  group: "S13",
  category_id: "secular-s13",
  cases,
  validOutput: s13Output,
  topic:
    "An original Senegalese Mbalax & Afro-Pop song about family, relationships and life lessons",
});
const actor = { artistId: 7, requestKey: "qa-s13-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S13 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S13-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S13").name,
    "Senegalese Mbalax & Afro-Pop",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s13"'));
  assert.throws(() => dna.prepare(brief("secular-s13"), actor));
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
test("S13 preserves five Senegalese cores and requires central sabar/tama, bass and guitar instructions", () => {
  const distinguishing = [
    ["classic senegalese", "layered sabar", "conversational tama"],
    ["modern senegalese", "electronic bass", "club pressure"],
    ["festival", "bouncy electric bass", "call-and-response"],
    ["fast senegalese", "slides", "dramatic sabar breakdown"],
    ["gentle senegalese", "kora", "reflective"],
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
      registry.styles.filter((s) => !s.id.startsWith("S13-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s13Output(c);
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
      () => dna.validateOutput({ ...out, style: s13Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    for (const pattern of [
      /sabar/gi,
      /tama/gi,
      /electric bass|bass/gi,
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
  }
  assert.equal(identities.size, 5);
});
test("S13 exact descriptions and available language choices never force Wolof or French", () => {
  const descriptions = [
    "Classic Senegalese Mbalax with powerful sabar drums, melodic bass and rich live-band arrangements.",
    "Contemporary Mbalax with deep electronic bass, bright keyboards and energetic percussion.",
    "Uplifting Afro-Pop and Mbalax fusion with lively drums, guitars and brass.",
    "Fast Senegalese dance Mbalax with explosive percussion and powerful bass.",
    "Warm Senegalese Afro-Soul with acoustic guitar, kora and gentle traditional percussion.",
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.equal(
      registry.styles.find((s) => s.id === id).description,
      descriptions[i],
    );
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /never forces Wolof, French/);
    for (const languages of [
      ["fr"],
      ["en"],
      ["fr", "en"],
      ["pcm"],
      ["yo"],
      ["ig"],
      ["ha"],
      ["fr", "ha"],
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
  if (!dna.catalogue().languages.some((l) => l.id === "wo"))
    assert.throws(() =>
      dna.prepare({ ...brief("S13-01"), musicDnaLanguages: ["wo"] }, actor),
    );
  assert(registry.revision.length <= 120);
});
test("S13 has its own selector group and Senegalese rhythm distinct from rumba, coupé-décalé and Amapiano", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S13").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Afrobeats & African Music / Senegalese Mbalax & Afro-Pop">';
  assert(html.includes(label));
  for (let n = 1; n <= 12; n++) {
    const previous = c.categories.find((x) => x.group_id === "S" + n),
      previousLabel =
        '<optgroup label="Afrobeats & African Music / ' + previous.name + '">';
    assert(html.includes(previousLabel));
    assert(html.indexOf(previousLabel) < html.indexOf(label));
  }
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S(?:[1-9]|10|11|12)-/.test(segment));
  for (const [id] of cases) {
    const x = dna.prepare(brief(id), actor);
    assert.match(x.profile.rhythm, /Mbalax/);
    assert.match(x.profile.drums_percussion, /sabar/);
    assert.match(x.profile.drums_percussion, /tama/);
  }
  const classic = dna.prepare(brief("S13-01"), actor);
  assert.match(
    classic.profile.production_mix,
    /sabar and tama are central musical voices/,
  );
  assert.match(
    classic.profile.production_mix,
    /Avoid generic four-on-the-floor Afrobeats/,
  );
  assert.match(
    dna.prepare({ ...brief("S13-01"), musicDnaStyle: "S12-01" }, actor).profile
      .rhythm,
    /Congolese rumba/,
  );
  assert.match(
    dna.prepare({ ...brief("S13-01"), musicDnaStyle: "S6-01" }, actor).profile
      .bass,
    /tuned log-drum/,
  );
});
test("S13 fixed moods and high-energy versus reflective arrangements remain gender/voice-independent", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic electronic Afropop loop",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic electronic Afropop loop"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s13Output(c), dna_mood: "Unrelated solemn worship" },
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
    dna.prepare(brief("S13-03"), actor).profile.production_mix,
    /Never assign a default lead gender or register/,
  );
  assert.match(
    dna.prepare(brief("S13-04"), actor).profile.production_mix,
    /Avoid uncontrolled percussion layers/,
  );
  const gentle = dna.prepare(brief("S13-05"), actor);
  assert.match(
    gentle.profile.drums_percussion,
    /restrained sabar percussion, soft tama/,
  );
  assert.match(gentle.profile.instruments.other, /Kora, balafon/);
  assert.match(
    gentle.profile.arrangement,
    /instrumental kora-and-guitar passage/,
  );
});
