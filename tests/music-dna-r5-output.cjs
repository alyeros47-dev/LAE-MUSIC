"use strict";
// Independent synthetic replies only; no paid provider/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function r5Output(context) {
  const prompts = {
    "R5-01":
      "Polished Jamaican club dancehall with heavy kick, sharp snare/clap accents, syncopated hats, rapid shakers, rimshot fills and tight Caribbean percussion. Thick electronic sub-bass uses short punchy notes and controlled slides locked to the kick beneath bright synth plucks, keyboard stabs, sparse muted guitar, congas and tasteful whistles. Immediate drum/bass intro, rhythmic verse, short pre-chorus, explosive chorus, dancehall break, second verse and final chorus. Original catchy rhythmic hooks follow the customer topic. Optional double-time subdivisions retain the chosen BPM; deep clean bass, sharp clarity and restrained transitions rather than generic EDM drops.",
    "R5-02":
      "Playful Jamaican reggae-dancehall with bouncy kick, crisp snare, light claps, syncopated hats, shakers and gentle Caribbean percussion. Deep rounded electric bass or electronic bass sustains playful melodic movement under bright organ bubbles, rhythmic piano, synth plucks, clean offbeat guitar skank, brass accents and congas. Keyboard/bass intro, storytelling verse, catchy chorus, Caribbean groove, second verse, short rhythmic break and final chorus. Original lighthearted hooks follow the customer topic; humor only when appropriate, never forced for a serious subject. Warm clear bass and relaxed bounce rather than aggressive club drums or excessive effects.",
    "R5-03":
      "Classic Jamaican dancehall riddim with kick/snare patterns, crisp rimshots, syncopated hats, claps, rapid fills and stop-start breaks. Heavy repetitive electronic bass uses punchy motifs and short slides beneath sharp synth stabs, rhythmic organ accents, bright keyboard riffs and minimal offbeat guitar skank. Brass hits, whistles, handclaps and congas stay clear. Strong riddim intro, rhythmic verse, chant-driven chorus, dancehall passage, second verse, drum/bass breakdown and final chorus. Original rhythmic hooks and selected-voice-compatible responses; powerful clean lows and percussion preserve classic identity rather than trap or excessive synth layers.",
    "R5-04":
      "Explosive fast Jamaican dancehall riddim with heavy kick, sharp snare, rapid hats, claps, rolling percussion, dramatic fills and stop-start breaks. Thick electronic sub-bass drives aggressive clean pulses and short slides under bright synth stabs, dramatic riffs and sparse muted guitar accents. Whistles, brass hits, congas and electronic percussion support dynamic transitions. Explosive drum/bass intro, rhythmic verse, powerful chorus, extended dance break, second verse, dramatic percussion breakdown and final dance climax. Original short hooks follow the customer topic; punchy drums, controlled highs and separated bass avoid distortion, muddy lows and generic EDM.",
    "R5-05":
      "Warm melodic Jamaican ragga-dancehall crossover with bouncy kick, crisp snare, relaxed hats, shakers, light claps and gentle Caribbean percussion. Deep electric bass or electronic bass flows with melodic passing notes beneath bright organ bubbles, rhythmic piano stabs, warm electric piano, synth phrases and clean offbeat guitar skank with short lead replies. Brass and congas remain gentle. Keyboard/bass intro, playful verse, melodic chorus, reggae-dancehall groove, second verse, rhythmic bridge and final chorus. Original catchy romantic hooks respect the customer topic and selected single voice or duet; no automatically added performers. Strong clear bass retains authentic Caribbean bounce.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r5Output };
