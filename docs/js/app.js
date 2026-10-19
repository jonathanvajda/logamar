import { getAll, ensureProgress, putOne, putMany } from "./db.js";
import { loadSeedData } from "./seed-data.js";
import { createSession } from "./models.js";
import { generateFlashcardItems } from "./session-generator.js";
import { applyFlashcardResult } from "./scheduler.js";
import { renderDashboard } from "./render-dashboard.js";
import { readSetupForm, renderSetup, updatePoolCounts } from "./render-setup.js";
import { enrichProgress } from "./progress.js";
import { renderSession } from "./render-session.js";
import { renderReport } from "./render-report.js";
import { filterTermSearch, renderTermBrowser, renderTermRows } from "./teacher-console.js";
import { bindImportExport, renderImportExport } from "./import-export.js";

const app = document.querySelector("#app");
const navLinks = [...document.querySelectorAll(".top-nav a")];

let state = {
  terms: [],
  progressRows: [],
  history: [],
  selectedTermIds: new Set(),
  report: { language: "both", pool: "all", query: "", page: 0 },
  activeSession: null,
  activeItems: [],
  currentIndex: 0,
  revealed: false,
  hintVisible: false,
  usedHint: false
};

window.addEventListener("hashchange", route);

boot();

async function boot() {
  state.terms = await loadSeedData();
  state.progressRows = await getAll("termProgress");
  route();
}

async function refreshProgress() {
  const [progressRows, history] = await Promise.all([getAll("termProgress"), getAll("sessionItems")]);
  state.history = history;
  state.progressRows = enrichProgress(progressRows, history);
}

async function route() {
  window.scrollTo({ top: 0, left: 0 });
  const [path, queryString = ""] = (location.hash.replace("#", "") || "/").split("?");
  setCurrentNav(path);

  if (path === "/" || path === "") {
    await refreshProgress();
    render(renderDashboard({ terms: state.terms, progressRows: state.progressRows }));
    return;
  }

  if (path === "/setup") {
    await refreshProgress();
    const params = new URLSearchParams(queryString);
    render(renderSetup({ terms: state.terms, progressRows: state.progressRows,
      defaults: { pool: params.get("pool") ?? "all", language: params.get("language") ?? "both" },
      selectedIds: [...state.selectedTermIds] }));
    const form = document.querySelector("#setup-form");
    const updateCounts = () => updatePoolCounts(form, state.terms, state.progressRows, [...state.selectedTermIds]);
    form.addEventListener("change", updateCounts);
    form.addEventListener("input", updateCounts);
    updateCounts();
    form.addEventListener("submit", startSession);
    return;
  }

  if (path === "/session") {
    renderActiveSession();
    return;
  }

  if (path === "/browser") {
    render(renderTermBrowser({ terms: state.terms }));
    const input = document.querySelector("#term-search");
    const results = document.querySelector("#term-results");
    input.addEventListener("input", () => {
      results.innerHTML = renderTermRows(filterTermSearch(state.terms, input.value));
    });
    return;
  }

  if (path === "/report") {
    await refreshProgress();
    showReport();
    return;
  }

  if (path === "/settings") {
    render(renderImportExport());
    bindImportExport();
    return;
  }

  renderEmpty("Page not found", "That Logamar view does not exist yet.");
}

async function startSession(event) {
  event.preventDefault();
  const options = readSetupForm(event.currentTarget);
  options.selectedIds = [...state.selectedTermIds];
  await refreshProgress();
  const progressMap = new Map(state.progressRows.map((row) => [row.termId, row]));
  const items = generateFlashcardItems(state.terms, progressMap, options);

  if (items.length === 0) {
    const message = document.querySelector("#pool-count");
    message.textContent = "No matching cards. Try another progress pool, language, or part of speech.";
    return;
  }

  state.activeSession = createSession({
    mode: "flashcard",
    languages: options.languages,
    filters: options,
    totalQuestions: items.length
  });
  state.activeItems = items;
  state.currentIndex = 0;
  state.revealed = false;
  state.hintVisible = false;
  state.usedHint = false;

  await putOne("sessions", state.activeSession);
  location.hash = "#/session";
}

