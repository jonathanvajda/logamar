import { activePoolIds, escapeHtml as e } from "./pools.js";

let indexPromise;
export function loadPassages() {
  return indexPromise ??= fetch("./data/generated/passages.json").then((r) => {
    if (!r.ok) throw new Error("Unable to load passage data. Connect once to prepare offline passages.");
    return r.json();
  }).catch((error) => { indexPromise = null; throw error; });
}
const bookKey = (s) => s.toLowerCase().replace(/[.\s]/g, "");
const EXTRA = { Jhn: ["John", "Jn"], "1Jn": ["1 John", "1Jo"], "2Jn": ["2 John", "2Jo"], "3Jn": ["3 John", "3Jo"], Jde: ["Jude"], Psa: ["Psalm", "Ps"], Sng: ["Song of Solomon", "Song"], Phl: ["Philippians", "Phil"], Phm: ["Philemon"], Jas: ["James"] };

export function parseReference(input, index) {
  const match = input.trim().replace(/[–—]/g, "-").match(/^([1-3]?\s*\.?\s*[A-Za-z][A-Za-z .]*?)\s*\.?\s*(\d+)(?::(\d+))?(?:\s*-\s*(\d+)(?::(\d+))?)?$/);
  if (!match) throw new Error(`Use a reference such as John 1:1-5: ${input}`);
  const key = bookKey(match[1]);
  const candidates = index.books.filter((b) => [b.id, b.name, ...(EXTRA[b.id] ?? [])].some((alias) => bookKey(alias) === key));
  if (candidates.length !== 1) throw new Error(`Unknown or ambiguous book: ${match[1]}`);
  const book = candidates[0]; const chapters = Object.keys(book.chapters).map(Number).sort((a, b) => a - b);
  const single = chapters.length === 1;
  let startChapter = Number(match[2]), startVerse = match[3] ? Number(match[3]) : null;
  let endChapter, endVerse;
  if (single && startVerse === null) {
    startVerse = startChapter; startChapter = chapters[0];
    if (match[5]) throw new Error("Use Jude 1:5-1:8 for chapter-and-verse endpoints.");
    endChapter = startChapter; endVerse = Number(match[4] ?? startVerse);
  } else {
    if (!book.chapters[startChapter]) throw new Error(`No chapter ${startChapter} in ${book.name}. Include ':' between chapter and verse.`);
    const startVerses = Object.keys(book.chapters[startChapter]).map(Number).sort((a, b) => a - b);
    if (startVerse === null) {
      startVerse = startVerses[0]; endChapter = Number(match[4] ?? startChapter);
      if (match[5]) throw new Error("Give a starting verse for a chapter-and-verse range.");
      endVerse = Math.max(...Object.keys(book.chapters[endChapter] ?? {}).map(Number));
    } else {
      endChapter = match[5] ? Number(match[4]) : startChapter;
      endVerse = Number(match[5] ?? match[4] ?? startVerse);
    }
  }
  if (!book.chapters[startChapter]?.[startVerse] || !book.chapters[endChapter]?.[endVerse]) throw new Error(`Verse is outside the available ${book.name} text.`);
  if (endChapter < startChapter || (endChapter === startChapter && endVerse < startVerse)) throw new Error("Ending verse must follow starting verse.");
  const termIds = new Set(); const provenance = {};
  for (let c = startChapter; c <= endChapter; c++) {
    if (!book.chapters[c]) throw new Error(`Chapter ${c} is unavailable.`);
    const lo = c === startChapter ? startVerse : Math.min(...Object.keys(book.chapters[c]).map(Number));
    const hi = c === endChapter ? endVerse : Math.max(...Object.keys(book.chapters[c]).map(Number));
    for (let v = lo; v <= hi; v++) {
      if (!book.chapters[c][v]) throw new Error(`Verse ${book.name} ${c}:${v} is unavailable in this corpus.`);
      for (const id of book.chapters[c][v]) { termIds.add(id); (provenance[id] ??= []).push(`${book.name} ${c}:${v}`); }
    }
  }
  return { reference: `${book.name} ${startChapter}:${startVerse}-${endChapter}:${endVerse}`, termIds: [...termIds], provenance };
}

