# Logamar

Logamar is a static, offline-first web app for studying New Testament Greek and Old Testament Hebrew vocabulary. The name combines `Log-` from Koine Greek `logos` (word) and `Amar` from Hebrew `amar` (to speak).

Phase 1 lives in [`docs/`](./docs) for GitHub Pages deployment. It implements a complete flashcard vertical slice:

- load generated Greek and sample Hebrew seed JSON
- choose language, term count, frequency band, and part of speech
- generate a weighted flashcard session
- reveal glosses and show hints
- mark cards as `I know this` or `Revisit`
- persist progress in IndexedDB
- browse terms
- view a progress report
- export/import progress JSON

Test sessions, printable tests, answer keys, and full teacher templates are planned for Phase 2.

## Run locally

Because the app uses ES modules and `fetch()` for JSON files, run it through a local static server rather than opening `index.html` directly.

```powershell
cd docs
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

Pure-function tests are available at:

```text
http://localhost:8080/tests/
```

## Deploy to GitHub Pages

In the repository settings, configure GitHub Pages to deploy from the `docs/` folder on the main branch.

## Data sources to evaluate

For the GPL version of Logamar, prefer public-domain, CC0, or clearly GPL-compatible open datasets. Good candidates:

1. **MorphGNT Strong's Greek Dictionary XML**
   - Source: https://github.com/morphgnt/strongs-dictionary-xml
   - License: CC0/public domain waiver.
   - Fit: excellent Greek Strong's-linked lexical base. It is XML, so Logamar would need a conversion step into the app's canonical JSON shape.

2. **OpenScriptures Strong's Dictionaries**
   - Source: https://github.com/openscriptures/strongs
   - Fit: Greek and Hebrew Strong's dictionary data, including JSON-style resources in the repo history/structure.
   - License note: verify the exact file-level license before bundling. Strong's original dictionaries are public domain, but the repository presentation is less explicit than the MorphGNT CC0 Greek repo.

3. **mormon-documentation-project/strongs**
   - Source: https://github.com/mormon-documentation-project/strongs
   - License: Unlicense according to the repository page.
   - Fit: convenient JSON/CSV/SQLite formats derived from OpenScriptures Strong's resources. Useful for MVP import experiments, but still review provenance before shipping.

4. **Open Scriptures Hebrew Bible / OSHB**
   - Source: https://github.com/openscriptures/morphhb
   - License: lemma and morphology data are CC BY 4.0; WLC text is public domain.
   - Fit: strong Hebrew frequency/morphology source, but CC BY attribution requirements should be tracked carefully in app credits and generated data docs.

5. **unfoldingWord original-language resources**
   - Source: https://unfoldingword.org/for-translators/content/
   - License: CC BY-SA 4.0.
   - Fit: high quality Greek/Hebrew lexicon and tagged text resources. ShareAlike obligations may be acceptable for GPL-adjacent open distribution, but verify compatibility for the exact packaging plan before bundling.

The Greek app data is generated from OpenScriptures' Greek Word List. The Hebrew file remains a tiny handmade sample until the Hebrew pipeline is promoted.

## Project structure

```text
docs/
  index.html
  css/styles.css
  data/
    generated/
      greek.json
      data-manifest.json
    hebrew-sample.json
  js/
    app.js
    db.js
    models.js
    seed-data.js
    session-generator.js
    scoring.js
    scheduler.js
    answer-checking.js
    distractors.js
    render-dashboard.js
    render-setup.js
    render-session.js
    render-report.js
    teacher-console.js
    import-export.js
  tests/
    index.html
    pure-functions.test.js
```
