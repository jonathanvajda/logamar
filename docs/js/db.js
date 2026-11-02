import { createDefaultProgress } from "./models.js";

const DB_NAME = "logamar";
const DB_VERSION = 2;
const STORES = ["terms", "termProgress", "sessions", "sessionItems", "settings", "testTemplates", "studyPools", "examDefinitions", "examAttempts"];

let dbPromise;

export function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const keyPath = storeName === "settings" ? "key" : storeName === "termProgress" ? "termId" : "id";
          const store = db.createObjectStore(storeName, { keyPath });
          if (storeName === "terms") {
            store.createIndex("language", "language", { unique: false });
            store.createIndex("partOfSpeech", "partOfSpeech", { unique: false });
          }
          if (storeName === "termProgress") {
            store.createIndex("termId", "termId", { unique: true });
          }
          if (storeName === "sessionItems") {
            store.createIndex("sessionId", "sessionId", { unique: false });
          }
        }
      }
    };

    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => reject(new Error("Close other Logamar tabs, then reload to finish the storage update."));
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function txStore(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDb();
  return promisify(txStore(db, storeName).getAll());
}

export async function getOne(storeName, key) {
  const db = await openDb();
  return promisify(txStore(db, storeName).get(key));
}

export async function putOne(storeName, value) {
  const db = await openDb();
  return promisify(txStore(db, storeName, "readwrite").put(value));
}

export async function putMany(storeName, values) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const value of values) {
      store.put(value);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Commit the whole pool record atomically and reject stale edits from other tabs.
export async function savePool(pool, expectedRevision) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("studyPools", "readwrite");
    const store = tx.objectStore("studyPools");
    let conflict = false;
    const request = store.get(pool.id);
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== expectedRevision) { conflict = true; tx.abort(); return; }
      store.put(pool);
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(new Error(conflict ? "This pool changed in another tab. Reopen Pools before editing it." : "Pool changes could not be saved."));
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePool(poolId, expectedRevision) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("studyPools", "readwrite");
    const store = tx.objectStore("studyPools");
    let conflict = false;
    const request = store.get(poolId);
    request.onsuccess = () => {
      if (!request.result || request.result.revision !== expectedRevision) { conflict = true; tx.abort(); return; }
      store.delete(poolId);
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(new Error(conflict ? "This pool changed in another tab. Reopen Pools before deleting it." : "Pool could not be deleted."));
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveExamAttempt(attempt) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("examAttempts", "readwrite"); const store = tx.objectStore("examAttempts");
    let submitted = false;
    const request = store.get(attempt.id);
    request.onsuccess = () => {
      if (request.result?.status === "submitted") { submitted = true; tx.abort(); }
      else store.put(attempt);
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(new Error(submitted ? "This attempt has already been submitted. Reopen Exams to view the result." : "Unable to save exam answers."));
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveReview(progress, item) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["termProgress", "sessionItems"], "readwrite");
    tx.objectStore("termProgress").put(progress);
    tx.objectStore("sessionItems").put(item);
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error ?? new Error("Could not save this review. Please try again."));
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName) {
  const db = await openDb();
  return promisify(txStore(db, storeName, "readwrite").clear());
}

export async function getProgressMap() {
  const rows = await getAll("termProgress");
  return new Map(rows.map((row) => [row.termId, row]));
}

export async function ensureProgress(termId) {
  const existing = await getOne("termProgress", termId);
  if (existing) return existing;
  const progress = createDefaultProgress(termId);
  await putOne("termProgress", progress);
  return progress;
}

export async function exportUserData() {
  const [termProgress, sessions, sessionItems, settings, testTemplates, studyPools, examDefinitions, examAttempts] = await Promise.all([
    getAll("termProgress"),
    getAll("sessions"),
    getAll("sessionItems"),
    getAll("settings"),
    getAll("testTemplates"),
    getAll("studyPools"),
    getAll("examDefinitions"),
    getAll("examAttempts")
  ]);
  return {
    exportedAt: new Date().toISOString(),
    app: "Logamar",
    version: 2,
    termProgress,
    sessions,
    sessionItems,
    settings,
    testTemplates,
    studyPools,
    examDefinitions,
    examAttempts
  };
}

