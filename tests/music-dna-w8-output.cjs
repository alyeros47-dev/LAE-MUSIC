"use strict";
// Independent synthetic replies only; no paid provider/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w8Output(context) {
  const prompts = {
    "W8-01":
      "Traditional Appalachian/Nashville country with light acoustic kick, gentle brushed snare, simple backbeat, subtle hats and occasional train-beat accents. Warm upright bass or electric bass plays root-fifth movement and passing tones below acoustic piano and bright steel-string acoustic guitar with alternating bass-note picking, strumming and fingerpicked phrases. Fiddle, mandolin, gentle banjo, dobro and pedal steel stay natural. Guitar/fiddle intro, storytelling verse, warm chorus, second verse, fiddle/mandolin passage, reflective bridge and final chorus. Original clear melodies follow topic and selected voice; faith only if requested, no forced regional accent, electronic sub groove or pop drums.",
    "W8-02":
      "Classic Nashville country-pop with warm acoustic kick, soft snare, gentle hats, brushed accents, tasteful tom fills and natural dynamics. Deep rounded electric bass uses steady country movement and sustained passing notes beneath expressive acoustic piano, warm electric piano and restrained organ. Gentle strummed/fingerpicked acoustic guitar, clean electric replies, expressive pedal steel, fiddle, soft strings and harmonica preserve storytelling space. Guitar intro, verse, heartfelt chorus, second verse, pedal-steel passage, reflective bridge and final chorus. Original conversational melody follows topic and selected voice; mature warm studio clarity rather than soft rock, electronic dance drums or excessive orchestration.",
    "W8-03":
      "Powerful Southern country-blues with deep live kick, strong snare, relaxed hats, expressive toms and a blues shuffle or straight country-rock groove. Thick warm electric bass uses walking phrases, melodic slides and kick interaction beneath Hammond organ, blues acoustic piano and Rhodes. Expressive blues electric guitar, controlled overdriven lead bends, acoustic rhythm guitar and slide accents blend with harmonica, pedal steel and tambourine. Guitar/bass intro, storytelling verse, powerful chorus, second verse, guitar passage, emotional bridge and final chorus. Original soulful melody follows topic and voice without forced rasp; natural live force rather than arena rock or uncontrolled distortion.",
    "W8-04":
      "Contemporary Nashville country-rock with strong live kick, punchy snare, steady hats, expressive toms and dynamic cymbal accents. Deep melodic electric bass supports expressive acoustic piano, warm electric piano, subtle organ and restrained pads. Bright acoustic guitar, clean electric fills, controlled country-rock leads, fiddle, pedal steel, cinematic strings and tambourine retain country identity. Guitar intro, emotional verse, rising pre-chorus, powerful chorus, second verse, electric-guitar passage, dramatic bridge and final chorus. Original strong country-pop hooks follow topic and selected voice without forced high register; polished live dynamics and clear bass, not generic pop or EDM.",
    "W8-05":
      "Organic intimate acoustic folk-country centered on fingerpicked steel-string acoustic guitar, alternating bass-note patterns, delicate arpeggios and gentle strumming. Warm upright bass or acoustic bass sustains simple melodic support below soft acoustic piano and restrained electric piano. Very light acoustic kick, soft brushed snare, gentle shaker and sparse hand percussion stay natural with mandolin, fiddle, harmonica and subtle cello. Solo guitar intro, intimate storytelling verse, gentle chorus, second verse, acoustic passage, reflective bridge and final chorus. Original conversational melodies follow the topic and selected voice; clear personal studio warmth, not electronic production, pop-ballad drums or dense orchestration.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w8Output };
