"use strict";
// Synthetic text only, not paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function g13Output(context) {
  const prompts = {
    "G13-01":
      "Urban Black American Gospel R&B with punchy kick, crisp snare, syncopated hi-hats and deep funk bass locked to drums. Bright piano, Hammond organ, Rhodes electric piano, synth textures, rhythmic electric guitar, brass and handclaps support large SATB choir harmonies, unison phrases and rhythmic responses. Choir/keys intro, rhythmic verse, powerful choir chorus, call-and-response, instrumental groove and expanded final chorus. Original hope and victory lyrics; modern rhythmic clarity and strong live choir presence.",
    "G13-02":
      "Explosive Black American Gospel funk with powerful live drums, rapid tom fills, syncopated kick, sharp snare and heavy fast bass runs. Aggressive piano, Hammond organ, bright synth stabs, rhythmic electric guitar, brass, handclaps and percussion support energetic multi-part choir with fast responses and dramatic unison accents. Drum/brass intro, energetic verse, powerful chorus, rhythmic breakdown, instrumental praise explosion and final choir climax. Original freedom and faith lyrics; avoid slow worship pacing.",
    "G13-03":
      "Smooth Black American Gospel soul/R&B with warm drums, crisp snare, controlled hi-hats and prominent melodic funk bass. Rhodes electric piano, Hammond organ, rich piano, warm pads, clean electric guitar, subtle brass and hand percussion support smooth multi-part choir harmonies and melodic group responses. Electric-piano intro, melodic verse, rich choir chorus, second verse, bass-led instrumental groove, expressive bridge and final chorus. Original grace and encouragement lyrics; warm relaxed engaging pocket.",
    "G13-04":
      "Traditional Black American church Gospel with strong live drums, driving kick/snare, tom fills and deep walking-style bass transitions. Prominent Hammond organ, bright piano, electric guitar, brass and handclaps support full SATB choir harmonies, congregational responses and repeated refrains with evolving harmony. Hammond intro, choir-led verse, congregational chorus, call-and-response, traditional Gospel vamp and dramatic choir climax. Original perseverance and thanksgiving lyrics; authentic organ-led full ensemble dynamics.",
    "G13-05":
      "Multicultural Gospel fusion with driving live drums, syncopated kick/snare, Latin percussion and deep funk bass. Bright piano, Hammond organ, warm pads, rhythmic synths, electric guitar, acoustic guitar, congas, timbales and brass support multilayered choir harmonies and energetic group responses. Guitar/percussion intro, energetic verse, uplifting chorus, instrumental fusion break, call-and-response and powerful final chorus. Original unity and divine-love lyrics; distinct Latin accents, worship-rock elements and energetic band balance.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g13Output };
