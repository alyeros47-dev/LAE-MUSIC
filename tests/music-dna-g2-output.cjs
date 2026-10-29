"use strict";
// Non-billable synthetic upstream responses, never evidence of actual audio quality.
const { output } = require("./music-dna-fixture.cjs");
function g2Output(context) {
  const out = output(context),
    styles = {
      "G2-01":
        "Sustained keyboard pads, soft piano, low ambient drones, gentle bass notes, subtle strings and minimal percussion. Spacious prayer melody, silence between phrases, a developing refrain and a quiet reverent resolution.",
      "G2-02":
        "Rhythmic keyboards, deep bass, live drums, controlled tom builds and hand percussion. A memorable evolving chant, call-and-response harmonies and growing musical momentum resolve powerfully.",
      "G2-03":
        "Expressive piano, warm pads, melodic bass, live drums, electric guitar textures, soft strings and layered choir harmonies. Flowing worship verses grow into an expressive chorus and stronger final section.",
      "G2-04":
        "Deep pads, rhythmic piano, cinematic strings, low bass and restrained tom drums. Original spoken declarations alternate with sung refrains and choir responses, leaving deliberate space before a hopeful resolution.",
      "G2-05":
        "Grand piano, cinematic strings, atmospheric pads, warm bass, restrained orchestral percussion, ambient guitar and layered harmonies. Gentle worship grows through a cinematic interlude to an expressive final chorus and peaceful resolution.",
    };
  out.style = context.tempo + " BPM. " + styles[context.style_id];
  return out;
}
module.exports = { g2Output };
