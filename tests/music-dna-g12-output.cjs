"use strict";
// Synthetic provider text only; no paid generation or audio-quality claims.
const { output } = require("./music-dna-fixture.cjs");
function g12Output(context) {
  const prompts = {
    "G12-01":
      "Western soulful Gospel ballad with controlled live drums, warm kick, expressive snare and deep melodic bass passing notes. Expressive grand piano, rich Hammond-style organ, warm electric piano, sustained pads, cinematic strings, clean electric guitar, acoustic guitar and layered choir build gradually. Piano intro, intimate verse, powerful chorus, expanded second verse, instrumental development, emotional bridge and majestic choir-supported final chorus. Original grace and redemption lyrics; warm harmonies and controlled climax.",
    "G12-02":
      "Gentle Western acoustic worship in steady 4/4 with soft live drums, restrained snare, light hi-hats and smooth warm bass. Acoustic guitar, soft piano, warm organ, sustained pads, clean electric guitar, gentle strings and restrained congregational harmonies support clear original trust and thanksgiving lyrics. Acoustic intro, reflective verse, memorable chorus, second verse, gentle instrumental interlude and uplifting final chorus. Simple accessible melodies, natural phrasing and warm restrained band balance.",
    "G12-03":
      "Cinematic Western worship with gentle live drums, restrained kick/snare, cinematic tom accents and sustained warm bass. Grand piano, atmospheric pads, orchestral keyboard textures, cinematic strings, ambient electric guitar, acoustic guitar and layered harmonies develop gradually. Piano-and-strings intro, reflective verse, melodic chorus, orchestral instrumental passage, emotional bridge and expansive final chorus. Original eternity and hope imagery; expressive orchestral dynamics, depth and spacious melodic phrasing.",
    "G12-04":
      "Midtempo Western worship-rock in steady 4/4 with live kick/snare, rhythmic hi-hats, controlled toms and driving synchronized bass. Rhythmic acoustic guitar, melodic electric guitar, ambient layers, bright piano, atmospheric pads, subtle synths and congregational harmonies support original enduring-love and praise hooks. Acoustic intro, melodic verse, uplifting chorus, second verse, instrumental build, strong bridge and final congregational chorus. Memorable group melody, strong momentum and balanced live-band energy.",
    "G12-05":
      "Expansive Western congregational worship with controlled live drums, warm kick, expressive snare, tom fills and deep melodic bass. Grand piano, warm organ, atmospheric pads, layered synths, electric guitar, acoustic guitar, subtle strings and rich choir harmonies develop progressively. Piano intro, reflective verse, powerful chorus, second verse, instrumental worship passage, climactic bridge and majestic final chorus. Original holiness and adoration lyrics; natural emotional development and powerful balanced band atmosphere.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g12Output };
