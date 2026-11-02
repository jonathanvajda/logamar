import { matchesPool, needsRevisit } from "./progress.js";
import { LANGUAGES } from "./models.js";
import { studyContext } from "./study-context.js";

export function filterTerms(terms, options) {
  const languages = options.languages?.length ? options.languages : LANGUAGES;
  const partsOfSpeech = options.partsOfSpeech?.length ? options.partsOfSpeech : null;
  const topN = Number(options.topN ?? 999999);

  return terms
    .filter((term) => languages.includes(term.language))
    .filter((term) => !partsOfSpeech || partsOfSpeech.includes(term.partOfSpeech))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, topN);
}

export function classifyTerm(term, progress, now = new Date()) {
  if (progress?.manuallyFlagged && !progress.retired) return "flagged";
  if (needsRevisit(progress)) {
    return "weak";
  }
  if (!progress || progress.seenCount === 0) return "unseen";
  if (progress.nextDueAt && new Date(progress.nextDueAt) <= now) return "due";
  return "review";
}

export function generateFlashcardItems(terms, progressMap, options, now = new Date()) {
  const context = studyContext(terms, progressMap, options.difficulty);
  terms = context.terms;
  progressMap = context.progressMap;
  const selectedIds = (options.selectedIds ?? []).map((id) => context.idMap.get(id) ?? id);
  const pool = options.progressPool ?? "all";
  const allowed = options.allowedIds ? new Set(options.allowedIds) : null;
  const eligible = terms.filter((term) => (!allowed || allowed.has(term.id)) && matchesPool(term, progressMap.get(term.id), pool, now, selectedIds));
  const filtered = filterTerms(eligible, options);
  const total = Math.max(1, Number(options.totalQuestions ?? 10));
  const mostCommonFirst = options.studyOrder === "frequency";
  const choose = (items, count) => mostCommonFirst
    ? [...items].sort(compareFrequency).slice(0, Math.max(0, count))
    : takeShuffled(items, count);
  const toItems = (items) => items.map((term, index) => ({
    id: `${term.id}-${index}`, termId: term.id, promptType: "lemma-to-gloss",
    studyFrequency: term.frequency, dictionaryMode: options.difficulty !== "hard"
  }));
  if (allowed) {
    // Oldest pool review first provides continuous coverage, including known words.
    // Newly added terms get one turn, then join the back of the rotation.
    const latest = new Map();
    for (const h of options.poolHistory ?? []) {
      latest.set(h.termId, Math.max(latest.get(h.termId) ?? 0, Date.parse(h.answeredAt) || 0));
    }
    const ordered = takeShuffled(filtered, filtered.length).sort((a, b) =>
      (latest.get(a.id) ?? 0) - (latest.get(b.id) ?? 0));
    return toItems(ordered.slice(0, total));
  }
  if (pool !== "all") return toItems(choose(filtered, total));
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

  return toItems(choose(selected, total));
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
