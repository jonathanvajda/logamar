// Run the browser-compatible pure-function suite with Node and no dependencies.
const rows = [];
globalThis.document = {
  querySelector: () => ({ append: (row) => rows.push(row) }),
  createElement: () => ({})
};
await import("./pure-functions.test.js");
for (const row of rows) console.log(row.textContent);
if (rows.some((row) => row.className === "fail")) process.exitCode = 1;
console.log(`${rows.length} tests executed.`);
