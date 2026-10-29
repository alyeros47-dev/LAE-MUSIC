"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  registry = require("../config/music-dna.json"),
  { r7Output } = require("./music-dna-r7-output.cjs");
const cases = [
  ["R7-01", "Kingdom Roots Worship", 72, 96],
  ["R7-02", "Gospel Dancehall Victory", 94, 116],
  ["R7-03", "Street Testimony Reggae", 88, 108],
  ["R7-04", "Heavenly Reggae Soul", 68, 92],
  ["R7-05", "African Gospel Reggae Fire", 76, 102],
];
require("./music-dna-group-contract.cjs")({
  group: "R7",
  category_id: "reggae-r7",
  cases,
  validOutput: r7Output,
  topic:
    "An original Christian gospel reggae song about gratitude and hope during difficult times",
});
const actor = { artistId: 7, requestKey: "qa-r7-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en"],
  voice: "neutral",
  idea: "An original story of friendship and everyday life without imposed beliefs",
});
test("R7 exact public labels/descriptions, nonselectable heading, and private research references", async () => {
  const c = dna.catalogue(),
    cat = c.categories.find((x) => x.group_id === "R7");
  assert.deepEqual(cat, {
    id: "reggae-r7",
    name: "Reggae Gospel",
    department_id: "reggae-caribbean",
    group_id: "R7",
  });
  assert.deepEqual(
    c.styles.filter((x) => x.category_id === cat.id).map((x) => [x.id, x.name]),
    cases.map(([id, name]) => [id, name]),
  );
  const descriptions = [
    "Live-band Jamaican gospel reggae with deep bass, one-drop drums and uplifting worship.",
    "Energetic Caribbean gospel dancehall with heavy bass and joyful praise rhythms.",
    "Powerful reggae-dancehall fusion with rhythmic storytelling and Christian testimony.",
    "Soulful gospel lovers rock with warm piano, deep bass and heartfelt worship.",
    "Nigerian gospel reggae with powerful bass, African percussion and uplifting praise.",
  ];
  const ui = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/music-dna.js").toString("base64")
  );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(
    html.includes('<optgroup label="Reggae & Caribbean Music / Reggae Gospel">'),
  );
  assert(!html.includes('<option value="reggae-r7"'));
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
  assert(html.indexOf('value="R7-01"') > html.indexOf('value="R6-05"'));
});
test("R7 five gospel reggae identities preserve specific bass/drums/guitar/keys and reject missing core terms", () => {
  const identities = new Set(),
    markers = [
      ["beat three", "live jamaican", "worship bridge"],
      ["synth plucks", "sub-bass", "praise bridge"],
      ["organic", "blues", "testimony"],
      ["rhodes", "acoustic guitar", "comforting"],
      ["nigerian", "talking-drum", "shekere"],
    ];
  for (const [i, [id]] of cases.entries()) {
    const c = dna.prepare(brief(id), actor),
      s = c.profile,
      out = r7Output(c);
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
      /electric bass|electronic sub-bass/gi,
      /guitar/gi,
      /organ/gi,
      /kick/gi,
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
      () => dna.validateOutput({ ...out, style: r7Output(contrast).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("R7 supported languages remain independent without forced Patois, Pidgin or regional accent", () => {
  for (const [id] of cases) {
    const base = dna.prepare({ ...brief(id), musicDnaLanguages: [] }, actor);
    assert.deepEqual(base.languages, []);
    assert.match(
      base.profile.lyrics.vocabulary,
      /Never force Jamaican Patois, Nigerian Pidgin or a regional accent/,
    );
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
    dna.prepare({ ...brief("R7-01"), musicDnaLanguages: ["jam"] }, actor),
  );
  assert.throws(() =>
    dna.prepare(
      { ...brief("R7-05"), musicDnaLanguages: ["unsupported-custom-language"] },
      actor,
    ),
  );
});
test("R7 embedded moods and independent voices never require a deejay persona or fixed lead gender", () => {
  for (const [id] of cases) {
    const c = dna.prepare(
      {
        ...brief(id),
        mood: "Unrelated secular nightclub",
        beat: "generic Afrobeats club",
      },
      actor,
    );
    assert(!dna.instructions(c).includes("generic Afrobeats club"));
    assert.throws(() =>
      dna.validateOutput(
        { ...r7Output(c), dna_mood: "Unrelated secular nightclub" },
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
    dna.prepare(brief("R7-02"), actor).profile.vocal_delivery,
    /only when compatible with the requested performance/,
  );
  assert.match(
    dna.prepare(brief("R7-04"), actor).profile.vocal_delivery,
    /any customer-selected voice/,
  );
});
test("R7 Christian topic guidance and regional rhythmic differences remain explicit and vocal-friendly", () => {
  for (const [id] of cases) {
    const c = dna.prepare(brief(id), actor);
    assert.match(
      c.profile.lyrics.structure,
      /customer song topic while retaining Christian gospel character/,
    );
    assert.match(
      c.profile.lyrics.vocabulary,
      /without empty repetition or guaranteed individual outcomes/,
    );
    assert.match(c.profile.production_mix, /without masking kick or vocals/);
  }
  const dance = dna.prepare(brief("R7-02"), actor),
    street = dna.prepare(brief("R7-03"), actor);
  assert.match(dance.profile.drums_percussion, /dancehall riddim/);
  assert(!/one-drop/i.test(dance.profile.drums_percussion));
  assert.match(street.profile.bass, /more organic and roots-oriented/);
  assert.match(
    street.profile.lyrics.structure,
    /beginning, struggle, turning point and encouraging conclusion/,
  );
  const african = dna.prepare(brief("R7-05"), actor);
  assert.match(african.profile.instruments.guitar, /Highlife/);
  assert.match(african.profile.drums_percussion, /Nigerian percussion/);
  for (const pattern of [/talking-drum/gi, /shekere/gi])
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...r7Output(african),
            style: r7Output(african).style.replace(pattern, "generic texture"),
          },
          african,
        ),
      /core instrumental identity/,
    );
});
test("R7 remains separate from secular reggae and Gospel groups, with all earlier styles accessible and no mood selector", async () => {
  const c = dna.catalogue(),
    ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    );
  const html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String),
    label = '<optgroup label="Reggae & Caribbean Music / Reggae Gospel">';
  const segment = html.slice(
    html.indexOf(label),
    html.indexOf("</optgroup>", html.indexOf(label)),
  );
  assert.equal((segment.match(/<option /g) || []).length, 5);
  assert(!/value="(?:R[123456]|G\d+|S\d+)-/.test(segment));
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
  const earlier = registry.styles.filter((s) => !s.id.startsWith("R7-")),
    cores = new Set(earlier.map(core));
  for (const [id] of cases)
    assert(!cores.has(core(registry.styles.find((x) => x.id === id))));
  for (const s of earlier)
    assert(
      html.includes('<option value="' + s.id + '">' + s.name + "</option>"),
      s.id,
    );
  for (let n = 1; n <= 6; n++)
    assert(
      html.indexOf('value="R' + n + '-05"') < html.indexOf('value="R7-01"'),
    );
});
test("Reggae registration completeness: R1–R7 contain 35 unique individually selectable styles in numeric order", async () => {
  const c = dna.catalogue(),
    groups = c.categories.filter((x) => x.department_id === "reggae-caribbean");
  assert.deepEqual(
    groups.map((x) => x.group_id),
    ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
  );
  const ids = [];
  for (const cat of groups) {
    const actual = c.styles.filter((s) => s.category_id === cat.id),
      expected = Array.from(
        { length: 5 },
        (_, n) => cat.group_id + "-" + String(n + 1).padStart(2, "0"),
      );
    assert.deepEqual(
      actual.map((s) => s.id),
      expected,
    );
    for (const s of actual) assert.equal(s.department_id, "reggae-caribbean");
    ids.push(...expected);
  }
  assert.equal(ids.length, 35);
  assert.equal(new Set(ids).size, 35);
  const ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    ),
    html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert.deepEqual(
    [...html.matchAll(/<option value="(R\d+-\d{2})">/g)].map((m) => m[1]),
    ids,
  );
  assert.equal(
    (html.match(/<optgroup label="Reggae & Caribbean Music \//g) || []).length,
    7,
  );
  for (const cat of groups)
    assert(!html.includes('<option value="' + cat.id + '"'));
  assert.equal(c.styles.filter((s) => s.department_id === "gospel").length, 70);
});
