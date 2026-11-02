import { activePoolIds, stageCsv, stageList, vocabularyCsv, poolReport, parseCsv } from "../js/pools.js";
import { parseReference } from "../js/passages.js";
import { scoreExam } from "../js/exams.js";
import { normalizeAnswer, checkTypedAnswer } from "../js/answer-checking.js";
import { buildDistractors, frequencyBand } from "../js/distractors.js";
import { generateFlashcardItems } from "../js/session-generator.js";
import { applyFlashcardResult } from "../js/scheduler.js";
import { scoreAnswer } from "../js/scoring.js";
import { normalizeTerm } from "../js/models.js";
import { renderSession } from "../js/render-session.js";
import { summarizeProgress, learningStatus, matchesPool, enrichProgress } from "../js/progress.js";
import { renderReport } from "../js/render-report.js";
import { studyContext, dictionaryHistory } from "../js/study-context.js";

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

test("Aramaic cards use their own language and the right-to-left script layout", () => {
  const term = normalizeTerm({
    id: "H2", language: "aramaic", biblicalLanguages: ["aramaic"],
    lemma: "אַב", glosses: ["father"], frequency: 3
  });
  const markup = renderSession({
    session: { mode: "flashcard" }, items: [{ termId: "H2" }], terms: [term],
    currentIndex: 0, revealed: true, hintVisible: false, usedHint: false
  });
  assert(term.language === "aramaic", "Expected a separate Aramaic study collection");
  assert(markup.includes('class="lemma hebrew"'), "Aramaic should retain Hebrew-script RTL styling");
  assert(markup.includes('class="tag">Aramaic</span>'), "Expected an explicit Aramaic label");
  assert(markup.includes("father"), "Expected short gloss on revealed card");
});

const progressTerm = (id, frequency = 1, language = "greek") => ({
  id, frequency, language, lemma: id, transliteration: "", glosses: ["word"], partOfSpeech: "noun"
});
const learnedProgress = (id, values = {}) => ({
  termId: id, seenCount: 4, correctCount: 4, incorrectCount: 0, hintCount: 0,
  confidence: "strong", nextDueAt: "2099-01-01", ...values
});

test("latest revisit overrides a strong lifetime score and is shared by study pools", () => {
  const progress = learnedProgress("G1", { lastChoice: "revisit", incorrectCount: 1, seenCount: 5 });
  assert(learningStatus(progress) === "revisit", "Latest revisit must be visible despite high lifetime score");
  assert(matchesPool(progressTerm("G1"), progress, "revisit"), "Revisit study pool must use same definition");
  assert(!matchesPool(progressTerm("G1"), progress, "strong"), "Revisit must take precedence over strong");
  const next = applyFlashcardResult(progress, { choice: "know", usedHint: false });
  assert(next.lastChoice === "know", "Latest choice should be persisted");
});

test("old progress recovers the latest choice without overwriting explicit new data", () => {
  const rows = [learnedProgress("G1"), learnedProgress("G2", { lastChoice: "know" })];
  const history = [
    { termId: "G1", answerGiven: "revisit", answeredAt: "2026-10-19T13:00:00Z" },
    { termId: "G1", answerGiven: "know", answeredAt: "2026-10-18T13:00:00Z" },
    { termId: "G2", answerGiven: "revisit", answeredAt: "2026-10-19T13:00:00Z" }
  ];
  const enriched = enrichProgress(rows, history);
  assert(enriched[0].lastChoice === "revisit", "Must use latest timestamp, not array order");
  assert(enriched[1].lastChoice === "know", "Explicit stored choice remains authoritative");
  assert(rows[0].lastChoice === undefined, "Original progress is not mutated");
});

