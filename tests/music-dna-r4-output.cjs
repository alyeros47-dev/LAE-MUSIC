"use strict";
// Independent synthetic replies; no paid provider or audio calls.
const { output } = require("./music-dna-fixture.cjs");
function r4Output(context) {
  const prompts = {
    "R4-01":
      "Warm modern Jamaican roots reggae: relaxed one-drop kick, crisp rimshot, natural tom fills and gentle percussion. Deep rounded electric bass flows with melodic passing notes beneath Hammond organ bubbles, warm Rhodes, bright acoustic piano, pads and clean offbeat guitar skank with bright lead and restrained acoustic accents. Congas, shakers, soft brass and tambourine stay natural. Guitar/organ intro, melodic verse, uplifting chorus, roots passage, second verse, short dub breakdown and final chorus. Original expressive melody follows the customer topic; polished live warmth, punchy drums and prominent clear bass rather than tropical pop or excessive electronics.",
    "R4-02":
      "Spacious modern Jamaican dub roots with tight one-drop or half-time kick, sharp rimshot, controlled hats and subtle hip-hop drum accents. Thick sub-bass blends with warm electric bass in hypnotic repeating motifs and occasional slides under dark electric piano, vintage organ bubbles, synth pads and minimal muted guitar skank. Restrained brass, congas, shakers and analog dub echoes stay tasteful. Atmospheric bass/keyboard intro, reflective verse, restrained chorus, dub passage, second verse, bass/drum breakdown and final chorus. Original understated conversational hooks; modern low-frequency clarity and controlled effects preserve reggae rather than generic hip-hop or trap hats.",
    "R4-03":
      "Powerful contemporary roots reggae with strong one-drop or steppers kick, crisp snare, controlled hats, tom accents and energetic percussion. Deep electric bass repeats syncopated low-register motifs with occasional melodic runs below Hammond organ bubbles, piano stabs, dark electric piano, restrained synths and sharp offbeat guitar skank. Brass stabs, congas, shakers and subtle hip-hop textures support assertive rhythmic phrasing. Heavy bass/drum intro, rhythmic verse, powerful chorus, brass/guitar passage, second verse, drum/bass breakdown and final chorus. Original commanding hooks follow the customer topic without forced politics; clean punchy reggae, not generic trap or distorted lows.",
    "R4-04":
      "Intense roots-based urban reggae fusion: heavy one-drop or steppers kick, sharp snare, syncopated dancehall accents, rolling toms and strong percussion breaks. Deep electric bass plus sub-bass uses rhythmic pressure and expressive slides beneath dark organ bubbles, piano stabs, restrained cinematic synths and tight muted guitar skank. Nyabinghi-influenced percussion, congas, brass and dub effects stay separated. Dramatic bass/percussion intro, rhythmic verse, powerful chorus, reggae-dancehall groove, second verse, heavy drum/bass breakdown and final chorus. Original intense hooks follow the chosen subject; hip-hop influence complements authentic reggae, without EDM drops or excess trap.",
    "R4-05":
      "Soulful contemporary roots reggae with warm one-drop kick, crisp rimshot, relaxed hats, natural tom fills and gentle hand percussion. Deep melodic electric bass flows with passing notes and sustained warmth beneath rich acoustic piano, warm Rhodes, Hammond organ bubbles, pads and clean offbeat guitar skank with expressive lead and gentle acoustic guitar accents. Soft brass, strings, congas and shakers remain balanced. Piano/guitar intro, heartfelt verse, uplifting chorus, reggae-soul passage, second verse, emotional bridge and final chorus. Original expressive melodies follow the customer topic; optional harmonies respect voice settings. Clear bass and warm live dynamics retain reggae rather than generic R&B.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r4Output };
