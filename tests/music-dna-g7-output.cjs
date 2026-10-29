"use strict";
// Synthetic text fixtures only; no paid audio generation or quality claims.
const { output } = require("./music-dna-fixture.cjs");
function g7Output(context) {
  const prompts = {
    "G7-01":
      "Flowing 4/4 Gospel ballad with gentle live drums, restrained kick, clear snare, cymbal swells and warm melodic electric bass. Expressive grand piano, warm organ, sustained pads, clean electric guitar, subtle acoustic guitar, soft strings and layered choir build gradually. Piano intro, meaningful verse, memorable chorus, expanded second verse, uplifting bridge and full-band final chorus. Original faithfulness and hope lyrics use the selected language; keep vocals clear and choir entrances balanced.",
    "G7-02":
      "Relaxed African soul drum groove with soft snare, gentle kick, restrained hi-hats and natural fills. Deep warm electric bass supports soulful grand piano, electric piano, gentle organ, acoustic guitar, subtle electric guitar, warm strings and restrained backing harmonies. Piano or acoustic intro, storytelling verse, emotional chorus, second verse, instrumental interlude, powerful bridge and final chorus. Original believable perseverance and family testimony gets natural breathing room and warm live dynamics.",
    "G7-03":
      "Intimate soulful worship with soft live drums, restrained snare, gentle cymbals, delicate percussion and warm sustained bass. Expressive piano, mellow electric piano, atmospheric pads, gentle organ, ambient guitar, soft strings and layered backing harmonies expand gradually. Piano intro, reflective verse, emotional chorus, expanded harmonic section, gentle bridge and heartfelt closing refrain. Original mercy and forgiveness lyrics stay prayerful in the selected language; preserve space and minimal fills.",
    "G7-04":
      "Relaxed midtempo Gospel R&B pocket with controlled kick and snare, syncopated hi-hats and occasional live fills. Rounded melodic bass locks to the kick. Rhodes-style electric piano, rich extended chords, warm synth pads, clean electric guitar, acoustic guitar, subtle strings and soulful harmonies support original conversational grace and transformation hooks. Electric-piano intro, melodic verse, smooth chorus, second verse, instrumental groove, expressive bridge and final chorus; keep layers balanced.",
    "G7-05":
      "Spacious atmospheric ballad with minimal percussion, soft kick pulses, delicate cymbals, restrained tom accents and deep sustained bass. Soft grand piano, atmospheric pads, ambient keys, acoustic guitar, ambient electric guitar, cinematic strings and airy backing harmonies leave natural space. Atmospheric intro, intimate verse, reflective chorus, cinematic instrumental passage, expanding bridge and peaceful final refrain. Use original understandable hope and restoration imagery in the selected language; avoid rhythmic pressure.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g7Output };
