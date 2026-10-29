"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s13Output(context) {
  const prompts = {
    "S13-01":
      "Classic Senegalese Mbalax with central layered sabar ensemble and conversational tama, strong live kick, crisp snare, rolling toms and shakers. Deep melodic electric bass interacts with sabar beneath bright piano, rhythmic organ, warm electric piano, clean electric guitar, brass and balafon accents. Sabar/bass intro, melodic verse, uplifting chorus, brass/guitar passage, second verse, extended sabar dance break and final chorus. Original community and cultural-pride lyrics; complex live percussion leads, not generic four-on-the-floor Afrobeats.",
    "S13-02":
      "Modern Senegalese Mbalax with unmistakable sabar/tama rhythm, strong kick, sharp snare, rolling toms and claps. Thick electronic bass layers melodic electric bass below central percussion; bright synths, rhythmic piano, warm organ, guitar and brass add dance clarity. Synth/sabar intro, melodic verse, catchy chorus, dance groove, second verse, extended percussion break and energetic final chorus. Original friendship and romance hooks; contemporary club pressure never overpowers traditional sabar movement.",
    "S13-03":
      "Bold Senegalese Mbalax-Afro-Pop festival with central sabar/tama interplay, punchy live kick, crisp snare, congas and shakers. Deep bouncy electric bass supports bright piano, rhythmic organ, synth pads, clean electric guitar, brass and balafon. Percussion/guitar intro, energetic verse, uplifting chorus, sabar/brass groove, second verse, dance break and final chorus. Original cultural-pride and success lyrics; powerful clear percussion, lively melodic guitar and expressive call-and-response, with no fixed lead gender.",
    "S13-04":
      "Fast Senegalese Mbalax with complex sabar conversations, prominent tama, heavy kick, crisp snare, rolling toms and claps. Powerful melodic electric bass has rapid syncopation and expressive slides beside bright organ, energetic piano, synth stabs, rhythmic electric guitar, brass and balafon. Immediate sabar/bass intro, energetic verse, powerful chorus, extended percussion/guitar dance section, second verse, dramatic sabar breakdown and final celebration. Original community hooks; maximum clear live percussion energy, not muddy layers.",
    "S13-05":
      "Gentle Senegalese Afro-Soul with restrained sabar, soft tama responses, gentle live kick/snare and shakers. Warm melodic electric bass supports rich piano, warm electric piano, soft organ, pads, fingerpicked acoustic guitar, clean electric guitar, kora, balafon and soft strings. Acoustic guitar/kora intro, reflective verse, soulful chorus, kora/guitar passage, second verse, emotional bridge and final chorus. Original humanity and peace storytelling; organic traditional rhythm stays essential within warm reflective harmony, not aggressive club drums.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s13Output };
