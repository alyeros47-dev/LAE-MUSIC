"use strict";
// Independent synthetic provider replies only; no paid model/audio calls.
const { output } = require("./music-dna-fixture.cjs");
function w3Output(context) {
  const prompts = {
    "W3-01":
      "Luxurious classic romantic soul with smooth live kick/snare, relaxed hats, ghost notes and tasteful laid-back fills. Deep rounded electric bass flows with melodic runs, passing notes and occasional slides below grand piano, Rhodes, warm Hammond organ and sophisticated seventh, ninth and suspended voicings. Clean soul guitar uses gentle strumming, subtle funk accents and expressive replies; elegant strings, soft brass and shakers remain vocal-friendly. Piano/bass intro, romantic verse, warm chorus, second verse, strings/guitar passage, emotional bridge and expanded final chorus. Original graceful melodies follow the topic and voice settings; warm live depth rather than trap or excessive orchestral climax.",
    "W3-02":
      "Warm romantic pop-soul with relaxed live kick/snare, steady hats, subtle tom fills and gentle percussion. Smooth rounded electric bass uses simple melodic movement and passing tones under warm acoustic piano, mellow electric piano, soft organ and restrained analog pads. Gentle acoustic guitar strumming and clean electric-guitar lead replies blend with soft strings, brass, shakers and tambourine. Piano/guitar intro, storytelling verse, memorable chorus, second verse, guitar passage, emotional bridge and final chorus. Original conversational hooks and heartfelt melody follow the customer topic; clear soulful live warmth, not generic country-pop or ordinary soft rock.",
    "W3-03":
      "Expressive contemporary piano soul with warm live/hybrid kick, controlled snare, gentle hats, ghost notes and subtle fills. Deep melodic electric bass sustains harmonic support beneath central grand piano, rich soul/gospel voicings, expressive fills, warm electric piano and restrained organ. Gentle acoustic/clean electric guitar, warm strings, soft brass and compatible harmonies remain clear. Solo piano intro, intimate verse, heartfelt chorus, fuller second-verse rhythm, piano passage, emotional bridge and final chorus. Original natural melodic rises follow topic and selected voice; gospel harmony does not force Christian lyrics. Piano-centered warmth avoids excessive orchestral drama or vocal imitation.",
    "W3-04":
      "Silky intimate romantic R&B-soul with soft deep kick, gentle snare, relaxed hats, subtle syncopation and restrained fills. Deep smooth electric bass or synth bass sustains rounded melodic movement below Rhodes, warm acoustic piano, seventh/ninth voicings and soft synth pads. Clean fingerpicked guitar fills, muted rhythmic accents, soulful replies, soft strings and compatible optional harmonies stay understated. Electric-piano intro, intimate verse, melodic chorus, second verse, guitar/keyboard passage, reflective bridge and final chorus. Original elegant conversational melody follows the customer topic; restrained instrumentation and clear warm bass rather than trap or excessive vocal ornament.",
    "W3-05":
      "Sophisticated atmospheric neo-soul with laid-back live kick, dry snare, ghost notes, relaxed hats and gentle swing. Deep expressive electric bass uses syncopated grooves, melodic slides, occasional octave movement and rich sustained notes below Rhodes, warm analog organ, extended jazz-soul harmony and pads. Muted clean funk guitar and blues replies blend with soft strings and subtle percussion. Bass/Rhodes intro, intimate verse, smooth chorus, second verse, extended neo-soul groove, reflective bridge and final chorus. Original flowing intimate melodies follow topic and voice settings without forced high register; engaging organic bass and harmonic space, not trap or excessive electronics.",
  };
  return {
    ...output(context),
    style: context.tempo + " BPM. " + prompts[context.style_id],
  };
}
module.exports = { w3Output };
