export function scheduleFromFlashcardChoice(choice, now = new Date()) {
  const minutes = choice === "revisit" ? 10 : 24 * 60 * 3;
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

export function confidenceFromProgress(progress) {
  if (progress.seenCount === 0) return "new";
  if (progress.incorrectCount > progress.correctCount) return "weak";
  if (progress.correctCount >= 4 && progress.incorrectCount === 0) return "strong";
  return "learning";
}

export function applyFlashcardResult(progress, { choice, usedHint, now = new Date() }) {
  const next = {
    ...progress,
    seenCount: progress.seenCount + 1,
    lastSeenAt: now.toISOString(),
    nextDueAt: scheduleFromFlashcardChoice(choice, now)
  };

  if (choice === "know") {
    next.correctCount += 1;
  } else {
    next.incorrectCount += 1;
  }

  if (usedHint) {
    next.hintCount += 1;
  }

  next.confidence = confidenceFromProgress(next);
  return next;
}
