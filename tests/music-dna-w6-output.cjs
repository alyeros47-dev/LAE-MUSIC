"use strict";
// Independent synthetic provider replies only; no paid model/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w6Output(context) {
  const prompts = {
    "W6-01":
      "Grand emotional contemporary piano ballad with solo grand piano opening and expressive chord fills. Deep warm electric bass sustains harmonic support, growing fuller without masking piano. Minimal opening percussion gradually develops soft kick, controlled snare, gentle toms and cymbal swells under cinematic strings, cello, gentle acoustic/clean electric guitar and ambient pads. Piano intro, storytelling verse, emotional chorus, fuller second verse, dramatic bridge, powerful final chorus and gentle piano ending. Original conversational melodies and natural climbs follow customer topic and voice; clear dynamic contrast, not constant volume, dance-pop or imitation.",
    "W6-02":
      "Simple emotionally direct contemporary pop ballad with sparse expressive acoustic piano, warm electric piano and restrained pads. Warm electric bass sustains simple harmonic notes and occasional passing tones below early sparse kick/snare, gradually building fuller live drums, strong chorus snare and expressive tom fills. Gentle acoustic/clean electric guitar, soft strings and subtle orchestral percussion remain uncluttered. Piano intro, intimate verse, emotional pre-chorus, powerful chorus, second verse, dramatic bridge and final chorus. Original direct conversational hooks follow topic and voice without forced rasp; natural building intensity rather than excessive electronics.",
    "W6-03":
      "Elegant tender pop-soul ballad with soft deep kick, controlled snare/rimshot, gentle hats, subtle fills and spacious phrasing. Deep rounded electric bass or synth bass sustains restrained movement beneath expressive acoustic piano, warm Rhodes, soft organ and rich soul chords. Gentle acoustic/clean electric guitar, soft strings, cello, pads and compatible harmonies stay clear. Soft piano intro, reflective verse, emotional chorus, second verse, strings/piano passage, heartfelt bridge and final chorus. Original flowing intimate melody adapts to selected voice and customer topic without forced high register; warm graceful depth rather than electronic dance drums.",
    "W6-04":
      "Warm acoustic pop centered on rhythmic acoustic guitar strumming, fingerpicked hooks and muted percussive guitar accents. Melodic electric bass or acoustic bass uses passing notes and clear rhythmic support below gentle acoustic/electric piano and restrained pads. Light kick, soft snare/clap, hats, hand percussion, shakers and tambourine remain natural; subtle strings and clean electric replies support storytelling. Guitar intro, relatable verse, melodic chorus, second verse, guitar passage, emotional bridge and final chorus. Original conversational singalong melodies follow the customer topic and selected voice; clear guitar and deep bass rather than generic country or excessive electronics.",
    "W6-05":
      "Emotional acoustic pop-rock soul ballad with expressive acoustic guitar, warm piano/electric piano and restrained pads. Deep sustained electric bass supports a gradual live-drum build: warm kick, strong controlled snare, gentle hats and expressive toms, balanced in the final chorus. Clean electric-guitar replies and occasional restrained overdriven textures blend with soft strings and subtle orchestral percussion. Guitar/piano intro, intimate verse, rising pre-chorus, powerful chorus, second verse, guitar passage, emotional bridge and final chorus. Original expressive melodies and controlled climaxes follow topic and selected voice without forced rasp; natural intensity, not arena rock or excessive distortion.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w6Output };
