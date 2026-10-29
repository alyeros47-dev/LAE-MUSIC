"use strict";
// Synthetic contract fixtures ONLY. Not an approved musical catalogue or research-group specification.
function catalogue() {
  return {
    revision: "qa-dna-v1",
    status: "approved",
    departments: structuredClone(
      require("../config/music-dna.json").departments,
    ),
    categories: [
      {
        id: "qa-prayer",
        department_id: "gospel",
        name: "QA restrained category",
      },
    ],
    styles: [
      {
        id: "qa-restrained",
        name: "QA restrained ensemble",
        department_id: "gospel",
        category_id: "qa-prayer",
        tempo: { min: 62, max: 76 },
        rhythm: "Spacious measured pulse",
        drums_percussion: "Sparse soft hand taps",
        bass: "Warm sustained bass",
        instruments: {
          keys: "Sparse piano",
          guitar: "Optional quiet acoustic accents",
          other: "Restrained sustained texture",
        },
        melody_harmony: "Short motifs and gentle harmonic movement",
        vocal_delivery: "Measured intimate phrases with clear diction",
        arrangement: "Sparse opening, gradual refrain, resolved ending",
        lyrics: {
          structure: "Short verses and responsive refrain",
          vocabulary: "Clear original topic-led words",
        },
        mood: "Reflective",
        energy: "Restrained",
        production_mix:
          "Warm close lead, spacious stereo instruments, gentle dynamics",
        variations: {
          introductions: ["Piano opening", "Quiet guitar opening"],
          progressions: ["Gentle rising harmony", "Gentle returning harmony"],
          arrangements: ["Early refrain", "Later refrain"],
          melody: ["Stepwise contour", "Small-interval answering motif"],
          lyrical: ["First-person reflection", "Collective reflection"],
        },
        research_references: ["INTERNAL_QA_RESEARCH_NAME"],
      },
    ],
  };
}
function output(context, lyrics = "Original QA words, a complete ending.") {
  return {
    title: "QA original",
    lyrics,
    style:
      "A restrained ensemble with soft taps and warm sustained bass, sparse piano and intimate measured phrasing; gentle dynamics, a resolved ending and spacious mixing.",
    dna_style_id: context.style_id,
    variation_id: context.variation_id,
    language_codes: context.languages,
    dna_mood: context.profile.mood,
    dna_energy: context.profile.energy,
    tempo_bpm: context.tempo,
  };
}
module.exports = { catalogue, output };
