import { clearStore, getAll, getOne, putMany, putOne } from "./db.js";
import { normalizeTerm } from "./models.js";

const SEED_VERSION = "2026-05-05-generated-greek-v1";
const SEED_FILES = ["./data/generated/greek.json", "./data/hebrew-sample.json"];

export async function loadSeedData() {
  const seedSetting = await getOne("settings", "seedDataVersion");
  const existing = await getAll("terms");
  if (existing.length > 0 && seedSetting?.value === SEED_VERSION) return existing;

  const files = await Promise.all(
    SEED_FILES.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Unable to load ${path}`);
      }
      return response.json();
    })
  );

  const terms = files.flat().map(normalizeTerm);
  await clearStore("terms");
  await putMany("terms", terms);
  await putOne("settings", {
    key: "seedDataVersion",
    value: SEED_VERSION,
    updatedAt: new Date().toISOString()
  });
  return terms;
}

export async function refreshSeedData() {
  const files = await Promise.all(
    SEED_FILES.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Unable to load ${path}`);
      }
      return response.json();
    })
  );

  const terms = files.flat().map(normalizeTerm);
  await putMany("terms", terms);
  return terms;
}
