"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r6Output } = require("./music-dna-r6-output.cjs");
const cases = [
  ["R6-01", "British Velvet Reggae Pop", 74, 96],
  ["R6-02", "Island Celebration Reggae", 90, 112],
  ["R6-03", "Caribbean Reggae Funk Orchestra", 88, 110],
  ["R6-04", "Electric Caribbean Freedom", 96, 120],
  ["R6-05", "Sunshine Youth Reggae", 88, 108],
];
require("./music-dna-group-contract.cjs")({
  group: "R6",
  category_id: "reggae-r6",
  cases,
  validOutput: r6Output,
  topic:
    "An original international reggae crossover song about friendship and everyday resilience",
});
const actor = { artistId: 7, requestKey: "qa-r6-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R6 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R6");
  assert.deepEqual(cat, {
    id: "reggae-r6",
    name: "Reggae Pop & Crossover",
    department_id: "reggae-caribbean",
    group_id: "R6",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Smooth romantic reggae-pop with deep bass, warm keyboards and gentle guitar.",
    "Upbeat Jamaican party reggae with bouncing bass, lively brass and catchy melodies.",
    "Sophisticated reggae-funk with melodic bass, rhythmic guitars and rich soul harmony.",
    "Powerful reggae-rock and electro-pop with punchy drums and bright synth hooks.",
    "Cheerful pop-reggae with playful organ, bouncing bass and joyful melodies.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Reggae and Caribbean / Reggae Pop & Crossover">',
    ),
  );
  assert(!html.includes('<option value="reggae-r6"'));
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
  assert(html.indexOf('value="R6-01"') > html.indexOf('value="R5-05"'));
});
test("R6 five crossover identities retain specific drums/bass/guitar/keys and reject missing core terms", () => {
  const identities = new Set(),
    markers = [
      ["british", "saxophone", "nostalgic"],
      ["trombone", "springy", "bass/brass intro"],
      ["clavinet", "sixteenth", "octave"],
      ["reggae-rock", "sub-bass", "analog synth"],
      ["handclaps", "tambourine", "cheerful"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = r6Output(c);
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
    assert.match(s.rhythm, /reggae/i);
    assert.match(s.bass, /electric bass/i);
    assert.match(s.instruments.guitar, /skank/i);
    for (const key of [
      "rhythm",
      "drums_percussion",
      "bass",
      "arrangement",
      "production_mix",
    ])
      assert(dna.instructions(c).includes(s[key]));
    for (const pattern of [/electric bass/gi, /guitar/gi, /organ/gi, /kick/gi])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
    const contrast = dna.prepare(brief(cases[[2, 0, 3, 4, 1][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: r6Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("R6 supported languages remain independent without forcing Patois or a regional accent", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(
      base.profile.lyrics.vocabulary,
      /Never force Jamaican Patois or a regional accent/,
    );
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
    dna.prepare({ ...brief("R6-01"), musicDnaLanguages: ["jam"] }, actor),
  );
});
test("R6 fixed mood and independent voice settings never infer age or group performance from Sunshine Youth", () => {
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
        { ...r6Output(c), dna_mood: "Unrelated solemn prayer" },
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
    dna.prepare(brief("R6-05"), actor).profile.vocal_delivery,
    /without forcing child vocals, a youthful voice, a group performance or a particular gender/,
  );
});
test("R6 topic authority, funk counterpoint, electro-rock drive and appropriate drum foundations stay explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.production_mix,
      /complement rather than replace the reggae identity/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect selected single-singer, duet and supported harmony settings/,
    );
  }
  const funk = dna.prepare(brief("R6-03"), actor);
  assert.match(funk.profile.instruments.guitar, /sixteenth-note/);
  assert.match(funk.profile.rhythm, /rhythmic counterpoint/);
  for (const pattern of [/clavinet/gi, /sixteenth/gi, /octave/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...r6Output(funk),
            style: r6Output(funk).style.replace(pattern, "generic texture"),
          },
          funk,
        ),
      /core instrumental identity/,
    );
  const rock = dna.prepare(brief("R6-04"), actor);
  assert.match(rock.profile.drums_percussion, /rock-influenced/);
  assert.throws(
    () =>
      dna.validateOutput(
        {
          ...r6Output(rock),
          style: r6Output(rock).style.replace(/sub-bass/gi, "generic texture"),
        },
        rock,
      ),
    /core instrumental identity/,
  );
  for (const id of ["R6-01", "R6-05"])
    assert.match(
      dna.prepare(brief(id), actor).profile.drums_percussion,
      /one-drop/,
    );
  for (const id of ["R6-02", "R6-03", "R6-04"])
    assert(
      !/one-drop/i.test(dna.prepare(brief(id), actor).profile.drums_percussion),
    );
  assert.match(
    dna.prepare(brief("R6-05"), actor).profile.lyrics.vocabulary,
    /Do not force childish lyrics unless requested/,
  );
});
test("R6 selection and musical fingerprints remain separate while every earlier style stays accessible", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label = '<optgroup label="Reggae and Caribbean / Reggae Pop & Crossover">';
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R[12345]|S\d+)-/.test(segment));
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = registry.styles.filter((s) => !s.id.startsWith("R6-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (const group of ["R1", "R2", "R3", "R4", "R5"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="R6-01"'),
    );
});
