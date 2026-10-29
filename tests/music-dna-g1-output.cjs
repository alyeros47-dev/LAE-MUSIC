"use strict";
// Mocked upstream responses for contract tests; these are not provider-generated songs.
const { output } = require("./music-dna-fixture.cjs");
function validOutput(context) {
  const out = output(context),
    styles = {
      "G1-01":
        "Warm grand piano, expressive trumpet, atmospheric pads, smooth bass, gentle live drums and choir harmonies. Reverent 4/4 worship expands gradually into a trumpet interlude and powerful final chorus.",
      "G1-02":
        "Reflective piano and keyboards introduce expressive electric guitar, deep bass and live drums. Controlled fills and choir harmonies build into a full-band worship climax.",
      "G1-03":
        "Intimate grand piano, warm strings, atmospheric pads, gentle bass and minimal percussion. Spacious reflective phrasing rises through an emotional bridge and final chorus without a dance shift.",
      "G1-04":
        "Atmospheric pads and sustained keyboards, soft piano, ambient guitar and warm bass. Prayerful spacious phrases leave instrumental breathing room; restrained percussion supports a reverent resolution.",
      "G1-05":
        "Fingerpicked acoustic guitar, soft piano, warm bass, subtle shaker and delicate backing harmonies. A peaceful natural groove builds gently with a short acoustic passage before the final chorus.",
    };
  out.style = context.tempo + " BPM. " + styles[context.style_id];
  return out;
}

module.exports = { g1Output: validOutput };
