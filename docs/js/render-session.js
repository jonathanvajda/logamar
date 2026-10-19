import { escapeHtml } from "./html.js";

export function renderSession({ session, items, terms, currentIndex, revealed, hintVisible, usedHint }) {
  const termById = new Map(terms.map((term) => [term.id, term]));
  const item = items[currentIndex];
  const term = item ? termById.get(item.termId) : null;

  if (!term) {
    return `
      <section class="panel">
        <h1>Session complete</h1>
        <p class="lead">Nice work. Your flashcard choices were saved locally.</p>
        <div class="actions">
          <a class="button" href="#/setup">Start another</a>
          <a class="button secondary" href="#/report">View progress</a>
        </div>
      </section>
    `;
  }

  return `
    <section class="session-layout">
      <article class="flashcard">
        <div class="term-meta">
          <span class="tag">${term.biblicalLanguages?.includes("aramaic") ? "Aramaic" : term.language}</span>
          <span class="tag">${term.partOfSpeech}</span>
          ${term.isInflected ? '<span class="tag">Inflected form</span>' : ""}
          <span class="tag">${item.dictionaryMode && term.language === "greek" ? "lemma freq." : "freq."} ${item.studyFrequency ?? term.frequency}</span>
          <span class="tag">${currentIndex + 1} / ${items.length}</span>
        </div>
        <div class="lemma ${["hebrew", "aramaic"].includes(term.language) ? "hebrew" : ""}">${term.lemma}</div>
        <p class="muted">${term.transliteration}</p>
        ${revealed ? renderGloss(term) : `<p class="muted">Reveal the gloss when you are ready.</p>`}
        ${hintVisible ? `<p class="hint">${hintFor(term)}</p>` : ""}
        <div class="card-actions">
          <button id="reveal-card" class="secondary" ${revealed ? "disabled" : ""}>Reveal</button>
          <button id="show-hint" class="warning" ${usedHint ? "disabled" : ""}>Hint</button>
          <button id="mark-revisit" class="danger">Revisit</button>
          <button id="mark-know">I know this</button>
        </div>
      </article>
      <aside class="panel">
        <h2>Session</h2>
        <p class="muted">Mode: ${session.mode}</p>
        <p class="muted">Use “revisit” when you want the card back soon. Use “I know this” when it can wait a few days.</p>
      </aside>
    </section>
  `;
}

function renderGloss(term) {
  const short = term.studyGlosses ?? term.glosses;
  const more = short.join("; ") !== term.glosses.join("; ");
  return `<p class="answer">${escapeHtml(short.join("; "))}</p>${term.isInflected ? `<p class="muted">Dictionary form: ${escapeHtml(term.dictionaryLemma)}</p>` : ""}${more ? `
    <details class="source-senses"><summary>More source senses</summary>
      <ul>${term.glosses.map((gloss) => `<li>${escapeHtml(gloss)}</li>`).join("")}</ul>
    </details>` : ""}`;
}

function hintFor(term) {
  if (term.morphologyHints?.length) return term.morphologyHints[0];
  if (term.sourceRefs?.length) return `Seen near ${term.sourceRefs[0]}.`;
  return `The first gloss begins with “${term.glosses?.[0]?.slice(0, 1) ?? "?"}”.`;
}
