# Logamar

Logamar is a static, offline-first web app for studying the biblical languages:
Koine Greek, Biblical Hebrew, and Biblical Aramaic. The name combines `Log-` from
Koine Greek `logos` (word) and `Amar` from Hebrew `amar` (to speak).

Phase 1 lives in [`docs/`](./docs) for GitHub Pages deployment. It implements a complete flashcard vertical slice:

- load generated Greek, Hebrew, and Aramaic seed JSON
- choose language, term count, frequency band, and part of speech
- generate a weighted flashcard session
- choose mixed practice or most common first, introducing frequent vocabulary while retaining review cards
- study Greek dictionary forms by default, or include separate inflected Strong's entries in hard mode
- reveal glosses and show hints
- mark cards as `I know this` or `Revisit`
- persist progress in IndexedDB
- browse terms
- view a progress report
- track learning status, daily practice, streaks, and frequency coverage by language
- study only revisit, due, new, learning, strong, previously studied, or manually selected cards
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

## Install and study offline

Use **Install Logamar** in the navigation, or your browser's install option.
On iPhone/iPad, the button explains Safari's **Share → Add to Home Screen** flow.
Installation support varies by browser. GitHub Pages supplies HTTPS; localhost
also supports the service worker for development.

After the first successful download, the app caches its interface and all three
vocabulary datasets for offline study. The desktop navigation shows “Ready for
offline study” when preparation finishes. Your study progress remains in IndexedDB
and can be backed up with Import / Export. Browser storage may be cleared by the
user or browser, so installation does not replace a progress backup.

Updates show an **Update app** button. Finish the current cards before choosing it;
the app reloads only when you request the update. Cache cleanup is scoped to this
Logamar installation and does not remove saved study progress.

Before deploying any changed app assets, regenerate the content-based offline list:

```powershell
python tools/build_pwa.py
python tools/build_pwa.py --check
```

The manifest and service worker use relative URLs to support GitHub Pages project
paths. CI checks that the offline asset list matches the shipped files. See
[tool documentation](tools/README.md) for optional browser installation tests and
icon generation.

Pure-function tests are available at:

```text
http://localhost:8080/tests/
```

They also run without a browser using `node docs/tests/run.mjs`.

## Progress and targeted practice

Greek defaults to dictionary-form study: 43 reviewed inflection/paradigm entries
are grouped under their headword for selection, frequency ordering, and reporting.
For example, “you are” and “he is” are studied under εἰμί (“to be”). Dictionary
headwords use conventional lexical forms, not invented bare stems. The explicit
mapping is in `src/greek-study-forms.json`; etymologically related words are not
automatically merged. Choose **Greek word forms → Include inflected entries (hard)**
to study the original separate entries and their meanings. Hard cards reveal the
dictionary form after the answer. This is vocabulary practice, not a full parsing quiz.

Aramaic is a separate study/report language with 655 entries explicitly marked
Aramaic by TBESH. The remaining Hebrew file contains 8,641 entries. Shared/proper
names without explicit Aramaic classification remain in the Hebrew collection.
Old Strong's IDs and review records are retained. Dictionary-form progress combines
Greek form reviews in memory, so historical inflection reviews still contribute
without copying or resetting saved records.

The Progress view shows studied/strong/revisit/due totals, lifetime review counts,
a review-weighted Know rate, hints, and a streak based on local calendar days.
A vocabulary breakdown and 14-day activity chart work offline without chart libraries.
Language filters scope the report and its session shortcuts. Frequency coverage
measures the share of source occurrences represented by studied entries; it is not
a reading-comprehension score, and Greek/Hebrew source totals are not directly comparable.

Revisit includes a latest Revisit rating, weak performance, or a manual flag.
The latest choice is saved on progress records; older records recover it from
answer history when available. Strong uses the existing scheduler rule: at least
four Know ratings with no Revisit ratings. Due is a separate, overlapping pool
based on the scheduled time. Self-assessed Know rate is not test accuracy.

Choose a progress pool in study setup, or use a report shortcut. An explicit pool
never fills missing slots with unrelated cards. Most common first orders eligible
cards within that pool. Top-N frequency limits are applied after the progress filter.
The report's searchable list shows 50 words per page; selections persist across
pages and filters while the app is open, and Study selected opens a selected-only
session. Temporary selections reset when the page reloads. Saved progress and
answer history remain local and are included in the existing export/import backup.
The activity chart uses actual saved answer history; aggregate-only imports do not
invent historical activity.

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

Greek vocabulary is generated from OpenScriptures' Greek Word List with local TR
frequencies. Hebrew/Aramaic vocabulary and frequencies are adapted from
[STEP Bible](https://www.STEPBible.org), based on work at Tyndale House Cambridge,
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Only TBESH's short
glosses are used; its separately restricted long definitions are excluded.
See [data attribution and changes](docs/data-sources.html) and
[build instructions](tools/README.md).

Rebuild and verify the app's data with:

```powershell
python tools/build_greek.py
python tools/build_hebrew.py
python tools/build_greek.py --check
python tools/build_hebrew.py --check
```

## Project structure

```text
docs/
  index.html
  css/styles.css
  data/
    generated/
      greek.json
      hebrew.json
      aramaic.json
      hebrew-manifest.json
      data-manifest.json
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
