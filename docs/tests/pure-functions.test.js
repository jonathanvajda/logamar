import { normalizeAnswer, checkTypedAnswer } from "../js/answer-checking.js";
import { buildDistractors, frequencyBand } from "../js/distractors.js";
import { generateFlashcardItems } from "../js/session-generator.js";
import { applyFlashcardResult } from "../js/scheduler.js";
import { scoreAnswer } from "../js/scoring.js";
import { normalizeTerm } from "../js/models.js";
import { renderSession } from "../js/render-session.js";

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

test("most common first selects and presents the highest-frequency unseen words", () => {
  const terms = [1, 100, 20, 500, 0, 50].map((frequency, index) => ({
    id: `G${index + 1}`, language: "greek", partOfSpeech: "noun", frequency
  }));
  const items = generateFlashcardItems(terms, new Map(), {
    languages: ["greek"], totalQuestions: 3, studyOrder: "frequency"
  });
  assert(items.map((item) => item.termId).join(",") === "G4,G2,G6", "Expected top three in descending frequency, including filler cards");
});

test("most common first progresses to new words and retains due, weak, and flagged reviews", () => {
  const terms = Array.from({ length: 15 }, (_, index) => ({
    id: `G${index + 1}`, language: "greek", partOfSpeech: "noun", frequency: 100 - index
  }));
  const progress = new Map([
    ["G1", { seenCount: 1, confidence: "learning", nextDueAt: "2099-01-01" }],
    ["G13", { seenCount: 1, confidence: "learning", nextDueAt: "2020-01-01" }],
    ["G14", { seenCount: 1, confidence: "weak" }],
    ["G15", { seenCount: 1, manuallyFlagged: true }]
  ]);
  const items = generateFlashcardItems(terms, progress, {
    languages: ["greek"], totalQuestions: 10, studyOrder: "frequency"
  }, new Date("2026-10-19T12:00:00Z"));
  const ids = items.map((item) => item.termId);
  assert(ids.filter((id) => !progress.has(id)).slice(0, 4).join(",") === "G2,G3,G4,G5", "Expected most frequent unseen words first");
  assert(["G13", "G14", "G15"].every((id) => ids.includes(id)), "Expected due, weak, and flagged reviews");
  assert(items.length === 10 && new Set(ids).size === 10, "Expected exactly ten unique cards");
});

test("most common first honors language, POS, and top-N filters", () => {
  const terms = [
    { id: "H1", language: "hebrew", partOfSpeech: "noun", frequency: 1000 },
    { id: "G1", language: "greek", partOfSpeech: "verb", frequency: 900 },
    { id: "G2", language: "greek", partOfSpeech: "noun", frequency: 10 },
    { id: "G3", language: "greek", partOfSpeech: "noun", frequency: 20 },
    { id: "G4", language: "greek", partOfSpeech: "noun", frequency: 0 }
  ];
  const items = generateFlashcardItems(terms, new Map(), {
    languages: ["greek"], partsOfSpeech: ["noun"], topN: 2,
    totalQuestions: 10, studyOrder: "frequency"
  });
  assert(items.map((item) => item.termId).join(",") === "G3,G2", "Expected only the two eligible most common nouns");
});

test("most common first breaks frequency ties consistently and places zero counts last", () => {
  const terms = ["G10", "G2", "G1"].map((id) => ({
    id, language: "greek", partOfSpeech: "noun", frequency: id === "G1" ? 0 : 5
  }));
  const items = generateFlashcardItems(terms, new Map(), {
    totalQuestions: 3, studyOrder: "frequency"
  });
  assert(items.map((item) => item.termId).join(",") === "G2,G10,G1", "Expected stable ties and zero frequency last");
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

test("Aramaic metadata survives normalization and labels Hebrew-collection cards", () => {
  const term = normalizeTerm({
    id: "H2", language: "hebrew", biblicalLanguages: ["aramaic"],
    lemma: "אַב", glosses: ["father"], frequency: 3
  });
  const markup = renderSession({
    session: { mode: "flashcard" }, items: [{ termId: "H2" }], terms: [term],
    currentIndex: 0, revealed: true, hintVisible: false, usedHint: false
  });
  assert(term.language === "hebrew", "Expected existing study collection to remain compatible");
  assert(markup.includes('class="tag">Aramaic</span>'), "Expected an explicit Aramaic label");
  assert(markup.includes("father"), "Expected short gloss on revealed card");
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
