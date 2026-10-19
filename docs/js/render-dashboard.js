import { summarizeProgress, learningStatus } from "./progress.js";
import { escapeHtml } from "./html.js";

export function renderDashboard({ terms, progressRows }) {
  const progressByTerm = new Map(progressRows.map((row) => [row.termId, row]));
  const summary = summarizeProgress(terms, progressRows);

  return `
    <section class="hero">
      <div class="hero-main">
        <span class="eyebrow">Offline first flashcards</span>
        <h1>Build fluency one word at a time.</h1>
        <p class="lead">Study Koine Greek and Biblical Hebrew vocabulary with local progress tracking and clean, focused flashcards.</p>
        <div class="actions">
          <a class="button" href="#/setup">Start studying</a>
          <a class="button secondary" href="#/browser">Browse terms</a>
        </div>
      </div>
      <aside class="panel">
        <h2>Today</h2>
        <p class="muted">Your study progress is saved on this device.</p>
        <div class="progress-list">
          ${recentRows(progressRows, progressByTerm, terms)}
        </div>
      </aside>
    </section>
    <section class="stats-grid" aria-label="Progress summary">
      ${stat("Terms", terms.length)}
      ${stat("Studied", summary.studied)}
      ${stat("Revisit", summary.status.revisit)}
      ${stat("Know rate", summary.knowRate === null ? "—" : `${summary.knowRate}%`)}
    </section>
    <section class="panel">
      <h2>Choose your next step</h2>
      <p class="muted">${summary.due} cards due now · ${summary.status.strong} strong words · ${summary.reviews} card reviews</p>
      <div class="actions"><a class="button" href="#/report">Explore your progress</a><a class="button secondary" href="#/setup?pool=revisit">Study revisit pool</a><a class="button secondary" href="#/setup?pool=due">Study due cards</a></div>
    </section>
  `;
}

function stat(label, value) {
  return `<div class="stat"><strong>${typeof value === "number" ? value.toLocaleString() : value}</strong><span>${label}</span></div>`;
}

function recentRows(progressRows, progressByTerm, terms) {
  const byId = new Map(terms.map((term) => [term.id, term]));
  const rows = progressRows
    .filter((row) => row.lastSeenAt && byId.has(row.termId))
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
    .slice(0, 4);

  if (rows.length === 0) {
    return `<p class="muted">No cards studied yet.</p>`;
  }

  return rows.map((row) => {
    const term = byId.get(row.termId);
    return `<div><strong>${escapeHtml(term?.lemma ?? row.termId)}</strong><br><span class="muted">${learningStatus(progressByTerm.get(row.termId))}</span></div>`;
  }).join("");
}
