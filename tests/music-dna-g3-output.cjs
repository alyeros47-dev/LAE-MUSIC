"use strict";
// Synthetic provider responses for focused G3 contract checks, not paid audio.
const { output } = require("./music-dna-fixture.cjs");
function g3Output(context) {
  const out = output(context),
    styles = {
      "G3-01":
        "Bright piano and Gospel keyboards, warm melodic bass, live drums with energetic fills, rhythmic electric guitar, light African percussion and shakers. Expressive melodic verses grow into an uplifting chorus with Gospel backing harmonies, an instrumental interlude and a stronger final chorus.",
      "G3-02":
        "Warm grand piano, rich keyboard pads, melodic electric guitar, smooth bass, controlled live drums, soft strings and layered backing harmonies. A steady hopeful groove supports meaningful verses, an expressive bridge and a powerful melodic final chorus.",
      "G3-03":
        "Bright synth hooks, deep rhythmic bass, punchy electronic and live drums, syncopated Afro-pop percussion and rhythmic electric guitar. Energetic Gospel backing harmonies support a danceable chorus, instrumental dance passage and a memorable triumphant conclusion.",
      "G3-04":
        "Expressive grand piano, warm orchestral strings, atmospheric pads, smooth bass, gentle live drums, subtle electric guitar and rich choir harmonies. Spacious heartfelt Gospel ballad phrasing develops through meaningful storytelling and an expressive bridge before the final chorus.",
      "G3-05":
        "Soft contemporary keyboards, warm piano, melodic flowing bass, light live drums, gentle African percussion, acoustic guitar textures and soft backing harmonies. Encouraging melodic verses build through subtle layers into an uplifting chorus, a short instrumental passage and a reassuring finish.",
    };
  out.style = context.tempo + " BPM. " + styles[context.style_id];
  return out;
}
module.exports = { g3Output };
