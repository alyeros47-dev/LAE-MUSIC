// UI adapter only. The existing backend owns profiles, provider calls and quotas.
export function musicRequest(brief, voiceProfile) {
  const useVoice = brief.useVoice === "on" || brief.useVoice === true;
  if (
    useVoice &&
    !(voiceProfile?.hasVoice === true && voiceProfile.status === "ready")
  )
    throw Error(
      "Your saved voice profile is not ready. Use the standard voice or check your profile.",
    );
  const style = [
    brief.style,
    brief.language ? "Language direction: " + brief.language : "",
    brief.nativeLyrics,
  ]
    .filter(Boolean)
    .join("\n");
  if (style.length > 1000)
    throw Error(
      "Shorten your style and language instructions to 1,000 characters.",
    );
  const seconds = brief.duration ? parseInt(brief.duration, 10) * 60 : 180,
    lyrics = String(brief.lyrics || ""),
    words = lyrics
      .replace(/\[[^\]\n]*\]/g, " ")
      .trim()
      .split(/\s+/u)
      .filter(Boolean).length;
  if (
    lyrics.length > Math.min(5000, (seconds / 60) * 900) ||
    words > Math.max(15, Math.floor(((seconds - 12) / 60) * 100))
  )
    throw Error(
      "Your lyrics are too long for this duration. Choose a longer song or shorten the lyrics; nothing was sent or charged.",
    );
  return {
    title: brief.title,
    lyrics: brief.lyrics,
    style,
    useVoice,
    ...(brief.duration
      ? { duration: Math.round(parseInt(brief.duration, 10) * 60) }
      : {}),
  };
}

// Keep the original request contract and select exactly one musical profile.
export function lyricsRequest(brief) {
  if (brief.musicDnaStyle) {
    if (!["gpt-6.1-sol", "gpt-6-astra"].includes(brief.lyricsModel))
      throw Error("Choose GPT-6.1 Sol or GPT-6 Astra.");
    return {
      model: brief.lyricsModel,
      idea: brief.idea,
      musicDnaStyle: brief.musicDnaStyle,
      musicDnaLanguages: brief.musicDnaLanguages || [],
      voice: brief.voice || "neutral",
      duration: brief.duration,
      nativeLyrics: brief.nativeLyrics,
      nativeLanguage: brief.nativeLanguage,
    };
  }
  const gospel = brief.musicFamily === "gospel";
  const secular = brief.musicFamily === "secular";
  if (!["gpt-6.1-sol", "gpt-6-astra"].includes(brief.lyricsModel))
    throw Error("Choose GPT-6.1 Sol or GPT-6 Astra.");
  return {
    ...(brief.lyricsModel ? { model: brief.lyricsModel } : {}),
    idea: brief.idea,
    genre: brief.genre,
    language: brief.language,
    nativeLyrics: brief.nativeLyrics,
    nativeLanguage: brief.nativeLanguage || brief.language,
    extraLanguage: brief.extraLanguage || "",
    voice: brief.voice,
    duration: brief.duration,
    beat: brief.beat || "none",
    tradition: "custom",
    gospelProfile: gospel ? brief.musicProfile || "" : "",
    secularProfile: secular ? brief.musicProfile || "" : "",
    musicCountry: brief.musicCountry || "",
    musicFamily: ["gospel", "secular"].includes(brief.musicFamily)
      ? brief.musicFamily
      : "",
  };
}
