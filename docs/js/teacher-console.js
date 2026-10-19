export function renderTermBrowser({ terms }) {
  return `
    <section class="panel">
      <span class="eyebrow">Term browser</span>
      <h1>Search the lexicon.</h1>
      <label class="field">
        <span>Search</span>
        <input id="term-search" type="search" placeholder="Strong's number, lemma, transliteration, gloss, language, POS">
      </label>
      <div id="term-results" class="progress-list">
        ${renderTermRows(terms)}
      </div>
    </section>
  `;
}

export function renderTermRows(terms) {
  if (terms.length === 0) {
    return `<p class="muted">No matching terms.</p>`;
  }

  return terms.map((term) => `
    <div class="term-row">
      <strong>${term.id}</strong>
      <span>${term.lemma} <span class="muted">${term.transliteration}</span></span>
      <span>${term.partOfSpeech}</span>
      <span>${term.glosses.join("; ")}</span>
    </div>
  `).join("");
}

export function filterTermSearch(terms, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return terms;
  return terms.filter((term) => {
    const haystack = [
      term.id,
      term.language,
      term.lemma,
      term.transliteration,
      term.partOfSpeech,
      ...(term.glosses ?? [])
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
