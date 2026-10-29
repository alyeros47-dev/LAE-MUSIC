"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s8Output(context) {
  const prompts = {
    "S8-01":
      "Grand percussion-led Yoruba Fuji with dominant talking drum ensemble, sakara, omele, agogo, shekere, congas and supporting kick/snare. Rounded electric bass interacts with percussion beneath warm organ, bright piano, restrained synths, rhythmic guitar and occasional brass. Extended traditional intro, rhythmic verse, celebratory refrain, talking-drum solo, second verse, expanded percussion ensemble and final celebration. Original cultural-pride and community phrases; evolving ceremonial conversations lead, not generic Afrobeats loops.",
    "S8-02":
      "Fast contemporary Fuji with powerful talking drum rolls, sakara, omele, agogo, shekere, congas, sharp snare and strong kick support. Thick bouncy bass syncs to traditional percussion beneath bright organ, rhythmic piano, short synth hooks, guitar and brass. Fast percussion intro, rhythmic verse, festive refrain, heavy bass/talking-drum groove, second verse, extended Fuji dance break and final refrain. Original success and friendship lyrics; authentic traditional drums lead modern street-party energy, not electronic beat replacement.",
    "S8-03":
      "Storytelling Yoruba Fuji with conversational talking drum, sakara, omele, agogo, shekere, congas and restrained drum-kit accents. Warm flowing electric bass supports traditional organ, restrained piano, gentle guitar and occasional brass. Traditional intro, storytelling verse, melodic refrain, talking-drum conversation, second verse, extended rhythmic development and closing refrain. Original wisdom and social-responsibility narratives; evolving intricate percussion and sung/spoken-rhythm phrasing, not generic party chants.",
    "S8-04":
      "Guitar-led classic Yoruba Juju with interlocking clean electric guitars, melodic lead/picking parts and steel-guitar-like responses. Deep melodic electric bass supports warm organ, electric piano, natural kick/snare, talking drum, congas, shekere and agogo. Extended guitar intro, melodic verse, celebratory chorus, interlocking guitar passage, second verse, talking-drum/guitar break and final chorus. Original family and heritage lyrics; warm infectious live dance movement and prominent guitars, never heavy electronic bass overpowering them.",
    "S8-05":
      "Guitar-led traditional Yoruba Juju with gentle interlocking electric guitar melodies and rhythmic picking. Warm melodic electric bass supports traditional organ, warm piano, electric piano, soft talking drum, shekere, congas, agogo and subtle brass. Gentle guitar/organ intro, storytelling verse, warm refrain, guitar passage, second verse, reflective bridge and final refrain. Original wisdom and life-lessons lyrics; mature reflective harmony and natural live-band warmth, not aggressive club drums or overcrowded synths.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s8Output };
