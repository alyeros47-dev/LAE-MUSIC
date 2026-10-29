"use strict";
// Synthetic text fixtures only: no paid provider calls or generated audio.
const { output } = require("./music-dna-fixture.cjs");
function g4Output(context) {
  const out = output(context);
  const prompts = {
    "G4-01":
      "Powerful live drums with driving kick, crisp snare, rolling toms and cymbal crashes. Deep punchy syncopated electric bass locks to the kick. Bright piano, organ stabs and layered synths support brass hooks, rhythmic electric guitar, congas, talking drum and shakers. Energetic choir answers original Gospel victory hooks. Drum-and-brass intro, energetic verse, explosive chorus, call-and-response, instrumental dance break and full-band final climax. Keep vocals clear and lows controlled.",
    "G4-02":
      "Syncopated Afro-Gospel drums, snare accents and rolling fills. Bouncy electric bass supports bright piano, organ riffs and keyboard responses. Talking drum, congas, shekere, handclaps, rhythmic guitar and brass accents create playful Nigerian Gospel dance. Percussion intro, catchy verse, rhythmic chorus, short audience responses, instrumental dance groove and final chorus. Balance articulate percussion with a clear lead and joyful original thanksgiving hooks; use selected lyric languages independently.",
    "G4-03":
      "Strong live drums, rolling toms, energetic snare and cymbals. Warm electric bass repeats rhythmic motifs with melodic transitions. Lively organ, bright piano, rhythmic guitar, congas, shakers and traditional hand percussion support communal Gospel responses. Rhythmic intro, expressive verse, repeated praise chorus with evolving harmonies, percussion-led instrumental passage and energetic ending. Keep gratitude messages clear, percussion forward and organ lively in the selected lyric language.",
    "G4-04":
      "Punchy Afrobeat kick, crisp snares, energetic hi-hats and syncopated percussion. Heavy rhythmic bass supports bright synth hooks, rhythmic piano, electronic textures, electric guitar riffs, brass accents, claps and group harmonies. Attention-grabbing rhythmic intro, energetic verse, memorable chorus, crowd-response break, bass-driven instrumental dance section and final chorus. Keep a clear Gospel identity and clean transformation testimony; control lows and keep crowd hooks audible.",
    "G4-05":
      "Driving live drums with a strong backbeat, lively fills and controlled cymbals. Smooth prominent electric bass supports bright piano, layered Gospel organ, warm pads, uplifting synths, rhythmic electric guitar, brass accents and African percussion. Rich backing harmonies support original meaningful verses and a memorable Gospel chorus. Bright keyboard intro, melodic verse, uplifting chorus, instrumental development, expressive bridge and powerful final chorus. Balance the band around clear lead melodies.",
  };
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { g4Output };
