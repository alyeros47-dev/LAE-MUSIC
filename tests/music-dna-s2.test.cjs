"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s2Output } = require("./music-dna-s2-output.cjs");
const cases = [
  ["S2-01", "Midnight Afro-Silk", 94, 112],
  ["S2-02", "Sweetheart Afro-Melody", 98, 116],
  ["S2-03", "Velvet Afro-Romance", 88, 106],
  ["S2-04", "Golden Heart Afro-Soul", 92, 110],
  ["S2-05", "After-Dark Afro-R&B", 96, 114],
];
require("./music-dna-group-contract.cjs")({
  group: "S2",
  category_id: "secular-s2",
  cases,
  validOutput: s2Output,
  topic:
    "An original romantic song about affection, companionship and emotional honesty",
});
const actor = { artistId: 7, requestKey: "qa-s2-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S2 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S2-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S2").name,
    "Smooth Afropop & Romantic",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s2"'));
  assert.throws(() => dna.prepare(brief("secular-s2"), actor));
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
test("S2 preserves five smooth bass, guitar and romantic arrangement identities", () => {
  const distinguishing = [
    ["rhodes", "muted guitar", "rounded sub-bass"],
    ["bright romantic", "marimba", "relaxed dance bounce"],
    ["fingerpicked", "sustained warm sub-bass", "dreamy"],
    ["afro-soul", "passing notes", "guitar-led"],
    ["glides", "dark synth", "hypnotic"],
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
      registry.styles.filter((s) => !s.id.startsWith("S2-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s2Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    assert.match(out.style, /bass/i);
    assert.match(out.style, /guitar/i);
    assert.match(out.style, /kick/i);
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: s2Output(neighbor).style }, c),
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
});
test("S2 exact descriptions and all supported language combinations preserve the instrumental identity", () => {
  const descriptions = [
    "Smooth, relaxed Afropop with warm bass, gentle percussion and flowing guitars.",
    "Bright romantic Afropop with playful guitar hooks and catchy melodies.",
    "Dreamy Afro-R&B with fingerpicked guitar, soft drums and intimate textures.",
    "Soulful romantic Afropop with rich electric piano and expressive melodies.",
    "Atmospheric romantic grooves with hypnotic bass and modern electronic textures.",
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
test("S2 and S1 are separate selector groups with distinct dance intensity and production direction", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S2").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    s1 =
      '<optgroup label="Afrobeats & African Music / Party Afrobeats & Dance Hits">',
    s2 = '<optgroup label="Afrobeats & African Music / Smooth Afropop & Romantic">';
  assert(html.includes(s1));
  assert(html.includes(s2));
  assert(html.indexOf(s1) < html.indexOf(s2));
  const segment = html.slice(
    html.indexOf(s2),
    html.indexOf("</optgroup>", html.indexOf(s2)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!segment.includes('value="S1-'));
  const party = dna.prepare(
      { ...brief("S2-01"), musicDnaStyle: "S1-01" },
      actor,
    ),
    silk = dna.prepare(brief("S2-01"), actor);
  assert.match(party.profile.arrangement, /explosive party chorus/);
  assert.match(
    silk.profile.production_mix,
    /Avoid aggressive brass, explosive party drums/,
  );
  assert.match(
    dna.prepare(brief("S2-02"), actor).profile.production_mix,
    /Avoid heavy trap drums/,
  );
  assert.match(
    dna.prepare(brief("S2-03"), actor).profile.production_mix,
    /Avoid heavy brass, loud dance breaks/,
  );
  assert.match(
    dna.prepare(brief("S2-05"), actor).profile.production_mix,
    /Avoid generic party brass/,
  );
});
test("S2 fixed romantic mood and Gospel-colored harmony do not assign worship lyrics, lead gender or register", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Explosive party chant",
        beat: "generic aggressive party beat",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic aggressive party beat"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s2Output(c), dna_mood: "Explosive party chant" },
        c,
      ),
    );
    assert(
      !/divine|prayer|worship/.test(c.profile.lyrics.structure.toLowerCase()),
    );
  }
  for (const voice of ["neutral", "male", "female", "duet", "custom"]) {
    const c = dna.prepare({ ...brief("S2-04"), voice }, actor);
    assert.equal(c.voice, voice);
    assert(
      !/\b(male|female|tenor|soprano|alto|baritone)\b/i.test(
        c.profile.vocal_delivery,
      ),
    );
    assert.match(
      c.profile.instruments.keys,
      /Gospel-influenced chord voicings/,
    );
    assert.match(c.profile.production_mix, /harmonic color only/);
  }
});
