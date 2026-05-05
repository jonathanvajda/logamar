import { takeShuffled } from "./session-generator.js";

export function buildDistractors(term, terms, count = 3) {
  const sameBand = frequencyBand(term.frequency);
  const preferred = terms.filter((candidate) => {
    return candidate.id !== term.id
      && candidate.language === term.language
      && candidate.partOfSpeech === term.partOfSpeech
      && frequencyBand(candidate.frequency) === sameBand;
  });

  const fallback = terms.filter((candidate) => candidate.id !== term.id && candidate.language === term.language);
  return takeShuffled(preferred.length >= count ? preferred : fallback, count);
}

export function frequencyBand(frequency) {
  if (frequency <= 100) return "1-100";
  if (frequency <= 500) return "101-500";
  if (frequency <= 1000) return "501-1000";
  return "1001+";
}
