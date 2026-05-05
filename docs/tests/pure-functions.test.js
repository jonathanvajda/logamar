import { normalizeAnswer, checkTypedAnswer } from "../js/answer-checking.js";
import { buildDistractors, frequencyBand } from "../js/distractors.js";
import { generateFlashcardItems } from "../js/session-generator.js";
import { applyFlashcardResult } from "../js/scheduler.js";
import { scoreAnswer } from "../js/scoring.js";

const results = document.querySelector("#results");
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test("normalizeAnswer trims, lowercases, and removes punctuation", () => {
  assert(normalizeAnswer("  Love! ") === "love", "Expected normalized answer to be love");
});

test("checkTypedAnswer accepts verb gloss with and without to", () => {
  const term = { partOfSpeech: "verb", glosses: ["to love"] };
  assert(checkTypedAnswer("love", term).wasCorrect, "Expected love to be accepted");
  assert(checkTypedAnswer("to love", term).wasCorrect, "Expected to love to be accepted");
});

test("frequencyBand groups terms", () => {
  assert(frequencyBand(99) === "1-100", "Expected top 100 band");
  assert(frequencyBand(501) === "501-1000", "Expected 501-1000 band");
});

test("buildDistractors prefers same language, POS, and band", () => {
  const term = { id: "G1", language: "greek", partOfSpeech: "noun", frequency: 50 };
  const terms = [
    term,
    { id: "G2", language: "greek", partOfSpeech: "noun", frequency: 80 },
    { id: "G3", language: "greek", partOfSpeech: "verb", frequency: 80 },
    { id: "H1", language: "hebrew", partOfSpeech: "noun", frequency: 70 }
  ];
  const distractors = buildDistractors(term, terms, 1);
  assert(distractors[0].id === "G2", "Expected the closest distractor");
});

test("generateFlashcardItems returns requested terms when available", () => {
  const terms = [
    { id: "G1", language: "greek", partOfSpeech: "noun", frequency: 1 },
    { id: "G2", language: "greek", partOfSpeech: "verb", frequency: 2 }
  ];
  const items = generateFlashcardItems(terms, new Map(), {
    languages: ["greek"],
    partsOfSpeech: ["noun", "verb"],
    totalQuestions: 2
  });
  assert(items.length === 2, "Expected two items");
});

test("applyFlashcardResult updates revisit progress", () => {
  const base = {
    termId: "G1",
    seenCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    hintCount: 0,
    confidence: "new",
    nextDueAt: null,
    lastSeenAt: null
  };
  const next = applyFlashcardResult(base, {
    choice: "revisit",
    usedHint: true,
    now: new Date("2026-05-05T12:00:00Z")
  });
  assert(next.seenCount === 1, "Expected seen count increment");
  assert(next.incorrectCount === 1, "Expected revisit to count as incorrect for scheduling");
  assert(next.hintCount === 1, "Expected hint count increment");
  assert(next.confidence === "weak", "Expected weak confidence");
});

test("scoreAnswer applies hinted penalty", () => {
  assert(scoreAnswer({ wasCorrect: true, usedHint: true }) === 0.7, "Expected hinted score");
});

for (const { name, fn } of tests) {
  const row = document.createElement("div");
  try {
    fn();
    row.className = "pass";
    row.textContent = `PASS ${name}`;
  } catch (error) {
    row.className = "fail";
    row.textContent = `FAIL ${name}: ${error.message}`;
  }
  results.append(row);
}
