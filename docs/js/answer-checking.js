const PUNCTUATION = /[.,;:!?'"()[\]{}]/g;

export function normalizeAnswer(value, { stripDiacritics = true } = {}) {
  let normalized = String(value ?? "").trim().toLowerCase().replace(PUNCTUATION, "").replace(/\s+/g, " ");
  if (stripDiacritics) {
    normalized = normalized.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }
  return normalized;
}

export function approvedGlossesForTerm(term) {
  const glosses = new Set(term.glosses ?? []);
  if (term.partOfSpeech === "verb") {
    for (const gloss of term.glosses ?? []) {
      const clean = gloss.replace(/^to\s+/i, "");
      glosses.add(clean);
      glosses.add(`to ${clean}`);
    }
  }
  return [...glosses];
}

export function checkTypedAnswer(answer, term) {
  const normalizedAnswer = normalizeAnswer(answer);
  const approved = approvedGlossesForTerm(term).map((gloss) => normalizeAnswer(gloss));
  return {
    wasCorrect: approved.includes(normalizedAnswer),
    normalizedAnswer,
    approved
  };
}
