"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const dna = require("../lib/music-dna"),
  catalogue = require("../config/music-dna.json"),
  { handler } = require("./lyrics-handler-fixture.cjs"),
  { output } = require("./music-dna-fixture.cjs");
const cases = [
  ["G1-01", "Glory Trumpet Worship", 68, 82],
  ["G1-02", "Heavenly Fire Worship", 78, 105],
  ["G1-03", "Broken Before You", 58, 76],
  ["G1-04", "Altar Encounter", 55, 78],
  ["G1-05", "Intimate Acoustic Worship", 62, 88],
];
const refs = catalogue.styles.flatMap((s) => s.research_references || []);
const { g1Output: validOutput } = require("./music-dna-g1-output.cjs");
const actor = { artistId: 7, requestKey: "qa-g1-integration-request-0001" };
const brief = (id) => ({
  musicDnaStyle: id,
  musicDnaLanguages: ["en", "yo"],
  voice: "neutral",
  idea: "An original personal prayer of hope and gratitude",
});
for (const [id, name, min, max] of cases) {
  test(
    id +
      " retains its supplied musical identity, mood and independently selectable voices/languages",
    () => {
      const source = catalogue.styles.find((s) => s.id === id),
        base = dna.prepare(brief(id), actor);
      assert.equal(source.name, name);
      assert.equal(source.category_id, "gospel-g1");
      assert.deepEqual(source.tempo, { min, max });
      assert.equal(base.profile.mood, source.mood);
      assert.equal(base.profile.energy, source.energy);
      assert(
        !/\b(male|female|tenor|baritone|alto|soprano)\b/i.test(
          source.vocal_delivery,
        ),
      );
      for (const voice of ["neutral", "male", "female", "duet", "custom"])
        for (const languages of [
          ["en"],
          ["pcm"],
          ["yo"],
          ["ig"],
          ["ha"],
          ["fr"],
          ["en", "yo"],
          ["en", "pcm", "ig"],
        ]) {
          const x = dna.prepare(
            {
              ...brief(id),
              voice,
              musicDnaLanguages: languages,
              mood: "Party dance",
              beat: "party club beat",
            },
            actor,
          );
          assert.deepEqual(x.profile, base.profile);
          assert.deepEqual(x.choices, base.choices);
          assert.equal(x.tempo, base.tempo);
          assert.deepEqual(x.languages, languages);
          assert.equal(x.voice, voice);
          assert(x.tempo >= min && x.tempo <= max);
          assert(!JSON.stringify(x).includes("Party dance"));
        }
      const varied = new Set();
      for (let n = 0; n < 24; n++) {
        const x = dna.prepare(brief(id), {
          artistId: n + 10,
          requestKey: "qa-g1-variation-request-" + n,
        });
        assert(x.tempo >= min && x.tempo <= max);
        for (const [k, v] of Object.entries(x.choices))
          assert(source.variations[k].includes(v));
        varied.add(JSON.stringify([x.tempo, x.choices]));
      }
      assert(varied.size > 1);
      assert.equal(
        dna.prepare(brief(id), actor).variation_id,
        base.variation_id,
      );
    },
  );
  test(
    id +
      " reaches the actual existing lyrics handler with one mocked provider request and one credit reservation",
    async () => {
      const context = dna.prepare(brief(id), actor),
        response = validOutput(context);
      assert(response.style.length <= 950);
      const x = await handler({
        payload: {
          ...brief(id),
          model:
            id === "G1-02" || id === "G1-04" ? "gpt-6-astra" : "gpt-6.1-sol",
        },
        engine: dna,
        actor,
        response,
      });
      assert.equal(x.result.status, 200);
      assert.deepEqual(x.counts, {
        reserve: 1,
        complete: 1,
        refund: 0,
        post: 1,
      });
      assert.equal(x.result.data.music_dna.style_id, id);
      assert.equal(x.reserved.musicDnaStyle, id);
      assert.equal(x.reserved.musicDnaRevision, catalogue.revision);
      assert.equal(
        x.request.model,
        id === "G1-02" || id === "G1-04" ? "gpt-6-astra" : "gpt-6.1-sol",
      );
      const system = x.request.input[0].content,
        user = JSON.parse(x.request.input[1].content);
      assert(system.includes(sourceField(id, "rhythm")));
      assert(system.includes(sourceField(id, "arrangement")));
      assert.equal(user.musicDna.profile.mood, context.profile.mood);
      assert.equal(user.idea, brief(id).idea);
      assert(!Object.hasOwn(user, "beat"));
      assert(!Object.hasOwn(user, "mood"));
      for (const ref of refs) {
        assert(!system.includes(ref));
        assert(!JSON.stringify(user).includes(ref));
        assert(!JSON.stringify(x.result.data).includes(ref));
      }
    },
  );
}
function sourceField(id, k) {
  return catalogue.styles.find((s) => s.id === id)[k];
}
test("G1 instrument and arrangement invariants distinguish all five supplied styles", () => {
  const p = (id) => dna.prepare(brief(id), actor).profile;
  assert(p("G1-01").instruments.other.includes("trumpet interlude"));
  assert(p("G1-01").rhythm.includes("4/4"));
  assert(p("G1-02").drums_percussion.includes("controlled fills"));
  assert(p("G1-02").arrangement.includes("full-band worship climax"));
  assert(p("G1-03").arrangement.includes("without becoming a dance song"));
  assert(p("G1-03").instruments.other.includes("Warm strings"));
  assert(/free.time/.test(p("G1-04").rhythm));
  assert(p("G1-04").arrangement.includes("instrumental space"));
  assert(
    p("G1-05").instruments.guitar.includes("Fingerpicked acoustic guitar"),
  );
  assert(
    p("G1-05").arrangement.includes("short acoustic instrumental passage"),
  );
  assert.equal(
    new Set(
      cases.map(([id]) =>
        JSON.stringify([p(id).rhythm, p(id).instruments, p(id).arrangement]),
      ),
    ).size,
    5,
  );
});
test("G1 public names/descriptions are exact, research references stay internal and category headings cannot generate", async () => {
  const c = dna.catalogue();
  assert.deepEqual(
    c.styles.map((s) => [s.id, s.name]),
    cases.map(([id, name]) => [id, name]),
  );
  assert.equal(c.categories[0].name, "Deep Worship & Spiritual Encounter");
  assert.deepEqual(c.coverage.supplied_research_groups, ["G1"]);
  assert.equal(c.coverage.expected_research_groups, 43);
  for (const s of c.styles)
    assert(s.description.length > 20 && s.description.length <= 240);
  for (const ref of refs) assert(!JSON.stringify(c).includes(ref));
  assert.throws(
    () => dna.prepare({ ...brief("G1-01"), musicDnaStyle: "gospel-g1" }, actor),
    (e) => e.status === 400,
  );
  const ui = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/music-dna.js").toString("base64")
    ),
    html = ui.musicDNAControls(c, (s) =>
      String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;"),
    );
  assert.equal((html.match(/<optgroup /g) || []).length, 1);
  assert(!html.includes('<option value="gospel-g1"'));
  for (const [id, name] of cases)
    assert(html.includes('<option value="' + id + '">' + name + "</option>"));
  for (const ref of refs) assert(!html.includes(ref));
  const copy = structuredClone(catalogue);
  copy.styles[0].description = refs[3] + " style";
  assert.throws(() => dna.createEngine(copy), /research references/i);
});
test("a wrong G1 mood or missing custom-voice profile does not complete or spend an extra lyric request", async () => {
  const context = dna.prepare(brief("G1-04"), actor),
    bad = { ...output(context), dna_mood: "Party dance" };
  const failed = await handler({
    payload: brief("G1-04"),
    engine: dna,
    actor,
    response: bad,
  });
  assert.equal(failed.result.status, 502);
  assert.deepEqual(failed.counts, {
    reserve: 1,
    complete: 0,
    refund: 1,
    post: 1,
  });
  const missing = await handler({
    payload: { ...brief("G1-05"), voice: "custom" },
    engine: dna,
    actor,
  });
  assert.equal(missing.result.status, 409);
  assert.deepEqual(missing.counts, {
    reserve: 0,
    complete: 0,
    refund: 0,
    post: 0,
  });
  const ready = await handler({
    payload: { ...brief("G1-05"), voice: "custom" },
    engine: dna,
    actor,
    voiceReady: true,
    response: validOutput(
      dna.prepare({ ...brief("G1-05"), voice: "custom" }, actor),
    ),
  });
  assert.equal(ready.result.status, 200);
  assert.equal(ready.result.data.music_dna.voice, "custom");
});

test("G1 responses cannot pass by echoing metadata while supplying a generic or neighboring instrumental prompt", () => {
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0],
      context = dna.prepare(brief(id), actor),
      out = validOutput(context);
    dna.validateOutput(out, context);
    assert.throws(
      () =>
        dna.validateOutput(
          {
            ...out,
            style: "Generic glossy party pop with unrelated synthesizers.",
          },
          context,
        ),
      /core instrumental identity/,
    );
    const other = dna.prepare(brief(cases[(i + 1) % cases.length][0]), actor);
    assert.throws(
      () =>
        dna.validateOutput(
          { ...out, style: validOutput(other).style },
          context,
        ),
      /core instrumental identity/,
    );
  }
});
