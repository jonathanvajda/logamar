export function filterTerms(terms, options) {
  const languages = options.languages?.length ? options.languages : ["greek", "hebrew"];
  const partsOfSpeech = options.partsOfSpeech?.length ? options.partsOfSpeech : null;
  const topN = Number(options.topN ?? 999999);

  return terms
    .filter((term) => languages.includes(term.language))
    .filter((term) => !partsOfSpeech || partsOfSpeech.includes(term.partOfSpeech))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, topN);
}

export function classifyTerm(term, progress, now = new Date()) {
  if (!progress || progress.seenCount === 0) return "unseen";
  if (progress.manuallyFlagged) return "flagged";
  if ((progress.confidence === "weak" || progress.incorrectCount > progress.correctCount) && !progress.retired) {
    return "weak";
  }
  if (progress.nextDueAt && new Date(progress.nextDueAt) <= now) return "due";
  return "review";
}

export function generateFlashcardItems(terms, progressMap, options, now = new Date()) {
  const filtered = filterTerms(terms, options);
  const total = Math.max(1, Number(options.totalQuestions ?? 10));
  const mostCommonFirst = options.studyOrder === "frequency";
  const choose = (items, count) => mostCommonFirst
    ? [...items].sort(compareFrequency).slice(0, Math.max(0, count))
    : takeShuffled(items, count);
  const buckets = {
    unseen: [],
    due: [],
    weak: [],
    flagged: [],
    review: []
  };

  for (const term of filtered) {
    const progress = progressMap.get(term.id);
    buckets[classifyTerm(term, progress, now)].push(term);
  }

  const targets = [
    ["unseen", Math.ceil(total * 0.4)],
    ["due", Math.round(total * 0.3)],
    ["weak", Math.round(total * 0.2)],
    ["flagged", Math.max(1, Math.floor(total * 0.1))]
  ];

  const selected = [];
  const seen = new Set();
  for (const [bucketName, count] of targets) {
    for (const term of choose(buckets[bucketName], Math.min(count, total - selected.length))) {
      if (!seen.has(term.id)) {
        selected.push(term);
        seen.add(term.id);
      }
    }
  }

  const leftovers = Object.values(buckets)
    .flat()
    .filter((term) => !seen.has(term.id));

  for (const term of choose(leftovers, total - selected.length)) {
    selected.push(term);
  }

  return choose(selected, total).map((term, index) => ({
    id: `${term.id}-${index}`,
    termId: term.id,
    promptType: "lemma-to-gloss"
  }));
}

function compareFrequency(a, b) {
  return b.frequency - a.frequency || a.id.localeCompare(b.id, "en", { numeric: true });
}

export function takeShuffled(items, count, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, Math.max(0, count));
}
