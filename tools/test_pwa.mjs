// Browser smoke test: optional Playwright dependency; no app data is modified.
// PLAYWRIGHT_MODULE can point to an existing installation.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../docs/", import.meta.url));
let serveUpdate = false;
const mime = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (!pathname.startsWith("/logamar/")) throw new Error("Outside test scope");
    const relative = decodeURIComponent(pathname.slice("/logamar/".length)) || "index.html";
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + sep)) throw new Error("Outside docs");
    let content = await readFile(path);
    if (relative === "precache-manifest.js" && serveUpdate) content = Buffer.from(content.toString().replace(/"version": "([^"]+)"/, '"version": "$1-test-update"'));
    response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/logamar/`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByRole("heading", { name: "Build fluency one word at a time." }).waitFor();
  await page.waitForFunction(() => navigator.serviceWorker.controller && document.querySelector("#offline-status").textContent === "Ready for offline study");
  assert.equal(await page.locator("#pwa-update").isVisible(), false, "First install is not an app update");
  await page.getByRole("button", { name: "Install Logamar", exact: true }).waitFor({ state: "visible" });
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  assert.equal(manifest.errors.length, 0, "Manifest must parse without errors");
  const parsed = JSON.parse(manifest.data);
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.scope, "./");
  const installability = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual(installability.installabilityErrors, [], "Chromium installability checks must pass");
  await page.evaluate(async () => {
    const { putOne, clearStore } = await import("./js/db.js");
    await putOne("settings", { key: "pwa-test-progress", value: "preserved" });
    // Prove offline data fetch works even without seeded vocabulary in IndexedDB.
    await clearStore("terms");
    await (await caches.open("unrelated-app-cache")).put("/unrelated", new Response("keep"));
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Build fluency one word at a time." }).waitFor();
  const data = await page.evaluate(async () => {
    const { getAll, getOne } = await import("./js/db.js");
    return { count: (await getAll("terms")).length, saved: (await getOne("settings", "pwa-test-progress")).value };
  });
  assert.equal(data.count, 14834);
  assert.equal(data.saved, "preserved");
  await page.getByRole("link", { name: "Study", exact: true }).click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await page.locator(".flashcard").waitFor();
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await page.locator(".answer").waitFor();
  await page.getByRole("button", { name: "I know this", exact: true }).click();
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await page.getByRole("heading", { name: "Your progress, made visible." }).waitFor();
  await context.setOffline(false);
  serveUpdate = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.locator("#pwa-update").waitFor({ state: "visible" });
  const before = await page.evaluate(async () => ({ waiting: Boolean((await navigator.serviceWorker.getRegistration()).waiting), keys: await caches.keys() }));
  assert.ok(before.waiting, "Updates must wait for the learner");
  await page.getByRole("button", { name: "Update app", exact: true }).click();
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).waiting && (await caches.keys()).some((key) => key.endsWith("test-update")));
  await page.getByRole("heading", { name: "Your progress, made visible." }).waitFor();
  assert.equal(await page.evaluate(async () => (await (await import("./js/db.js")).getOne("settings", "pwa-test-progress")).value), "preserved");
  assert.ok((await page.evaluate(() => caches.keys())).includes("unrelated-app-cache"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Mobile layout must fit");
  assert.deepEqual(errors, []);
  console.log("PWA checks passed: subdirectory scope, installability, offline fresh vocabulary, offline study, updates waiting for consent, preserved progress, unrelated caches, and mobile layout.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
