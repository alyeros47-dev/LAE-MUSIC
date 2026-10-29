"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s11Output(context) {
  const prompts = {
    "S11-01":
      "Classic Ghanaian dance Highlife with strong live kick, crisp snare, flowing hi-hats, congas, shakers and claps. Warm melodic electric bass runs support bright organ, rhythmic piano, interlocking clean electric guitar, brass and shekere. Bright guitar intro, melodic verse, catchy chorus, extended lead-guitar passage, second verse, dance break and final chorus. Original marriage and friendship lyrics; bright expressive guitars and warm melodic bass lead authentic live Highlife dance movement, not generic synth loops.",
    "S11-02":
      "Smooth Ghanaian Highlife-reggae with warm live kick, restrained snare, flowing shakers and gentle congas. Deep rounded electric bass combines rolling reggae movement and Highlife passing notes beneath warm electric piano, reggae organ bubbles, rich piano, pads, Highlife guitar, offbeat reggae guitar, gentle strings and soft brass. Guitar/organ intro, romantic verse, smooth chorus, reggae-Highlife groove, second verse, soulful bridge and final chorus. Original companionship lyrics; peaceful soulful melody, not heavy dancehall aggression.",
    "S11-03":
      "Contemporary Ghanaian Highlife with punchy live/electronic kick, crisp snare, congas, shakers and claps. Rounded melodic electric bass supports bright piano, warm organ, restrained synths, interlocking guitar, brass and shekere. Highlife guitar intro, melodic verse, catchy chorus, guitar groove, second verse, percussion-led bridge and final chorus. Original family and gratitude hooks; flowing Ghanaian lead guitar and melodic bass retain traditional identity with clean modern production rather than generic Afropop synth replacement.",
    "S11-04":
      "Traditional Ghanaian Highlife with natural live kick/snare, gentle congas, shakers and restrained toms. Warm electric bass walking patterns support traditional organ, acoustic piano, electric piano, restrained pads, interlocking guitar picking, soft brass, shekere and occasional flute. Gentle guitar intro, storytelling verse, warm chorus, Highlife passage, second verse, reflective bridge and final chorus. Original life-lessons and community lyrics; mature warm live-band dynamics and expressive guitars, not heavy electronic bass or aggressive club drums.",
    "S11-05":
      "Romantic Ghanaian Highlife with soft live kick, gentle snare/rimshot, flowing shakers and subtle congas. Warm melodic electric bass supports expressive piano, rich electric piano, organ, soft pads, clean Highlife guitar, fingerpicked acoustic guitar, soft strings and gentle brass. Soft guitar/piano intro, romantic verse, emotional chorus, guitar passage, second verse, expressive bridge and warm final chorus. Original commitment and affection lyrics; rich tender harmony, expressive live guitar and gentle dance motion rather than aggressive club bass.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s11Output };
