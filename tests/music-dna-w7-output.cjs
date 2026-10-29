"use strict";
// Independent synthetic replies only; no paid model/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w7Output(context) {
  const prompts = {
    "W7-01":
      "Precision dance funk with deep punchy kick, crisp snare/handclaps, exact hats, syncopated fills and dramatic stops with subtle human dynamics. Deep electric bass or synth bass uses tightly controlled sixteenth-note motifs, octave jumps and short slides locked to kick. Bright analog synths, electric piano, stabs and pads answer sharply muted sixteenth-note guitar and clipped chords; brass, shakers and subtle disco strings stay clear. Immediate bass/drum intro, rhythmic verse, rising pre-chorus, energetic chorus, funk breakdown, second verse, dramatic bridge and final chorus. Original catchy rhythmic hooks follow topic and selected voice; heavy clean lows and precise separation, not generic EDM or static loops.",
    "W7-02":
      "Bold Minneapolis electro-funk with tight drum-machine kick, sharp snare/claps, crisp hats, syncopated accents and rhythmic stops. Deep electric bass or synth bass repeats funk motifs with octave movement and expressive slides beneath bright analog synth stabs, electric piano and clavinet. Expressive electric guitar combines sharp muted funk strumming, blues-rock replies and occasional controlled overdriven passages. Synth/guitar intro, rhythmic verse, catchy chorus, extended electric-funk passage, second verse, guitar-led breakdown and final chorus. Original playful hooks follow topic and selected voice; vibrant synths and separated heavy bass rather than uncontrolled distortion, generic EDM or copied riffs.",
    "W7-03":
      "Polished live-band retro funk with punchy kick, crisp snare, tight hats, handclaps, tasteful tom fills and energetic breaks. Thick warm electric bass plays active syncopated grooves, octave jumps and passing tones beneath bright piano, Rhodes, Hammond organ, clavinet and brief analog synth accents. Muted sixteenth-note funk guitar and playful riffs interact with trumpet, trombone, saxophone, tambourine, shakers and occasional disco strings. Brass/bass intro, rhythmic verse, energetic chorus, brass/guitar groove, second verse, funk breakdown and final chorus. Original joyful hooks and compatible responses follow the topic; live bass and bright brass stay clear, not generic electronic dance-pop.",
    "W7-04":
      "Majestic orchestral disco-soul with strong live kick, crisp snare, steady hats, energetic toms and tasteful percussion. Deep melodic electric bass flows with funk phrases, octave jumps and passing tones beneath bright electric piano, grand piano, Hammond organ and analog synth colors. Sharp muted sixteenth-note funk guitar supports full layered brass, disco strings, congas, shakers and tambourine. Brass/strings intro, rhythmic verse, uplifting chorus, extended disco-soul passage, second verse, orchestral bridge and final chorus. Original rich melodies follow topic and selected voice; powerful clear horns and orchestral harmony without thin bass, generic EDM or excessive effects.",
    "W7-05":
      "Classic live-band party funk with strong kick, crisp snare, tight hats, handclaps, syncopated fills and dynamic breaks. Thick punchy electric bass repeats dance-friendly motifs with octaves and rhythmic slides locked to kick. Bright piano, Hammond organ, electric piano, clavinet and short synth hooks support sharp muted sixteenth-note guitar stabs. Trumpet, trombone, saxophone, congas and tambourine form bright energetic arrangements. Immediate brass/bass intro, energetic verse, celebration chorus, funk passage, second verse, percussion breakdown and final chorus. Original joyful hooks and compatible responses follow topic and selected voice; heavy clean bass and precise brass, not generic disco loops or copied anthems.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w7Output };
