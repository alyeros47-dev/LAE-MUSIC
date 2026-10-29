"use strict";
// Synthetic provider text for G5 contracts; no paid generation or audio claims.
const { output } = require("./music-dna-fixture.cjs");
function g5Output(context) {
  const prompts = {
    "G5-01":
      "Gentle live drums, soft talking drum, restrained congas and hand percussion support flowing warm electric bass. Soft piano, warm organ, sustained pads, acoustic guitar, shekere, subtle strings and response harmonies create reflective Yoruba-inspired Gospel worship. Traditional intro, storytelling verse, melodic chorus, call-and-response, reflective interlude and final chorus. Use original poetic faithfulness and testimony imagery in the selected language; balance percussion around expressive vocals.",
    "G5-02":
      "Strong talking drum, congas, hand drums, shekere, live kick and snare create a syncopated communal dance pulse. Bouncy electric bass supports bright organ, lively piano, electric guitar, handclaps and group harmonies. Talking-drum intro, group-response verse, memorable praise chorus, percussion break, instrumental dance passage and energetic closing chorus. Meaningfully vary original thanksgiving refrains in the selected language. Keep traditional percussion forward and responses clear.",
    "G5-03":
      "Live Juju groove with prominent interlocking electric guitars, conversational talking drum and rolling melodic electric bass. Lively live drums, congas, shekere, hand percussion, organ riffs, rhythmic piano, brass accents and group vocals preserve consistent dance momentum. Guitar/percussion intro, praise verse, response chorus, extended instrumental Juju groove, additional verse and celebratory final chorus. Original testimony and perseverance lyrics use the selected language; keep live instrumental interplay prominent.",
    "G5-04":
      "Gentle African acoustic Gospel soul with soft hand drums, subtle shakers and restrained drum-kit accompaniment. Warm understated bass supports expressive piano, gentle organ, atmospheric pads, acoustic guitar, soft strings and intimate background harmonies. Acoustic intro, thoughtful storytelling verse, melodic refrain, instrumental reflection, second verse and meaningful closing chorus. Leave natural breathing room and use original mature imagery about wisdom and hope in the selected language.",
    "G5-05":
      "Talking drum, hand percussion, congas, shekere and energetic live drums support a steady dance pulse and rhythmic electric bass. Bright organ, lively piano, electric guitar, brass and layered group-response harmonies create traditional Yoruba-inspired praise. Percussion intro, rhythmic verse, group chorus, instrumental celebration, second verse and strong final chorus. Use original gratitude and divine-protection testimony in the selected language. Keep drum conversations articulate and bass transitions clear.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g5Output };
