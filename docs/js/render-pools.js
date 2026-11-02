import { getAll, putOne, savePool } from "./db.js";
import { organizePoolView } from "./pool-layout.js";
import { bindPassageImport } from "./passages.js";
import { bindExamAuthoring } from "./exams.js";
import { SEED_VERSION } from "./seed-data.js";
import { studyContext } from "./study-context.js";
import { activePoolIds, stageList, vocabularyCsv, poolReport, csv, safeText, escapeHtml as e, download, vocabularyFingerprint } from "./pools.js";

export async function showPools(app, terms, selectedIds = []) {
  const pools = await getAll("studyPools");
  const options = pools.map((p) => `<option value="${e(p.id)}">${e(p.name)}${p.archived ? " (archived)" : ""} (${activePoolIds(p).length})</option>`).join("");
  app.innerHTML = `<section class="panel pool-panel"><h1>Saved study pools</h1>
    <p>Words stay in your pool until you release them.</p>
    <form id="create-pool" class="actions"><label>New pool name <input name="name" required maxlength="160"></label><button>Create pool</button></form>
    <label class="field" ${!pools.length ? "hidden" : ""}>Pool <select id="saved-pool"><option value="">Choose a pool</option>${options}</select></label>
    <div id="pool-detail"></div><p id="pool-status" role="status"></p></section>`;
  const status = (message) => { app.querySelector("#pool-status").textContent = message; };
  app.querySelector("#create-pool").onsubmit = async (event) => {
    event.preventDefault(); const name = new FormData(event.target).get("name").trim(); if (!name) return;
    const pool = { id: crypto.randomUUID(), name, revision: 1, sources: [], releasedIds: [], createdAt: new Date().toISOString() };
    await putOne("studyPools", pool); await showPools(app, terms, selectedIds);
    app.querySelector("#saved-pool").value = pool.id; app.querySelector("#saved-pool").dispatchEvent(new Event("change"));
  };
  app.querySelector("#saved-pool").onchange = async (event) => {
    const pool = pools.find((p) => p.id === event.target.value); const detail = app.querySelector("#pool-detail");
    if (!pool) { detail.innerHTML = ""; return; }
    const original = structuredClone(pool);
    const save = async () => { const expected = pool.revision; pool.revision++; pool.updatedAt = new Date().toISOString(); await savePool(pool, expected); await showPools(app, terms, selectedIds); app.querySelector("#saved-pool").value = pool.id; app.querySelector("#saved-pool").dispatchEvent(new Event("change"));
      const message = app.querySelector("#pool-status"); message.textContent = "Pool updated. ";
      const undo = document.createElement("button"); undo.textContent = "Undo last change"; message.append(undo);
      undo.onclick = async () => { try { await savePool({ ...original, revision: pool.revision + 1 }, pool.revision); await showPools(app, terms, selectedIds); app.querySelector("#saved-pool").value = pool.id; app.querySelector("#saved-pool").dispatchEvent(new Event("change")); } catch (error) { status(error.message); } };
    };
    const ids = new Set(activePoolIds(pool));
    detail.innerHTML = `<label class="field">Pool name <input id="pool-name" value="${e(pool.name)}" maxlength="160"></label><label class="field">Target date (optional) <input id="pool-date" type="date" value="${e(pool.targetDate ?? "")}"></label><button id="save-pool-details">Save details</button><button id="archive-pool">${pool.archived ? "Restore pool" : "Archive pool"}</button><div class="actions"><a class="button" href="#/setup?savedPool=${encodeURIComponent(pool.id)}">Study ${ids.size} words</a><button id="vocab-export">Download vocabulary CSV</button><button id="pool-report">Show progress report</button></div><label class="field">Report / vocabulary export scope <select id="pool-report-scope"><option value="">All pool sources</option>${pool.sources.map((source) => `<option value="${e(source.id)}">${e(source.label)}${source.archived ? " (archived)" : ""}</option>`).join("")}</select></label><label class="field">Student name / identifier for report (optional) <input id="report-student" maxlength="160"></label>
      <h2>Sources</h2>${pool.sources.map((s) => `<p>${e(s.label)}: ${s.termIds.length} words <button data-source="${e(s.id)}">${s.archived ? "Restore" : "Archive"}</button></p>`).join("") || "<p>No sources yet.</p>"}
      <button id="add-selected" ${!selectedIds.length ? "disabled" : ""}>Add ${selectedIds.length} selected progress words</button>
      <h2>Add from list</h2><p>Upload a CSV (commas), TSV (tabs), or TXT file (one entry per line), or paste a list below. Use a vocabulary ID such as <code>G3056</code>, or copy a word or transliteration from Logamar. If several words match, use its ID. Preview the result before adding it.</p><label class="field">Source label <input id="source-label" value="${e('List imported on ' + new Date().toLocaleDateString())}"></label>
      <label class="field">Upload list (CSV, TSV, or TXT) <input id="csv-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"></label>
      <label class="field">Or paste a list <textarea id="pool-csv" rows="6" placeholder="G3056&#10;G26"></textarea></label>
      <label class="field">List format <select id="list-format"><option value="auto">Detect automatically</option><option value="csv">CSV (comma-separated)</option><option value="tsv">TSV (tab-separated)</option><option value="txt">TXT (one entry per line)</option></select></label><label class="field">First row <select id="csv-header"><option value="auto">Detect a header automatically</option><option value="yes">Header / column names</option><option value="no">Vocabulary entry</option></select></label>
      <label>Identifier column (starting at 1) <input id="csv-column" type="number" min="1" value="1"></label>
      <label>Bare number namespace <select id="csv-namespace"><option value="">Require prefix</option><option value="G">Greek (G)</option><option value="H">Hebrew/Aramaic (H)</option></select></label>
      <button id="preview-csv">Preview list</button><div id="csv-preview"></div>
      <h2>Pool words</h2><p>Select words to release or restore. Reviews never remove them.</p>
      <div class="actions"><button id="release-words">Release selected</button><button id="restore-words">Restore selected</button><button id="exclude-source-words">Remove selected from chosen source</button><button id="include-source-words">Restore selected to chosen source</button></div>
      <div class="table-wrap"><table><thead><tr><th>Select</th><th>ID</th><th>Word</th><th>Status</th><th>Sources</th></tr></thead><tbody>${[...new Set(pool.sources.flatMap((s) => s.termIds))].map((id) => {
        const t = terms.find((t) => t.id === id);
        return `<tr><td><input class="pool-word" type="checkbox" value="${e(id)}" aria-label="Select ${e(id)}"></td><td>${e(id)}</td><td>${e(t?.lemma ?? id)}</td><td>${ids.has(id) ? "Active" : "Inactive"}</td><td>${pool.sources.filter((s) => s.termIds.includes(id)).map((s) => e(s.label)).join("; ")}</td></tr>`;
      }).join("")}</tbody></table></div><div id="pool-report-view"></div>`;
    detail.querySelector("#save-pool-details").onclick = async () => { const name = detail.querySelector("#pool-name").value.trim(); if (!name) throw new Error("Enter a pool name."); pool.name = name; pool.targetDate = detail.querySelector("#pool-date").value; await save(); };
    detail.querySelector("#archive-pool").onclick = async () => { pool.archived = !pool.archived; await save(); };
    await bindPassageImport(detail, pool, terms, save, status);
    await bindExamAuthoring(detail, pool, terms, status);
    organizePoolView(detail, pool, selectedIds.length);
    for (const button of detail.querySelectorAll("[data-source]")) button.onclick = async () => {
      const source = pool.sources.find((s) => s.id === button.dataset.source);
      const before = new Set(activePoolIds(pool));
      const proposed = structuredClone(pool); proposed.sources.find((s) => s.id === source.id).archived = !source.archived;
      const after = new Set(activePoolIds(proposed));
      const removed = [...before].filter((id) => !after.has(id)).length;
      const kept = source.termIds.filter((id) => before.has(id) && after.has(id)).length;
      const preview = document.createElement("p"); preview.setAttribute("role", "status");
      preview.textContent = `${source.archived ? "Restore" : "Archive"} ${source.label}: ${removed} words leave active study; ${kept} remain active. `;
      const confirm = document.createElement("button"); confirm.textContent = "Confirm source change";
      const cancel = document.createElement("button"); cancel.textContent = "Cancel";
      preview.append(confirm, cancel); button.parentElement.append(preview); button.disabled = true;
      cancel.onclick = () => { preview.remove(); button.disabled = false; };
      confirm.onclick = async () => { confirm.disabled = true; try { source.archived = !source.archived; await save(); } catch (error) { status(error.message); } };
    };
    detail.querySelector("#add-selected").onclick = async () => {
      pool.sources.push({ id: crypto.randomUUID(), label: "Selected words", termIds: [...new Set(selectedIds)], archived: false }); await save();
    };
    for (const [button, release] of [["#release-words", true], ["#restore-words", false]]) detail.querySelector(button).onclick = async () => {
      const chosen = [...detail.querySelectorAll(".pool-word:checked")].map((i) => i.value); const released = new Set(pool.releasedIds);
      chosen.forEach((id) => release ? released.add(id) : released.delete(id)); pool.releasedIds = [...released]; await save();
    };
    for (const [button, exclude] of [["#exclude-source-words", true], ["#include-source-words", false]]) detail.querySelector(button).onclick = async () => {
      const source = pool.sources.find((s) => s.id === detail.querySelector("#word-source").value);
      if (!source) throw new Error("Choose a source for the selected words first.");
      const chosen = [...detail.querySelectorAll(".pool-word:checked")].map((i) => i.value).filter((id) => source.termIds.includes(id));
      const excluded = new Set(source.excludedIds ?? []); chosen.forEach((id) => exclude ? excluded.add(id) : excluded.delete(id)); source.excludedIds = [...excluded]; await save();
    };
    const scopedPool = () => {
      const source = pool.sources.find((source) => source.id === detail.querySelector("#pool-report-scope").value);
      return source ? { ...pool, sources: [source] } : pool;
    };
    detail.querySelector("#vocab-export").onclick = async () => {
      const scope = scopedPool(); const source = detail.querySelector("#pool-report-scope").value ? scope.sources[0] : null;
      const exported = source ? { ...scope, id: source.assignment?.list_id ?? source.id, revision: source.assignment?.list_revision ?? pool.revision, name: source.label } : scope;
      download("logamar-vocabulary.csv", await vocabularyCsv(exported, terms));
    };
    const preview = detail.querySelector("#csv-preview");
    let stagingRevision = 0;
    for (const input of detail.querySelectorAll("#pool-csv, #list-format, #csv-header, #csv-column, #csv-namespace, #source-label")) input.oninput = () => { stagingRevision++; preview.replaceChildren(); };
    detail.querySelector("#csv-file").onchange = async (event) => { const file = event.target.files[0]; if (file) {
      stagingRevision++; preview.replaceChildren();
      detail.querySelector("#pool-csv").value = await file.text();
      const extension = file.name.split(".").at(-1).toLowerCase();
      detail.querySelector("#list-format").value = ["csv", "tsv", "txt"].includes(extension) ? extension : "auto";
    } preview.replaceChildren(); };
    detail.querySelector("#preview-csv").onclick = async () => {
      try {
        const revision = stagingRevision;
        const staged = stageList(detail.querySelector("#pool-csv").value, terms, { format: detail.querySelector("#list-format").value, header: detail.querySelector("#csv-header").value === "auto" ? "auto" : detail.querySelector("#csv-header").value === "yes", column: Number(detail.querySelector("#csv-column").value) - 1, namespace: detail.querySelector("#csv-namespace").value });
        const errors = staged.results.filter((r) => r.error).length;
        if (!errors && staged.assignment?.vocabulary_fingerprint && await vocabularyFingerprint(staged.termIds) !== staged.assignment.vocabulary_fingerprint) throw new Error("The vocabulary does not match the list fingerprint. Ask for a corrected list or update the app if dictionary mappings changed.");
        if (revision !== stagingRevision) return;
        preview.innerHTML = `<p>${staged.format.toUpperCase()} list; ${staged.header ? "first row treated as a header" : "first row treated as a vocabulary entry"}.</p><p>${staged.termIds.length} unique words; ${staged.duplicates} duplicates; ${errors} unresolved. ${staged.termIds.filter((id) => !ids.has(id) && !pool.releasedIds.includes(id)).length} new active words. Previously released words stay released.</p>
          <div class="table-wrap"><table><thead><tr><th>Row</th><th>Input</th><th>Word</th><th>Result</th></tr></thead><tbody>${staged.results.map((r) => `<tr><td>${r.row}</td><td>${e(r.input)}</td><td>${e(r.term?.lemma)}</td><td>${e(r.error || (pool.releasedIds.includes(r.term.id) ? "Previously released" : ids.has(r.term.id) ? "Already active" : "New"))}</td></tr>`).join("")}</tbody></table></div>
          <button id="stage-export" ${errors || !staged.termIds.length ? "disabled" : ""}>Download normalized CSV</button>
          <button id="commit-csv" ${errors || !staged.termIds.length ? "disabled" : ""}>Confirm adding ${staged.termIds.length} source associations</button>`;
        const source = { id: crypto.randomUUID(), label: staged.assignment?.list_name || detail.querySelector("#source-label").value.trim() || "Vocabulary list", assignment: staged.assignment, termIds: staged.termIds, archived: false };
        preview.querySelector("#stage-export").onclick = async () => download("logamar-vocabulary.csv", await vocabularyCsv({ id: source.assignment?.list_id ?? source.id, revision: source.assignment?.list_revision ?? 1, name: source.label, sources: [source], releasedIds: [] }, terms));
        preview.querySelector("#commit-csv").onclick = async (event) => {
          event.target.disabled = true;
          if (pool.sources.some((s) => !s.archived && ((source.assignment && s.assignment?.list_id === source.assignment.list_id && s.assignment?.list_revision === source.assignment.list_revision) || (!source.assignment && s.label === source.label)) && [...s.termIds].sort().join() === [...source.termIds].sort().join())) { status("This source is already present."); return; }
          try {
            if (source.assignment && pool.sources.some((s) => s.assignment?.list_id === source.assignment.list_id && s.assignment?.list_revision === source.assignment.list_revision && [...s.termIds].sort().join() !== [...source.termIds].sort().join())) throw new Error("This list revision already exists with different words. Give the revised list a new revision.");
            pool.sources.push(source); await save();
          } catch (error) { status(error.message); }
        };
      } catch (error) { status(error.message); preview.replaceChildren(); }
    };
    detail.querySelector("#pool-report").onclick = async () => {
      const scope = scopedPool();
      const context = studyContext(terms, new Map((await getAll("termProgress")).map((p) => [p.termId, p])));
      const rows = poolReport(scope, terms, [...context.progressMap.values()], await getAll("sessionItems"));
      const student = detail.querySelector("#report-student").value.trim();
      const scopeLabel = scope.sources.length === pool.sources.length ? "All pool sources" : scope.sources[0].label;
      const generatedAt = new Date().toISOString();
      const report = { app: "Logamar", type: "pool-progress", version: 1, poolId: pool.id, poolName: pool.name, revision: pool.revision, generatedAt, student, scopeLabel, datasetVersion: SEED_VERSION, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, rows, vocabularyFingerprint: await vocabularyFingerprint(rows.map((r) => r.id)), sources: structuredClone(scope.sources) };
      const view = detail.querySelector("#pool-report-view");
      view.innerHTML = `<h2>${e(pool.name)} progress</h2><p>${e(student)} ? ${e(scopeLabel)} ? ${e(new Date(generatedAt).toLocaleString())}</p><p>${rows.filter((r) => r.reviews).length} of ${rows.length} assigned words reviewed in this pool. Includes inactive words. Know ratings are self-assessed practice, not exam scores.</p><button id="report-csv">Download report CSV</button><button id="report-json">Download report JSON</button><button id="report-print">Print</button>
        <table><thead><tr><th>Word</th><th>Active</th><th>Global status</th><th>Pool reviews</th><th>Know</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${e(r.id)} ${e(r.lemma)}</td><td>${r.active}</td><td>${e(r.globalStatus)}</td><td>${r.reviews}</td><td>${r.know}</td></tr>`).join("")}</tbody></table>`;
      view.querySelector("#report-json").onclick = () => download("logamar-pool-report.json", JSON.stringify(report, null, 2), "application/json");
      view.querySelector("#report-csv").onclick = () => download("logamar-pool-report.csv", csv([["pool_id", "pool_name", "revision", "generated_at", "student", "scope", "dataset_version", "vocabulary_fingerprint", "term_id", "lemma", "active", "global_status", "pool_reviews", "know", "last_pool_review"], ...rows.map((r) => [pool.id, safeText(pool.name), pool.revision, generatedAt, safeText(student), safeText(scopeLabel), SEED_VERSION, report.vocabularyFingerprint, r.id, safeText(r.lemma), r.active, r.globalStatus, r.reviews, r.know, r.lastReview])]));
      view.querySelector("#report-print").onclick = () => {
        document.body.classList.add("printing-pool-report");
        window.print();
        document.body.classList.remove("printing-pool-report");
      };
    };
    for (const element of detail.querySelectorAll("button, input")) {
      for (const property of ["onclick", "onchange"]) {
        const handler = element[property];
        if (handler) element[property] = async (event) => { try { await handler(event); } catch (error) { status(error.message); } };
      }
    }
  };
}