test("summary uses weighted ratings and ignores progress for absent vocabulary", () => {
  const terms = [progressTerm("G1"), progressTerm("G2"), progressTerm("G3"), progressTerm("G4")];
  const rows = [learnedProgress("G1"), learnedProgress("G2", { confidence: "learning", seenCount: 1, correctCount: 0, incorrectCount: 1, lastChoice: "revisit", hintCount: 1 }),
    learnedProgress("G3", { confidence: "learning", seenCount: 1, correctCount: 1 }), learnedProgress("orphan", { seenCount: 100 })];
  const summary = summarizeProgress(terms, rows);
  assert(summary.reviews === 6 && summary.knowRate === 83, "Know rate should be 5/6, weighted by reviews");
  assert(summary.studied === 3 && summary.hints === 1, "Only existing vocabulary should be counted");
  assert(Object.values(summary.status).reduce((a, b) => a + b, 0) === 4, "Breakdown must partition the vocabulary");
  assert(summary.status.strong === 1 && summary.status.revisit === 1 && summary.status.unseen === 1 && summary.status.learning === 1, "Expected all four learning states");
});

test("due pool respects review dates and excludes new and retired cards", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const term = progressTerm("G1");
  assert(matchesPool(term, learnedProgress("G1", { nextDueAt: now.toISOString() }), "due", now), "Due at exact boundary");
  assert(!matchesPool(term, learnedProgress("G1", { retired: true, nextDueAt: "2020-01-01" }), "due", now), "Retired card not due");
  assert(!matchesPool(term, { seenCount: 0, nextDueAt: "2020-01-01" }, "due", now), "Unseen card not due");
});

test("explicit revisit pools never fill with unrelated cards and apply top N within the pool", () => {
  const terms = [progressTerm("G1", 100), progressTerm("G2", 20), progressTerm("G3", 10)];
  const progress = new Map([["G1", learnedProgress("G1")], ["G2", learnedProgress("G2", { lastChoice: "revisit" })], ["G3", learnedProgress("G3", { lastChoice: "revisit" })]]);
  const items = generateFlashcardItems(terms, progress, {
    progressPool: "revisit", topN: 1, totalQuestions: 10, studyOrder: "frequency"
  });
  assert(items.length === 1 && items[0].termId === "G2", "Only top eligible revisit word should be returned");
  const empty = generateFlashcardItems(terms, new Map(), { progressPool: "revisit", totalQuestions: 8 });
  assert(empty.length === 0, "Empty revisit pool must stay empty");
});

test("selected-card sessions preserve selection and language restrictions", () => {
  const terms = [progressTerm("G1"), progressTerm("G2"), progressTerm("H1", 10, "hebrew")];
  const items = generateFlashcardItems(terms, new Map(), {
    progressPool: "selected", selectedIds: ["G2", "H1"], languages: ["greek"], totalQuestions: 10
  });
  assert(items.length === 1 && items[0].termId === "G2", "Session must contain only selected eligible cards");
});

test("activity uses local days and a streak may continue from yesterday", () => {
  const now = new Date(2026, 9, 19, 12);
  const at = (day) => new Date(2026, 9, day, 23).toISOString();
  const history = [
    { termId: "G1", answerGiven: "know", answeredAt: at(18) },
    { termId: "G1", answerGiven: "revisit", answeredAt: at(17) },
    { termId: "missing", answerGiven: "know", answeredAt: at(19) },
    { termId: "G1", answerGiven: "know", answeredAt: "not-a-date" }
  ];
  const summary = summarizeProgress([progressTerm("G1")], [], history, now);
  assert(summary.activity.length === 14 && summary.streak === 2, "Expected local 14-day window and two-day streak");
  assert(summary.activity[12].know === 1 && summary.activity[11].revisit === 1, "Reviews belong to their local calendar dates");
  assert(summary.activity[13].know === 0, "No invented activity today");
});

