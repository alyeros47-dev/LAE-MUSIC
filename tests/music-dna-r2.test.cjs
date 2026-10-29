"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r2Output } = require("./music-dna-r2-output.cjs");
const cases = [
  ["R2-01", "African Freedom Reggae", 72, 94],
  ["R2-02", "West African Reggae Fire", 76, 100],
  ["R2-03", "African Conscious Roots", 70, 92],
  ["R2-04", "Nigerian Reggae Thunder", 72, 98],
  ["R2-05", "African Sunrise Reggae", 78, 104],
];
require("./music-dna-group-contract.cjs")({
  group: "R2",
  category_id: "reggae-r2",
  cases,
  validOutput: r2Output,
  topic:
    "An original roots reggae story about friendship and everyday resilience, without religious or political themes",
});
const actor = { artistId: 7, requestKey: "qa-r2-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R2 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R2");
  assert.deepEqual(cat, {
    id: "reggae-r2",
    name: "African Roots Reggae",
    department_id: "reggae-caribbean",
    group_id: "R2",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Emotional South African roots reggae with deep rolling bass and powerful melodies.",
    "Energetic West African reggae with bright guitar, strong bass and lively percussion.",
    "Deep, serious roots reggae with hypnotic bass and purposeful African rhythms.",
    "Soulful Nigerian reggae with heavy bass, expressive guitar and live percussion.",
    "Uplifting Ghanaian roots reggae with Highlife guitar and warm African percussion.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(
    html.includes(
      '<optgroup label="Reggae & Caribbean Music / African Roots Reggae">',
    ),
  );
  assert(!html.includes('<option value="reggae-r2"'));
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
  assert(html.indexOf('value="R2-01"') > html.indexOf('value="R1-05"'));
});
test("R2 distinct regional identities preserve roots bass/guitar/organ and reject instrumental omissions", () => {
  const identities = new Set(),
    markers = [
      ["south african", "beat three", "rolling"],
      ["ivorian", "brass", "djembe"],
      ["hypnotic", "balafon", "measured"],
      ["nigerian", "talking-drum", "blues"],
      ["ghanaian", "highlife", "shekere"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      out = r2Output(c),
      s = c.profile;
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
    const contrast = dna.prepare(brief(cases[(i + 1) % 5][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: r2Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("R2 supported languages remain independent and Twi is neither silently enabled nor forced", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(
      base.profile.lyrics.vocabulary,
      /Never force a regional language/,
    );
    for (const languages of [
      ["en"],
      ["fr"],
      ["pcm"],
      ["en", "fr"],
      ["en", "pcm"],
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
  assert(!dna.catalogue().languages.some((x) => x.id === "tw"));
  assert.throws(() =>
    dna.prepare({ ...brief("R2-05"), musicDnaLanguages: ["tw"] }, actor),
  );
});
test("R2 fixed mood and independent voice settings do not alter regional instrumental identity", () => {
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
        { ...r2Output(c), dna_mood: "Unrelated party mood" },
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
test("R2 topic control, clean bass and regional foundations remain explicit without forced beliefs or ensemble vocals", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(c.profile.lyrics.structure, /Follow the customer song topic/);
    assert.match(
      c.profile.lyrics.vocabulary,
      /Never force a regional language, political, religious or Rastafarian content/,
    );
    assert.match(c.profile.production_mix, /without overpowering/);
    assert.match(
      c.profile.production_mix,
      /not as random instrumental decoration/,
    );
  }
  const conscious = dna.prepare(brief("R2-03"), actor).profile;
  assert.match(
    conscious.vocal_delivery,
    /customer topic determines the message/,
  );
  assert.match(conscious.instruments.other, /balafon/);
  assert.match(
    dna.prepare(brief("R2-04"), actor).profile.instruments.other,
    /Talking-drum/,
  );
  const sunrise = dna.prepare(brief("R2-05"), actor).profile;
  assert.match(sunrise.instruments.guitar, /Highlife/);
  assert.match(sunrise.vocal_delivery, /never forced for a single voice/);
});
test("R2 remains separate from R1 and earlier African groups in configuration and rendered selection", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label = '<optgroup label="Reggae & Caribbean Music / African Roots Reggae">';
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R1|S\d+)-/.test(segment));
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = new Set(
    registry.styles.filter((s) => !s.id.startsWith("R2-")).map(core),
  );
  for (const [id] of cases)
    assert(!earlier.has(core(registry.styles.find((x) => x.id === id))));
  assert.match(
    registry.styles.find((x) => x.id === "R1-01").rhythm,
    /Jamaican/,
  );
  assert.match(
    registry.styles.find((x) => x.id === "R2-01").rhythm,
    /South African/,
  );
});
