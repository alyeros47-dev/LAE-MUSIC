"use strict";
// Synthetic text fixtures only; no paid provider or audio generation.
const { output } = require("./music-dna-fixture.cjs");
function g6Output(context) {
  const prompts = {
    "G6-01":
      "Joyful Igbo Gospel highlife with lively live drums, steady kick/snare, flowing toms and deep bouncy melodic bass. Bright organ, rhythmic piano, warm pads and interlocking electric guitar lines lead naturally balanced ogene metal gong, ekwe slit drum, udu clay drum, shakers and handclaps. Guitar/percussion intro, thanksgiving verse, memorable chorus, highlife instrumental, choir response and extended celebratory final chorus. Original goodness and protection testimony; keep guitars and bass prominent.",
    "G6-02":
      "Traditional Igbo Gospel with steady live drums, controlled snare, rolling toms and grounded warm highlife bass. Traditional organ, rhythmic piano, clean highlife guitar, repeating ogene, ekwe and udu cycles, shakers and communal choir retain measured indigenous phrasing. Percussion intro, narrative verse, group-response refrain, instrumental passage, second narrative verse and communal thanksgiving finale. Original family-blessing and encouragement storytelling; restrained keys and no excessive electronic dance production.",
    "G6-03":
      "Fast Igbo live praise with powerful live drums, heavy kick, sharp snare, energetic tom rolls and deep punchy highlife bass. Bright piano, energetic organ, warm pads, rhythmic guitar, ogene, ekwe, congas, shakers, brass and powerful choir drive traditional dance momentum. Explosive drum/percussion intro, energetic verse, powerful chorus, call-and-response, dance break and triumphant final chorus. Original victory and strength testimony; strong bass/drum presence, exciting breakdowns and no slow pacing.",
    "G6-04":
      "Classic Igbo Gospel highlife with traditional drum patterns, steady kick/snare, flowing hi-hats and melodic bass with walking transitions. Bright organ, rhythmic piano, interlocking lead/rhythm guitar, ogene, ekwe, udu, shakers and group harmonies support flowing live dance movement. Melodic guitar intro, storytelling verse, catchy chorus, extended guitar-and-bass passage, second verse and celebratory closing refrain. Original faithfulness and community encouragement; preserve classic guitars and rolling bass.",
    "G6-05":
      "Reflective traditional Igbo Gospel with gentle live drums, restrained toms and warm understated melodic highlife bass. Soft organ, expressive piano, clean electric guitar, acoustic guitar, light ogene accents, subtle udu, shakers and soft group harmonies create natural space. Gentle guitar/organ intro, testimony verse, melodic refrain, reflection, second verse and uplifting final chorus. Original life lessons and divine-guidance testimony; mature storytelling, warm natural instruments and gentle communal responses.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g6Output };
