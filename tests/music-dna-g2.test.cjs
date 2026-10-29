"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  dna = require("../lib/music-dna"),
  catalogue = require("../config/music-dna.json"),
  { handler } = require("./lyrics-handler-fixture.cjs"),
  { g2Output } = require("./music-dna-g2-output.cjs");
const cases = [
  ["G2-01", "Upper Room Prayer", 55, 72],
  ["G2-02", "Revival Fire Chant", 76, 105],
  ["G2-03", "River of Worship", 68, 90],
  ["G2-04", "Prophetic Declaration", 65, 92],
  ["G2-05", "Sacred Prayer Symphony", 58, 80],
];
require("./music-dna-group-contract.cjs")({
  group: "G2",
  category_id: "gospel-g2",
  cases,
  validOutput: g2Output,
  topic: "Original prayer about renewed devotion, hope and perseverance",
});
const actor = { artistId: 7, requestKey: "qa-g2-integration-request-0001" },
  brief = (id) => ({
    musicDnaStyle: id,
    musicDnaLanguages: ["en", "ha"],
    voice: "duet",
    idea: "Original prayer about renewed devotion, hope and perseverance",
  });
test("G2 keeps all five supplied names, tempos, research boundaries and distinct core instruments", () => {
  const c = dna.catalogue(),
    styles = c.styles.filter((s) => s.id.startsWith("G2-"));
  assert.deepEqual(
    styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(
    c.categories.find((x) => x.group_id === "G2").name,
    "Revival Prayer & Prophetic Chants",
  );
  assert(c.coverage.supplied_research_groups.includes("G2"));
  assert.equal(c.coverage.expected_research_groups, 43);
  const p = (id) => dna.prepare(brief(id), actor).profile;
  assert(/free.time/.test(p("G2-01").rhythm));
  assert(p("G2-01").instruments.other.includes("drones"));
  assert(p("G2-02").drums_percussion.includes("tom"));
  assert(p("G2-03").instruments.guitar.includes("Electric guitar"));
  assert(p("G2-04").vocal_delivery.includes("spoken"));
  assert(p("G2-04").lyrics.vocabulary.includes("recognizable sermon"));
  assert(
    p("G2-05").instruments.other.includes("cinematic instrumental interlude"),
  );
  assert.equal(
    new Set(
      cases.map(([id]) =>
        JSON.stringify([p(id).rhythm, p(id).instruments, p(id).arrangement]),
      ),
    ).size,
    5,
  );
  for (const s of catalogue.styles.filter((s) => s.id.startsWith("G2-"))) {
    const serialized =
      JSON.stringify(c) + dna.instructions(dna.prepare(brief(s.id), actor));
    for (const ref of [
      ...s.research_references,
      ...(s.internal_research_context ? [s.internal_research_context] : []),
    ])
      assert(!serialized.includes(ref));
  }
});
test("prayer outputs reject positive club treatment, preserve negative avoidance instructions and prevent excessive chant loops", () => {
  for (const [id] of cases) {
    const context = dna.prepare(brief(id), actor),
      out = g2Output(context);
    dna.validateOutput(out, context);
    for (const addition of [
      "Add nightclub production.",
      "Use a club-ready beat.",
      "Add party dance energy.",
      "Use an EDM drop.",
      "Not only nightclub production, but a club beat.",
    ])
      assert.throws(
        () =>
          dna.validateOutput(
            { ...out, style: out.style + " " + addition },
            context,
          ),
        /fixed atmosphere/,
      );
    dna.validateOutput(
      {
        ...out,
        style:
          out.style +
          " No nightclub production; avoid club-ready beats; never add party-dance energy. Don’t add nightclub percussion.",
      },
      context,
    );
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...out,
            lyrics: "[Chant]\n" + Array(5).fill("Renew my heart!").join("\n"),
          },
          context,
        ),
      /repeats an identical line/,
    );
    dna.validateOutput(
      {
        ...out,
        lyrics:
          "[Refrain]\n" +
          Array(4).fill("Renew my heart").join("\n") +
          "\n[Verse]\nWe persevere in hope and devotion.\n[Refrain]\nRenew my heart",
      },
      context,
    );
  }
});
test("original declaration safeguards reject personal predictions and guaranteed outcomes, not ordinary faith or explicit refusals", () => {
  const context = dna.prepare(brief("G2-04"), actor),
    out = g2Output(context);
  for (const lyrics of [
    "I prophesy you will receive wealth tomorrow.",
    "God told me that you will become rich.",
    "I guarantee your breakthrough.",
    "You receive guaranteed healing.",
  ])
    assert.throws(
      () => dna.validateOutput({ ...out, lyrics }, context),
      /personal prophecy|guaranteed outcome/,
    );
  for (const lyrics of [
    "We hope and persevere; God is faithful.",
    "Do not promise guaranteed wealth.",
    "Never offer guaranteed healing.",
    "We cannot offer guaranteed healing.",
    "We don’t promise guaranteed wealth.",
  ])
    dna.validateOutput({ ...out, lyrics }, context);
});
test("G2 content failures restore the existing reservation once and never complete a bad output", async () => {
  const context = dna.prepare(brief("G2-04"), actor),
    out = g2Output(context);
  for (const response of [
    { ...out, style: out.style + " Add nightclub production." },
    { ...out, lyrics: "I prophesy you will become rich." },
    { ...out, lyrics: Array(5).fill("Renew my heart").join("\n") },
  ]) {
    const r = await handler({
      payload: brief("G2-04"),
      engine: dna,
      actor,
      response,
    });
    assert.equal(r.result.status, 502);
    assert.deepEqual(r.counts, { reserve: 1, complete: 0, refund: 1, post: 1 });
    assert(r.result.data.error.includes("credit was restored"));
  }
});
test("G2 headings remain nonselectable and unsupplied IDs cannot generate", async () => {
  const c = dna.catalogue();
  assert.equal(c.styles.filter((s) => s.id.startsWith("G2-")).length, 5);
  assert(!c.categories.some((x) => x.group_id === "UNSUPPLIED99"));
  assert.throws(() =>
    dna.prepare({ ...brief("G2-01"), musicDnaStyle: "gospel-g2" }, actor),
  );
  const ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    ),
    html = ui.musicDNAControls(c, String);
  for (const [id, name] of cases)
    assert(html.includes('<option value="' + id + '">' + name + "</option>"));
  assert(!html.includes('<option value="gospel-g2"'));
});

test("malformed prayer quality rules cannot silently disable validation", () => {
  for (const mutate of [
    (s) => (s.production_exclusions = "nightclub"),
    (s) => (s.lyric_rules.max_consecutive_repeated_lines = 0),
    (s) => (s.lyric_rules.avoid_guaranteed_outcomes = "yes"),
    (s) => (s.lyric_rules.unreviewed_override = true),
  ]) {
    const c = structuredClone(catalogue);
    mutate(c.styles.find((s) => s.id === "G2-04"));
    assert.throws(() => dna.createEngine(c));
  }
});
