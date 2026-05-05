export const SCORES = {
  typedCorrect: 1.0,
  multipleChoiceCorrect: 0.8,
  correctAfterHint: 0.7,
  typedNearlyCorrect: 0.85,
  incorrect: 0,
  skipped: 0
};

export function scoreAnswer({ mode, wasCorrect, usedHint, nearlyCorrect, skipped }) {
  if (skipped) return SCORES.skipped;
  if (!wasCorrect) return SCORES.incorrect;
  if (usedHint) return SCORES.correctAfterHint;
  if (nearlyCorrect) return SCORES.typedNearlyCorrect;
  if (mode === "multiple-choice") return SCORES.multipleChoiceCorrect;
  return SCORES.typedCorrect;
}
