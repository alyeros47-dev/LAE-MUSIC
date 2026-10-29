"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r4Output } = require("./music-dna-r4-output.cjs");
const cases = [
  ["R4-01", "New Generation Roots Revival", 76, 100],
  ["R4-02", "Modern Dub Roots Fusion", 72, 96],
  ["R4-03", "Conscious Reggae Fire", 78, 104],
  ["R4-04", "Urban Roots Revolution", 82, 108],
  ["R4-05", "Soulful Reggae Uplift", 74, 98],
];
require("./music-dna-group-contract.cjs")({
  group: "R4",
  category_id: "reggae-r4",
  cases,
  validOutput: r4Output,
  topic:
    "An original roots reggae story about friendship and everyday resilience, without religious or political themes",
});
const actor = { artistId: 7, requestKey: "qa-r4-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R4 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R4");
  assert.deepEqual(cat, {
    id: "reggae-r4",
    name: "Contemporary Conscious Reggae",
    department_id: "reggae-caribbean",
    group_id: "R4",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Modern roots reggae with warm bass, live guitars and uplifting melodies.",
    "Atmospheric reggae with deep sub-bass, dub textures and contemporary production.",
    "Powerful modern reggae with punchy drums and confident rhythmic hooks.",
    "Intense reggae fusion with heavy bass, dancehall energy and dramatic arrangements.",
    "Smooth contemporary reggae with rich piano harmony and heartfelt melodies.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Reggae and Caribbean / Contemporary Conscious Reggae">',
    ),
  );
  assert(!html.includes('<option value="reggae-r4"'));
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
  assert(html.indexOf('value="R4-01"') > html.indexOf('value="R3-05"'));
});
test("R4 five contemporary identities preserve roots bass/skank/organ and reject missing core instructions", () => {
  const identities = new Set(),
    markers = [
      ["rhodes", "live warmth", "dub breakdown"],
      ["half-time", "sub-bass", "analog dub"],
      ["brass/guitar passage", "assertive", "hip-hop"],
      ["nyabinghi", "cinematic", "dancehall"],
      ["acoustic guitar", "strings", "reggae-soul passage"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = r4Output(c);
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
    assert.match(s.drums_percussion, /one-drop/i);
    assert.match(s.bass, /electric.*bass/i);
    assert.match(s.instruments.guitar, /skank/i);
    assert.match(s.instruments.keys, /organ.*bubbles/i);
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
      /one-drop|steppers|half-time/gi,
    ])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style.replace(pattern, "generic texture") },
            c,
          ),
        /core instrumental identity/,
      );
    const contrast = dna.prepare(brief(cases[[1, 2, 1, 4, 0][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: r4Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("R4 supported languages stay independent without forcing or silently enabling Jamaican Patois", () => {
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
    dna.prepare({ ...brief("R4-01"), musicDnaLanguages: ["jam"] }, actor),
  );
});
test("R4 fixed moods and independent voice choices preserve the selected modern reggae identity", () => {
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
        { ...r4Output(c), dna_mood: "Unrelated party mood" },
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
test("R4 modern production retains roots foundations, approved bass layers and customer lyrical/vocal control", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(c.profile.lyrics.structure, /Follow the customer song topic/);
    assert.match(
      c.profile.lyrics.vocabulary,
      /Never force Jamaican Patois, political, religious or Rastafarian content/,
    );
    assert.match(
      c.profile.production_mix,
      /complement rather than replace the central reggae foundation/,
    );
  }
  const dub = dna.prepare(brief("R4-02"), actor);
  assert.match(dub.profile.drums_percussion, /half-time/);
  assert.match(dub.profile.bass, /sub-bass.*electric bass/);
  assert.throws(
    () =>
      dna.validateOutput(
        {
          ...r4Output(dub),
          style: r4Output(dub).style.replace(/sub-bass/gi, "generic texture"),
        },
        dub,
      ),
    /core instrumental identity/,
  );
  const urban = dna.prepare(brief("R4-04"), actor);
  assert.match(urban.profile.drums_percussion, /dancehall/);
  assert.match(urban.profile.instruments.other, /Nyabinghi/);
  for (const pattern of [/sub-bass/gi, /nyabinghi/gi, /cinematic/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...r4Output(urban),
            style: r4Output(urban).style.replace(pattern, "generic texture"),
          },
          urban,
        ),
      /core instrumental identity/,
    );
  assert.match(
    dna.prepare(brief("R4-03"), actor).profile.production_mix,
    /forced political lyrics/,
  );
  assert.match(
    dna.prepare(brief("R4-05"), actor).profile.vocal_delivery,
    /never forced for a single voice/,
  );
});
test("R4 selector and musical fingerprints remain separate from R1–R3 and earlier African groups", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Reggae and Caribbean / Contemporary Conscious Reggae">';
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R[123]|S\d+)-/.test(segment));
  for (const group of ["R1", "R2", "R3"])
    assert(
      html.indexOf('value="' + group + '-05"') < html.indexOf('value="R4-01"'),
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
    registry.styles.filter((s) => !s.id.startsWith("R4-")).map(core),
  );
  for (const [id] of cases)
    assert(!earlier.has(core(registry.styles.find((x) => x.id === id))));
});
