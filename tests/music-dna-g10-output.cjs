"use strict";
// Synthetic text only: no paid provider requests or audio-quality claims.
const { output } = require("./music-dna-fixture.cjs");
function g10Output(context) {
  const prompts = {
    "G10-01":
      "Slow soulful Ghanaian worship with gentle live drums, soft kick, restrained snare, cymbal swells and rounded warm electric bass. Expressive grand piano, mellow electric piano, atmospheric pads, soft organ, ambient electric guitar, subtle acoustic guitar, gentle strings and intimate backing harmonies develop gradually. Piano intro, reflective verse, emotional chorus, expanded second verse, intimate instrumental passage and heartfelt final chorus. Original mercy and devotion lyrics; preserve space and clear warm vocals.",
    "G10-02":
      "Gentle Ghanaian highlife devotion with restrained live drums, light congas, shakers and subtle percussion. Warm melodic bass passing notes support soft organ, warm piano, clean interlocking electric guitars, acoustic guitar and soft group harmonies. Guitar-led intro, thoughtful verse, melodic refrain, instrumental highlife passage, second verse and peaceful final chorus. Original gratitude and wisdom storytelling; keep flowing guitar interplay and restrained dance movement rather than fast celebratory praise.",
    "G10-03":
      "Moderate Ghanaian worship with controlled live drums, warm kick, soft snare, gentle toms and cymbal swells. Deep melodic bass supports grand piano, warm organ, atmospheric pads, clean electric guitar, subtle strings, gentle African percussion and layered choir. Piano intro, testimony verse, melodic chorus, expanded choir harmonies, instrumental reflection and uplifting final chorus. Original thanksgiving and faithfulness testimony; natural band movement, clear expressive lead and gradual choir development.",
    "G10-04":
      "Deep Ghanaian prayer worship with minimal introductory percussion, soft live drums, restrained toms, gentle cymbals and sustained deep warm bass. Atmospheric pads, expressive piano, warm organ, ambient electric guitar, soft strings and layered prayerful harmonies build gradually. Atmospheric intro, prayerful verse, recurring refrain, instrumental development, emotional bridge and powerful but controlled final chorus. Original mercy and restoration prayers; spacious phrasing, gradual dynamics and controlled intensity.",
    "G10-05":
      "Gentle acoustic Ghanaian worship with live percussion, restrained kick, soft snare, subtle shakers and understated warm melodic bass. Soft grand piano, warm electric piano, atmospheric pads, gentle organ, acoustic guitar, ambient electric guitar, subtle strings and intimate background harmonies create natural space. Acoustic or piano intro, intimate verse, melodic chorus, instrumental reflection, expanded harmonies and peaceful closing refrain. Original presence and trust imagery; smooth phrasing and acoustic picking.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g10Output };