function renderActiveSession() {
  if (!state.activeSession) {
    renderEmpty("No active session", "Start a study session first.");
    return;
  }

  render(renderSession({
    session: state.activeSession,
    items: state.activeItems,
    terms: state.terms,
    currentIndex: state.currentIndex,
    revealed: state.revealed,
    hintVisible: state.hintVisible,
    usedHint: state.usedHint
  }));

  document.querySelector("#reveal-card")?.addEventListener("click", () => {
    state.revealed = true;
    renderActiveSession();
  });
  document.querySelector("#show-hint")?.addEventListener("click", () => {
    state.hintVisible = true;
    state.usedHint = true;
    renderActiveSession();
  });
  document.querySelector("#mark-revisit")?.addEventListener("click", () => completeCard("revisit"));
  document.querySelector("#mark-know")?.addEventListener("click", () => completeCard("know"));
}

async function completeCard(choice) {
  const item = state.activeItems[state.currentIndex];
  const stored = await ensureProgress(item.termId);
  const progress = state.progressRows.find((row) => row.termId === item.termId) ?? stored;
  const updated = applyFlashcardResult(progress, {
    choice,
    usedHint: state.usedHint,
    now: new Date()
  });
  await putOne("termProgress", updated);
  state.progressRows = [...state.progressRows.filter((row) => row.termId !== item.termId), updated];
  await putMany("sessionItems", [{
    id: crypto.randomUUID(),
    sessionId: state.activeSession.id,
    termId: item.termId,
    promptType: item.promptType,
    answerGiven: choice,
    correctAnswers: [],
    wasCorrect: choice === "know",
    usedHint: state.usedHint,
    score: choice === "know" ? (state.usedHint ? 0.7 : 1) : 0,
    startedAt: state.activeSession.startedAt,
    answeredAt: new Date().toISOString(),
    elapsedMs: null
  }]);

  state.currentIndex += 1;
  state.revealed = false;
  state.hintVisible = false;
  state.usedHint = false;

  if (state.currentIndex >= state.activeItems.length) {
    state.activeSession = {
      ...state.activeSession,
      endedAt: new Date().toISOString()
    };
    await putOne("sessions", state.activeSession);
  }

  renderActiveSession();
}

function render(html) {
  app.innerHTML = html;
  app.focus({ preventScroll: true });
}

function showReport() {
  render(renderReport({ terms: state.terms, progressRows: state.progressRows, history: state.history,
    ...state.report, selectedIds: [...state.selectedTermIds] }));
  document.querySelector("#report-language").addEventListener("change", (event) => {
    state.report.language = event.target.value; state.report.page = 0; showReport();
  });
  document.querySelector("#report-filters").addEventListener("submit", (event) => {
    event.preventDefault();
    state.report.query = document.querySelector("#report-search").value;
    state.report.pool = document.querySelector("#report-pool").value;
    state.report.page = 0; showReport();
  });
  document.querySelector("#report-pool").addEventListener("change", () => {
    state.report.pool = document.querySelector("#report-pool").value;
    state.report.query = document.querySelector("#report-search").value;
    state.report.page = 0; showReport();
  });
  const updateSelection = () => {
    const count = state.selectedTermIds.size;
    const link = document.querySelector("#study-selected");
    link.hidden = count === 0; link.textContent = `Study selected (${count})`;
    document.querySelector("#selection-count").textContent = `${count} selected`;
    document.querySelector("#report-clear").disabled = count === 0;
  };
  for (const input of document.querySelectorAll(".report-select")) {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedTermIds.add(input.value); else state.selectedTermIds.delete(input.value);
      updateSelection();
    });
  }
  document.querySelector("#report-select-page").addEventListener("click", () => {
    for (const input of document.querySelectorAll(".report-select")) { input.checked = true; state.selectedTermIds.add(input.value); }
    updateSelection();
  });
  document.querySelector("#report-clear").addEventListener("click", () => { state.selectedTermIds.clear(); state.report.page = 0; showReport(); });
  document.querySelector("#report-prev").addEventListener("click", () => { state.report.page = Math.max(0, state.report.page - 1); showReport(); });
  document.querySelector("#report-next").addEventListener("click", () => { state.report.page += 1; showReport(); });
}

function renderEmpty(title, message) {
  const template = document.querySelector("#empty-state-template");
  const fragment = template.content.cloneNode(true);
  fragment.querySelector("h1").textContent = title;
  fragment.querySelector("p").textContent = message;
  app.replaceChildren(fragment);
}

function setCurrentNav(path) {
  for (const link of navLinks) {
    const linkPath = link.getAttribute("href").replace("#", "") || "/";
    if (linkPath === path) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
