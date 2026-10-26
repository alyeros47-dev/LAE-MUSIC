// UI adapter only. The existing backend owns profiles, provider calls and quotas.
export function musicRequest(brief, voiceProfile) {
  const useVoice = brief.useVoice === 'on' || brief.useVoice === true;
  if (useVoice && !(voiceProfile?.hasVoice === true && voiceProfile.status === 'ready'))
    throw Error('Your saved voice profile is not ready. Use the standard voice or check your profile.');
  const style = [brief.style, 'Language direction: ' + brief.language, brief.nativeLyrics].filter(Boolean).join('\n');
  if (style.length > 2000) throw Error('Shorten your style and language instructions to 2,000 characters.');
  return { title: brief.title, lyrics: brief.lyrics, style, useVoice };
}
