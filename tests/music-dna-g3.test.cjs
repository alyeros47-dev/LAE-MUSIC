"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  dna = require("../lib/music-dna"),
  catalogue = require("../config/music-dna.json"),
  { g3Output } = require("./music-dna-g3-output.cjs"),
  { handler } = require("./lyrics-handler-fixture.cjs");
const cases = [
  ["G3-01", "Overflowing Praise", 96, 118],
  ["G3-02", "Graceful Victory", 82, 108],
  ["G3-03", "Kingdom Celebration", 112, 132],
  ["G3-04", "Heart of Gratitude", 70, 92],
  ["G3-05", "Radiant Hope", 78, 102],
];
require("./music-dna-group-contract.cjs")({
  group: "G3",
  category_id: "gospel-g3",
  cases,
  validOutput: g3Output,
  topic: "An original testimony of gratitude, hope and divine faithfulness",
});
const actor = { artistId: 7, requestKey: "qa-g3-integration-request-0001" },
  brief = (id) => ({
    musicDnaStyle: id,
    musicDnaLanguages: ["en"],
    voice: "neutral",
    idea: "An original testimony of gratitude and hope",
  });
test("G3 uses the exact five supplied names and nonselectable category with private research references", async () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G3-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((x) => x.group_id === "G3").name,
    "Contemporary Gospel Praise",
  );
  assert.equal(c.coverage.expected_research_groups, 43);
  assert(c.coverage.supplied_research_groups.includes("G3"));
  const ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    ),
    html = require("./music-dna-ui-projection.cjs").allViews(ui, c, String);
  assert(!html.includes('<option value="gospel-g3"'));
  assert.throws(() =>
    dna.prepare({ ...brief("G3-01"), musicDnaStyle: "gospel-g3" }, actor),
  );
  for (const [id, name] of cases) {
    assert(html.includes('<option value="' + id + '">' + name + "</option>"));
    const s = catalogue.styles.find((s) => s.id === id);
    assert(s.description.length > 20 && s.description.length <= 240);
    for (const ref of s.research_references) {
      assert(!JSON.stringify(c).includes(ref));
      assert(!dna.instructions(dna.prepare(brief(id), actor)).includes(ref));
    }
  }
});
test("celebratory Afro-Gospel remains danceable without inheriting G2 prayer restrictions", () => {
  const c = dna.prepare(brief("G3-03"), actor),
    out = g3Output(c);
  assert(c.profile.mood.includes("Energetic"));
  assert(c.profile.arrangement.includes("dance passage"));
  assert(!c.profile.production_exclusions.includes("party-dance"));
  dna.validateOutput(
    { ...out, style: out.style + " Joyful celebratory dance energy." },
    c,
  );
  assert.throws(
    () =>
      dna.validateOutput(
        { ...out, style: out.style + " Nightclub production." },
        c,
      ),
    /fixed atmosphere/,
  );
  const ballad = dna.prepare(brief("G3-04"), actor);
  assert(ballad.profile.mood.includes("Heartfelt"));
  assert.throws(() =>
    dna.validateOutput(
      { ...g3Output(ballad), dna_mood: c.profile.mood },
      ballad,
    ),
  );
});
test("G3 identities and complete production instructions remain distinct across all five styles", () => {
  const identities = new Set();
  for (let i = 0; i < cases.length; i++) {
    const c = dna.prepare(brief(cases[i][0]), actor),
      out = g3Output(c);
    dna.validateOutput(out, c);
    identities.add(
      JSON.stringify([
        c.profile.rhythm,
        c.profile.instruments,
        c.profile.arrangement,
      ]),
    );
    assert(out.style.length <= 950);
    assert(dna.instructions(c).includes(c.profile.production_mix));
    const neighbor = dna.prepare(
      brief(cases[(i + 1) % cases.length][0]),
      actor,
    );
    assert.throws(
      () => dna.validateOutput({ ...out, style: g3Output(neighbor).style }, c),
      /core instrumental identity/,
    );
  }
  assert.equal(identities.size, 5);
});
test("unspecified language never forces Pidgin and supported multilingual combinations retain the instrumental identity", () => {
  const base = dna.prepare({ ...brief("G3-05"), musicDnaLanguages: [] }, actor);
  assert.deepEqual(base.languages, []);
  for (const languages of [
    ["pcm"],
    ["en", "pcm"],
    ["en", "yo"],
    ["en", "ig"],
    ["en", "ha"],
    ["fr", "yo"],
  ]) {
    const c = dna.prepare(
      { ...brief("G3-05"), musicDnaLanguages: languages },
      actor,
    );
    assert.deepEqual(c.profile, base.profile);
    assert.deepEqual(c.languages, languages);
    assert.equal(c.variation_id, base.variation_id);
  }
});
test("invalid G3 production prompts restore one reservation while successful requests complete once", async () => {
  const c = dna.prepare(brief("G3-03"), actor),
    r = await handler({
      payload: brief("G3-03"),
      engine: dna,
      actor,
      response: {
        ...g3Output(c),
        style: g3Output(c).style + " Nightclub production.",
      },
    });
  assert.equal(r.result.status, 502);
  assert.deepEqual(r.counts, { reserve: 1, complete: 0, refund: 1, post: 1 });
});
