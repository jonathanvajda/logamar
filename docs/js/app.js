import { getAll, getProgressMap, ensureProgress, putOne, putMany } from "./db.js";
import { loadSeedData } from "./seed-data.js";
import { createSession } from "./models.js";
import { generateFlashcardItems } from "./session-generator.js";
import { applyFlashcardResult } from "./scheduler.js";
import { renderDashboard } from "./render-dashboard.js";
import { readSetupForm, renderSetup } from "./render-setup.js";
import { renderSession } from "./render-session.js";
import { renderReport } from "./render-report.js";
import { filterTermSearch, renderTermBrowser, renderTermRows } from "./teacher-console.js";
import { bindImportExport, renderImportExport } from "./import-export.js";

const app = document.querySelector("#app");
const navLinks = [...document.querySelectorAll(".top-nav a")];

let state = {
  terms: [],
  progressRows: [],
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
  state.progressRows = await getAll("termProgress");
}

async function route() {
  const path = location.hash.replace("#", "") || "/";
  setCurrentNav(path);

  if (path === "/" || path === "") {
    await refreshProgress();
    render(renderDashboard({ terms: state.terms, progressRows: state.progressRows }));
    return;
  }

  if (path === "/setup") {
    render(renderSetup({ terms: state.terms }));
    document.querySelector("#setup-form").addEventListener("submit", startSession);
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
    render(renderReport({ terms: state.terms, progressRows: state.progressRows }));
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
  const progressMap = await getProgressMap();
  const items = generateFlashcardItems(state.terms, progressMap, options);

  if (items.length === 0) {
    renderEmpty("No matching cards", "Try broadening your language, POS, or frequency filters.");
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
  const progress = await ensureProgress(item.termId);
  const updated = applyFlashcardResult(progress, {
    choice,
    usedHint: state.usedHint,
    now: new Date()
  });
  await putOne("termProgress", updated);
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
    link.toggleAttribute("aria-current", linkPath === path);
  }
}
