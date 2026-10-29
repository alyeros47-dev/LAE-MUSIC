"use strict";
// Independent synthetic replies only; no paid provider/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function r7Output(context) {
  const prompts = {
    "R7-01":
      "Live Jamaican gospel roots worship with natural one-drop kick/rimshot on beat three, relaxed hats, tasteful toms, congas, shakers and tambourine. Deep warm electric bass sustains syncopated melodic notes below Hammond organ bubbles, soft piano, vintage electric piano and clipped offbeat guitar skank with short lead responses. Soft brass and optional compatible harmonies remain vocal-friendly. Bass/organ intro, reflective worship verse, uplifting chorus, second verse, fuller chorus, reggae passage, worship bridge and final chorus. Original meaningful Christian worship follows the customer topic; warm live dynamics and clear bass avoid generic pop-worship loops or excess pads.",
    "R7-02":
      "Energetic Jamaican gospel dancehall with punchy hybrid kick, sharp snare/clap/rimshot, syncopated hats, shakers and short percussion rolls. Deep clean electronic sub-bass uses short rhythmic notes and controlled slides beneath bright synth plucks, organ stabs, piano accents and sparse clean guitar skank. Congas, brass, tambourine and restrained transitions stay clear. Immediate bass/drum intro, rhythmic praise verse, explosive chorus, second verse, dancehall break, praise bridge and final celebration chorus. Original joyful Christian hooks follow the topic; rhythmic singing or spoken passages only if requested performance permits, no forced deejay persona. Clean powerful riddim, not trap or EDM.",
    "R7-03":
      "Bold gospel reggae-dancehall testimony with syncopated heavy kick, sharp snare/rimshot, controlled hats, short fills and occasional one-drop contrast. Organic punchy electric bass repeats low motifs with expressive fills under Hammond organ bubbles, piano stabs, bright electric piano and tight offbeat guitar skank with blues replies. Brass, congas, shakers, tambourine and tasteful dub effects preserve narrative space. Bass/drum intro, storytelling verse, declarative chorus, second testimony verse, roots passage, breakdown and final chorus. Original Christian redemption story follows the topic with struggle, turning point and hopeful conclusion when appropriate; organic bass distinguishes it from electronic club dancehall.",
    "R7-04":
      "Comforting soulful Jamaican gospel lovers rock with soft one-drop kick/rimshot, relaxed hats, light toms, congas and shakers. Deep smooth electric bass flows with sustained notes, passing tones and gentle slides beneath expressive acoustic piano, Rhodes, Hammond organ bubbles, pads and gentle offbeat guitar skank with acoustic guitar accents. Soft strings, brass and optional compatible harmonies preserve vocal space. Piano/organ intro, reflective verse, heartfelt chorus, second verse, guitar passage, emotional worship bridge and final chorus. Original meaningful Christian comfort and trust lyrics follow the topic; warm gospel chord extensions and natural dynamics retain reggae without harsh drums or fixed voice gender.",
    "R7-05":
      "Distinctive Nigerian gospel reggae with strong one-drop or moderate steppers kick/snare, steady hats, expressive toms and Nigerian hand percussion. Deep warm electric bass rolls with melodic slides and syncopation beneath Hammond organ bubbles, bright piano, warm electric piano and clean offbeat guitar skank with Nigerian Highlife-inspired replies. Talking-drum accents, congas, shekere, tambourine and restrained brass remain clear. Percussion/bass intro, storytelling verse, praise chorus, second verse, guitar/organ groove, testimony bridge and final chorus. Original African Christian encouragement follows the topic without forced Pidgin. Audible clean bass and Jamaican roots survive regional accents, not Afrobeats or Amapiano loops.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r7Output };
