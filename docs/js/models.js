export const LANGUAGES = ["greek", "hebrew"];

export function createDefaultProgress(termId) {
  return {
    termId,
    seenCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    hintCount: 0,
    lastSeenAt: null,
    nextDueAt: null,
    confidence: "new",
    easeFactor: 2.0,
    manuallyFlagged: false,
    retired: false
  };
}

export function createSession({ mode, languages, filters, totalQuestions }) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    startedAt: now,
    endedAt: null,
    mode,
    languages,
    filters,
    totalQuestions,
    correctCount: 0,
    incorrectCount: 0
  };
}

export function normalizeTerm(rawTerm) {
  return {
    id: rawTerm.id,
    language: rawTerm.language,
    lemma: rawTerm.lemma,
    transliteration: rawTerm.transliteration ?? "",
    glosses: Array.isArray(rawTerm.glosses) ? rawTerm.glosses : [],
    partOfSpeech: rawTerm.partOfSpeech ?? "unknown",
    frequency: Number(rawTerm.frequency ?? 0),
    frequencies: rawTerm.frequencies ?? {
      gnt: Number(rawTerm.frequency ?? 0),
      lxx: 0
    },
    sourceRefs: rawTerm.sourceRefs ?? [],
    morphologyHints: rawTerm.morphologyHints ?? [],
    exampleRefs: rawTerm.exampleRefs ?? [],
    alternateLemmas: rawTerm.alternateLemmas ?? [],
    source: rawTerm.source ?? null
  };
}

export function progressSuccessRate(progress) {
  const attempts = progress.correctCount + progress.incorrectCount;
  if (attempts === 0) return null;
  return Math.round((progress.correctCount / attempts) * 100);
}
