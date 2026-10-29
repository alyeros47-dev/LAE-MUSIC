"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s2Output(context) {
  const prompts = {
    "S2-01":
      "Relaxed romantic Afropop with soft punchy kick, crisp rimshot/snare, delicate hi-hats, flowing shakers and subtle congas. Rounded sub-bass layers warm melodic electric bass with gentle syncopation. Rhodes electric piano, soft synth pads, mellow plucks, clean electric guitar and muted guitar plucks leave natural space. Guitar/percussion intro, smooth verse, melodic pre-chorus, warm romantic chorus, groove, second verse and relaxed final chorus. Original companionship lyrics; polished smooth lows, no aggressive brass or party drums.",
    "S2-02":
      "Bright romantic Afropop with tight kick, crisp clap, rhythmic hi-hats, shakers and light congas. Warm bouncy bass supports bright piano, playful synth plucks, warm pads, clean guitar, acoustic guitar, soft marimba-like plucks and light African percussion. Guitar/piano intro, melodic verse, short pre-chorus, catchy romantic chorus, instrumental hook, second verse and uplifting final chorus. Original affection and happiness lyrics; sweet melodic hooks, relaxed dance bounce and no heavy trap drums or slow ballad pacing.",
    "S2-03":
      "Dreamy romantic Afro-R&B with soft electronic kick, delicate rimshot, restrained hi-hats, subtle shakers and minimal Afro-percussion. Sustained warm sub-bass pulses beneath atmospheric pads, mellow electric piano, soft synth plucks, clean fingerpicked electric guitar and acoustic guitar. Soft guitar intro, intimate verse, dreamy chorus, reflection, second verse, emotional bridge and delicate final chorus. Original vulnerability and affection imagery; clean spacious textures, soft African pulse and no aggressive club production.",
    "S2-04":
      "Soulful romantic Afro-soul with warm kick, crisp snare, flowing hi-hats, gentle congas, shakers and subtle syncopation. Warm melodic electric bass passing notes support rich electric piano, atmospheric pads, expressive clean electric guitar, acoustic guitar and subtle strings. Electric-piano intro, soulful verse, melodic pre-chorus, expressive chorus, guitar-led instrumental passage, emotional bridge and final chorus. Original romantic commitment lyrics; rich harmony is musical colour only, with natural live dynamics and no fixed voice register.",
    "S2-05":
      "Late-night romantic Afro-R&B with electronic kick, sharp rimshot, syncopated hi-hats, restrained Afro-percussion and subtle congas. Hypnotic electronic sub-bass locks to kick with occasional controlled glides. Dark synth pads, muted plucks, Rhodes chords and processed guitar stay spacious. Synth/bass intro, restrained verse, hypnotic chorus, instrumental groove, second verse, dynamic bridge and final chorus. Original relationship and attraction lyrics; deep clean lows, understated hooks and no generic party brass or excessive live drums.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s2Output };
