import { SEED_VERSION } from "./seed-data.js";

// Membership is independent of learning progress. Source groups may overlap.
export function activePoolIds(pool) {
  if (pool.archived) return [];
  const released = new Set(pool.releasedIds ?? []);
  return [...new Set(pool.sources.filter((s) => !s.archived).flatMap((s) => s.termIds.filter((id) => !(s.excludedIds ?? []).includes(id))))].filter((id) => !released.has(id));
}

export function parseCsv(text, delimiter = ",") {
  const rows = []; let row = [], field = "", quoted = false, closedQuote = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (closedQuote && ![delimiter, "\r", "\n"].includes(c)) throw new Error("Unexpected text after a quoted list field.");
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === "") { closedQuote = quoted; quoted = !quoted; }
      else throw new Error("Unexpected quote in CSV field.");
    } else if (!quoted && (c === delimiter || c === "\n" || c === "\r")) {
      row.push(field); field = ""; closedQuote = false;
      if (c !== delimiter) { if (row.some((v) => v.trim())) rows.push(row); row = []; if (c === "\r" && text[i + 1] === "\n") i++; }
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  row.push(field); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

export function csv(rows) {
  return rows.map((r) => r.map((v) => '"' + safeText(String(v ?? "")).replace(/"/g, '""') + '"').join(",")).join("\r\n");
}
export function safeText(value) { return /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value; }
export function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

export function stageCsv(text, terms, { header = true, column = 0, namespace = "", format = "csv" } = {}) {
  if (!["csv", "tsv", "txt"].includes(format)) throw new Error("Choose CSV, TSV, or plain text.");
  const rows = format === "txt" ? text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/).filter((line) => line.trim()).map((line) => [line.trim()]) : parseCsv(text, format === "tsv" ? "\t" : ",");
  if (header === "auto") header = rows[0]?.some((v) => /^(?:term[_ ]?id|id|strong'?s?(?:[_ ]?(?:id|number))?|format_version)$/i.test(v.trim())) ?? false;
  const headings = header ? rows.shift()?.map((s) => s.trim()) ?? [] : [];
  if (headings.length !== new Set(headings).size) throw new Error("CSV column names must be unique.");
  const normalized = headings.includes("format_version") && headings.includes("term_id");
  if (!rows.length) throw new Error("The list has no vocabulary rows.");
  if (!Number.isInteger(column) || column < 0) throw new Error("Choose a valid identifier column.");
  let assignment = null;
  if (normalized) {
    for (const key of ["list_id", "list_revision", "list_name", "language"]) if (!headings.includes(key)) throw new Error(`Missing normalized CSV column: ${key}`);
    const metadata = (row) => Object.fromEntries(["list_id", "list_revision", "list_name", ...["vocabulary_fingerprint", "dataset_version"].filter((key) => headings.includes(key))].map((key) => [key, row[headings.indexOf(key)]]));
    assignment = metadata(rows[0]);
    if (Object.values(assignment).some((v) => !v?.trim())) throw new Error("Normalized list metadata cannot be empty.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(assignment.list_id) || !/^[1-9]\d*$/.test(assignment.list_revision)) throw new Error("Invalid list ID or revision.");
    if (rows.some((row) => JSON.stringify(metadata(row)) !== JSON.stringify(assignment))) throw new Error("List metadata differs between rows.");
    if (rows.some((row) => row.length !== headings.length)) throw new Error("Normalized CSV rows must match the header's column count.");
  }
  if (normalized) column = headings.indexOf("term_id");
  const byId = new Map(terms.map((t) => [t.id, t]));
  const bySpelling = new Map();
  const spellingKey = (value) => value.trim().normalize("NFC").toLocaleLowerCase();
  for (const term of terms) {
    for (const label of [term.lemma, term.transliteration]) {
      if (!label?.trim()) continue;
      const key = spellingKey(label);
      if (!bySpelling.has(key)) bySpelling.set(key, new Set());
      bySpelling.get(key).add(term.lemmaId ?? term.id);
    }
  }
  const results = [], seen = new Set(); let duplicates = 0;
  for (const [index, row] of rows.entries()) {
    const value = row[column]?.trim() ?? "";
    let id = value;
    if (!normalized) {
      // Extended Hebrew suffixes are case-sensitive catalog identities.
      id = id.replace(/^[gh]/i, (prefix) => prefix.toUpperCase());
      if (/^\d+$/.test(id) && namespace) id = namespace + id;
      id = id.replace(/^([GH])0+(?=\d)/, "$1");
    }
    let term = byId.get(id); let error = "";
    if (!term && !normalized) {
      const candidates = bySpelling.get(spellingKey(value));
      if (candidates?.size === 1) term = byId.get([...candidates][0]);
      else if (candidates?.size > 1) error = "Ambiguous word; use a vocabulary ID";
    }
    if (!term && !error) error = "Unknown word or ID (bare numbers need a namespace)";
    if (normalized) {
      if (row[headings.indexOf("format_version")] !== "1") error = "Unsupported CSV version";
      if (headings.includes("language") && term && row[headings.indexOf("language")] !== term.language) error = "Language mismatch";
    }
    const canonical = term?.lemmaId ?? term?.id;
    if (!error && seen.has(canonical)) { duplicates++; continue; }
    if (!error) seen.add(canonical);
    results.push({ row: index + (header ? 2 : 1), input: value, term: byId.get(canonical), error });
  }
  return { results, duplicates, termIds: [...seen], assignment, format, header };
}

export function stageList(text, terms, options = {}) {
  let format = options.format ?? "auto";
  if (format === "auto") {
    let quoted = false, comma = false, tab = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
      if (!quoted && (c === "\n" || c === "\r")) { if (comma || tab || text.slice(0, i).trim()) break; }
      if (!quoted && c === ",") comma = true;
      if (!quoted && c === "\t") tab = true;
    }
    format = tab ? "tsv" : comma ? "csv" : "txt";
  }
  return stageCsv(text, terms, { header: "auto", ...options, column: format === "txt" ? 0 : options.column ?? 0, format });
}

export async function vocabularyCsv(pool, terms) {
  const ids = new Set(activePoolIds(pool));
  const fingerprint = await vocabularyFingerprint([...ids]);
  return csv([["format_version", "list_id", "list_revision", "list_name", "language", "term_id", "lemma", "display_gloss", "vocabulary_fingerprint", "dataset_version"],
    ...terms.filter((t) => ids.has(t.id)).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })).map((t) =>
      ["1", pool.id, pool.revision ?? 1, safeText(pool.name), t.language, t.id, safeText(t.lemma), safeText(t.glosses.join("; ")), fingerprint, SEED_VERSION])]);
}

export function poolReport(pool, terms, progress, history) {
  const assigned = [...new Set(pool.sources.flatMap((s) => s.termIds))];
  const active = new Set(activePoolIds(pool)); const byId = new Map(terms.map((t) => [t.id, t]));
  return assigned.map((id) => {
    const reviews = history.filter((h) => h.poolId === pool.id && h.termId === id);
    const p = progress.find((p) => p.termId === id);
    return { id, lemma: byId.get(id)?.lemma ?? id, active: active.has(id), globalStatus: p?.confidence ?? "new", reviews: reviews.length,
      know: reviews.filter((h) => h.answerGiven === "know").length, lastReview: reviews.map((h) => h.answeredAt).sort().at(-1) ?? "" };
  });
}

export function download(name, content, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function vocabularyFingerprint(ids) {
  const bytes = new TextEncoder().encode(JSON.stringify(["dictionary", [...new Set(ids)].sort()]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
