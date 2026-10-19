// Shared definitions keep reporting and session selection in agreement.
export const POOLS = {
  all: "All terms", unseen: "Not started", revisit: "Revisit", due: "Due now",
  learning: "Learning", strong: "Strong", studied: "Previously studied", selected: "Selected cards"
};

export function needsRevisit(progress) {
  return Boolean(progress && !progress.retired && (progress.manuallyFlagged ||
    progress.lastChoice === "revisit" || progress.confidence === "weak" ||
    progress.incorrectCount > progress.correctCount));
}

export function learningStatus(progress) {
  if (needsRevisit(progress)) return "revisit";
  if (!progress || !progress.seenCount) return "unseen";
  if (progress.confidence === "strong") return "strong";
  return "learning";
}

export function matchesPool(term, progress, pool = "all", now = new Date(), selectedIds = []) {
  if (pool === "selected") return selectedIds.includes(term.id);
  if (pool === "all") return true;
  if (pool === "due") return Boolean(progress?.seenCount > 0 && !progress.retired &&
    progress.nextDueAt && new Date(progress.nextDueAt) <= now);
  if (pool === "studied") return Boolean(progress?.seenCount > 0);
  return learningStatus(progress) === pool;
}

// Older progress records lack lastChoice; recover it from saved answer history.
export function enrichProgress(progressRows, history) {
  const latest = new Map();
  for (const item of history) {
    if (!["know", "revisit"].includes(item.answerGiven) || !Number.isFinite(Date.parse(item.answeredAt))) continue;
    const previous = latest.get(item.termId);
    if (!previous || Date.parse(item.answeredAt) > Date.parse(previous.answeredAt)) latest.set(item.termId, item);
  }
  return progressRows.map((row) => row.lastChoice || !latest.has(row.termId) ? row :
    { ...row, lastChoice: latest.get(row.termId).answerGiven });
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function summarizeProgress(terms, progressRows, history = [], now = new Date()) {
  const byId = new Map(enrichProgress(progressRows, history).map((row) => [row.termId, row]));
  const ids = new Set(terms.map((term) => term.id));
  const status = { unseen: 0, revisit: 0, learning: 0, strong: 0 };
  let reviews = 0, know = 0, hints = 0, studied = 0, due = 0;
  for (const term of terms) {
    const progress = byId.get(term.id);
    status[learningStatus(progress)] += 1;
    if (progress?.seenCount > 0) studied += 1;
    if (matchesPool(term, progress, "due", now)) due += 1;
    reviews += progress?.seenCount ?? 0;
    know += progress?.correctCount ?? 0;
    hints += progress?.hintCount ?? 0;
  }
  const activity = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    date.setDate(date.getDate() - 13 + index);
    return { day: dayKey(date), label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), know: 0, revisit: 0 };
  });
  const days = new Set();
  const activityByDay = new Map(activity.map((day) => [day.day, day]));
  for (const item of history) {
    const date = new Date(item.answeredAt);
    if (!ids.has(item.termId) || !Number.isFinite(date.getTime()) || date > now || !["know", "revisit"].includes(item.answerGiven)) continue;
    const day = dayKey(date);
    days.add(day);
    const entry = activityByDay.get(day);
    if (entry) entry[item.answerGiven] += 1;
  }
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return { total: terms.length, studied, due, status, reviews, know, hints, activity, streak,
    knowRate: reviews ? Math.round(know / reviews * 100) : null, byId };
}
