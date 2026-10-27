// UI adapter only. The existing backend owns profiles, provider calls and quotas.
export function musicRequest(brief, voiceProfile) {
  const useVoice = brief.useVoice === 'on' || brief.useVoice === true;
  if (useVoice && !(voiceProfile?.hasVoice === true && voiceProfile.status === 'ready'))
    throw Error('Your saved voice profile is not ready. Use the standard voice or check your profile.');
  const style = [brief.style, 'Language direction: ' + brief.language, brief.nativeLyrics].filter(Boolean).join('\n');
  if (style.length > 2000) throw Error('Shorten your style and language instructions to 2,000 characters.');
  return { title: brief.title, lyrics: brief.lyrics, style, useVoice };
}

// Keep the original request contract and select exactly one musical profile.
export function lyricsRequest(brief) {
  const gospel = brief.musicFamily === 'gospel';
  return {idea:brief.idea,genre:brief.genre,language:brief.language,
    nativeLyrics:brief.nativeLyrics,nativeLanguage:brief.nativeLanguage || brief.language,
    extraLanguage:brief.extraLanguage || '',mood:brief.mood,voice:brief.voice,
    duration:brief.duration,beat:brief.beat || 'none',tradition:'custom',
    gospelProfile:gospel ? brief.musicProfile || '' : '',
    secularProfile:gospel ? '' : brief.musicProfile || ''};
}
