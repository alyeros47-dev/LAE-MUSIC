"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  dna = require("../lib/music-dna");
test("small shared-engine regression retains a prior style, retry identity and language/voice independence", () => {
  const s = dna.catalogue().styles[0],
    b = { musicDnaStyle: s.id, voice: "neutral", musicDnaLanguages: ["en"] },
    actor = { artistId: 7, requestKey: "qa-dna-shared-smoke-0001" },
    a = dna.prepare(b, actor),
    c = dna.prepare(
      { ...b, voice: "female", musicDnaLanguages: ["yo"] },
      actor,
    );
  assert.deepEqual(a.profile, c.profile);
  assert.equal(a.variation_id, c.variation_id);
  assert(!JSON.stringify(a).includes("research_references"));
});
