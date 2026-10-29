"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s1Output } = require("./music-dna-s1-output.cjs");
const cases = [
  ["S1-01", "Lagos Celebration Anthem", 108, 124],
  ["S1-02", "Bouncing Party Groove", 104, 120],
  ["S1-03", "Futuristic Afro-Rave", 106, 126],
  ["S1-04", "Golden Afro-Dance Celebration", 102, 120],
  ["S1-05", "Tropical Afro-Dance Machine", 108, 126],
];
require("./music-dna-group-contract.cjs")({
  group: "S1",
  category_id: "secular-s1",
  cases,
  validOutput: s1Output,
  topic:
    "An original party song about dancing, friendship and personal success",
});
const actor = { artistId: 7, requestKey: "qa-s1-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S1 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S1-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S1").name,
    "Party Afrobeats & Dance Hits",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s1"'));
  assert.throws(() => dna.prepare(brief("secular-s1"), actor));
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
test("S1 preserves five distinct bass signatures, percussion patterns and production structures", () => {
  const distinguishing = [
    ["rounded sub-bass", "brass", "new layers"],
    ["mid-bass", "woodblock", "bounce"],
    ["afro-rave", "pulsing", "arpeggiated"],
    ["afro-r&b", "electric-piano", "refined"],
    ["afro-dance", "marimba", "rhythmic breakdown"],
  ];
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s1Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    assert.match(out.style, /kick/i);
    assert.match(out.style, /bass/i);
    assert.match(out.style, /percussion|congas/i);
    identities.add(
      JSON.stringify([
        c.profile.rhythm,
        c.profile.bass,
        c.profile.drums_percussion,
        c.profile.arrangement,
      ]),
    );
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: s1Output(neighbor).style }, c),
      /core instrumental identity/,
    );
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...out,
            style: out.style.replace(
              /sub-bass|mid-bass|bass/gi,
              "thin texture",
            ),
          },
          c,
        ),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("S1 exact descriptions and all supported language choices preserve the instrumental identity", () => {
  const descriptions = [
    "High-energy Nigerian Afropop with lively brass, bright hooks and powerful dance drums.",
    "Bass-heavy Afrobeats with infectious rhythmic piano and playful percussion.",
    "Modern electronic Afro-rave with hypnotic synths and deep pulsing bass.",
    "Smooth Afro-R&B dance fusion with warm harmonies and stylish percussion.",
    "Hypnotic bass-driven Afro-dance with punchy synths and tropical percussion.",
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
test("S1 has a separate Secular/Afrobeats optgroup and never inherits Gospel prayer rules", async () => {
  const c = dna.catalogue(),
    group = c.categories.find((x) => x.group_id === "S1");
  assert.equal(group.department_id, "secular-afrobeats");
  assert.equal(c.styles.filter((x) => x.department_id === "gospel").length, 70);
  assert.equal(
    c.styles.filter((x) => x.category_id === group.id).length,
    5,
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Afrobeats & African Music / Party Afrobeats & Dance Hits">';
  assert(html.includes(label));
  assert(
    html.indexOf(label) > html.indexOf("Gospel & Christian Music / Indigenous Igbo Gospel"),
  );
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!segment.includes('value="G'));
  for (const [id] of cases) {
    const x = dna.prepare(
      {
        ...brief(id),
        mood: "Solemn prayer chant",
        beat: "slow Gospel worship",
      },
      actor,
    );
    assert(!dna.instructions(x).includes("slow Gospel worship"));
    assert(!x.profile.production_exclusions?.includes("party-dance"));
    assert(
      !/worship|prayer|divine/.test(x.profile.lyrics.structure.toLowerCase()),
    );
    assert.throws(() =>
      dna.validateOutput(
        { ...s1Output(x), dna_mood: "Solemn prayer chant" },
        x,
      ),
    );
  }
  for (const voice of ["neutral", "male", "female", "duet", "custom"]) {
    const x = dna.prepare({ ...brief("S1-04"), voice }, actor);
    assert.equal(x.voice, voice);
    assert(!/\b(male|female|tenor|soprano)\b/i.test(x.profile.vocal_delivery));
  }
});
test("research-name boundaries allow ordinary words but reject names across casing, punctuation and newlines", () => {
  const fixture = require("./music-dna-fixture.cjs"),
    catalogue = fixture.catalogue();
  const sample = catalogue.styles[0];
  sample.research_references = ["Rema", "Kizz Daniel"];
  sample.production_mix +=
    " The groove can remain lively with controlled instrumental remainders.";
  const engine = dna.createEngine(catalogue),
    payload = {
      musicDnaStyle: sample.id,
      musicDnaLanguages: ["en"],
      voice: "neutral",
    };
  const c = engine.prepare(payload, actor),
    out = require("./music-dna-fixture.cjs").output(c);
  engine.validateOutput(
    {
      ...out,
      lyrics: out.lyrics + "\nWe remain together, no remainder of fear.",
    },
    c,
  );
  for (const name of [
    "Rema",
    "REMA",
    "Ｒｅｍａ",
    "Kizz Daniel",
    "KIZZ—DANIEL",
    "Kizz\nDaniel",
  ]) {
    assert.throws(
      () =>
        engine.validateOutput(
          { ...out, lyrics: out.lyrics + "\n" + name + " style" },
          c,
        ),
      /Research names/,
    );
    const bad = structuredClone(catalogue);
    bad.styles[0].description = "Sound for " + name;
    assert.throws(() => dna.createEngine(bad), /Research reference/);
  }
});
