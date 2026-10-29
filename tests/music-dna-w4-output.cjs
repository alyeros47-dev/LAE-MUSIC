"use strict";
// Independent synthetic replies only; no paid provider/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w4Output(context) {
  const prompts = {
    "W4-01":
      "Guitar-driven modern R&B/alternative soul with warm kick, tight snare/rimshot, relaxed syncopated hats, ghost notes and occasional live fills. Deep rounded electric bass or synth bass sustains warm melodic slides below Rhodes, analog pads, subtle organ and seventh/ninth voicings. Expressive clean electric guitar uses blues phrases, gentle bends, slides and emotional replies; soft strings and compatible optional harmonies stay clear. Atmospheric guitar intro, intimate verse, smooth chorus, second verse, expressive guitar passage, reflective bridge and final chorus. Original soulful phrases follow the topic and voice; intimate organic space, not generic trap or distorted guitar.",
    "W4-02":
      "Dreamy atmospheric alternative R&B with sparse kick, dry snare/rimshot, syncopated hats, subtle percussion glitches, half-time emphasis and deliberate rhythmic silence. Deep smooth sub-bass sustains minimal melodic movement below textured synth pads, detuned electric piano and unconventional extended chords. Sparse clean/ambient guitar plucks and reversed instrumental effects stay restrained. Atmospheric intro, introspective verse, understated chorus, second verse, experimental passage, reflective bridge and final chorus. Original conversational melody uses coherent unexpected turns while following topic and selected voice; clear intimate space rather than trap loops or chaotic effects.",
    "W4-03":
      "Minimal intimate R&B with soft deep kick, warm snare/rimshot, sparse hats, subtle rolls and minimal fills. Deep rounded sub-bass or electric bass sustains restrained notes under warm Rhodes, soft acoustic piano, mellow seventh/ninth progressions and atmospheric pads. Gentle clean fingerpicked guitar, subtle strings and compatible harmonies remain sparse. Guitar/Rhodes intro, intimate verse, restrained chorus, second verse, short passage, reflective bridge and final chorus. Original conversational melody follows the customer topic without forced breathiness; clear emotional storytelling and gentle rises rather than club production or dramatic orchestration.",
    "W4-04":
      "Organic alternative soul with gentle live kick/snare, relaxed hats, ghost notes and natural dynamic changes. Deep warm electric bass sustains melodic passing tones beneath expressive acoustic piano, Rhodes, rich jazz-soul extensions and restrained organ. Gentle acoustic guitar, clean fingerpicked electric replies, soft strings and subtle brass keep warm harmonic depth. Piano/guitar intro, reflective verse, warm chorus, fuller second verse, guitar passage, emotional bridge and final chorus. Original thoughtful melody follows topic and selected voice; gospel-derived musical harmony does not force Christian lyrics. Natural organic movement rather than electronic excess or generic trap.",
    "W4-05":
      "Dark cinematic contemporary R&B with restrained deep kick, dry snare/rimshot, sparse hats, subtle percussion and occasional cinematic toms. Deep rounded electric bass or synth bass sustains restrained movement with warm sub-bass reinforcement below dark acoustic piano, warm Rhodes, analog pads and subtle organ. Sparse clean guitar with blues replies, cinematic strings, cello and soft brass preserve clear vocal space. Piano/strings intro, intimate verse, emotional chorus, second verse, cinematic passage, reflective bridge and final chorus. Original emotionally intense melodies follow topic and selected voice without a forced pitch or range; spacious controlled drama, not excess orchestration or trap.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w4Output };