test("report is paginated, escapes imported text, and handles a fresh browser", () => {
  const terms = Array.from({ length: 120 }, (_, index) => progressTerm(`G${index + 1}`, 120 - index));
  terms[0].lemma = '<img src=x onerror="alert(1)">';
  const markup = renderReport({ terms, progressRows: [], query: "", page: 0 });
  assert((markup.match(/class="report-select"/g) ?? []).length === 50, "Only one page should render");
  assert(markup.includes("Page 1 of 3"), "Expected three pages");
  assert(!markup.includes('<img src=x') && markup.includes("&lt;img"), "Imported lemma should render as text");
  assert(!markup.includes("NaN") && !markup.includes("Infinity"), "Fresh report should have valid numeric displays");
  const empty = renderReport({ terms: [], progressRows: [] });
  assert(empty.includes("No words match") && !empty.includes("NaN"), "Empty vocabulary should render gracefully");
});

test("Hebrew cards show a short study gloss and keep full senses behind a closed disclosure", () => {
  const term = normalizeTerm({
    id: "H3947", language: "hebrew", lemma: "לָקַח", studyGlosses: ["to take"],
    glosses: ["to take: take", "to take: marry", "to take: bring"], frequency: 1
  });
  const options = { session: { mode: "flashcard" }, items: [{ termId: term.id }], terms: [term], currentIndex: 0 };
  const revealed = renderSession({ ...options, revealed: true });
  assert(revealed.includes('<p class="answer">to take</p>'), "Expected concise head gloss as the answer");
  assert(revealed.includes('<details class="source-senses">') && !revealed.includes('<details open'), "Extra senses should start collapsed");
  assert(revealed.includes("to take: marry"), "Original senses must remain available");
  const hidden = renderSession({ ...options, revealed: false });
  assert(!hidden.includes("to take") && !hidden.includes("More source senses"), "Neither answer nor extra senses should leak before reveal");
  assert(term.glosses.length === 3, "Normalization must preserve all source glosses");
});

test("Greek and legacy cards keep their existing glosses without redundant disclosure", () => {
  const term = normalizeTerm({ id: "G1", language: "greek", lemma: "alpha", glosses: ["first", "beginning"] });
  const markup = renderSession({ session: { mode: "flashcard" }, items: [{ termId: "G1" }], terms: [term], currentIndex: 0, revealed: true });
  assert(markup.includes("first; beginning") && !markup.includes("More source senses"), "Unchanged glosses should remain simple");
});

test("dictionary study combines Greek form counts without merging related words", () => {
  const terms = [
    { ...progressTerm("G1510", 2), lemmaFrequency: 12, lemmaId: "G1510" },
    { ...progressTerm("G2076", 10), lemmaId: "G1510", isInflected: true },
    { ...progressTerm("G3056", 7), lemmaId: "G3056" }
  ];
  const context = studyContext(terms, new Map());
  assert(context.terms.length === 2 && context.terms[0].frequency === 12, "Expected one dictionary entry per mapped family");
  assert(context.terms.some((term) => term.id === "G3056"), "Unmapped lexical words remain independent");
  const items = generateFlashcardItems(terms, new Map(), { totalQuestions: 3, studyOrder: "frequency" });
  assert(items.map((item) => item.termId).join(",") === "G1510,G3056", "Dictionary mode must be default and avoid duplicate headwords");
  assert(items[0].studyFrequency === 12 && terms[0].frequency === 2, "Study totals must not overwrite source counts");
  const hard = generateFlashcardItems(terms, new Map(), { difficulty: "hard", totalQuestions: 3, studyOrder: "frequency" });
  assert(hard.map((item) => item.termId).join(",") === "G2076,G3056,G1510", "Hard mode should retain original forms and frequencies");
});

