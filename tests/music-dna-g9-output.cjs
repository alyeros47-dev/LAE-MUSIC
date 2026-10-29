"use strict";
// Synthetic text responses only: no paid provider requests or generated audio.
const { output } = require("./music-dna-fixture.cjs");
function g9Output(context) {
  const prompts = {
    "G9-01":
      "Flowing Ghanaian highlife-influenced Gospel praise with lively live drums, steady kick, crisp snare, flowing hi-hats and subtle hand percussion. Warm melodic bass passing notes support bright piano, warm organ, sustained pads, clean interlocking electric guitars, congas, shakers, brass and layered choir. Bright intro, melodic verse, uplifting chorus, richer second verse, instrumental highlife passage and celebratory final chorus. Original faithfulness and thanksgiving lyrics; balanced live-band movement.",
    "G9-02":
      "Energetic Ghanaian Gospel praise with strong kick and snare, tom rolls, lively hi-hats, cymbal accents and dynamic live fills. Deep prominent bass synchronizes with drums beneath bright piano, rhythmic organ, layered pads, electric guitar, brass, congas, shakers and full choir. Drum-and-keyboard intro, energetic verse, strong choir chorus, call-and-response, instrumental praise break and powerful final chorus. Original divine-greatness and victory lyrics; preserve African syncopation and group response.",
    "G9-03":
      "Expansive Ghanaian live Gospel with controlled live drums, dynamic kick/snare, expressive toms and cymbal swells. Deep warm melodic bass supports grand piano, rich organ, atmospheric pads, synth textures, expressive electric guitar, cinematic strings, brass, African percussion and large choir. Atmospheric keys intro, expressive verse, powerful chorus, expanded second verse, worship passage, climactic bridge and full-band final chorus. Original renewal and hope lyrics; gradual intensity and harmonic development.",
    "G9-04":
      "Ghanaian highlife Gospel with lively drum patterns, steady kick, snare accents, congas, hand percussion, shakers and rhythmic fills. Bouncy melodic highlife bass supports interlocking electric guitars, bright organ, rhythmic piano, subtle brass, handclaps and group harmonies. Guitar/percussion intro, thanksgiving verse, catchy chorus, instrumental highlife dance passage, second verse and extended celebratory closing chorus. Original goodness and protection testimony; keep guitars flowing and bass passing notes prominent.",
    "G9-05":
      "Fast Ghanaian live praise with energetic live drums, driving kick, crisp snare, rolling toms, cymbal crashes and African percussion. Deep punchy bass supports bright piano, energetic organ riffs, rhythmic electric guitar, brass, congas, shakers, handclaps and layered choir. Powerful intro, energetic verse, memorable praise chorus, choir call-and-response, drum-and-bass dance break and triumphant final chorus. Original perseverance and gratitude lyrics; strong rhythmic lead clarity and syncopated band momentum.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g9Output };
