"use strict";
// Independent synthetic provider replies, never paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function r3Output(context) {
  const prompts = {
    "R3-01":
      "Intimate Jamaican lovers rock: soft one-drop kick and snare/rimshot, relaxed hats, ghost notes and gentle tom fills. Deep rounded electric bass sustains smooth syncopated phrases beneath Hammond organ bubbles, mellow electric piano, soft acoustic piano and clean offbeat guitar skank with sparse romantic lead replies. Soft strings, restrained brass, shakers and congas stay gentle. Organ/bass intro, intimate verse, understated chorus, gentle guitar passage, second verse, emotional bridge and final chorus. Original tender melody follows the chosen subject; silky prominent bass and spacious warm balance rather than Western slow-jam or bright dancehall.",
    "R3-02":
      "Heartfelt Jamaican reggae-soul with smooth one-drop kick, crisp rimshot, flowing hats and gentle toms. Thick melodic electric bass runs support rich acoustic piano, warm Rhodes, Hammond organ bubbles, soulful chord voicings and clean guitar skank with restrained picking. Soft brass, strings, congas and shakers stay balanced. Piano/organ intro, soulful verse, emotional chorus, reggae-soul groove, second verse, expressive bridge and expanded final chorus. Original powerful refrain and customer-led words; gospel-influenced harmony means chords, not religious lyrics. Optional harmonies follow voice settings; warm live separation retains reggae rhythm, not generic R&B.",
    "R3-03":
      "Classic warm Jamaican romantic reggae with natural one-drop kick/snare, bright hats, gentle toms and light Caribbean percussion. Deep melodic electric bass uses flowing runs, expressive slides and sustained notes beneath bright Hammond organ bubbles, warm piano and clean guitar skank with short melodic lead replies. Brass, congas, shakers and tambourine support the relaxed dance pulse. Guitar/organ intro, melodic verse, uplifting chorus, brass/guitar passage, second verse, warm bridge and final chorus. Original hopeful melodies follow the customer topic; optional backing layers follow voice settings. Clear rolling bass and live warmth without electronic club drums or tropical pop.",
    "R3-04":
      "Mature Jamaican lovers rock with gentle one-drop kick, crisp rimshot, soft hats, restrained toms and subtle hand percussion. Rounded electric bass runs and sustained notes underpin warm organ, expressive acoustic piano, mellow electric piano, pads and clean offbeat guitar skank with restrained acoustic guitar accents. Soft brass, strings, shakers and congas stay warm. Gentle guitar/piano intro, reflective verse, romantic chorus, organ/guitar passage, second verse, emotional bridge and final chorus. Original thoughtful melodic storytelling follows the requested subject; elegant natural live dynamics and prominent rich bass rather than dramatic pop or dancehall.",
    "R3-05":
      "Polished Caribbean lovers-rock reggae-pop crossover with warm kick, crisp snare, controlled hats and gentle percussion. Deep smooth electric bass or electronic bass retains melodic reggae movement and rounded sub-bass support below bright electric piano, synth pads, rhythmic organ bubbles and clean offbeat guitar skank with smooth lead responses. Soft brass, strings, shakers and congas remain restrained. Keyboard/bass intro, smooth verse, catchy chorus, reggae-pop groove, second verse, melodic bridge and final chorus. Original accessible romantic hooks follow the chosen subject; polished R&B harmony retains the reggae offbeat without excessive EDM or thin lows.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r3Output };
