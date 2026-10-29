"use strict";
// Synthetic G8 provider text only; no paid calls or generated-audio claims.
const { output } = require("./music-dna-fixture.cjs");
function g8Output(context) {
  const prompts = {
    "G8-01":
      "African Gospel pop-rock with steady danceable 4/4, energetic live drums, punchy kick, crisp snare and warm driving electric bass. Bright piano, warm pads, lively organ and electronic textures support prominent melodic electric guitar leads, rhythmic guitar, brass accents and layered Gospel harmonies. Guitar or keyboard intro, melodic verse, uplifting chorus, second verse, expressive guitar instrumental and powerful final chorus. Original encouraging divine-love lyrics; polished band balance and clear vocals.",
    "G8-02":
      "Driving African praise with strong live kick and snare, energetic tom rolls, cymbal crashes and syncopated percussion. Deep punchy bass supports bright Gospel piano, rhythmic organ stabs, synth textures, electric guitar, brass section, congas and shakers. Drum-and-keyboard intro, energetic verse, large choir chorus, call-and-response, instrumental praise break and explosive final chorus. Original victory and faithfulness lyrics; strong controlled lows, rich group harmonies and exciting instrumental transitions.",
    "G8-03":
      "Spacious majestic worship with gentle live drums, restrained kick, soft snare, cymbal swells and warm smooth bass. Grand piano, atmospheric pads, gentle organ, cinematic strings, ambient electric guitar, subtle acoustic guitar and layered choir build gradually. Gentle piano intro, reflective verse, majestic chorus, expanded second verse, instrumental worship passage, expressive bridge and full choir-supported final chorus. Original adoration and holiness lyrics; clear vocal placement and controlled cinematic dynamics.",
    "G8-04":
      "Live worship grows from restrained live drums into stronger kick, snare, tom and cymbal patterns. Deep warm bass sustains then develops rhythmic movement. Atmospheric pads, expressive piano, layered organ, ambient electric guitar, subtle strings, live percussion and expanding choir harmonies build naturally. Atmospheric intro, prayerful verse, memorable refrain, instrumental development, intense bridge, full-band worship climax and peaceful resolution. Original surrender and consecration lyrics; controlled live intensity.",
    "G8-05":
      "Flowing midtempo African Gospel pop with warm kick, crisp snare, rhythmic hi-hats and lively fills. Melodic syncopated bass supports bright piano, warm organ, contemporary pads, rhythmic electric guitar, acoustic guitar, subtle African percussion and rich choir harmonies. Bright intro, melodic verse, memorable chorus, second verse with expanded harmonies, instrumental interlude, uplifting bridge and joyful final chorus. Original divine-love and gratitude lyrics; warm accessible mix with polished choir responses.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g8Output };
