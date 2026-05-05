export function renderSetup({ terms }) {
  const counts = countTermsByPos(terms);
  const posOptions = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  return `
    <section class="panel">
      <span class="eyebrow">Study setup</span>
      <h1>Choose your flashcards.</h1>
      <p class="lead">Phase 1 focuses on lightweight flashcard review. Tests will build on this same setup in Phase 2.</p>
      <form id="setup-form" class="setup-form">
        <div class="option-grid">
          <label class="field">
            <span>Language</span>
            <select name="language">
              <option value="both">Greek and Hebrew</option>
              <option value="greek">Greek</option>
              <option value="hebrew">Hebrew</option>
            </select>
          </label>
          <label class="field">
            <span>Number of terms</span>
            <input name="totalQuestions" type="number" min="1" max="50" value="8">
          </label>
          <label class="field">
            <span>Frequency band</span>
            <select name="topN">
              <option value="999999">All sample terms</option>
              <option value="100">Top 100 by frequency</option>
              <option value="500">Top 500 by frequency</option>
              <option value="1000">Top 1000 by frequency</option>
            </select>
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
    partsOfSpeech: data.getAll("partOfSpeech"),
    difficulty: data.get("difficulty")
  };
}

function countTermsByPos(terms) {
  const counts = new Map();
  for (const term of terms) {
    counts.set(term.partOfSpeech, (counts.get(term.partOfSpeech) ?? 0) + 1);
  }
  return counts;
}
