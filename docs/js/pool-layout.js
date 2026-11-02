// Keep task choices separate from the controls needed to carry out each task.
const preferences = new Map();

export function organizePoolView(detail, pool, selectedCount) {
  const state = preferences.get(pool.id) ?? { csv: true, passage: false, selected: selectedCount > 0 };
  preferences.set(pool.id, state);
  if (!selectedCount) state.selected = false;
  const find = (id) => detail.querySelector(id);
  const disclosure = (label, key) => {
    const box = document.createElement("details"); box.className = "pool-disclosure";
    box.open = Boolean(state[key]);
    const summary = document.createElement("summary"); summary.textContent = label; box.append(summary);
    box.addEventListener("toggle", () => { state[key] = box.open; });
    return box;
  };
  const moveRange = (first, last, host) => {
    let node = first;
    while (node) { const next = node.nextSibling; host.append(node); if (node === last) break; node = next; }
  };
  const settings = disclosure("Pool settings", "settings");
  const firstSetting = find("#pool-name").closest("label");
  firstSetting.before(settings); moveRange(firstSetting, find("#archive-pool"), settings);

  const report = disclosure("Reports and vocabulary export", "reports"); report.id = "pool-report-tools";
  report.hidden = !pool.sources.length;
  const scope = find("#pool-report-scope").closest("label");
  scope.before(report); report.append(scope, find("#report-student").closest("label"));
  scope.hidden = pool.sources.length < 2;
  const reportActions = document.createElement("div"); reportActions.className = "actions";
  reportActions.append(find("#vocab-export"), find("#pool-report")); report.append(reportActions, find("#pool-report-view"));

  const sources = disclosure(`Manage sources (${pool.sources.length})`, "sources");
  const sourcesHeading = [...detail.querySelectorAll("h2")].find((h) => h.textContent === "Sources");
  sourcesHeading.before(sources);
  moveRange(sourcesHeading, find("#add-selected").previousElementSibling, sources);
  sourcesHeading.remove(); sources.hidden = !pool.sources.length;
  const sourceHelp = document.createElement("p"); sourceHelp.textContent = "Archiving a source keeps words that are also needed by another source.";
  sources.querySelector("summary").after(sourceHelp);

  const csvSection = document.createElement("section"); csvSection.id = "pool-add-csv";
  const csvHeading = [...detail.querySelectorAll("h2")].find((h) => h.textContent === "Add from list");
  csvHeading.before(csvSection); moveRange(csvHeading, find("#csv-preview"), csvSection);
  const advanced = disclosure("List options", "csvOptions");
  const sourceLabel = find("#source-label").closest("label");
  csvSection.append(advanced);
  advanced.append(sourceLabel, find("#list-format").closest("label"), find("#csv-header").closest("label"), find("#csv-column").closest("label"), find("#csv-namespace").closest("label"));
  find("#pool-csv").rows = 3;

  const passageSection = find("#passage-text").closest("section"); passageSection.id = "pool-add-passage";
  const selectedSection = document.createElement("section"); selectedSection.id = "pool-add-selected";
  const selectedHeading = document.createElement("h2"); selectedHeading.textContent = "Add selected words";
  selectedSection.append(selectedHeading, find("#add-selected"));

  const add = document.createElement("section"); add.className = "pool-add-methods";
  const choices = document.createElement("fieldset"); const legend = document.createElement("legend"); legend.textContent = "Choose how to add words"; choices.append(legend); add.append(choices);
  for (const [key, label, section] of [["csv", "Add from list", csvSection], ["passage", "Add from Bible reference", passageSection], ["selected", `Add selected words (${selectedCount})`, selectedSection]]) {
    const option = document.createElement("label"); const input = document.createElement("input");
    input.type = "checkbox"; input.id = `pool-method-${key}`; input.checked = Boolean(state[key]);
    input.setAttribute("aria-controls", section.id); section.hidden = !input.checked;
    input.onchange = () => { state[key] = input.checked; section.hidden = !input.checked; };
    const copy = document.createElement("span"); const title = document.createElement("strong"); title.textContent = label;
    const hint = document.createElement("small");
    hint.textContent = { csv: "Choose your own vocabulary, such as an exam list or textbook chapter.", passage: "Use Bible passages for sermon prep, group sight-reading, or a course on a biblical book.", selected: "Use words you have selected on the Progress page." }[key];
    copy.append(title, hint); option.append(input, copy); choices.append(option); add.append(section);
    option.hidden = key === "selected" && selectedCount === 0;
  }

  const wordsHeading = [...detail.querySelectorAll("h2")].find((h) => h.textContent === "Pool words");
  const words = disclosure(`Manage words (${new Set(pool.sources.flatMap((s) => s.termIds)).size})`, "words");
  const table = detail.querySelector(".table-wrap");
  wordsHeading.before(words); moveRange(wordsHeading, table, words); wordsHeading.remove();
  words.hidden = !pool.sources.some((s) => s.termIds.length);
  const bulk = find("#release-words").closest(".actions"); bulk.hidden = true;
  const sourceChoice = document.createElement("label"); sourceChoice.className = "field"; sourceChoice.textContent = "Change membership in a source (optional)";
  const sourceSelect = find("#pool-report-scope").cloneNode(true); sourceSelect.id = "word-source"; sourceSelect.options[0].textContent = "Entire pool";
  sourceChoice.append(sourceSelect); bulk.prepend(sourceChoice);
  const updateSelection = () => {
    bulk.hidden = !detail.querySelector(".pool-word:checked");
    find("#exclude-source-words").hidden = !sourceSelect.value;
    find("#include-source-words").hidden = !sourceSelect.value;
  };
  sourceSelect.onchange = updateSelection;
  for (const input of detail.querySelectorAll(".pool-word")) input.addEventListener("change", updateSelection);
  updateSelection();

  const examSection = find("#prepare-exam").closest("section");
  const exam = disclosure("Create a vocabulary exam", "exam"); exam.append(examSection); exam.hidden = !pool.sources.some((s) => s.termIds.length);
  // Study stays first; optional tasks follow in the order users usually need them.
  detail.append(add, words, sources, report, exam, settings);
  const studyLink = detail.querySelector('a[href^="#/setup?savedPool="]');
  if (studyLink) studyLink.hidden = !pool.sources.length || Boolean(pool.archived);
}
