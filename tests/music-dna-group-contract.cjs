"use strict";
// Shared style-group contract: the actual handler is exercised with mocked providers only.
const test = require("node:test"),
  assert = require("node:assert/strict"),
  dna = require("../lib/music-dna"),
  catalogue = require("../config/music-dna.json"),
  { handler } = require("./lyrics-handler-fixture.cjs");
module.exports = function registerGroup({
  group,
  category_id,
  cases,
  validOutput,
  topic,
}) {
  const refs = catalogue.styles.flatMap((s) => s.research_references || []),
    actor = {
      artistId: 7,
      requestKey: "qa-" + group.toLowerCase() + "-integration-request-0001",
    };
  const brief = (id) => ({
    musicDnaStyle: id,
    musicDnaLanguages: ["en", "yo"],
    voice: "neutral",
    idea: topic,
  });
  for (const [id, name, min, max] of cases) {
    test(
      id +
        " retains its supplied musical identity, mood and independently selectable voices/languages",
      () => {
        const source = catalogue.styles.find((s) => s.id === id),
          base = dna.prepare(brief(id), actor);
        assert.equal(source.name, name);
        assert.equal(source.category_id, category_id);
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
              cases.findIndex((x) => x[0] === id) % 2 === 1
                ? "gpt-6-astra"
                : "gpt-6.1-sol",
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
          cases.findIndex((x) => x[0] === id) % 2 === 1
            ? "gpt-6-astra"
            : "gpt-6.1-sol",
        );
        const system = x.request.input[0].content,
          user = JSON.parse(x.request.input[1].content);
        assert(
          system.includes(catalogue.styles.find((s) => s.id === id).rhythm),
        );
        assert(
          system.includes(
            catalogue.styles.find((s) => s.id === id).arrangement,
          ),
        );
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
};
