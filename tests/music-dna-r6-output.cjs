"use strict";
// Independent synthetic provider replies; no paid model/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function r6Output(context) {
  const prompts = {
    "R6-01":
      "Smooth British reggae-pop with gentle one-drop kick, crisp rimshot, restrained hats, tom fills and shakers. Deep rounded electric bass flows with sustained notes and slides under Hammond organ bubbles, warm electric piano, bright piano accents, vintage synths and clean offbeat guitar skank with muted replies. Soft saxophone, trumpet, congas and strings stay balanced. Organ/bass intro, melodic verse, memorable chorus, saxophone or guitar passage, second verse, gentle bridge and final chorus. Original smooth melody follows the customer topic; nostalgic live warmth, prominent clean bass and stereo depth rather than soft rock, thin lows or aggressive dancehall.",
    "R6-02":
      "Upbeat Jamaican celebration reggae-pop with bouncy kick, crisp snare, syncopated hats, lively fills and occasional dancehall accents. Thick springy electric bass repeats dance-friendly motifs with melodic passing notes below bright Hammond organ, rhythmic piano stabs, lively electric piano and sharp offbeat guitar skank. Trumpet, trombone, saxophone, congas, tambourine, shakers and claps form clear bright brass/percussion. Bass/brass intro, playful verse, energetic chorus, brass/guitar passage, second verse, percussion breakdown and final chorus. Original catchy hooks follow the chosen topic; lively Caribbean bounce, not EDM or monotonous four-on-the-floor.",
    "R6-03":
      "Sophisticated reggae-funk and soul crossover: live kick/snare, syncopated hats, ghost notes and dynamic tom fills move with deep melodic electric bass, octave jumps, slides and rhythmic funk fills. Rhodes, Hammond organ, clavinet, warm piano and analog synth colors create counterpoint with offbeat guitar skank and muted sixteenth-note funk strumming. Brass, congas, shakers and strings stay separated. Funky bass/guitar intro, soulful verse, rich chorus, keyboard/guitar groove, second verse, extended reggae-funk breakdown and final chorus. Original harmonically rich melodies follow the topic; precise live interaction preserves reggae offbeats rather than generic disco.",
    "R6-04":
      "Bold Caribbean reggae-rock/electro-pop with strong kick, punchy snare, tight hats, claps and occasional rock fills. Thick electric bass repeats syncopated motifs with octave jumps and subtle sub-bass reinforcement below bright analog synth hooks, rhythmic organ and electric piano. Sharp offbeat guitar skank blends with clean rhythmic rock riffs; congas, brass stabs and electronic percussion stay tasteful. Guitar/synth intro, rhythmic verse, powerful chorus, reggae-rock passage, second verse, bass/drum breakdown and final chorus. Original bold singalong hooks follow the customer topic; clean powerful lows and bright crossover drive without arena rock, uncontrolled distortion or EDM drops.",
    "R6-05":
      "Cheerful British-Jamaican pop-reggae with light bouncy one-drop kick, crisp snare, relaxed hats, handclaps and gentle fills. Deep playful electric bass repeats melodic patterns and smooth passing notes beneath bright Hammond organ bubbles, playful electric piano and clean offbeat guitar skank with muted melodic replies. Tambourine, shakers and soft brass remain warm. Guitar/organ intro, playful verse, catchy chorus, reggae-pop passage, second verse, short percussion break and final chorus. Original simple catchy melodies follow the requested topic; optional harmonies respect voice settings, never forced child vocals or a group performance. Clean buoyant reggae, not bubblegum pop.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { r6Output };
