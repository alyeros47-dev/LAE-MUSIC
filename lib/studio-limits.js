"use strict";
const { fail } = require("./transactions");
const MAX_LYRICS = 5000,
  MAX_STYLE = 1000,
  MAX_TITLE = 80;
function durationSeconds(value) {
  if (value === undefined || value === null || value === "") return 180;
  if (Number.isInteger(value) && value >= 10 && value <= 360) return value;
  const m = /^([1-6]) minutes?$/.exec(String(value));
  if (m) return Number(m[1]) * 60;
  throw fail(400, "Choose a song duration between 10 and 360 seconds.");
}
function budget(seconds) {
  return {
    characters: Math.min(MAX_LYRICS, Math.floor((seconds / 60) * 900)),
    words: Math.max(15, Math.floor(((seconds - 12) / 60) * 100)),
  };
}
function lyricsSize(lyrics) {
  const sung = String(lyrics)
    .replace(/\[[^\]\n]*\]/g, " ")
    .trim();
  return {
    characters: String(lyrics).length,
    words: sung ? sung.split(/\s+/u).length : 0,
  };
}
function validateLyrics(lyrics, seconds) {
  const limits = budget(seconds),
    size = lyricsSize(lyrics);
  if (size.characters > limits.characters || size.words > limits.words)
    throw fail(
      400,
      `These lyrics are too long for the selected duration. Use at most ${limits.characters} characters and about ${limits.words} sung words, or choose a longer duration. No lyrics were cut and no generation was charged.`,
    );
  return limits;
}
function guidance(value) {
  const seconds = durationSeconds(value),
    b = budget(seconds);
  return ` Target song length: ${seconds} seconds. Write at most ${b.characters} lyrics characters including section labels, and at most ${b.words} sung words (including repeated choruses). Leave room for instrumental phrasing and a resolved ending. End with a short [Outro] and [End]. Finish the final sentence naturally. Do not pad the song to a word count. The style field has its separate character budget.`;
}
module.exports = {
  MAX_LYRICS,
  MAX_STYLE,
  MAX_TITLE,
  durationSeconds,
  budget,
  lyricsSize,
  validateLyrics,
  guidance,
};
