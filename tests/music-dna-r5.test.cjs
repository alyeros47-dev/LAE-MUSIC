"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r5Output } = require("./music-dna-r5-output.cjs");
const cases = [
  ["R5-01", "Kingston Club Pressure", 94, 110],
  ["R5-02", "Island Party Swagger", 90, 108],
  ["R5-03", "Dancehall Crown Riddim", 92, 112],
  ["R5-04", "Caribbean Dance Explosion", 100, 124],
  ["R5-05", "Ragga Lovers Party Groove", 88, 106],
];
require("./music-dna-group-contract.cjs")({
  group: "R5",
  category_id: "reggae-r5",
  cases,
  validOutput: r5Output,
  topic:
    "An original Jamaican dancehall song about friendship and everyday confidence, without explicit content",
});
const actor = { artistId: 7, requestKey: "qa-r5-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R5 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R5");
  assert.deepEqual(cat, {
    id: "reggae-r5",
    name: "Dancehall & Party Reggae",
    department_id: "reggae-caribbean",
    group_id: "R5",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Modern Jamaican dancehall with heavy bass, sharp drums and energetic synth hooks.",
    "Playful reggae-dancehall with warm bass, bright keyboards and catchy melodies.",
    "Classic Jamaican dancehall with powerful riddims and rhythmic hooks.",
    "Explosive dancehall with heavy drums, deep sub-bass and dramatic dance breaks.",
    "Melodic reggae-dancehall crossover with warm bass and playful romantic rhythms.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(
    html.includes(
      '<optgroup label="Reggae & Caribbean Music / Dancehall & Party Reggae">',
    ),
  );
  assert(!html.includes('<option value="reggae-r5"'));
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
  assert(html.indexOf('value="R5-01"') > html.indexOf('value="R4-05"'));
});
test("R5 five dancehall identities preserve bass/riddim/keyboard instructions and reject missing core terms", () => {
  const identities = new Set(),
    markers = [
      ["synth plucks", "short pre-chorus", "double-time"],
      ["humor only", "relaxed bounce", "organ bubbles"],
      ["stop-start", "chant-driven", "classic"],
      ["extended dance break", "dance climax", "whistles"],
      ["ragga", "electric piano", "rhythmic bridge"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = r5Output(c);
    dna.validateOutput(out, c);
    assert(out.style.length <= 950);
    for (const marker of markers[i])
      assert(out.style.toLowerCase().includes(marker), marker);
    identities.add(
      JSON.stringify([
        s.drums_percussion,
        s.bass,
        s.instruments,
        s.arrangement,
      ]),
    );
    assert.match(s.drums_percussion, /dancehall/i);
    assert.match(s.bass, /bass/i);
    for (const key of [
      "rhythm",
      "drums_percussion",
      "bass",
      "arrangement",
      "production_mix",
    ])
      assert(dna.instructions(c).includes(s[key]));
    for (const pattern of [
      /electric bass|electronic bass|electronic sub-bass/gi,
      /guitar/gi,
      /kick/gi,
      /snare/gi,
    ])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
    const contrast = dna.prepare(brief(cases[[1, 0, 4, 2, 0][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: r5Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("R5 supported languages stay independent without forcing or silently enabling Jamaican Patois", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(base.profile.lyrics.vocabulary, /Never force Jamaican Patois/);
    for (const languages of [
      ["en"],
      ["fr"],
      ["pcm"],
      ["en", "fr"],
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
    dna.prepare({ ...brief("R5-01"), musicDnaLanguages: ["jam"] }, actor),
  );
});
test("R5 fixed moods and independent voice choices never turn ragga into an automatic duet", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated solemn prayer",
        beat: "generic Afrobeats club",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Afrobeats club"));
    assert.throws(() =>
      dna.validateOutput(
        { ...r5Output(c), dna_mood: "Unrelated solemn prayer" },
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
  assert.match(
    dna.prepare(brief("R5-05"), actor).profile.vocal_delivery,
    /never automatically add a duet or multiple performers/,
  );
});
test("R5 topic safeguards, optional bass alternatives and double-time subdivisions retain approved configuration", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(c.profile.lyrics.structure, /Follow the customer song topic/);
    assert.match(
      c.profile.lyrics.vocabulary,
      /do not automatically introduce explicit sexual content, violence or profanity/,
    );
    assert.match(
      c.profile.production_mix,
      /authentic Jamaican dancehall riddims/,
    );
  }
  assert.match(
    dna.prepare(brief("R5-02"), actor).profile.production_mix,
    /forced comedy when the customer's topic is serious/,
  );
  for (const id of ["R5-02", "R5-05"]) {
    const c = dna.prepare(brief(id), actor),
      out = r5Output(c);
    for (const bass of ["electric bass", "electronic bass"])
      dna.validateOutput(
        {
          ...out,
          style: out.style.replace("electric bass or electronic bass", bass),
        },
        c,
      );
  }
  const club = dna.prepare(brief("R5-01"), actor);
  assert(club.tempo >= 94 && club.tempo <= 110);
  assert.match(
    club.profile.energy,
    /optional double-time subdivisions do not change the 94–110 BPM tempo range/,
  );
  assert.throws(() =>
    dna.validateOutput({ ...r5Output(club), tempo_bpm: club.tempo * 2 }, club),
  );
  for (const id of ["R5-01", "R5-04"]) {
    const c = dna.prepare(brief(id), actor);
    assert(!/one-drop/i.test(c.profile.drums_percussion));
    assert(!/organ/i.test(c.profile.instruments.keys));
  }
});
test("R5 dancehall selector and musical fingerprints remain separate from R1–R4 roots-oriented groups", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label =
      '<optgroup label="Reggae & Caribbean Music / Dancehall & Party Reggae">';
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R[1234]|S\d+)-/.test(segment));
  for (const group of ["R1", "R2", "R3", "R4"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="R5-01"'),
    );
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = new Set(
    registry.styles.filter((s) => !s.id.startsWith("R5-")).map(core),
  );
  for (const [id] of cases)
    assert(!earlier.has(core(registry.styles.find((x) => x.id === id))));
});
