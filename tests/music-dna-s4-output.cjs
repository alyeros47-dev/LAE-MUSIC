"use strict";
// Synthetic provider text only: no paid model or audio output.
const { output } = require("./music-dna-fixture.cjs");
function s4Output(context) {
  const prompts = {
    "S4-01":
      "Live Afrobeat fusion with strong kick, crisp snare, syncopated hi-hats, congas, shekere and hand percussion. Deep rounded electric bass interacts with drums beneath warm electric piano, rhythmic organ, vintage synths, rhythmic electric guitar, rich brass and subtle strings. Brass/percussion intro, rhythmic verse, powerful chorus, instrumental Afrobeat groove, second verse, brass-led break and final chorus. Original ambition and African-pride lyrics; rich live movement, clear modern lows and no generic electronic loops.",
    "S4-02":
      "Nigerian Afro-dancehall with heavy kick, sharp snare, rhythmic hi-hats, shakers and lively Afro-percussion. Thick rolling electronic/electric bass and powerful sub-bass support bright synth hooks, rhythmic organ, offbeat reggae guitar, congas, brass and tropical accents. Bass/drum intro, rhythmic verse, energetic chorus, dancehall break, second verse, percussion build and final chorus. Original resilience and friendship lyrics; strong offbeat dance momentum, controlled heavy lows and punchy drums rather than soft romantic pacing.",
    "S4-03":
      "Warm Afro-reggae/dancehall with relaxed Caribbean groove, reggae kick/snare, flowing hi-hats, shakers and congas. Deep rolling reggae bass and sustained lows support organ bubbles, warm electric piano, soft pads, offbeat electric guitar, acoustic guitar, tropical percussion and subtle brass. Reggae guitar/organ intro, melodic verse, uplifting chorus, instrumental reggae groove, second verse, rhythmic bridge and final chorus. Original peace and unity lyrics; preserve offbeat identity and naturally blended African percussion.",
    "S4-04":
      "Bright coastal Nigerian highlife fusion with punchy kick, crisp snare, syncopated hi-hats, congas, shakers and claps. Bouncy melodic highlife bass supports bright piano, rhythmic organ, playful synth plucks, warm pads, clean interlocking guitar and brass accents. Guitar/percussion intro, rhythmic verse, catchy chorus, instrumental highlife groove, second verse, dance break and final chorus. Original enjoyment and friendship lyrics; lively highlife guitar interplay and clear warm lows, not dark electronic or slow ballad pacing.",
    "S4-05":
      "Atmospheric Afro-fusion/R&B with soft punchy electronic kick, crisp rimshot, restrained hi-hats, shakers and subtle African percussion. Deep gliding sub-bass pulses beneath dark synth pads, warm electric piano, processed electric guitar, ambient guitar and subtle strings. Synth/guitar intro, emotional verse, melodic chorus, instrumental reflection, second verse, expressive bridge and final chorus. Original personal-growth and relationship imagery; spacious gentle syncopation, controlled immersive lows and restrained powerful bass.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s4Output };
