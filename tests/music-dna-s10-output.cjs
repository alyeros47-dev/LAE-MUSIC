"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s10Output(context) {
  const prompts = {
    "S10-01":
      "Smooth Ghanaian Afropop with punchy kick, crisp snare, light claps, syncopated hi-hats, flowing shakers and gentle congas. Rounded warm bass supports electric piano, bright synth plucks, atmospheric pads, clean muted Highlife guitar and subtle brass. Guitar/percussion intro, melodic verse, romantic pre-chorus, catchy chorus, instrumental Highlife groove, second verse and expanded final chorus. Original companionship and enjoyment lyrics; flowing Ghanaian guitar movement, relaxed dance bounce and polished melody, not aggressive street-party drums.",
    "S10-02":
      "Bright Ghanaian Afro-dance with strong kick, crisp claps, lively hi-hats, rolling shakers and congas. Thick bouncy electronic bass locks to kick beneath bright piano, playful synth plucks, warm pads, rhythmic guitar, short Highlife riffs and tropical accents. Immediate percussion/keys intro, playful verse, short pre-chorus, dance chorus, groove, second verse and final chorus. Original friendship and romance hooks; strong clean lows and catchy Ghanaian dance momentum, not long atmospheric intros or ballad pacing.",
    "S10-03":
      "Ghanaian Highlife-pop with live/electronic drums, punchy kick, crisp snare, congas, shakers and claps. Warm melodic electric bass runs support bright piano, rhythmic organ, synth plucks, pads, interlocking guitar, brass and shekere. Highlife guitar intro, melodic verse, uplifting chorus, guitar-led section, second verse, percussion/brass break and final chorus. Original family and community celebration lyrics; authentic flowing Ghanaian guitar and melodic bass stay prominent within polished modern pop.",
    "S10-04":
      "Ghanaian Hiplife with punchy hip-hop kick, sharp snare, syncopated hi-hats and traditional percussion. Deep electronic bass and occasional melodic electric-bass runs support dark piano, rhythmic organ, warm electric piano, short synth motifs, Highlife guitar, brass and congas. Drum/piano intro, rhythmic storytelling verse, melodic chorus, Highlife break, second verse, dynamic bridge and final chorus. Original cultural-pride and perseverance lyrics; clear drums and Highlife movement. Rap-oriented passages are optional and customer-directed.",
    "S10-05":
      "Powerful Ghanaian Afro-dancehall with heavy kick, sharp snare, syncopated hi-hats, rolling shakers and congas. Thick rolling electronic sub-bass locks to kick beneath bright synths, reggae organ bubbles, rhythmic piano, offbeat guitar, Highlife accents and tropical percussion. Bass/percussion intro, rhythmic verse, energetic chorus, dancehall break, second verse, percussion build and powerful final chorus. Original resilience and unity hooks; retain Caribbean offbeats and lively African percussion with clear deep lows.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s10Output };
