"use strict";
// Synthetic provider text for G11 only; no paid requests or real audio.
const { output } = require("./music-dna-fixture.cjs");
function g11Output(context) {
  const prompts = {
    "G11-01":
      "South African choir celebration with powerful live drums, strong kick/snare, tom fills, handclaps and African percussion. Deep bouncy bass locks to kick beneath bright piano, lively organ, warm synth layers, electric guitar, brass, congas and shakers. Full SATB-style choir ensemble has clear multi-part harmonies and natural responses. Choir-and-drum intro, energetic verse, large choir chorus, call-and-response, dance break and triumphant final chorus. Original unity and thanksgiving lyrics; strong live-band interaction.",
    "G11-02":
      "Spacious South African live worship with controlled live drums, warm kick, expressive snare and gradual cymbal builds. Warm melodic bass supports grand piano, rich organ, atmospheric pads, electric guitar, gentle strings, African percussion and powerful choir. Piano intro, reflective verse, choir-supported chorus, expanded second verse, worship passage, powerful bridge and majestic final chorus. Original adoration and faithfulness lyrics; natural dynamic progression and clear congregational phrasing.",
    "G11-03":
      "Traditional South African Gospel with lively live drums, communal handclaps, congas, shakers and hand percussion. Warm rolling bass supports bright organ, rhythmic piano, rhythmic electric guitar, brass and layered group harmonies. Traditional rhythmic intro, melodic verse, group-response chorus, percussion break, instrumental celebration and uplifting final chorus. Original perseverance and thanksgiving lyrics; preserve flowing traditional dance patterns and natural choir responses rather than generic electronic dance.",
    "G11-04":
      "Gentle South African worship with soft live drums, restrained snare, subtle cymbal swells and sustained deep warm bass. Expressive grand piano, warm electric piano, atmospheric pads, rich organ, ambient electric guitar, soft strings, gentle percussion and layered choir build gradually. Piano intro, prayerful verse, emotional chorus, expanded instrumental development, expressive bridge and choir-supported final chorus. Original comfort and restoration lyrics; soulful phrasing and controlled emotional intensity.",
    "G11-05":
      "South African Gospel soul with smooth live drums, warm kick, crisp snare, expressive toms and flowing syncopated melodic bass. Rich grand piano, soulful electric piano, warm organ, atmospheric pads, clean electric guitar, subtle strings and light African percussion support sophisticated layered choir harmonies. Soulful keys intro, expressive verse, rich choir chorus, second verse, worship interlude, emotional bridge and powerful final chorus. Original divine-love and gratitude lyrics; rich vocal harmony stays central.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g11Output };
