"use strict";
// Synthetic provider text only: no paid model/audio output.
const { output } = require("./music-dna-fixture.cjs");
function s3Output(context) {
  const prompts = {
    "S3-01":
      "Fast Nigerian street-pop with Fuji percussion, heavy kick, sharp snare, rolling toms and fast shakers. Deep distorted-edge electronic bass locks to kick beneath bright synth hooks, rhythmic organ, talking drum, congas, shekere, brass stabs, whistles and short guitar accents. Explosive drum/percussion intro, energetic verse, chant chorus, percussion breakdown, second verse, heavy bass/drum dance section and final chorus. Original hustle and celebration lyrics; professionally balance raw crowd energy and controlled distortion.",
    "S3-02":
      "Melodic Nigerian street-pop with punchy kick, crisp snare, syncopated hi-hats, shakers and light talking drum. Warm deep electronic bass bounces under emotional piano, warm synth pads, gentle organ, clean electric guitar and restrained percussion. Piano intro, storytelling verse, emotional chorus, instrumental groove, second verse, uplifting bridge and final chorus. Original life-challenge and loyalty lyrics; reflective expressive hooks and a strong relaxed rhythmic groove, not aggressive party or slow Western ballad pacing.",
    "S3-03":
      "Nigerian street dance with heavy kick, sharp snare/claps, fast hi-hats and rolling percussion. Thick electronic sub-bass locks to kick beneath bright synth stabs, rhythmic piano, energetic organ, talking drum, shekere, congas, brass and whistles. Immediate drum/bass intro, energetic verse, original chant chorus, dance break, second verse, percussion-heavy breakdown and explosive final chorus. Original confidence and dancing lyrics; stop-start movement cues, concise hooks and powerful balanced lows.",
    "S3-04":
      "Minimal hypnotic Nigerian street-pop with tight electronic kick, crisp snare, syncopated hi-hats, controlled claps and shakers. Pulsing electronic sub-bass and controlled slides anchor sparse synth plucks, dark textures, occasional piano stabs, guitar accents, subtle talking drum and restrained percussion. Bass/drum intro, rhythmic verse, repetitive dance chorus, instrumental groove, second verse, short breakdown and final chorus. Original street-fashion and ambition hooks; precise pocket, evolving repetition and no overcrowding.",
    "S3-05":
      "Fast Lagos street-party with Fuji percussion and live/electronic drums, heavy kick, crisp snare, rolling toms and fast shakers. Deep bouncy bass supports bright organ, rhythmic piano, synth stabs, rhythmic electric guitar, powerful talking drum, shekere, congas, brass and whistles. Percussion/brass intro, energetic verse, crowd-response chorus, talking-drum passage, second verse, street dance break and explosive final chorus. Original community and festival chants; strong balanced bass/percussion with lively communal energy.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s3Output };
