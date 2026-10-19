import { matchesPool, POOLS } from "./progress.js";

export function renderSetup({ terms, progressRows = [], defaults = {}, selectedIds = [] }) {
  const counts = countTermsByPos(terms);
  const posOptions = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  return `
    <section class="panel">
      <span class="eyebrow">Study setup</span>
      <h1>Choose your flashcards.</h1>
      <p class="lead">Choose a progress pool, then set the size and order of your session.</p>
      <form id="setup-form" class="setup-form">
        <div class="option-grid">
          <label class="field">
            <span>Language</span>
            <select name="language">
              <option value="both" ${!defaults.language || defaults.language === "both" ? "selected" : ""}>Greek and Hebrew</option>
              <option value="greek" ${defaults.language === "greek" ? "selected" : ""}>Greek</option>
              <option value="hebrew" ${defaults.language === "hebrew" ? "selected" : ""}>Hebrew / Aramaic</option>
            </select>
          </label>
          <label class="field">
            <span>Progress pool</span>
            <select name="progressPool">
              ${Object.entries(POOLS).map(([pool, label]) => `<option value="${pool}" ${pool === (defaults.pool ?? "all") ? "selected" : ""}>${label}</option>`).join("")}
            </select>
            <small id="pool-count" role="status"></small>
          </label>
          <label class="field">
            <span>Number of terms</span>
            <input name="totalQuestions" type="number" min="1" max="50" value="8">
          </label>
          <label class="field">
            <span>Frequency band</span>
            <select name="topN">
              <option value="999999">All terms</option>
              <option value="100">Top 100 by frequency</option>
              <option value="500">Top 500 by frequency</option>
              <option value="1000">Top 1000 by frequency</option>
            </select>
          </label>
          <label class="field">
            <span>Study order</span>
            <select name="studyOrder">
              <option value="mixed">Mixed practice</option>
              <option value="frequency">Most common first</option>
            </select>
            <small>Most common first introduces frequent words first while keeping review cards in your session.</small>
          </label>
        </div>
        <fieldset class="checkbox-group">
          <legend>Parts of speech</legend>
          <div class="checkboxes">
            ${posOptions.map((pos) => `
              <label class="check-pill">
                <input type="checkbox" name="partOfSpeech" value="${pos}" checked>
                <span>${formatPosLabel(pos)} (${counts.get(pos)})</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
        <div class="option-grid">
          <label class="field">
            <span>Session type</span>
            <select name="mode">
              <option value="flashcard">Flashcards</option>
            </select>
          </label>
          <label class="field">
            <span>Difficulty</span>
            <select name="difficulty">
              <option value="normal">Normal</option>
              <option value="easy">Easy</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button type="submit">Start session</button>
          <a class="button secondary" href="#/">Cancel</a>
        </div>
      </form>
      <p class="muted">Revisit includes your latest “Revisit” choices, weak words, and flagged cards. Due now includes studied cards whose scheduled review time has arrived. Strong means at least four “Know” ratings with no “Revisit” ratings. Progress pools can overlap.</p>
    </section>
  `;
}

function formatPosLabel(pos) {
  return pos.replaceAll("-", " ");
}

export function readSetupForm(form) {
  const data = new FormData(form);
  const language = data.get("language");
  return {
    mode: data.get("mode"),
    languages: language === "both" ? ["greek", "hebrew"] : [language],
    totalQuestions: Number(data.get("totalQuestions")),
    topN: Number(data.get("topN")),
    studyOrder: data.get("studyOrder") ?? "mixed",
    progressPool: data.get("progressPool") ?? "all",
    partsOfSpeech: data.getAll("partOfSpeech"),
    difficulty: data.get("difficulty")
  };
}

export function updatePoolCounts(form, terms, progressRows, selectedIds = []) {
  const data = new FormData(form);
  const language = data.get("language");
  const progress = new Map(progressRows.map((row) => [row.termId, row]));
  for (const option of form.elements.progressPool.options) {
    const count = terms.filter((term) => (language === "both" || term.language === language) &&
      matchesPool(term, progress.get(term.id), option.value, new Date(), selectedIds)).length;
    option.textContent = `${POOLS[option.value]} (${count.toLocaleString()})`;
  }
  const options = readSetupForm(form);
  const eligible = terms.filter((term) => (language === "both" || term.language === language) &&
    (!options.partsOfSpeech.length || options.partsOfSpeech.includes(term.partOfSpeech)) &&
    matchesPool(term, progress.get(term.id), options.progressPool, new Date(), selectedIds));
  const count = Math.min(eligible.length, options.topN);
  const requested = Math.min(options.totalQuestions, count);
  form.querySelector("#pool-count").textContent = `${count.toLocaleString()} matching cards · ${requested} in this session`;
  form.querySelector('[type="submit"]').disabled = count === 0;
}

function countTermsByPos(terms) {
  const counts = new Map();
  for (const term of terms) {
    counts.set(term.partOfSpeech, (counts.get(term.partOfSpeech) ?? 0) + 1);
  }
  return counts;
}
