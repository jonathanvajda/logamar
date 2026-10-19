// Generate raster sizes from the existing Lambda logo. Requires Playwright.
// Optionally set PLAYWRIGHT_MODULE to an installed Playwright module path.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = new URL("../docs/icons/", import.meta.url);
const svg = await readFile(new URL("logo.svg", directory), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [name, size, maskable] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180], ["favicon-32.png", 32], ["maskable-512.png", 512, true]]) {
    // A maskable icon fills the canvas and keeps the Lambda within its safe zone.
    const content = maskable ? svg.replace('rx="88"', 'rx="0"').replace('font-size="344"', 'font-size="280"').replace('y="364"', 'y="344"') : svg;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${content}`);
    await page.screenshot({ path: fileURLToPath(new URL(name, directory)), omitBackground: true });
  }
  const png = await readFile(new URL("favicon-32.png", directory));
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 32; header[7] = 32;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await writeFile(new URL("../favicon.ico", directory), Buffer.concat([header, png]));
  console.log("Generated PNG, maskable, Apple touch, and ICO icons from the Logamar Lambda.");
} finally { await browser.close(); }
