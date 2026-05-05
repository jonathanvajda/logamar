import { exportUserData, importUserData } from "./db.js";

export function renderImportExport() {
  return `
    <section class="panel">
      <span class="eyebrow">Local data</span>
      <h1>Import and export progress.</h1>
      <p class="lead">Canonical terms live in JSON seed files. Your study progress lives separately in IndexedDB.</p>
      <div class="actions">
        <button id="export-data">Export progress JSON</button>
      </div>
      <label class="field">
        <span>Import JSON</span>
        <textarea id="import-json" rows="10" placeholder="Paste a Logamar export here"></textarea>
      </label>
      <div class="actions">
        <button id="import-data" class="secondary">Import progress</button>
      </div>
      <p id="import-export-status" class="notice" hidden></p>
    </section>
  `;
}

export function bindImportExport() {
  const exportButton = document.querySelector("#export-data");
  const importButton = document.querySelector("#import-data");
  const importField = document.querySelector("#import-json");
  const status = document.querySelector("#import-export-status");

  exportButton?.addEventListener("click", async () => {
    const payload = await exportUserData();
    importField.value = JSON.stringify(payload, null, 2);
    showStatus(status, "Export ready below.");
  });

  importButton?.addEventListener("click", async () => {
    try {
      await importUserData(JSON.parse(importField.value));
      showStatus(status, "Import complete.");
    } catch (error) {
      showStatus(status, error.message);
    }
  });
}

function showStatus(element, message) {
  element.hidden = false;
  element.textContent = message;
}
