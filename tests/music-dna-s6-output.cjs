"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s6Output(context) {
  const prompts = {
    "S6-01":
      "Soulful deep Amapiano with four-on-the-floor kick, restrained claps, crisp shakers, rimshots and subtle congas. Warm tuned log-drum bass rolls in melodic pitched phrases with occasional bends and deliberate spaces, related to kick. Rich jazz/deep-house piano chords, expressive electric piano, soft pads, organ and guitar stay elegant. Extended piano/shaker intro, gradual kick, melodic section, log-drum reveal, full groove, piano breakdown and final dance section. Original reflective lyrics with instrumental space; clean separated lows, no EDM drops.",
    "S6-02":
      "Heavy club Amapiano with punchy four-on-the-floor kick, sharp claps, rolling shakers and syncopated percussion. Resonant tuned log-drum bass alternates sparse and dense pitched sequences in clear kick relationship. Dark piano, rhythmic organ, deep synth pads, plucks, guitar and congas stay minimal. Atmospheric intro, kick/shaker groove, log-drum build, full club section, percussion breakdown, second bass variation and energetic ending. Original nightlife hooks leave instrumental space; clean powerful lows, no kick masking or generic EDM build-up.",
    "S6-03":
      "Energetic township Amapiano with strong house kick, crisp claps, shakers, rimshots and congas. Bouncy tuned log-drum bass plays short pitched motifs, rolling fills and percussion exchanges. Bright piano stabs, synth plucks, organ accents, whistles and brass drive rhythmic stops. Percussion/piano intro, rhythmic verse, original dance hook, log-drum break, second verse, township breakdown and final chorus/instrumental climax. Original friendship and ambition lyrics; authentic movement cues, clean lows and no ordinary synth-bass substitution.",
    "S6-04":
      "Melodic uplifting Amapiano with warm house kick, crisp claps, flowing shakers, gentle congas and rimshots. Rounded tuned log-drum bass has pitched melodic movement and playful kick-related variations. Bright piano, soulful electric piano, warm organ, uplifting pads, clean guitar and soft brass support warm harmony. Piano intro, melodic verse, uplifting chorus, log-drum groove, second verse, melodic breakdown and expanded final chorus. Original love and gratitude lyrics; joyful dance pulse with separate clean lows and no fixed voice or language.",
    "S6-05":
      "High-energy Amapiano with heavy four-on-the-floor kick, sharp claps, fast shakers, rimshots, congas and whistles. Leading tuned log-drum bass has rapid pitched rolls, short glides, rhythmic fills and deliberate silences tied to kick. Minimal piano stabs, synth plucks and sample-free percussive textures leave space. Sparse intro, kick/shaker build, first bass pattern, full dance section, sudden breakdown, new log-drum variation and extended climax. Original celebration hooks; unmistakable leading bass, clean lows and evolving patterns, not muddy identical loops.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s6Output };
