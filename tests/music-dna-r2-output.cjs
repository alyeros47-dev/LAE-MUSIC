"use strict";
// Independent synthetic provider replies; no paid model or music calls.
const { output } = require("./music-dna-fixture.cjs");
function r2Output(context) {
  const prompts = {
    "R2-01":
      "Melodic South African roots reggae with strong one-drop kick and crisp snare/rimshot on beat three, relaxed hats, natural tom fills and restrained African percussion. Deep rounded electric bass rolls with sustained melodic passing notes below Hammond organ bubbles, bright acoustic piano, smooth electric piano and clean guitar skank with South African pop-influenced lead replies. Rolling bass/drum intro, reflective verse, powerful chorus, guitar/organ passage, second verse, melodic bridge and final chorus. Original emotional storytelling and uplifting hooks follow the chosen topic; full-bodied live warmth, audible clean bass and clear separation, not generic pop-reggae.",
    "R2-02":
      "Energetic West African roots reggae with Ivorian melodic guitar character: firm one-drop or moderate steppers kick/snare, steady hats, congas, shakers and djembe accents. Thick rolling syncopated electric bass supports Hammond organ bubbles, piano stabs, bright electric piano, sharp guitar skank and a lively brass section. Percussion/bass intro, melodic verse, strong chorus, brass/guitar groove, second verse, drum/bass break and final chorus. Original declarative melodic hooks follow the customer subject. Clean powerful lows and natural regional interplay avoid random traditional additions, dancehall loops and excessive electronics.",
    "R2-03":
      "Serious West African conscious roots with heavy one-drop or restrained steppers kick, sharp rimshot, controlled hats, deep toms and measured djembe/conga conversations. Very deep electric bass repeats hypnotic long low motifs beneath dark organ bubbles, sparse piano, tight offbeat guitar skank, restrained blues replies, subtle balafon and brass. Heavy bass/percussion intro, storytelling verse, declarative chorus, roots passage, second verse, restrained percussion breakdown and final chorus. Original thoughtful phrases follow the customer topic without forced political or religious content; controlled intensity, clean drums and uncluttered live separation.",
    "R2-04":
      "Soulful Nigerian roots reggae: deep one-drop kick, strong snare/rimshot, relaxed hats, expressive toms and restrained talking-drum accents with congas/shakers. Thick warm electric bass rolls with melodic slides and passing notes below organ bubbles, expressive acoustic/electric piano, clean guitar skank and blues-influenced lead bends/solos. Guitar/bass intro, soulful verse, strong chorus, original blues guitar solo, second verse, percussion/organ breakdown and final chorus. Emotional original melody follows the chosen topic; powerful live warmth, prominent clear bass and Nigerian rhythmic accents preserve the reggae foundation rather than generic Afrobeats drums.",
    "R2-05":
      "Uplifting Ghanaian pan-African roots reggae with warm one-drop drums, crisp rimshot, relaxed hats, flowing shakers and congas. Deep rounded electric bass has melodic reggae movement and Highlife-inspired passing notes beneath Hammond organ bubbles, bright piano, warm electric piano and clean guitar skank blended with bright Ghanaian Highlife picking and lead phrases. Djembe, shekere, subtle brass and balafon support the groove. Guitar/percussion intro, verse, uplifting chorus, Highlife-reggae passage, second verse, percussion bridge and final chorus. Original joyful melody follows the customer topic; optional harmonies only if vocal settings permit, clean bass and natural separation without losing roots rhythm.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r2Output };
