"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s12Output(context) {
  const prompts = {
    "S12-01":
      "Congolese rumba with warm live kick, crisp snare, rolling toms, congas, shakers and cowbell. Deep melodic electric bass supports bright piano, warm organ and interlocking electric guitars with original soukous/sebene lead phrases. Elegant guitar intro, romantic verse, melodic chorus, guitar transition, sebene dance section, second verse and extended final groove. Original family and romance hooks; guitars/bass dominate clean lows. Base 96–118 BPM; optional 120–136 dance sections only if supported, otherwise increase rhythmic density at base tempo.",
    "S12-02":
      "East/Central African crossover dance-pop with punchy kick, crisp snare, shakers, congas and syncopated percussion. Rounded electronic/electric bass supports bright piano, playful synths, rhythmic organ, pads, melodic guitar, brass and marimba-like plucks. Guitar/percussion intro, melodic verse, catchy chorus, dance groove, second verse, percussion break and final chorus. Original friendship and celebration hooks; explicitly cross-regional fusion, not traditional Congolese rumba or authentic Ivorian dance. Keep melodic guitar and clean strong bass central.",
    "S12-03":
      "Polished Ivorian coupé-décalé with heavy dance kick, sharp snare, claps, rapid hi-hats, congas and shakers. Thick electronic sub-bass supports bright synth stabs, rhythmic piano, sparse electric guitar, whistles and brass. Immediate kick/percussion intro, energetic verse, explosive chorus, dance break, second verse, percussion climax and final chorus. Original confidence and nightlife refrains; powerful clear lows, catchy electronic hooks and syncopated Abidjan club energy, not slow romantic pacing.",
    "S12-04":
      "Explosive Abidjan street coupé-décalé with punchy kick, sharp snare, rapid claps, rolling percussion and fast shakers. Heavy electronic sub-bass has short controlled slides aligned to kick. Sharp synth stabs, minimal guitar, whistles, brass and crowd textures create rhythmic surprises. Explosive percussion intro, rhythmic verse, original chant chorus, heavy dance break, second verse, stop-start breakdown and final climax. Original determination and friendship hooks; maximum clear Ivorian dance energy without muddy bass or generic EDM drops.",
    "S12-05":
      "Uplifting Ivorian Afro-dance with melodic coupé-décalé percussion, punchy kick, crisp snare, shakers and congas. Deep bouncy melodic bass supports bright piano, warm organ, synth hooks, pads, clean African guitar, soukous accents, brass and shekere. Piano/percussion intro, storytelling verse, uplifting chorus, dance groove, second verse, brass/percussion break and celebratory final chorus. Original perseverance and community-success lyrics; strong clean lows, triumphant hooks and lively melodic guitar rather than dark arrangements or weak percussion.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s12Output };
