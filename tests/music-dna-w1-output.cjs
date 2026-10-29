"use strict";
// Independent synthetic provider replies; no paid model/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w1Output(context) {
  const prompts = {
    "W1-01":
      "Grand contemporary soul power ballad: intimate grand piano opens over warm sustained electric bass with melodic passing notes. Rich soul/gospel-influenced chords, warm electric piano, restrained organ, clean electric/acoustic guitar, cinematic strings and brass build gradually. Sparse opening percussion develops into deep kick, controlled snare, expressive toms and cymbal swells. Piano intro, reflective verse, rising pre-chorus, powerful chorus, fuller second verse, emotional bridge, climactic final chorus and gentle ending. Original expressive melody follows the customer topic and selected voice range; clear wide strings and dynamic live warmth, not constant loudness or dance-pop.",
    "W1-02":
      "Sweeping cinematic pop-soul ballad with emotional grand piano, soft electric piano/pads and deep smooth electric bass supporting full strings, cello, violin, subtle brass and gentle acoustic/clean electric guitar. Minimal opening drums develop into soft kick, controlled snare, cinematic toms and cymbal swells, with fuller live drums only toward the final chorus. Solo piano intro, intimate verse, emotional pre-chorus, sweeping chorus, second verse with strings, instrumental bridge, powerful final chorus and orchestral resolution. Original graceful long phrases follow the customer topic without forced wedding themes or belting; spacious stereo depth and balanced bass.",
    "W1-03":
      "Silky contemporary R&B ballad with soft kick, crisp snare, gently syncopated hats, ghost notes and subtle fills. Deep rounded electric bass or synth bass sustains melodic passing tones beneath Rhodes, warm piano, lush seventh and ninth chords, restrained organ and soft synth pads. Clean fingerpicked R&B guitar replies, soft strings and compatible optional harmonies stay separated. Electric-piano intro, intimate verse, smooth pre-chorus, melodic chorus, richer second verse, R&B passage, emotional bridge and final chorus. Original flowing melody and tasteful ornament follow the chosen topic and voice capability, never mandatory whistle notes; clear vocals and warm lows without trap or EDM.",
    "W1-04":
      "Powerful secular-capable soul ballad with sparse acoustic piano developing rich gospel-influenced chords, Hammond organ and warm electric piano. Thick sustained electric bass supports deep live kick, strong controlled snare, expressive toms, cymbal swells and occasional half-time emphasis. Soulful electric guitar with blues replies, brass swells, strings and optional compatible harmonies build dynamically. Piano intro, direct verse, rising pre-chorus, powerful chorus, second verse, organ/guitar passage, dramatic bridge and controlled final climax. Original commanding melody follows topic and voice capability; gospel harmony does not force Christian lyrics, extreme belting or constant volume.",
    "W1-05":
      "Intimate deep-soul R&B with soft deep kick, warm rimshot/snare, sparse hats, ghost notes and minimal fills. Very deep rounded electric bass or synth bass sustains restrained melodic movement under dark Rhodes, soft acoustic piano, warm analog pads and subtle organ. Muted clean R&B guitar with gentle blues replies, soft strings and restrained percussion preserve harmonic space. Atmospheric electric-piano intro, intimate verse, restrained chorus, second verse, short guitar/keyboard passage, reflective bridge, understated final chorus and soft ending. Original nuanced conversational melody follows the topic and selected voice without forced low pitch or huge orchestral climax.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w1Output };
