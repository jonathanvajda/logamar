import { approvedGlossesForTerm, normalizeAnswer } from "./answer-checking.js";
import { activePoolIds, escapeHtml as e, csv, safeText, download, vocabularyFingerprint } from "./pools.js";
import { getAll, putOne, saveExamAttempt } from "./db.js";
import { SEED_VERSION } from "./seed-data.js";

export function validateExam(definition) {
  if (definition?.app !== "Logamar" || definition.type !== "vocabulary-exam" || definition.version !== 1 ||
      typeof definition.id !== "string" || typeof definition.name !== "string" || !Array.isArray(definition.questions) || !definition.questions.length || definition.questions.length > 10000 ||
      definition.questions.some((q) => typeof q.termId !== "string" || typeof q.prompt !== "string" || !Array.isArray(q.accepted) || !q.accepted.length || q.accepted.some((a) => typeof a !== "string" || !a.trim())) ||
      new Set(definition.questions.map((q) => q.termId)).size !== definition.questions.length) throw new Error("Unsupported or invalid vocabulary exam definition.");
  return definition;
}

export function scoreExam(definition, responses) {
  validateExam(definition);
  const items = definition.questions.map((q) => {
    const answer = String(responses[q.termId] ?? "");
    const correct = Boolean(answer.trim()) && q.accepted.some((a) => normalizeAnswer(a) === normalizeAnswer(answer));
    return { ...q, answer, correct, points: correct ? 1 : 0 };
  });
  const earned = items.reduce((sum, i) => sum + i.points, 0);
  return { items, earned, possible: items.length, percentage: Math.round(earned / items.length * 10000) / 100,
    unanswered: items.filter((i) => !i.answer.trim()).length };
}

export async function createExam(pool, terms) {
  const ids = new Set(activePoolIds(pool));
  const definition = { app: "Logamar", type: "vocabulary-exam", version: 1, id: crypto.randomUUID(), name: pool.name,
    poolId: pool.id, poolRevision: pool.revision, vocabularyFingerprint: await vocabularyFingerprint([...ids]),
    datasetVersion: SEED_VERSION,
    scoring: "typed-gloss-v1; case/punctuation/diacritics ignored; 1 point each; unanswered = 0",
    questions: terms.filter((t) => ids.has(t.id)).map((t) => ({ termId: t.id, prompt: t.lemma, accepted: approvedGlossesForTerm({ ...t, glosses: t.studyGlosses ?? t.glosses }) })) };
  return validateExam(definition);
}

