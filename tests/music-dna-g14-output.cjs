"use strict";
// Synthetic provider text only; no paid calls or generated-audio claims.
const { output } = require("./music-dna-fixture.cjs");
function g14Output(context) {
  const prompts = {
    "G14-01":
      "Soulful Congolese worship with gentle live drums, warm kick, restrained snare, delicate African percussion and deep melodic bass passing notes. Grand piano, warm organ, atmospheric pads, clean electric guitar with Congolese phrases, cinematic strings, shakers and layered choir develop naturally. Atmospheric piano intro, reflective verse, emotional chorus, expanded second verse, worship passage and powerful choir-supported final chorus. Original surrender and renewal lyrics; warm live instruments and expressive harmony.",
    "G14-02":
      "Energetic Congolese Gospel with live drums, driving kick, crisp snare, tom rolls, congas and African percussion. Bouncy melodic bass supports bright piano, lively organ, synth accents, interlocking electric guitars with original soukous phrases, brass, shakers and powerful choir. Drum/guitar intro, energetic verse, choir chorus, instrumental guitar passage, call-and-response and celebratory final chorus. Original victory and thanksgiving lyrics; flowing Congolese guitar interplay and strong live dance momentum.",
    "G14-03":
      "Ivorian urban Afro-Gospel with punchy kick, crisp snare, syncopated hi-hats, rhythmic claps, African percussion and controlled electronic accents. Deep electronic/electric bass supports bright synth hooks, warm pads, piano accents, clean electric guitar, brass and layered backing harmonies. Synth/drum intro, melodic verse, catchy Gospel chorus, instrumental groove, second verse and energetic final chorus. Original purpose and protection lyrics; clear powerful lows and vibrant Ivorian rhythmic production.",
    "G14-04":
      "Smooth Francophone Afro-soul Gospel with R&B phrasing, warm drums, crisp snare, delicate hi-hats, subtle shakers and restrained percussion. Warm melodic bass supports Rhodes electric piano, atmospheric pads, warm grand piano, clean electric guitar, gentle acoustic guitar, soft strings and soulful harmonies. Soft keys intro, intimate verse, melodic chorus, second verse, reflection, expressive bridge and uplifting final chorus. Original love and comfort testimony; gentle Afro-pop syncopation without excessive dance percussion.",
    "G14-05":
      "Deep Congolese prayer worship with minimal introductory African percussion, soft live kick, restrained snare, expressive tom swells and deep sustained bass. Atmospheric pads, expressive grand piano, warm organ, ambient electric guitar with subtle Congolese phrases, cinematic strings and rich choir harmonies grow gradually. Atmospheric intro, prayerful verse, recurring refrain, instrumental development, emotional bridge and controlled powerful final chorus. Original surrender and mercy prayers; spacious phrasing and warm intense harmony.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g14Output };
