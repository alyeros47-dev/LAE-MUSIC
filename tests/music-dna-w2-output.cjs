"use strict";
// Independent synthetic replies only; no paid provider/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w2Output(context) {
  const prompts = {
    "W2-01":
      "Warm intimate 1990s-style R&B slow jam with relaxed swing, soft deep kick, crisp snare/rimshot, restrained hats, ghost notes and spacious fills. Deep rounded electric bass or synth bass sustains smooth gently syncopated phrases below Rhodes, rich seventh/ninth chords, warm piano, subtle organ and analog pads. Clean fingerpicked guitar fills, occasional blues replies, soft strings and compatible optional harmonies remain intimate. Electric-piano intro, intimate verse, melodic chorus, second verse, guitar/keyboard passage, emotional bridge and final chorus. Original conversational melody follows the customer topic without default explicit sexual content; warm luxurious lows, not trap or generic pop.",
    "W2-02":
      "Polished dance-oriented R&B with punchy kick, crisp snare, syncopated hats, claps and controlled electronic percussion. Deep electric bass or synth bass uses short rhythmic phrases and slides locked to the kick beneath bright synth plucks, rhythmic electric piano and warm pads. Clean funk guitar plays muted sixteenth-note strumming and short melodic replies; subtle brass, shakers and tasteful transitions stay separated. Immediate drum/bass intro, rhythmic verse, rising pre-chorus, catchy chorus, dance groove, second verse, bridge and final chorus. Original confident hooks follow the customer subject; strong R&B backbeat and smooth transitions rather than EDM drops or excessive trap hats.",
    "W2-03":
      "Smooth mature romantic R&B with soft kick, warm snare, restrained hats, ghost notes and gentle percussion fills. Deep flowing electric bass sustains warm melodic phrases and passing tones under Rhodes, expressive acoustic piano, seventh/ninth voicings and subtle organ. Gentle clean guitar picking and soulful replies, soft strings, warm pads and compatible optional harmonies stay restrained. Piano/guitar intro, romantic verse, heartfelt chorus, second verse, gentle passage, emotional bridge and final chorus. Original tender conversational melody follows the chosen topic; clear emotional storytelling and warm intimate lows, not aggressive dance drums or generic slow pop.",
    "W2-04":
      "Elegant piano-led R&B with expressive grand piano, rich jazz/soul chord extensions and tasteful harmonic substitutions. Warm melodic electric bass and passing tones support gentle live/hybrid kick, restrained snare, soft hats and subtle tom fills. Gentle electric piano, restrained organ, soft acoustic guitar and fingerpicked clean electric-guitar replies stay intimate with subtle strings and compatible harmonies. Solo piano intro, intimate verse, melodic chorus, fuller second verse, piano-led passage, emotional bridge and final chorus. Original graceful melody follows topic and selected voice capability; beautiful piano clarity without orchestral excess, generic ballad drama or forced vocal acrobatics.",
    "W2-05":
      "Stylish midtempo pop-R&B with tight kick, crisp snare, rhythmic claps, controlled hats and polished syncopated electronic percussion. Deep smooth electric bass or synth bass uses melodic rhythm and occasional octave jumps locked to the kick beneath bright rhythmic piano, warm electric piano, clean synth plucks and pads. Muted funk-influenced electric guitar, subtle strings, brass and shakers stay clear. Piano/bass intro, smooth verse, melodic pre-chorus, catchy chorus, second verse, R&B groove, bridge and final chorus. Original polished hooks and verse-to-chorus transitions follow the topic; full clean bass and sophisticated rhythmic movement, not generic EDM or excess trap.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w2Output };
