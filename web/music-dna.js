// Catalogue-driven UI only. The existing authenticated backend validates identity and billing.
export function musicDNAControls(catalogue, e) {
  if (catalogue?.status !== "approved" || !catalogue.styles?.length) return "";
  const options = catalogue.departments
    .map((d) =>
      catalogue.categories
        .filter((c) => c.department_id === d.id)
        .map((c) => {
          const styles = catalogue.styles.filter((s) => s.category_id === c.id);
          return styles.length
            ? `<optgroup label="${e(d.name)} / ${e(c.name)}">${styles.map((s) => `<option value="${e(s.id)}">${e(s.name)}</option>`).join("")}</optgroup>`
            : "";
        })
        .join(""),
    )
    .join("");
  return `<section class="panel" aria-labelledby="music-dna-heading"><h3 id="music-dna-heading">Choose your Music DNA</h3><label>Musical style<select name="musicDnaStyle" aria-label="Music DNA style"><option value="">Use the existing style controls</option>${options}</select></label><p>Categories organize styles. Your selected style sets the rhythm, instruments, emotional atmosphere and energy; voice and languages stay independent.</p><label>Song languages<select name="musicDnaLanguages" aria-label="Music DNA languages" multiple size="6">${catalogue.languages.map((l) => `<option value="${e(l.id)}">${e(l.name)}</option>`).join("")}</select></label><p>Select up to four languages, or leave all clear to follow your description and supplied words.</p><p id="music-dna-status" role="status"></p></section>`;
}
export function bindMusicDNA(form, saved, catalogue) {
  const select = form.elements.musicDnaStyle,
    languages = form.elements.musicDnaLanguages;
  if (!select || !languages) return () => {};
  const restore = saved?.musicDnaStyle;
  if (catalogue.styles.some((s) => s.id === restore)) select.value = restore;
  for (const option of languages.options)
    option.selected =
      Array.isArray(saved?.musicDnaLanguages) &&
      saved.musicDnaLanguages.includes(option.value);
  const update = () => {
    const active = !!select.value;
    for (const name of [
      "musicFamily",
      "musicCountry",
      "musicProfile",
      "genre",
      "beat",
      "language",
      "extraLanguage",
    ])
      if (form.elements[name]) form.elements[name].disabled = active;
    languages.disabled = !active;
    form.querySelector("#music-dna-status").textContent = active
      ? "Style identity is fixed. Your topic shapes the lyrics; your voice and language choices stay independent."
      : "Using the existing musical-style controls.";
  };
  select.addEventListener("change", () => {
    update();
    form.dispatchEvent(new Event("input", { bubbles: true }));
  });
  update();
  return update;
}
