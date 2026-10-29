"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s14Output(context) {
  const prompts = {
    "S14-01":
      "Energetic Tanzanian Bongo Flava with punchy kick, crisp snare, claps, rolling shakers, hi-hats and congas. Rounded electronic bass layers melodic electric-bass accents beneath bright piano, synth plucks, warm electric piano, pads and interlocking East African coastal guitar. Immediate guitar/percussion intro, melodic verse, rising pre-chorus, energetic chorus, dance groove, second verse, percussion/guitar break and final chorus. Original ambition and friendship hooks; deep clear lows and lively melodic guitar rather than generic Afrobeats or EDM drops.",
    "S14-02":
      "Bold Tanzanian street Bongo with heavy kick, sharp snare, syncopated hi-hats, fast shakers and congas. Deep electronic bass uses punchy pulses and controlled slides beneath bright synth stabs, rhythmic piano, warm pads, coastal guitar, brass and African percussion. Bass/drum intro, rhythmic verse, punchy chorus, dance break, second verse, stop-start percussion passage and final chorus. Original determination and celebration hooks; clean powerful lows, exciting melodic refrains and no generic trap or constant identical loops.",
    "S14-03":
      "Romantic Tanzanian Bongo Flava with smooth kick, crisp rimshot/snare, gentle hi-hats, shakers and congas. Warm rounded melodic bass supports bright electric piano, acoustic piano, synth plucks, soft pads, flowing coastal guitar, soft brass and subtle strings. Gentle guitar/piano intro, romantic verse, melodic chorus, coastal guitar passage, second verse, emotional bridge and uplifting final chorus. Original commitment and companionship lyrics; expressive East African picking, relaxed dance bounce and clear warm lows rather than heavy club aggression.",
    "S14-04":
      "Sophisticated Tanzanian Bongo soul with warm kick, restrained snare, smooth hi-hats, subtle congas and shakers. Deep melodic electric bass passing notes support rich acoustic piano, warm Rhodes, soft organ, pads, fingerpicked East African guitar, soft strings and restrained brass. Elegant piano/guitar intro, intimate verse, romantic chorus, guitar reflection, second verse, emotional bridge and final chorus. Original emotional-honesty and family lyrics; mature romantic harmony, natural clarity and coastal rhythmic movement rather than generic Western ballad pacing.",
    "S14-05":
      "Bright Tanzanian Bongo Flava with punchy smooth kick, crisp snare, lively shakers, flowing congas and handclaps. Deep bouncy melodic bass supports bright piano, warm electric piano, synth plucks, gentle organ, pads and expressive East African coastal guitar. Subtle taarab-influenced ornaments, gentle strings and hand percussion remain tasteful. Guitar/keys intro, expressive verse, catchy chorus, coastal dance groove, second verse, melodic bridge and final chorus. Original relationship and celebration hooks; warm clear bass, playful melody and no fixed voice or language.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s14Output };