test("legacy inflection progress feeds dictionary revisit pools without duplicating stored reviews", () => {
  const terms = [
    { ...progressTerm("G1510", 2), lemmaFrequency: 12, lemmaId: "G1510" },
    { ...progressTerm("G2076", 10), lemmaId: "G1510", isInflected: true }
  ];
  const root = learnedProgress("G1510", { lastSeenAt: "2026-10-18T12:00:00Z", lastChoice: "know" });
  const form = learnedProgress("G2076", { seenCount: 1, correctCount: 0, incorrectCount: 1, lastSeenAt: "2026-10-19T12:00:00Z", lastChoice: "revisit" });
  const progress = new Map([[root.termId, root], [form.termId, form]]);
  const context = studyContext(terms, progress);
  assert(context.progressMap.get("G1510").seenCount === 5, "Old reviews should contribute exactly once");
  const items = generateFlashcardItems(terms, progress, { progressPool: "revisit", totalQuestions: 8 });
  assert(items.length === 1 && items[0].termId === "G1510", "A revisit of an inflection must surface its headword");
  assert(progress.get("G1510").seenCount === 4 && progress.get("G2076").seenCount === 1, "Stored per-ID records must stay intact");
  const history = dictionaryHistory([{ termId: "G2076", answerGiven: "revisit" }], context.idMap);
  assert(history[0].termId === "G1510", "Chart activity must follow the dictionary grouping");
  const selected = generateFlashcardItems(terms, progress, { progressPool: "selected", selectedIds: ["G2076"], totalQuestions: 8 });
  assert(selected.length === 1 && selected[0].termId === "G1510", "Selecting an old form should select the dictionary card");
});

test("Aramaic language filtering is independent of Hebrew", () => {
  const terms = [progressTerm("H1", 1, "hebrew"), progressTerm("H2", 10, "aramaic")];
  const items = generateFlashcardItems(terms, new Map(), { languages: ["aramaic"], totalQuestions: 8 });
  assert(items.length === 1 && items[0].termId === "H2", "Aramaic sessions must not include Hebrew words");
  assert(generateFlashcardItems(terms, new Map(), { totalQuestions: 8 }).length === 2, "All-languages sessions should include Aramaic");
});

test("persistent pool sources overlap and manual releases survive source changes", () => {
  const pool = { sources: [{ termIds: ["G1", "G2"] }, { termIds: ["G2", "G3"] }], releasedIds: ["G3"] };
  assert(activePoolIds(pool).join() === "G1,G2", "Union must deduplicate and honor releases");
  pool.sources[0].archived = true;
  assert(activePoolIds(pool).join() === "G2", "Archive must retain overlapping words");
});

test("CSV handles quoted fields, BOM, headers, namespace and dictionary deduplication", () => {
  const terms = [{ id: "G1", lemmaId: "G1" }, { id: "G2", lemmaId: "G1" }];
  const staged = stageCsv('\uFEFFid,note\r\n0001,"a,b"\r\n2,"two\nlines"', terms, { namespace: "G" });
  assert(staged.termIds.join() === "G1" && staged.duplicates === 1, "Canonical terms must deduplicate");
  assert(stageCsv("1", terms, { header: false }).results[0].error, "Bare number must require namespace");
  let failed = false; try { parseCsv('"unclosed'); } catch { failed = true; }
  assert(failed, "Malformed CSV must fail");
});

test("list imports accept TXT and TSV without dropping the first vocabulary entry", () => {
  const terms = [{ id: "G3056" }, { id: "G26" }];
  const text = stageList("\uFEFFG3056\r\nG26\r\nG3056", terms);
  assert(text.format === "txt" && !text.header && text.termIds.length === 2 && text.duplicates === 1, "TXT must keep its first entry and deduplicate");
  const tabbed = stageList('term_id\tnote\nG3056\t"a,b"\nG26\t"two\nlines"', terms);
  assert(tabbed.format === "tsv" && tabbed.header && tabbed.termIds.length === 2, "TSV must detect headers and support quoted fields");
  const unknown = stageList("unknown\nG26", terms);
  assert(unknown.results[0].error && unknown.results.length === 2, "Unknown first entries must not be silently treated as headers");
  const explicit = stageList("Custom title\nG26", terms, { format: "txt", header: true, column: 8 });
  assert(explicit.termIds[0] === "G26", "TXT must support explicit headers and always use its one column");
});

