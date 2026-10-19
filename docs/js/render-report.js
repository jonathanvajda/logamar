import { summarizeProgress, learningStatus, matchesPool, POOLS } from "./progress.js";
import { escapeHtml as esc } from "./html.js";
import { LANGUAGES, LANGUAGE_LABELS } from "./models.js";

const LABELS = { unseen: "Not started", learning: "Learning", revisit: "Revisit", strong: "Strong" };
const COLORS = { unseen: "var(--line)", learning: "var(--primary-light)", revisit: "var(--danger)", strong: "var(--primary)" };
const number = (value) => value.toLocaleString();
const percent = (value, total) => total && value > 0 && value / total < 0.01 ? "&lt;1" : total ? Math.round(value / total * 100) : 0;

export function renderReport({ terms, progressRows, history = [], language = "both", pool = "all", query = "", page = 0, selectedIds = [], now = new Date() }) {
  const scoped = terms.filter((term) => language === "both" || term.language === language);
  const summary = summarizeProgress(scoped, progressRows, history, now);
  const { total, studied, status, due, reviews, knowRate, hints, streak, byId } = summary;
  const needle = query.trim().toLowerCase();
  const matching = scoped.filter((term) => matchesPool(term, byId.get(term.id), pool, now, selectedIds) &&
    (!needle || [term.id, term.lemma, term.transliteration, ...term.glosses].join(" ").toLowerCase().includes(needle)))
    .sort((a, b) => b.frequency - a.frequency || a.id.localeCompare(b.id, "en", { numeric: true }));
  const pageCount = Math.max(1, Math.ceil(matching.length / 50));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  const visible = matching.slice(currentPage * 50, (currentPage + 1) * 50);
  const selected = new Set(selectedIds);
  const link = (target) => `#/setup?pool=${target}&language=${language}`;
  const milestone = Math.min(total, status.strong < 100 ? (Math.floor(status.strong / 10) + 1) * 10 : (Math.floor(status.strong / 100) + 1) * 100);
  return `
    <section class="report-heading">
      <div><span class="eyebrow">Learning record</span><h1>Your progress, made visible.</h1>
      <p class="lead">${number(studied)} of ${number(total)} dictionary words studied. Greek inflections and their history are grouped under the headword.</p></div>
      <label class="field"><span>Report language</span><select id="report-language">
        ${[["both", "All biblical languages"], ...LANGUAGES.map((key) => [key, LANGUAGE_LABELS[key]])].map(([value, label]) => `<option value="${value}" ${value === language ? "selected" : ""}>${label}</option>`).join("")}
      </select></label>
    </section>
    <section class="stats-grid report-stats" aria-label="Progress totals">
      ${stat("Words studied", `${number(studied)} / ${number(total)}`)}
      ${stat("Strong words", number(status.strong))}
      ${stat("Total card reviews", number(reviews))}
      ${stat("Know rate", knowRate === null ? "—" : `${knowRate}%`)}
      ${stat("Revisit pool", number(status.revisit))}
      ${stat("Due now", number(due))}
      ${stat("Day streak", number(streak))}
      ${stat("Hints used", number(hints))}
    </section>
    <p class="muted">Know rate reflects your flashcard ratings, not a scored test. Activity and streaks use saved answer history and your local calendar. Progress is saved in this browser; export a backup to keep a copy.</p>
    <section class="report-charts" aria-label="Learning charts">
      <article class="panel"><h2>Vocabulary breakdown</h2>
        ${donut(status, total)}
        <div class="chart-legend">${Object.entries(LABELS).map(([key, label]) => `<span><i style="background:${COLORS[key]}"></i>${label}: <strong>${number(status[key])}</strong> (${percent(status[key], total)}%)</span>`).join("")}</div>
        <p class="muted">Strong: at least four Know ratings and no Revisit ratings. A latest Revisit rating moves a word back into the revisit pool.</p>
      </article>
      <article class="panel"><h2>Practice activity</h2><p class="muted">Last 14 days; hover or focus a day for its counts.</p>
        ${activityChart(summary.activity)}
        <div class="chart-legend"><span><i style="background:${COLORS.strong}"></i>Know</span><span><i style="background:${COLORS.revisit}"></i>Revisit</span></div>
        ${summary.activity.every((day) => !day.know && !day.revisit) ? '<p class="muted">No answer history in this window yet. Your first review will appear here.</p>' : ""}
      </article>
    </section>
    <section class="panel report-section"><h2>Pick your next session</h2>
      <div class="pool-grid">${[["revisit", "Revisit", status.revisit, "Return to words that need attention."], ["due", "Due now", due, "Review words on their schedule."], ["unseen", "Not started", status.unseen, "Introduce new vocabulary."], ["strong", "Strong", status.strong, "Check words you know well."]].map(([key, label, count, description]) => `<article class="pool-card"><h3>${label}</h3><strong class="pool-number">${number(count)}</strong><p class="muted">${description}</p>${count ? `<a class="button secondary" href="${link(key)}">Study ${label.toLowerCase()}</a>` : '<span class="muted">No cards in this pool</span>'}</article>`).join("")}</div>
    </section>
    <section class="panel report-section"><h2>Progress by language</h2>
      ${LANGUAGES.filter((key) => language === "both" || language === key).map((key) => languageRow(key, scoped, progressRows, history, now)).join("")}
      <p class="muted">Frequency coverage is the share of source occurrences represented by studied entries, not a measure of reading comprehension. Greek uses TR counts; Hebrew and Aramaic use TAHOT counts.</p>
    </section>
    <section class="panel report-section milestone"><div><span class="eyebrow">Next milestone</span><h2>${total && status.strong === total ? "All words are strong" : `Build ${number(milestone)} strong words`}</h2><p class="muted">${number(Math.max(0, milestone - status.strong))} to go. Introduce common words and keep revisiting difficult ones.</p></div><strong>${number(status.strong)} / ${number(milestone)}</strong></section>
    <section class="panel report-section"><h2>Your words</h2>
      <form id="report-filters" class="report-toolbar">
        <label class="field"><span>Progress</span><select id="report-pool">${Object.entries(POOLS).map(([value, label]) => `<option value="${value}" ${value === pool ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="field"><span>Search words</span><input id="report-search" type="search" value="${esc(query)}" placeholder="Lemma, Strong's number, or gloss"></label>
        <button class="secondary" type="submit">Apply filters</button>
      </form>
      <div class="actions selection-actions"><button id="report-select-page" class="secondary" ${!visible.length ? "disabled" : ""}>Select this page</button><button id="report-clear" class="secondary" ${!selected.size ? "disabled" : ""}>Clear selection</button><a id="study-selected" class="button" href="#/setup?pool=selected&language=both" ${!selected.size ? 'hidden' : ""}>Study selected (${selected.size})</a><span id="selection-count" role="status">${selected.size} selected</span></div>
      <div class="table-scroll"><table class="report-table"><caption>${number(matching.length)} matching words; sorted by frequency</caption><thead><tr><th>Select</th><th>Word</th><th>Status</th><th>Reviews</th><th>Know rate</th><th>Last studied</th></tr></thead><tbody>
        ${visible.map((term) => wordRow(term, byId.get(term.id), selected)).join("") || '<tr><td colspan="6">No words match these filters. Try another pool or language.</td></tr>'}
      </tbody></table></div>
      <div class="pagination"><button id="report-prev" class="secondary" ${currentPage === 0 ? "disabled" : ""}>Previous</button><span>Page ${currentPage + 1} of ${pageCount}; up to 50 words per page</span><button id="report-next" class="secondary" ${currentPage + 1 >= pageCount ? "disabled" : ""}>Next</button></div>
    </section>`;
}

function stat(label, value) { return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`; }
function donut(status, total) {
  let start = 0;
  const stops = Object.keys(LABELS).map((key) => { const end = start + (total ? status[key] / total * 100 : 0); const stop = `${COLORS[key]} ${start}% ${end}%`; start = end; return stop; });
  return `<div class="progress-donut" role="img" aria-label="${percent(status.strong, total)}% strong; ${status.strong} strong, ${status.learning} learning, ${status.revisit} revisit, ${status.unseen} not started" style="background:conic-gradient(${total ? stops.join(",") : "#dce4ee 0% 100%"})"><div><strong>${percent(status.strong, total)}%</strong><span>strong</span></div></div>`;
}
function activityChart(days) {
  const max = Math.max(1, ...days.map((day) => day.know + day.revisit));
  return `<div class="activity-chart" aria-label="Daily card reviews">${days.map((day, index) => `<div class="activity-day" tabindex="0" aria-label="${esc(day.label)}: ${day.know} Know, ${day.revisit} Revisit" title="${esc(day.label)}: ${day.know} Know, ${day.revisit} Revisit"><span class="activity-value">${day.know + day.revisit}</span><div class="activity-track"><div class="activity-bars" style="height:${(day.know + day.revisit) / max * 100}%"><div style="flex:${day.revisit};background:${COLORS.revisit}"></div><div style="flex:${day.know};background:${COLORS.strong}"></div></div></div><small>${index % 3 === 0 || index === 13 ? esc(day.label) : "&nbsp;"}</small></div>`).join("")}</div>`;
}
function languageRow(language, terms, progressRows, history, now) {
  const scoped = terms.filter((term) => term.language === language);
  const summary = summarizeProgress(scoped, progressRows, history, now);
  const occurrences = scoped.reduce((sum, term) => sum + term.frequency, 0);
  const studiedOccurrences = scoped.reduce((sum, term) => sum + (summary.byId.get(term.id)?.seenCount > 0 ? term.frequency : 0), 0);
  return `<div class="language-progress"><h3>${LANGUAGE_LABELS[language]}</h3><p>${number(summary.studied)} / ${number(summary.total)} studied; ${number(summary.status.strong)} strong; ${number(summary.status.revisit)} revisit</p><progress value="${summary.studied}" max="${Math.max(1, summary.total)}" aria-label="${language} words studied"></progress><p class="muted">${percent(summary.studied, summary.total)}% of entries studied; ${occurrences ? `${percent(studiedOccurrences, occurrences)}% frequency coverage` : "Frequency coverage unavailable"}</p></div>`;
}
function wordRow(term, progress, selected) {
  const glosses = term.studyGlosses ?? term.glosses;
  const attempts = progress?.seenCount ?? 0;
  const rate = attempts ? `${Math.round((progress.correctCount ?? 0) / attempts * 100)}%` : "—";
  const date = progress?.lastSeenAt && Number.isFinite(Date.parse(progress.lastSeenAt)) ? new Date(progress.lastSeenAt).toLocaleDateString() : "—";
  return `<tr><td><input class="report-select" type="checkbox" value="${esc(term.id)}" aria-label="Select ${esc(term.id)}" ${selected.has(term.id) ? "checked" : ""}></td><td><strong>${esc(term.lemma)}</strong> <span class="muted">${esc(term.id)}</span><small class="report-gloss" title="${esc(term.glosses.join("; "))}">${esc(glosses.join("; "))}</small></td><td><span class="status-badge status-${learningStatus(progress)}">${LABELS[learningStatus(progress)]}</span></td><td>${attempts}</td><td>${rate}</td><td>${date}</td></tr>`;
}
