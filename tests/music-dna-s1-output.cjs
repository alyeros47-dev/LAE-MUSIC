"use strict";
// Synthetic text only, not paid model or audio output.
const { output } = require("./music-dna-fixture.cjs");
function s1Output(context) {
  const prompts = {
    "S1-01":
      "Nigerian Afropop with punchy kick, sharp snare/claps, syncopated hi-hats, congas and shakers. Deep rounded sub-bass layers melodic bass tightly locked to kick. Bright piano riffs, synth hooks, warm pads, rhythmic electric guitar and brass stabs support original festive responses. Percussion/hook intro, rhythmic verse, short pre-chorus, explosive party chorus, second verse, dance break and final chorus with new layers. Original friendship and success lyrics; radio-ready controlled lows and lively rhythmic development.",
    "S1-02":
      "Nigerian Afrobeats with immediate heavy kick, crisp snare, rolling shakers, syncopated hi-hats and bouncing percussion. Thick sub-bass and punchy mid-bass form a distinctive kick-locked bounce. Rhythmic piano, synth plucks, guitar, congas, woodblock and brass create playful responses. Bass/percussion intro, catchy verse, short pre-chorus, dance chorus, groove break, second verse and expanded final chorus. Original playful romance lyrics; bass/drum impact stays strong in instrumental passages, with clean low-frequency headroom.",
    "S1-03":
      "Electronic Afro-rave with tight kick, sharp snare/claps, rolling hi-hats and syncopated African percussion. Deep pulsing sub-bass locks to kick; futuristic synth leads, arpeggiated motifs, bright plucks, processed guitar and digital transitions create active atmosphere. Electronic rhythmic intro, hypnotic verse, rising pre-chorus, energetic hook, synth/bass section, second verse and dynamic final chorus. Original adventure and freedom lyrics; polished electronic textures, rhythmic surprises and controlled powerful lows.",
    "S1-04":
      "Danceable Afro-R&B/Afropop with warm punchy kick, crisp snare/claps, smooth hi-hats, congas and shakers. Rounded melodic bass bounces cleanly beneath rich electric-piano chords, bright synth hooks, rhythmic guitar and soft brass. Elegant keys/percussion intro, melodic verse, rhythmic pre-chorus, dance chorus, instrumental groove, second verse and expanded final chorus. Original romance and independence lyrics; smooth expressive hooks, refined harmony and strong enough bass/percussion to keep moving.",
    "S1-05":
      "Hypnotic Nigerian Afro-dance with tight kick, sharp snare, layered claps, lively shakers and tropical percussion. Heavy electronic sub-bass with controlled mid-bass punch repeats a precise kick-locked dance motif. Bright synth plucks, guitar accents, congas, marimba-like plucks and occasional brass stay minimal but powerful. Immediate bass/percussion intro, catchy verse, hook chorus, dance groove, second verse, rhythmic breakdown and powerful final chorus. Original nightlife and dancing lyrics; clean heavy lows and evolving infectious percussion.",
  };
  const out = output(context);
  out.style = context.tempo + " BPM. " + prompts[context.style_id];
  return out;
}
module.exports = { s1Output };
