// Browser smoke test: optional Playwright dependency; no app data is modified.
// PLAYWRIGHT_MODULE can point to an existing installation.
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../docs/", import.meta.url));

const mime = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\//, "") || "index.html";
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + sep)) throw new Error("Outside docs");
    response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url + "#/pools");
  await page.getByRole("heading", { name: "Saved study pools" }).waitFor();
  await page.locator('[name="name"]').fill("Chapter 7");
  await page.getByRole("button", { name: "Create pool", exact: true }).click();
  await page.locator("#pool-csv").waitFor();
  const poolId = await page.locator("#saved-pool").inputValue();
  assert(await page.locator('#create-pool [name="name"]').isVisible(), "Create pool stays visible after creation");
  assert.equal(await page.locator("#create-pool").locator("xpath=ancestor::details").count(), 0);
  await page.locator("#csv-file").setInputFiles({ name: "chapter.txt", mimeType: "text/plain", buffer: Buffer.from("G3056\nG26") });
  await page.waitForFunction(() => document.querySelector("#pool-csv").value === "G3056\nG26");
  await page.locator("#preview-csv").click();
  await page.locator("#commit-csv").waitFor();
  assert.match(await page.locator("#csv-preview").textContent(), /2 unique words; 0 duplicates; 0 unresolved/);
  await page.locator("#csv-file").setInputFiles({ name: "chapter.tsv", mimeType: "text/tab-separated-values", buffer: Buffer.from("term_id\tnote\nG3056\tword\nG26\tlove") });
  await page.waitForFunction(() => document.querySelector("#list-format").value === "tsv");
  await page.locator("#preview-csv").click();
  await page.locator("#commit-csv").waitFor();
  assert.match(await page.locator("#csv-preview").textContent(), /2 unique words; 0 duplicates; 0 unresolved/);
  await page.locator("#pool-add-csv details > summary").click();
  await page.locator("#list-format").selectOption("auto");
  await page.locator("#pool-add-csv details > summary").click();
  assert(await page.locator("#pool-method-csv").isChecked());
  assert(!await page.locator("#passage-text").isVisible());
  assert(!await page.locator("#pool-name").isVisible());
  await page.locator("#pool-csv").fill("id\nG3056");
  await page.locator("#pool-method-csv").uncheck();
  assert(!await page.locator("#pool-csv").isVisible());
  await page.locator("#pool-method-csv").check();
  assert.equal(await page.locator("#pool-csv").inputValue(), "id\nG3056");
  await page.locator("#pool-csv").fill("id\nG3056\nG26\nG3056");
  await page.getByRole("button", { name: "Preview list", exact: true }).click();
  assert.match(await page.locator("#csv-preview").textContent(), /2 unique words; 1 duplicates; 0 unresolved/);
  await page.locator("#commit-csv").click();
  await page.waitForFunction(() => document.querySelectorAll(".pool-word").length === 2);
  await page.getByText("Manage words (2)", { exact: true }).click();
  assert(!await page.locator("#release-words").isVisible());
  await page.locator(".pool-word").first().check();
  assert(await page.locator("#release-words").isVisible());
  await page.locator(".pool-word").first().uncheck();
  assert(!await page.locator("#release-words").isVisible());
  await page.getByText("Manage words (2)", { exact: true }).click();
  await page.getByText("Reports and vocabulary export", { exact: true }).click();
  const vocabDownload = page.waitForEvent("download"); await page.locator("#vocab-export").click();
  const vocabPath = await (await vocabDownload).path(); const vocab = await readFile(vocabPath, "utf8");
  assert.match(vocab, /format_version/); assert.match(vocab, /G3056/);
  await page.reload(); await page.locator("#saved-pool").selectOption(poolId); await page.locator("#pool-csv").waitFor();
  await page.getByRole("link", { name: "Study 2 words" }).click();
  assert.equal(await page.locator('[name="savedPoolId"]').inputValue(), poolId);
  assert.match(await page.locator("#pool-count").textContent(), /2 matching cards/);
  await page.locator('[name="totalQuestions"]').fill("1");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await page.locator("#reveal-card").click(); await page.locator("#mark-know").click();
  await page.getByRole("heading", { name: "Session complete" }).waitFor();
  await page.goto(url + "#/pools"); await page.locator("#saved-pool").selectOption(poolId);
  await page.getByText("Reports and vocabulary export", { exact: true }).click();
  await page.locator("#pool-report").click();
  await page.locator("#report-json").waitFor();
  assert.match(await page.locator("#pool-report-view").textContent(), /1 of 2 assigned words reviewed/);
  // Passage import resolves first, then writes only after confirmation.
  await page.locator("#pool-method-passage").check();
  await page.locator("#passage-text").fill("John 1:1"); await page.locator("#preview-passage").click();
  await page.locator("#commit-passage").waitFor();
  assert.equal(await page.locator(".pool-word").count(), 2);
  await page.locator("#commit-passage").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-source]").length === 2);
  // An overlapping word survives archiving its original CSV source.
  await page.getByText("Manage sources (2)", { exact: true }).click();
  await page.locator("[data-source]").first().click();
  await page.getByRole("button", { name: "Confirm source change" }).click();
  await page.waitForFunction(() => document.querySelector("[data-source]").textContent === "Restore");
  assert.match(await page.locator("#pool-detail").textContent(), /G3056/);
  // Freeze a teacher-reviewed exam and submit a student attempt.
  await page.getByText("Create a vocabulary exam", { exact: true }).click();
  await page.locator("#prepare-exam").click(); await page.locator("#exam-rubric").waitFor();
  await page.locator('#exam-rubric input').first().fill("test answer");
  const examDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Save and download exam JSON" }).click(); await examDownload;
  await page.goto(url + "#/exams"); await page.locator("#student-name").fill("Student A");
  await page.locator("[data-start]").first().click(); await page.locator("#attempt-form").waitFor();
  await page.locator('#attempt-form input').first().fill("test answer");
  await page.locator('#attempt-form input').first().press("Tab");
  await page.waitForFunction(() => document.querySelector("#answer-save-status").textContent === "Answers saved.");
  await page.reload(); await page.locator("[data-attempt]").first().click(); await page.locator("#attempt-form").waitFor();
  assert.equal(await page.locator('#attempt-form input').first().inputValue(), "test answer");
  await page.getByRole("button", { name: "Submit final answers" }).click(); await page.locator("#exam-result").waitFor();
  assert.match(await page.locator("#exam-result").textContent(), /1\//);
  const resultDownload = page.waitForEvent("download"); await page.locator("#result-json").click();
  const result = JSON.parse(await readFile(await (await resultDownload).path(), "utf8"));
  assert.equal(result.status, "submitted"); assert.equal(result.result.earned, 1);
  const backup = await page.evaluate(async () => (await import("./js/db.js")).exportUserData());
  assert.equal(backup.studyPools.length, 1); assert.equal(backup.examAttempts.length, 1);
  // Fresh device: normalized teacher list and full backup both work.
  const second = await browser.newContext(); const studentPage = await second.newPage();
  await studentPage.goto(url + "#/pools"); await studentPage.getByRole("heading", { name: "Saved study pools" }).waitFor();
  await studentPage.locator('[name="name"]').fill("Student chapter"); await studentPage.getByRole("button", { name: "Create pool", exact: true }).click();
  await studentPage.locator("#pool-csv").fill(vocab); await studentPage.locator("#preview-csv").click(); await studentPage.locator("#commit-csv").click();
  await studentPage.waitForFunction(() => document.querySelectorAll(".pool-word").length === 2);
  await studentPage.evaluate(async (backup) => { const db = await import("./js/db.js"); await db.importUserData(backup); }, backup);
  const restored = await studentPage.evaluate(async () => (await import("./js/db.js")).exportUserData());
  assert.equal(restored.studyPools.length, 2); assert.equal(restored.examAttempts[0].result.earned, 1);
  await studentPage.goto(url + "#/exams"); await studentPage.locator("#exam-file").setInputFiles({ name: "teacher-exam.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup.examDefinitions[0])) });
  await studentPage.locator("[data-start]").first().waitFor();
  // Submitted scores are immutable through normal writes, and stale pool edits fail.
  await page.evaluate(async () => {
    const db = await import("./js/db.js"); const [attempt] = await db.getAll("examAttempts");
    let rejected = false; try { await db.saveExamAttempt({ ...attempt, student: "changed" }); } catch { rejected = true; }
    if (!rejected) throw new Error("Submitted attempt was mutable");
    const [pool] = await db.getAll("studyPools"); rejected = false;
    try { await db.savePool({ ...pool, name: "stale" }, pool.revision - 1); } catch { rejected = true; }
    if (!rejected) throw new Error("Stale pool edit was accepted");
    const backup = await db.exportUserData(); backup.studyPools[0].name = "conflicting import";
    backup.settings.push({ key: "must-not-import", value: true }); rejected = false;
    try { await db.importUserData(backup); } catch { rejected = true; }
    if (!rejected || await db.getOne("settings", "must-not-import")) throw new Error("Backup conflict did not roll back atomically");
    await db.importUserData({ app: "Logamar", version: 1, termProgress: [] });
  });
  // A genuine version-1 database migrates without losing existing progress.
  const legacy = await browser.newContext(); const legacyPage = await legacy.newPage();
  await legacyPage.goto(url + "data-sources.html");
  await legacyPage.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("logamar", 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore("termProgress", { keyPath: "termId" }); store.put({ termId: "G3056", seenCount: 7, correctCount: 7, incorrectCount: 0 }); };
    request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = reject;
  }));
  await legacyPage.goto(url + "#/pools"); await legacyPage.getByRole("heading", { name: "Saved study pools" }).waitFor();
  assert.equal(await legacyPage.evaluate(async () => (await (await import("./js/db.js")).getOne("termProgress", "G3056")).seenCount), 7);
  await legacy.close();
  // Offline shell includes passage index and saved pool data.
  await page.waitForFunction(() => navigator.serviceWorker.controller && document.querySelector("#offline-status").textContent === "Ready for offline study");
  await context.setOffline(true); await page.goto(url + "#/pools");
  await page.locator("#saved-pool").selectOption(poolId); await page.locator("#pool-method-passage").check(); await page.locator("#passage-text").fill("Jude 5-8"); await page.locator("#preview-passage").click(); await page.locator("#commit-passage").waitFor();
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload(); await page.locator("#saved-pool").selectOption(poolId);
  await page.screenshot({ path: resolve(tmpdir(), "logamar-pools-mobile.png"), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Pool page must fit a mobile screen");
  assert.deepEqual(errors, []);
  console.log("PASS pool persistence, CSV round trip, scoped study/report, overlapping passages, scored exam, backup restore, and offline passage preview");
  await second.close(); await context.close();
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
