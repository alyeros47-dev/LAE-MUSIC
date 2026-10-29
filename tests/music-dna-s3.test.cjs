"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { s3Output } = require("./music-dna-s3-output.cjs");
const cases = [
  ["S3-01", "Street Carnival Explosion", 118, 142],
  ["S3-02", "Street Melody of Hope", 100, 122],
  ["S3-03", "Zanku Dance Pressure", 116, 140],
  ["S3-04", "Marlian Street Bounce", 108, 130],
  ["S3-05", "Agege Street Festival", 122, 146],
];
require("./music-dna-group-contract.cjs")({
  group: "S3",
  category_id: "secular-s3",
  cases,
  validOutput: s3Output,
  topic:
    "An original street anthem about determination, friendship and everyday life",
});
const actor = { artistId: 7, requestKey: "qa-s3-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original joyful testimony of gratitude and victory",
});
test("S3 exposes only the exact five styles under a nonselectable heading and keeps research references private", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("S3-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((s) => s.group_id === "S3").name,
    "Street Pop & Street Anthems",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="secular-s3"'));
  assert.throws(() => dna.prepare(brief("secular-s3"), actor));
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
test("S3 keeps five distinct street grooves and requires bass plus talking-drum instructions", () => {
  const distinguishing = [
    ["fuji", "distorted-edge", "crowd energy"],
    ["melodic", "emotional piano", "reflective"],
    ["street dance", "stop-start", "sub-bass"],
    ["minimal", "controlled slides", "dark textures"],
    ["lagos", "communal", "live/electronic"],
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
      registry.styles.filter((s) => !s.id.startsWith("S3-")).map(core),
    ),
    identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = s3Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    for (const term of distinguishing[i])
      assert(out.style.toLowerCase().includes(term), term);
    identities.add(core(c.profile));
    assert(!earlier.has(core(c.profile)));
    assert.match(out.style, /bass/i);
    assert.match(out.style, /talking[- ]drum/i);
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: s3Output(neighbor).style }, c),
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
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...out,
            style: out.style.replace(/talking[- ]drum/gi, "generic texture"),
          },
          c,
        ),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("S3 exact descriptions and selected languages never force Yoruba or Pidgin", () => {
  const descriptions = [
    "Raw, high-energy street-pop with Fuji percussion and heavy dance bass.",
    "Melodic Afro-street music with emotional storytelling and warm rhythmic grooves.",
    "Powerful street-dance music with heavy bass and energetic percussion breaks.",
    "Minimal, hypnotic street-pop with deep electronic bass and catchy rhythmic hooks.",
    "Fast Lagos street-party music with talking drums, brass and communal dance energy.",
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
      /Do not force Yoruba, Nigerian Pidgin/,
    );
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
test("S1, S2 and S3 remain separate selector groups with different rhythmic directions", async () => {
  const c = dna.catalogue();
  assert.equal(
    c.categories.find((x) => x.group_id === "S3").department_id,
    "secular-afrobeats",
  );
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    labels = [
      "Party Afrobeats & Dance Hits",
      "Smooth Afropop & Romantic",
      "Street Pop & Street Anthems",
    ].map((name) => '<optgroup label="Afrobeats & African Music / ' + name + '">');
  assert(labels.every((label) => html.includes(label)));
  assert(html.indexOf(labels[0]) < html.indexOf(labels[1]));
  assert(html.indexOf(labels[1]) < html.indexOf(labels[2]));
  const segment = html.slice(
    html.indexOf(labels[2]),
    html.indexOf("</optgroup>", html.indexOf(labels[2])),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="S[12]-/.test(segment));
  assert.match(
    dna.prepare(brief("S3-01"), actor).profile.rhythm,
    /Fuji-influenced/,
  );
  assert.match(
    dna.prepare({ ...brief("S3-01"), musicDnaStyle: "S1-01" }, actor).profile
      .rhythm,
    /Afropop/,
  );
  assert.match(
    dna.prepare({ ...brief("S3-01"), musicDnaStyle: "S2-01" }, actor).profile
      .mood,
    /Romantic/,
  );
  assert.match(
    dna.prepare(brief("S3-02"), actor).profile.production_mix,
    /Avoid turning every song into aggressive party music/,
  );
  assert.match(
    dna.prepare(brief("S3-04"), actor).profile.production_mix,
    /Minimal but powerful/,
  );
  assert.match(
    dna.prepare(brief("S3-05"), actor).profile.production_mix,
    /erase traditional street-party character/,
  );
});
test("S3 fixed atmosphere and original chant instructions remain independent of lead voice", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn worship",
        beat: "generic slow romantic ballad",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic slow romantic ballad"));
    assert.throws(() =>
      dna.validateOutput(
        { ...s3Output(c), dna_mood: "Unrelated solemn worship" },
        c,
      ),
    );
    assert(
      !/divine|prayer|worship/.test(c.profile.lyrics.structure.toLowerCase()),
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /never reproduce identifiable voices, lyrics, signature chants/,
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