async function definitionFingerprint(definition) {
  const bytes = new TextEncoder().encode(JSON.stringify(definition));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function bindExamAuthoring(container, pool, terms, status) {
  const host = document.createElement("section"); host.innerHTML = `<h2>Vocabulary exam</h2><p>Create a typed-gloss exam from the active words. Review accepted answers before distributing its JSON definition.</p><button id="prepare-exam" ${!activePoolIds(pool).length ? "disabled" : ""}>Prepare exam definition</button><div id="exam-authoring"></div>`; container.append(host);
  host.querySelector("#prepare-exam").onclick = async () => {
    try {
      const definition = await createExam(pool, terms); const editor = host.querySelector("#exam-authoring");
      editor.innerHTML = `<p>Separate alternative accepted answers with |. Students receive no feedback until submission.</p><form id="exam-rubric"><table><thead><tr><th>Word</th><th>Accepted answers</th></tr></thead><tbody>${definition.questions.map((q, i) => `<tr><td>${e(q.termId)} ${e(q.prompt)}</td><td><input name="q${i}" value="${e(q.accepted.join(" | "))}" aria-label="Accepted answers for ${e(q.termId)}" required></td></tr>`).join("")}</tbody></table><button>Save and download exam JSON</button></form>`;
      editor.querySelector("form").onsubmit = async (event) => {
        event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true;
        try {
          const data = new FormData(event.target);
          definition.questions.forEach((q, i) => { q.accepted = data.get(`q${i}`).split("|").map((v) => v.trim()).filter(Boolean); });
          validateExam(definition); await putOne("examDefinitions", definition);
          download("logamar-exam.json", JSON.stringify(definition, null, 2), "application/json"); status("Exam saved. Open Exams to take it, or share the downloaded definition.");
        } catch (error) { status(error.message); } finally { button.disabled = false; }
      };
    } catch (error) { status(error.message); }
  };
}

export async function showExams(app) {
  const definitions = await getAll("examDefinitions"); const attempts = await getAll("examAttempts");
  app.innerHTML = `<section class="panel exam-panel"><h1>Vocabulary exams</h1><p>Import a teacher's exam JSON or prepare one from a saved pool. These are local, honor-system results; identity is self-reported and exported files are editable.</p>
    <label class="field">Import exam definition <input id="exam-file" type="file" accept=".json,application/json"></label><p id="exam-status" role="status"></p>
    <label class="field">Student name or identifier <input id="student-name" maxlength="160"></label>
    <h2>Available exams</h2>${definitions.map((d) => `<p>${e(d.name)} (${d.questions.length} words) <button data-start="${e(d.id)}">Start new attempt</button></p>`).join("") || "<p>No exam definitions yet.</p>"}
    <h2>Attempts</h2>${attempts.map((a) => `<p>${e(a.definition.name)} — ${e(a.student)} — ${e(a.status)} <button data-attempt="${e(a.id)}">${a.status === "submitted" ? "View result" : "Resume"}</button></p>`).join("") || "<p>No attempts yet.</p>"}<div id="exam-work"></div></section>`;
  const status = (message) => { app.querySelector("#exam-status").textContent = message; };
  app.querySelector("#exam-file").onchange = async (event) => {
    try {
      const file = event.target.files[0]; if (!file) return;
      const d = validateExam(JSON.parse(await file.text()));
      const old = definitions.find((v) => v.id === d.id);
      if (old && JSON.stringify(old) !== JSON.stringify(d)) throw new Error("An exam with this ID already exists with different content. Ask the teacher for a new exam ID.");
      await putOne("examDefinitions", d); await showExams(app);
    } catch (error) { status(error.message); }
  };
  for (const button of app.querySelectorAll("[data-start]")) button.onclick = async () => {
    try {
      const student = app.querySelector("#student-name").value.trim(); if (!student) throw new Error("Enter your name or student identifier before starting.");
      button.disabled = true;
      const definition = structuredClone(definitions.find((d) => d.id === button.dataset.start));
      const attempt = { id: crypto.randomUUID(), definition, definitionFingerprint: await definitionFingerprint(definition), student, startedAt: new Date().toISOString(), status: "in-progress", responses: {} };
      await saveExamAttempt(attempt); renderAttempt(app.querySelector("#exam-work"), attempt, status);
    } catch (error) { status(error.message); } finally { button.disabled = false; }
  };
  for (const button of app.querySelectorAll("[data-attempt]")) button.onclick = () => renderAttempt(app.querySelector("#exam-work"), structuredClone(attempts.find((a) => a.id === button.dataset.attempt)), status);
}

function renderAttempt(host, attempt, status) {
  if (attempt.status === "submitted") { renderResult(host, attempt); return; }
  host.innerHTML = `<h2>${e(attempt.definition.name)} — ${e(attempt.student)}</h2><p>Answers save when you leave each field. Submit to finalize scoring; unanswered questions receive zero.</p><form id="attempt-form">${attempt.definition.questions.map((q, i) => `<label class="field">${i + 1}. ${e(q.prompt)} <input name="q${i}" value="${e(attempt.responses[q.termId] ?? "")}" autocomplete="off"></label>`).join("")}<button>Submit final answers</button><p id="answer-save-status" role="status"></p></form>`;
  let queue = Promise.resolve();
  const collect = () => { const data = new FormData(host.querySelector("form")); for (const [i, q] of attempt.definition.questions.entries()) attempt.responses[q.termId] = data.get(`q${i}`) ?? ""; };
  host.querySelector("form").onchange = () => {
    collect(); const snapshot = structuredClone(attempt);
    queue = queue.then(() => saveExamAttempt(snapshot)).then(() => { const message = host.querySelector("#answer-save-status"); if (message) message.textContent = "Answers saved."; }).catch((error) => { if (host.isConnected) status(error.message); });
  };
  host.querySelector("form").onsubmit = async (event) => {
    event.preventDefault(); event.target.querySelector("button").disabled = true;
    try {
      collect();
      for (const input of event.target.querySelectorAll("input")) input.disabled = true;
      await queue;
      attempt.status = "submitted"; attempt.submittedAt = new Date().toISOString();
      attempt.elapsedMs = Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt);
      attempt.result = scoreExam(attempt.definition, attempt.responses);
      await saveExamAttempt(attempt); renderResult(host, attempt);
    } catch (error) { status(error.message); for (const input of event.target.querySelectorAll("input, button")) input.disabled = false; }
  };
}

function renderResult(host, attempt) {
  const r = attempt.result;
  host.innerHTML = `<div id="exam-result"><h2>${e(attempt.definition.name)} result</h2><p>${e(attempt.student)} · ${e(attempt.submittedAt)}</p><p>${r.earned}/${r.possible} points (${r.percentage}%). ${r.unanswered} unanswered. Attempt ${e(attempt.id)}.</p><p>Honor-system submission; student identity and local results are self-reported.</p><div class="actions"><button id="result-json">Download result JSON</button><button id="result-csv">Download result CSV</button><button id="result-print">Print result</button></div><table><thead><tr><th>Word</th><th>Your answer</th><th>Accepted</th><th>Points</th></tr></thead><tbody>${r.items.map((i) => `<tr><td>${e(i.prompt)}</td><td>${e(i.answer)}</td><td>${e(i.accepted.join("; "))}</td><td>${i.points}</td></tr>`).join("")}</tbody></table></div>`;
  host.querySelector("#result-json").onclick = () => download("logamar-exam-result.json", JSON.stringify({ app: "Logamar", type: "exam-result", version: 1, ...attempt }, null, 2), "application/json");
  host.querySelector("#result-csv").onclick = () => download("logamar-exam-result.csv", csv([["attempt_id", "student", "exam", "submitted_at", "definition_fingerprint", "total_earned", "total_possible", "term_id", "prompt", "answer", "accepted", "points"], ...r.items.map((i) => [attempt.id, safeText(attempt.student), safeText(attempt.definition.name), attempt.submittedAt, attempt.definitionFingerprint, r.earned, r.possible, i.termId, safeText(i.prompt), safeText(i.answer), safeText(i.accepted.join("; ")), i.points])]));
  host.querySelector("#result-print").onclick = () => { document.body.classList.add("printing-exam-result"); window.print(); document.body.classList.remove("printing-exam-result"); };
}
