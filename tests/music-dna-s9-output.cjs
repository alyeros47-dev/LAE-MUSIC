"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s9Output(context) {
  const prompts = {
    "S9-01":
      "Atmospheric alternative Afro-soul with deep restrained kick, crisp rimshot, sparse hi-hats, gentle shakers, subtle congas and African syncopation. Rounded warm sub-bass pulses under rich Rhodes electric piano, dark synth pads, sparse clean electric guitar and soft strings. Atmospheric keys intro, intimate verse, expanding pre-chorus, emotional chorus, reflection, second verse, expressive bridge and final chorus. Original self-discovery and resilience imagery; wide expressive melodies, clear bass and spacious harmony, not crowded party drums.",
    "S9-02":
      "Confident modern Afro-R&B with punchy kick, crisp clap, syncopated hi-hats, shakers, congas and lively fills. Deep bouncy electronic bass supports bright synth plucks, warm electric piano, atmospheric pads, rhythmic guitar, muted picking and restrained brass. Synth/percussion intro, rhythmic verse, melodic pre-chorus, confident chorus, groove, second verse, dynamic bridge and final chorus. Original empowerment and ambition lyrics; controlled Afropop bounce, expressive catchy melody and strong bass, not slow ballad or EDM pacing.",
    "S9-03":
      "Warm Nigerian Afro-soul with soft clear kick, gentle rimshot/snare, flowing shakers and subtle congas. Melodic electric bass supports expressive piano, warm Rhodes, soft organ, gentle pads, fingerpicked acoustic guitar, clean electric guitar, soft strings and subtle flute. Acoustic guitar/piano intro, storytelling verse, warm chorus, guitar passage, second verse, emotional bridge and uplifting final chorus. Original family and emotional-honesty lyrics; intimate acoustic instrumentation, natural African dance pulse and expressive romantic refrains.",
    "S9-04":
      "Energetic African pop-soul with strong kick, crisp snare, rolling congas, shakers, claps and talking drum accents. Deep bouncy electric bass supports bright piano, rhythmic organ, melodic synths, warm pads, lively highlife electric guitar, brass and shekere. Percussion/guitar intro, energetic verse, uplifting chorus, African dance groove, second verse, brass/percussion break and final chorus. Original cultural-pride and independence hooks; expressive melody, powerful balanced African percussion and no fixed lead voice.",
    "S9-05":
      "Organic African alternative soul with natural acoustic drums, warm kick, gentle snare, optional brushes, subtle shakers and restrained congas. Warm upright-style bass supports acoustic piano, electric piano, organ, jazz voicings, fingerpicked acoustic guitar, clean electric guitar, soft strings and subtle flute. Acoustic intro, intimate storytelling verse, reflective chorus, acoustic passage, second verse, emotional bridge and gentle final chorus. Original humanity and life-lessons lyrics; warm live dynamics and understated mature melody, not electronic club production.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s9Output };
