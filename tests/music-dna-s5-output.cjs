"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s5Output(context) {
  const prompts = {
    "S5-01":
      "Modern Fuji-Afrobeats with heavy electronic kick, sharp snare, talking drum, shekere, congas, handclaps and sakara-inspired percussion. Thick punchy sub-bass locks to kick under bright piano riffs, rhythmic organ, short synth hooks, brass, guitar and layered crowd harmonies. Percussion/piano intro, rhythmic verse, powerful chorus, Fuji break, second verse, full instrumental dance section and final chorus. Original ambition and gratitude lyrics; dense energetic percussion remains clear, with evolving bright piano and powerful controlled lows.",
    "S5-02":
      "Reflective Fuji-street Afrobeats with punchy kick, crisp snare, restrained traditional percussion, talking drum, shakers and gentle shekere. Deep warm electronic bass bounces beneath emotional piano, warm organ, atmospheric pads, restrained synths, clean guitar and soft group responses. Piano intro, storytelling verse, emotional chorus, instrumental Fuji passage, second verse, uplifting bridge and final chorus. Original family and resilience lyrics; grounded pulse, expressive melody and authentic Fuji percussion balance.",
    "S5-03":
      "Melodic Fuji-influenced street Afrobeats with strong kick, crisp snare, rolling hi-hats, talking drum, congas, shakers and shekere. Warm punchy electronic bass supports bright piano, pads, short synth riffs, rhythmic electric guitar and restrained brass. Piano/percussion intro, expressive verse, catchy chorus, groove, second verse, dynamic bridge and final chorus. Original freedom and friendship lyrics; lively dance pulse, melodic bass runs and expressive storytelling balanced with powerful street rhythm.",
    "S5-04":
      "Soulful Yoruba-influenced Afro-soul with gentle Fuji percussion, warm kick, controlled snare, talking drum, shakers and shekere. Flowing melodic electric bass supports expressive piano, traditional organ, warm electric piano, pads, clean highlife guitar and soft strings. Guitar/piano intro, storytelling verse, melodic chorus, traditional percussion passage, second verse, emotional bridge and uplifting final chorus. Original life lessons and family testimony; mature soulful instruments and gentle highlife movement without forcing lyric language.",
    "S5-05":
      "Fast Fuji-street dance with heavy kick, sharp snare, rapid talking drum rolls, shekere, congas, handclaps and sakara-inspired percussion. Deep bouncy electronic bass locks to kick beneath bright organ, rhythmic piano, short synth hooks, rhythmic electric guitar, brass and whistles. Talking-drum intro, energetic verse, original chant chorus, Fuji dance break, second verse, instrumental climax and final chorus. Original festival and friendship lyrics; prominent traditional percussion, powerful clean bass and clear energetic responses.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s5Output };
