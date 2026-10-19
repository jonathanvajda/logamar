import { confidenceFromProgress } from "./scheduler.js";

// Keep stored Strong's IDs/history intact. Group only the reviewed inflections
// when selecting or reporting dictionary-form vocabulary.
export function studyContext(terms, progressMap, difficulty = "normal") {
  const idMap = new Map(terms.map((term) => [term.id, difficulty === "hard" ? term.id : term.lemmaId ?? term.id]));
  if (difficulty === "hard") return { terms, progressMap, idMap };
  const groups = new Map();
  for (const term of terms) {
    const parent = idMap.get(term.id);
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(term.id);
  }
  const groupedProgress = new Map();
  const vocabulary = terms.filter((term) => !term.isInflected).map((term) => {
    const members = groups.get(term.id) ?? [term.id];
    const rows = members.map((id) => progressMap.get(id)).filter(Boolean);
    if (rows.length === 1) groupedProgress.set(term.id, { ...rows[0], termId: term.id });
    else if (rows.length) {
      const latest = rows.reduce((a, b) => (Date.parse(b.lastSeenAt) || 0) > (Date.parse(a.lastSeenAt) || 0) ? b : a);
      const due = rows.filter((row) => !row.retired && row.nextDueAt && Number.isFinite(Date.parse(row.nextDueAt)))
        .map((row) => row.nextDueAt).sort((a, b) => Date.parse(a) - Date.parse(b));
      const progress = { ...latest, termId: term.id,
        seenCount: rows.reduce((sum, row) => sum + (row.seenCount ?? 0), 0),
        correctCount: rows.reduce((sum, row) => sum + (row.correctCount ?? 0), 0),
        incorrectCount: rows.reduce((sum, row) => sum + (row.incorrectCount ?? 0), 0),
        hintCount: rows.reduce((sum, row) => sum + (row.hintCount ?? 0), 0),
        manuallyFlagged: rows.some((row) => row.manuallyFlagged && !row.retired),
        retired: rows.every((row) => row.retired), nextDueAt: due[0] ?? null };
      progress.confidence = confidenceFromProgress(progress);
      groupedProgress.set(term.id, progress);
    }
    return term.language === "greek" ? { ...term, frequency: term.lemmaFrequency ?? term.frequency } : term;
  });
  return { terms: vocabulary, progressMap: groupedProgress, idMap };
}

export function dictionaryHistory(history, idMap) {
  return history.map((item) => ({ ...item, termId: idMap.get(item.termId) ?? item.termId }));
}