export async function importUserData(payload) {
  if (!payload || payload.app !== "Logamar") {
    throw new Error("This does not look like a Logamar export.");
  }

  if (![1, 2].includes(payload.version)) throw new Error("Unsupported backup version.");
  if (payload.studyPools && (!Array.isArray(payload.studyPools) || payload.studyPools.some((p) => !p.id || !Array.isArray(p.sources) || p.sources.some((s) => !s.id || !Array.isArray(s.termIds))))) throw new Error("Invalid saved pools.");
  const names = ["studyPools", "examDefinitions", "examAttempts", "termProgress", "sessions", "sessionItems", "settings", "testTemplates"];
  for (const name of names) {
    if (payload[name] !== undefined && !Array.isArray(payload[name])) throw new Error(`Invalid backup collection: ${name}`);
    const key = name === "settings" ? "key" : name === "termProgress" ? "termId" : "id";
    if ((payload[name] ?? []).some((row) => !row || typeof row[key] !== "string" || !row[key])) throw new Error(`Invalid backup record: ${name}`);
  }
  for (const pool of payload.studyPools ?? []) {
    if (typeof pool.name !== "string" || !Number.isInteger(pool.revision) || !Array.isArray(pool.releasedIds) || pool.releasedIds.some((id) => typeof id !== "string") ||
        pool.sources.some((source) => typeof source.label !== "string" || source.termIds.some((id) => typeof id !== "string") || (source.excludedIds !== undefined && (!Array.isArray(source.excludedIds) || source.excludedIds.some((id) => typeof id !== "string"))))) throw new Error("Invalid saved pool membership.");
  }
  const validDefinition = (d) => d && d.app === "Logamar" && d.type === "vocabulary-exam" && d.version === 1 && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.questions) && d.questions.length > 0 && d.questions.every((q) => typeof q.termId === "string" && typeof q.prompt === "string" && Array.isArray(q.accepted) && q.accepted.length && q.accepted.every((a) => typeof a === "string"));
  if ((payload.examDefinitions ?? []).some((d) => !validDefinition(d))) throw new Error("Invalid exam definition in backup.");
  if ((payload.examAttempts ?? []).some((a) => !validDefinition(a.definition) || typeof a.student !== "string" || !["in-progress", "submitted"].includes(a.status) || !a.responses || (a.status === "submitted" && (!a.result || !Array.isArray(a.result.items))))) throw new Error("Invalid exam attempt in backup.");
  for (const attempt of payload.examAttempts ?? []) {
    if (attempt.status !== "submitted") continue;
    const r = attempt.result;
    if ([r.earned, r.possible, r.percentage, r.unanswered].some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
        r.items.some((i) => !i || typeof i.termId !== "string" || typeof i.prompt !== "string" || typeof i.answer !== "string" || typeof i.points !== "number" || !Array.isArray(i.accepted) || i.accepted.some((v) => typeof v !== "string"))) throw new Error("Invalid submitted score in backup.");
  }
  const db = await openDb();
  // Preflight conflicts and apply the entire backup in one transaction.
  await new Promise((resolve, reject) => {
    const tx = db.transaction(names, "readwrite"); let error;
    const protectedNames = ["studyPools", "examDefinitions", "examAttempts"];
    const candidates = protectedNames.flatMap((name) => (payload[name] ?? []).map((row) => [name, row]));
    let pending = candidates.length;
    const write = () => { for (const name of names) for (const row of payload[name] ?? []) tx.objectStore(name).put(row); };
    for (const [name, row] of candidates) {
      const request = tx.objectStore(name).get(row.id);
      request.onsuccess = () => {
        if (request.result && JSON.stringify(request.result) !== JSON.stringify(row)) {
          error = new Error(`Backup conflicts with an existing ${name} record. Existing data was retained; import into a separate browser profile to preserve both versions.`);
          tx.abort(); return;
        }
        if (--pending === 0) write();
      };
    }
    if (!pending) write();
    tx.oncomplete = resolve;
    tx.onabort = () => reject(error ?? tx.error ?? new Error("Backup import failed."));
    tx.onerror = () => reject(tx.error);
  });
}
