import { createDefaultProgress } from "./models.js";

const DB_NAME = "logamar";
const DB_VERSION = 1;
const STORES = ["terms", "termProgress", "sessions", "sessionItems", "settings", "testTemplates"];

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

    request.onsuccess = () => resolve(request.result);
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
  const [termProgress, sessions, sessionItems, settings, testTemplates] = await Promise.all([
    getAll("termProgress"),
    getAll("sessions"),
    getAll("sessionItems"),
    getAll("settings"),
    getAll("testTemplates")
  ]);
  return {
    exportedAt: new Date().toISOString(),
    app: "Logamar",
    version: 1,
    termProgress,
    sessions,
    sessionItems,
    settings,
    testTemplates
  };
}

export async function importUserData(payload) {
  if (!payload || payload.app !== "Logamar") {
    throw new Error("This does not look like a Logamar export.");
  }

  await putMany("termProgress", payload.termProgress ?? []);
  await putMany("sessions", payload.sessions ?? []);
  await putMany("sessionItems", payload.sessionItems ?? []);
  await putMany("settings", payload.settings ?? []);
  await putMany("testTemplates", payload.testTemplates ?? []);
}