export async function bindPassageImport(container, pool, terms, save, status) {
  const host = document.createElement("section");
  host.innerHTML = `<h2>Add from Bible reference</h2><p>Choose the passages you want to study, and Logamar gathers their dictionary-form vocabulary.</p><p>Paste references such as John 1:1-5, or choose a book and verse range below. Preview the words before adding them. Vocabulary follows TR Parsed NT / STEPBible TAHOT OT.</p>
    <label class="field">Paste references, one per line<textarea id="passage-text" rows="3" placeholder="John 1:1-5"></textarea></label>
    <button id="show-passage-picker">Choose book and verses</button><div id="passage-picker"></div>
    <button id="preview-passage">Preview passage words</button><div id="passage-preview"></div>`;
  container.append(host);
  const preview = host.querySelector("#passage-preview");
  host.querySelector("#passage-text").oninput = () => preview.replaceChildren();
  host.querySelector("#show-passage-picker").onclick = async () => {
    try {
      const index = await loadPassages(); const picker = host.querySelector("#passage-picker");
      picker.innerHTML = `<label>Book <select id="passage-book">${index.books.map((b) => `<option value="${e(b.id)}">${e(b.name)}</option>`).join("")}</select></label>${["Starting chapter", "Starting verse", "Ending chapter", "Ending verse"].map((label, i) => `<label>${label} <select id="passage-endpoint-${i}"></select></label>`).join("")}<button id="use-range">Use this range</button>`;
      const endpoints = [0, 1, 2, 3].map((i) => picker.querySelector(`#passage-endpoint-${i}`));
      const book = () => index.books.find((b) => b.id === picker.querySelector("#passage-book").value);
      const fill = (select, values) => { select.innerHTML = values.sort((a, b) => a - b).map((v) => `<option>${v}</option>`).join(""); };
      const verses = (i) => fill(endpoints[i + 1], Object.keys(book().chapters[endpoints[i].value]).map(Number));
      const reset = () => { for (const i of [0, 2]) { fill(endpoints[i], Object.keys(book().chapters).map(Number)); verses(i); } };
      picker.querySelector("#passage-book").onchange = reset;
      endpoints[0].onchange = () => verses(0); endpoints[2].onchange = () => verses(2); reset();
      picker.querySelector("#use-range").onclick = () => { host.querySelector("#passage-text").value = `${book().name} ${endpoints[0].value}:${endpoints[1].value}-${endpoints[2].value}:${endpoints[3].value}`; preview.replaceChildren(); };
    } catch (error) { status(error.message); }
  };
  host.querySelector("#preview-passage").onclick = async () => {
    try {
      const index = await loadPassages();
      const inputs = host.querySelector("#passage-text").value.split(/\r?\n/).filter((s) => s.trim());
      if (!inputs.length) throw new Error("Enter a passage reference first.");
      const ranges = inputs.map((input) => parseReference(input, index)); const ids = [...new Set(ranges.flatMap((r) => r.termIds))];
      const byId = new Map(terms.map((t) => [t.id, t]));
      if (ids.some((id) => !byId.has(id))) throw new Error("Passage data and vocabulary versions differ. Update the app first.");
      const active = new Set(activePoolIds(pool));
      const newCount = ids.filter((id) => !active.has(id) && !pool.releasedIds.includes(id)).length;
      const disposition = (id) => pool.releasedIds.includes(id) ? "Previously released" : active.has(id) ? "Already active" : "New";
      preview.innerHTML = `<p>${e(ranges.map((r) => r.reference).join("; "))}: ${ids.length} unique dictionary words; ${newCount} new active words. Previously released words stay released.</p><table><thead><tr><th>ID</th><th>Word</th><th>Gloss</th><th>Result</th></tr></thead><tbody>${ids.map((id) => `<tr><td>${e(id)}</td><td>${e(byId.get(id).lemma)}</td><td>${e((byId.get(id).studyGlosses ?? byId.get(id).glosses).join("; "))}</td><td>${disposition(id)}</td></tr>`).join("")}</tbody></table><button id="commit-passage" ${!ids.length ? "disabled" : ""}>Confirm adding ${ids.length} source associations</button>`;
      preview.querySelector("#commit-passage").onclick = async (event) => {
        event.target.disabled = true;
        try {
          const label = ranges.map((r) => r.reference).join("; ");
          if (pool.sources.some((s) => !s.archived && s.type === "passage" && s.label === label)) throw new Error("This passage source is already present.");
          pool.sources.push({ id: crypto.randomUUID(), type: "passage", label, corpus: index.corpus, termIds: ids, ranges, archived: false }); await save();
        } catch (error) { status(error.message); }
      };
    } catch (error) { preview.replaceChildren(); status(error.message); }
  };
}
