"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { w8Output } = require("./music-dna-w8-output.cjs");
const cases = [
  ["W8-01", "Appalachian Golden Country", 84, 116],
  ["W8-02", "Nashville Storyteller Country", 72, 102],
  ["W8-03", "Southern Blues Country Fire", 76, 108],
  ["W8-04", "Modern Country Power Anthem", 88, 118],
  ["W8-05", "Fireside Acoustic Folk", 64, 96],
];
require("./music-dna-group-contract.cjs")({
  group: "W8",
  category_id: "western-w8",
  cases,
  validOutput: w8Output,
  topic: "An original country story about friendship and rebuilding confidence",
});
const actor = { artistId: 7, requestKey: "qa-w8-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("W8 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "W8");
  assert.deepEqual(cat, {
    id: "western-w8",
    name: "Country & Acoustic Storytelling",
    department_id: "western-international",
    group_id: "W8",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Traditional country with bright acoustic guitar, fiddle, mandolin and warm storytelling.",
    "Classic country-pop with expressive piano, pedal steel and mature life stories.",
    "Powerful country-blues with thick bass, soulful electric guitar and live drums.",
    "Contemporary country-rock with strong drums, deep bass and uplifting choruses.",
    "Intimate acoustic folk-country with fingerpicked guitar, warm bass and personal storytelling.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = ui.musicDNAControls(c, String);
  assert(
    html.includes(
      '<optgroup label="Western and International / Country & Acoustic Storytelling">',
    ),
  );
  assert(!html.includes('<option value="western-w8"'));
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
  assert(html.indexOf('value="W8-01"') > html.indexOf('value="W7-05"'));
});
test("W8 five country fingerprints preserve specific acoustic/electric/bass/drum/fiddle/steel instructions", () => {
  const identities = new Set(),
    markers = [
      ["appalachian", "root-fifth", "banjo"],
      ["nashville", "pedal steel", "harmonica"],
      ["country-blues", "hammond", "shuffle"],
      ["country-rock", "fiddle", "cymbal"],
      ["folk-country", "arpeggios", "cello"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = w8Output(c);
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
    for (const key of [
      "rhythm",
      "drums_percussion",
      "bass",
      "arrangement",
      "production_mix",
    ])
      assert(dna.instructions(c).includes(s[key]));
    for (const pattern of [
      /electric bass|upright bass|acoustic bass/gi,
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
    const contrast = dna.prepare(brief(cases[[1, 2, 3, 4, 0][i]][0]), actor);
    assert.throws(
      () => dna.validateOutput({ ...out, style: w8Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("W8 supported languages remain independent and unsupported custom codes are rejected", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    for (const languages of [
      ["en"],
      ["en", "pcm"],
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
  assert.throws(() =>
    dna.prepare(
      { ...brief("W8-01"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("W8 embedded moods and independent voices do not force country accents, rasp, gender or high pitch", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated club dance",
        beat: "generic electronic dance groove",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic electronic dance groove"));
    assert.throws(() =>
      dna.validateOutput(
        { ...w8Output(c), dna_mood: "Unrelated club dance" },
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
    dna.prepare(brief("W8-01"), actor).profile.vocal_delivery,
    /never force a regional accent/,
  );
  assert.match(
    dna.prepare(brief("W8-03"), actor).profile.vocal_delivery,
    /never force vocal rasp/,
  );
  assert.match(
    dna.prepare(brief("W8-04"), actor).profile.vocal_delivery,
    /never force a high register/,
  );
});
test("W8 topic control, natural bass alternatives and country instrument techniques remain explicit", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic as authoritative/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Faith themes apply only when requested/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /Respect single-singer, duet and supported harmony settings/,
    );
    assert.match(
      c.profile.production_mix,
      /rather than generic Western pop over electronic drums/,
    );
  }
  assert.match(dna.prepare(brief("W8-01"), actor).profile.bass, /root-fifth/);
  assert.match(
    dna.prepare(brief("W8-02"), actor).profile.instruments.guitar,
    /pedal steel/,
  );
  assert.match(
    dna.prepare(brief("W8-03"), actor).profile.drums_percussion,
    /shuffle/,
  );
  const fireside = dna.prepare(brief("W8-05"), actor);
  for (const pattern of [/fingerpick/gi, /brushed snare/gi, /arpeggio/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...w8Output(fireside),
            style: w8Output(fireside).style.replace(pattern, "generic texture"),
          },
          fireside,
        ),
      /core instrumental identity/,
    );
  for (const [id, phrase, options] of [
    [
      "W8-01",
      "upright bass or electric bass",
      ["upright bass", "electric bass"],
    ],
    [
      "W8-05",
      "upright bass or acoustic bass",
      ["upright bass", "acoustic bass"],
    ],
  ]) {
    const c = dna.prepare(brief(id), actor),
      out = w8Output(c);
    for (const bass of options)
      dna.validateOutput({ ...out, style: out.style.replace(phrase, bass) }, c);
  }
});
test("W8 stays separate from W1–W7 and earlier departments with all prior options and no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = ui.musicDNAControls(c, String),
    label =
      '<optgroup label="Western and International / Country & Acoustic Storytelling">';
  assert(html.includes(label));
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:W[1234567]|R\d+|G\d+|S\d+)-/.test(segment));
  assert(
    !/<(?:select|input)[^>]*name=["'](?:mood|musicDnaMood)["']/i.test(html),
  );
  const core = (s) =>
    JSON.stringify([
      s.rhythm,
      s.drums_percussion,
      s.bass,
      s.instruments,
      s.arrangement,
    ]);
  const earlier = registry.styles.filter((s) => !s.id.startsWith("W8-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (let n = 1; n <= 7; n++)
    assert(
      html.indexOf('value="W' + n + '-05"') < html.indexOf('value="W8-01"'),
    );
});
test("Completed registry contains 43 groups and 215 individually selectable unique styles across four departments", async () => {
  const c = dna.catalogue(),
    expected = [
      ["gospel", "G", 14],
      ["secular-afrobeats", "S", 14],
      ["reggae-caribbean", "R", 7],
      ["western-international", "W", 8],
    ],
    ids = [];
  assert.equal(c.categories.length, 43);
  assert.equal(c.styles.length, 215);
  for (const [department, prefix, count] of expected) {
    const groups = c.categories.filter((x) => x.department_id === department);
    assert.deepEqual(
      groups.map((x) => x.group_id),
      Array.from({ length: count }, (_, i) => prefix + (i + 1)),
    );
    for (const cat of groups) {
      const expectedIds = Array.from(
        { length: 5 },
        (_, i) => cat.group_id + "-" + String(i + 1).padStart(2, "0"),
      );
      const styles = c.styles.filter((s) => s.category_id === cat.id);
      assert.deepEqual(
        styles.map((s) => s.id),
        expectedIds,
      );
      for (const s of styles) assert.equal(s.department_id, department);
      ids.push(...expectedIds);
    }
  }
  assert.equal(new Set(ids).size, 215);
  const ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    ),
    html = ui.musicDNAControls(c, String);
  assert.deepEqual(
    [...html.matchAll(/<option value="([GSRW]\d+-\d{2})">/g)].map((m) => m[1]),
    ids,
  );
  assert.equal((html.match(/<optgroup /g) || []).length, 43);
  for (const cat of c.categories)
    assert(!html.includes('<option value="' + cat.id + '"'));
});