test("manual lists resolve unique dictionary forms and flag ambiguous spellings", () => {
  const terms = [
    { id: "G3056", lemma: "?????", transliteration: "logos" },
    { id: "H1", lemma: "?", transliteration: "shared" },
    { id: "H2", lemma: "?", transliteration: "shared" }
  ];
  const staged = stageList("?????\nlogos\nshared", terms);
  assert(staged.termIds.join() === "G3056" && staged.duplicates === 1, "Dictionary form and transliteration should share one canonical term");
  assert(staged.results.at(-1).error.includes("Ambiguous"), "Ambiguous transliteration must require an ID");
});

test("normalized vocabulary CSV round trips and validates metadata", async () => {
  const terms = [{ id: "G1", language: "greek", lemma: "word", glosses: ["a,b"] }];
  const pool = { id: "list-1", name: "Chapter 7", revision: 2, sources: [{ termIds: ["G1"] }], releasedIds: [] };
  const staged = stageCsv(await vocabularyCsv(pool, terms), terms);
  assert(staged.termIds.join() === "G1" && staged.assignment.list_revision === "2", "Normalized list must retain IDs and revision");
  assert(!staged.results[0].error, "Round trip must resolve");
});

test("saved pool sessions retain strong words and prefer unreviewed members", () => {
  const terms = [progressTerm("G1", 100), progressTerm("G2", 20), progressTerm("G3", 1)];
  const items = generateFlashcardItems(terms, new Map([["G2", { seenCount: 9, confidence: "strong" }]]), {
    allowedIds: ["G1", "G2"], totalQuestions: 1, poolHistory: [{ termId: "G1", answeredAt: "2026-01-01" }]
  });
  assert(items.length === 1 && items[0].termId === "G2", "Known words must remain eligible and get coverage");
  assert(generateFlashcardItems(terms, new Map(), { allowedIds: [], totalQuestions: 5 }).length === 0, "Empty saved pool must not fill from catalog");
});

test("pool reports keep released words in denominator and exclude unrelated activity", () => {
  const pool = { id: "p", sources: [{ termIds: ["G1", "G2"] }], releasedIds: ["G2"] };
  const rows = poolReport(pool, [], [], [{ poolId: "other", termId: "G1", answerGiven: "know" }, { poolId: "p", termId: "G2", answerGiven: "revisit" }]);
  assert(rows.length === 2 && rows[0].reviews === 0 && rows[1].reviews === 1 && !rows[1].active, "Report scope and denominator must be explicit");
});

test("passage normalization validates aliases, single chapters, and ambiguous compact references", () => {
  const index = { books: [{ id: "Jde", name: "Jude", chapters: { 1: { 1: ["G1"], 2: ["G2"], 3: ["G1"] } } }, { id: "1Jn", name: "1 John", chapters: { 1: { 4: ["G3"] } } }] };
  assert(parseReference("Jude 1-3", index).termIds.length === 2, "Single chapter range must deduplicate");
  assert(parseReference("1.Jo1:4", index).termIds[0] === "G3", "Explicit alias must normalize");
  for (const ref of ["1.Jo14", "Jude 3-1", "Jude 1:9"]) {
    let failed = false; try { parseReference(ref, index); } catch { failed = true; } assert(failed, "Invalid reference must fail: " + ref);
  }
});

test("exam scoring uses frozen accepted answers and counts unanswered as zero", () => {
  const definition = { app: "Logamar", type: "vocabulary-exam", version: 1, id: "e", name: "Chapter", questions: [{ termId: "G1", prompt: "word", accepted: ["to love", "love"] }, { termId: "G2", prompt: "other", accepted: ["other"] }] };
  const result = scoreExam(definition, { G1: " Love! " });
  assert(result.earned === 1 && result.possible === 2 && result.unanswered === 1 && result.percentage === 50, "Scored result must include unanswered questions");
});

for (const { name, fn } of tests) {
  const row = document.createElement("div");
  try {
    await fn();
    row.className = "pass";
    row.textContent = `PASS ${name}`;
  } catch (error) {
    row.className = "fail";
    row.textContent = `FAIL ${name}: ${error.message}`;
  }
  results.append(row);
}
