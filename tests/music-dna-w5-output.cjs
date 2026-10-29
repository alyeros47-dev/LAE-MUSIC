"use strict";
// Independent synthetic replies only; no paid provider/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w5Output(context) {
  const prompts = {
    "W5-01":
      "Powerful pop-R&B dance fusion with punchy kick, crisp snare/claps, syncopated hats, marching-style snare accents, percussion breaks and dramatic fills. Deep electric bass or synth bass uses rhythmic syncopation, octave jumps and tight kick coordination beneath bright piano, synth stabs, warm electric piano and funky muted guitar strumming with blues replies. Brass stabs, shakers and transitions stay clear. Drum/bass intro, rhythmic verse, rising pre-chorus, explosive chorus, dance passage, second verse, dramatic bridge and final chorus. Original confident hooks follow topic and selected voice; clean powerful bass and dynamic dance production, not generic EDM drops or excess trap.",
    "W5-02":
      "Vibrant Caribbean-influenced dance-pop with punchy electronic kick, sharp snare/claps, syncopated hats, tropical percussion and occasional dancehall-style breaks. Deep synth bass uses syncopated Caribbean movement and slides locked to the kick beneath bright synth plucks, warm pads, keyboard stabs and clean guitar with subtle offbeat accents. Congas, shakers and restrained effects keep detail clear. Bass/percussion intro, rhythmic verse, catchy chorus, tropical-pop groove, second verse, bridge and final chorus. Original playful melodic hooks follow the customer topic and voice without a forced Jamaican accent; polished commercial pop rather than generic dancehall imitation or excessive EDM.",
    "W5-03":
      "Modern disco-pop with strong four-on-the-floor kick, crisp snare/claps, steady/open hats and disco percussion fills. Deep funky electric bass develops active melodic grooves, octave jumps and syncopation beneath bright analog synth hooks, rhythmic electric piano and disco string textures. Clean funk guitar plays muted sixteenth-note strumming; tambourine, brass and handclaps remain crisp. Bass/synth intro, rhythmic verse, rising pre-chorus, energetic chorus, disco groove, second verse, dance breakdown and final chorus. Original catchy pop melodies follow the topic and selected voice; prominent evolving bass and bright dance arrangements, not generic EDM or repeated static loops.",
    "W5-04":
      "Bold theatrical electro-pop with powerful electronic kick, sharp snare/claps, driving hats, rhythmic percussion and controlled build-ups/breakdowns. Heavy clean synth bass repeats rhythmic motifs with octave movement beneath bold synth leads, bright arpeggios, dramatic stabs, pads and brass-like synthesizers. Occasional controlled distorted guitar accents and clean rhythmic replies support cinematic transitions. Dramatic synth intro, rhythmic verse, rising pre-chorus, explosive chorus, electro-pop passage, second verse, dramatic breakdown and final chorus. Original fearless hooks follow topic and selected voice; separated powerful lows and polished theatre, not uncontrolled distortion or generic festival EDM.",
    "W5-05":
      "Smooth melodic pop-R&B with tight electronic kick, crisp snare/claps, controlled syncopated hats, subtle R&B fills and gentle transitions. Deep rounded electric bass or synth bass moves melodically with gentle slides beneath bright electric piano, analog pads, clean synth plucks and warm chords. Gentle muted clean guitar, soft strings, shakers and compatible optional harmonies stay clear. Keyboard intro, melodic verse, rising pre-chorus, catchy chorus, second verse, pop-R&B passage, emotional bridge and final chorus. Original smooth hooks and tasteful ornament follow topic and selected voice capability without mandatory high pitch or excessive runs; polished deep bass rather than generic trap.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w5Output };
