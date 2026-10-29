"use strict";
// Independent synthetic provider replies; no paid music/model calls.
const { output } = require("./music-dna-fixture.cjs");
function r1Output(context) {
  const prompts = {
    "R1-01":
      "Warm Jamaican roots reggae: one-drop kick and snare/rimshot on beat three, relaxed hats, ghost notes and restrained tom fills. Deep rounded electric bass sustains syncopated melodic notes beneath clean offbeat guitar skank, Hammond organ bubbles, acoustic piano, congas and restrained brass. Bass/drum intro, conversational verse, uplifting communal chorus, guitar/organ passage, second verse, short dub breakdown and final chorus. Original hopeful melody and topic-led words; audible rolling bass, organic live dynamics and balanced clear instruments, without dancehall or generic pop.",
    "R1-02":
      "Firm Jamaican roots with heavy one-drop or restrained steppers drums, kick, sharp snare, controlled hats and purposeful tom fills. Thick low-register electric bass motifs drive sharp guitar skank, expressive blues lead bends, deep Hammond organ, piano stabs, warm electric piano, brass and congas. Bass/guitar intro, forceful verse, declarative chorus, lead passage, second verse, drum/bass breakdown and final chorus. Original assertive melody follows the chosen topic; commanding clean lows, clear separation and restrained dub effects rather than lightweight tropical pop or distorted dancehall.",
    "R1-03":
      "Slow meditative Jamaican roots reggae: heavy one-drop kick, restrained rimshot, spacious hats, rolling toms and Nyabinghi hand-percussion conversations. Very deep sustained electric bass repeats a subtly evolving hypnotic motif under dark Hammond organ bubbles, sparse piano, minimal offbeat guitar skank and subtle horns. Hand-drum intro, bass/drum groove, reflective verse, meditative chorus, extended roots passage, second verse, percussion breakdown and final refrain. Original chant-like melody with meaningful development follows the customer topic without imposed beliefs; warm analog space, audible bass and uncrowded live textures.",
    "R1-04":
      "Traditional communal Jamaican roots reggae: natural one-drop kick/snare, gentle hats, restrained toms and hand percussion. Warm flowing electric bass passing notes support clean offbeat guitar skank, Hammond organ bubbles, rhythmic acoustic piano, vintage electric piano, congas, shakers, tambourine and soft brass. Guitar/organ intro, storytelling verse, warm chorus, roots passage, second verse, reflective bridge and final chorus. Original communal refrain; backing harmonies only if vocal settings permit, no forced harmony for a single voice. Clear warm live balance with audible melodic bass, not electronic dancehall.",
    "R1-05":
      "Soulful Jamaican roots reggae with relaxed one-drop kick, gentle rimshot/snare, flowing hats, light toms and Caribbean percussion. Deep rounded electric bass uses melodic runs, occasional slides and warm sustained notes beneath expressive Hammond organ, acoustic/vintage electric piano, clean offbeat guitar skank, soft lead replies, congas, soft brass and restrained dub effects. Gentle organ/guitar intro, thoughtful verse, uplifting chorus, bass/guitar groove, second verse, reflective bridge and final chorus. Original soulful melodic ornaments and customer-led lyrics; natural live clarity and smooth audible bass rather than generic R&B or synthetic dancehall.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r1Output };
