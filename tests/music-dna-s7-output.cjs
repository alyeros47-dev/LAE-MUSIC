"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s7Output(context) {
  const prompts = {
    "S7-01":
      "Modern Igbo Highlife with strong live kick, crisp snare, congas, shakers and handclaps. Warm melodic electric bass runs support bright piano, rhythmic organ, warm pads, interlocking clean electric guitar lead/picking patterns, ogene, udu, ekwe, shekere and brass. Guitar/percussion intro, melodic verse, festive chorus, lead-guitar passage, second verse, brass/percussion break and final chorus. Original marriage and community lyrics; keep bright Highlife guitars and lively electric bass prominent rather than generic synth loops.",
    "S7-02":
      "Traditional Eastern Highlife with natural live kick/snare, gentle toms, congas and shakers. Rounded electric bass walking patterns support warm organ, restrained piano, soft electric piano and complementary interlocking guitar lead/rhythmic-picking parts. Ogene, udu, ekwe, shekere and occasional flute stay organic. Extended guitar intro, storytelling verse, melodic refrain, guitar passage, second verse, percussion interlude and final refrain. Original heritage and wisdom lyrics; natural live warmth, no EDM bass or aggressive trap.",
    "S7-03":
      "Eastern urban Highlife with punchy kick, sharp snare, syncopated hi-hats and percussion. Powerful electronic bass layers melodic electric bass under bright piano, rhythmic organ, synth plucks, pads, clean Highlife guitar riffs, ogene, ekwe, udu and brass. Guitar/bass intro, rhythmic verse, melodic chorus, guitar groove, second verse, percussion bridge and final chorus. Original ambition and cultural-pride lyrics; retain Highlife guitar/bass motion and modern clear lows. Spoken or rap-like passages are optional and customer-directed, never forced.",
    "S7-04":
      "Vintage Highlife with natural live drums, warm roomy snare, congas and shakers. Round melodic electric bass supports vintage electric piano, warm organ, soft piano, interlocking bright electric guitar, rhythmic fingerpicking, shekere, ogene, soft brass and traditional flute. Extended guitar/percussion intro, melodic verse, warm chorus, live-band section, second verse, guitar-led bridge and final chorus. Original family and everyday-happiness lyrics; organic analog warmth, clear live interplay and no synthetic-bass dominance.",
    "S7-05":
      "Fast Igbo cultural Highlife with strong live drums, energetic congas, ekwe rhythms and ogene accents. Deep bouncy electric bass runs support bright organ, rhythmic piano, fast interlocking guitar, udu, shekere, traditional flute, brass and handclaps. Ogene/percussion intro, lively guitar entry, celebratory verse, communal chorus, traditional dance break, second verse and extended final celebration. Original cultural pride and community-achievement hooks; powerful indigenous percussion and clear live Highlife movement.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s7Output };
