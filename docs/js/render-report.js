import { progressSuccessRate } from "./models.js";

export function renderReport({ terms, progressRows }) {
  const progressByTerm = new Map(progressRows.map((row) => [row.termId, row]));
  const rows = terms.map((term) => ({ term, progress: progressByTerm.get(term.id) }));
  const studied = rows.filter(({ progress }) => progress?.seenCount > 0);

  return `
    <section class="panel">
      <span class="eyebrow">Progress report</span>
      <h1>Your vocabulary progress.</h1>
      <p class="lead">${studied.length} of ${terms.length} sample terms have been studied in this browser.</p>
      <div class="progress-list">
        ${rows.map(({ term, progress }) => renderRow(term, progress)).join("")}
      </div>
    </section>
  `;
}

function renderRow(term, progress) {
  const rate = progress ? progressSuccessRate(progress) : null;
  return `
    <div class="progress-row">
      <strong>${term.id}</strong>
      <span>${term.lemma} <span class="muted">${term.transliteration}</span></span>
      <span>${progress?.confidence ?? "new"}</span>
      <span>${rate === null ? "N/A" : `${rate}%`}</span>
    </div>
  `;
}
