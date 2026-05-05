import { progressSuccessRate } from "./models.js";

export function renderDashboard({ terms, progressRows }) {
  const progressByTerm = new Map(progressRows.map((row) => [row.termId, row]));
  const seen = progressRows.filter((row) => row.seenCount > 0).length;
  const revisit = progressRows.filter((row) => row.confidence === "weak").length;
  const hints = progressRows.reduce((sum, row) => sum + row.hintCount, 0);
  const avgSuccess = average(progressRows.map(progressSuccessRate).filter((rate) => rate !== null));

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
        <p class="muted">Your data stays in this browser through IndexedDB.</p>
        <div class="progress-list">
          ${recentRows(progressRows, progressByTerm, terms)}
        </div>
      </aside>
    </section>
    <section class="stats-grid" aria-label="Progress summary">
      ${stat("Terms", terms.length)}
      ${stat("Seen", seen)}
      ${stat("Revisit", revisit)}
      ${stat("Avg. success", avgSuccess === null ? "N/A" : `${avgSuccess}%`)}
    </section>
    <section class="panel">
      <h2>Phase 1 scope</h2>
      <p class="muted">This MVP supports flashcard sessions with reveal, hints, “know it,” and “revisit.” Test modes, printable exports, and teacher templates are staged for the next phase.</p>
      <p class="muted">Hints used: ${hints}</p>
    </section>
  `;
}

function stat(label, value) {
  return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function recentRows(progressRows, progressByTerm, terms) {
  const byId = new Map(terms.map((term) => [term.id, term]));
  const rows = progressRows
    .filter((row) => row.lastSeenAt)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
    .slice(0, 4);

  if (rows.length === 0) {
    return `<p class="muted">No cards studied yet.</p>`;
  }

  return rows.map((row) => {
    const term = byId.get(row.termId);
    return `<div><strong>${term?.lemma ?? row.termId}</strong><br><span class="muted">${progressByTerm.get(row.termId)?.confidence ?? "new"}</span></div>`;
  }).join("");
}
