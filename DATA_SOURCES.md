# Logamar Data Sources

Logamar's canonical lexical JSON must be generated deterministically from vetted source files. Do not use AI-generated lexical entries.

The first import target is Greek data from OpenScriptures' Greek Word List. Hebrew Strong's and morphhb frequency data are supported as follow-on inputs.

### OpenScriptures Greek Word List

- Local source path: `openscriptures/GreekResources/GreekWordList.js`
- Local documentation: `openscriptures/GreekResources/GreekWordList.md`
- Purpose: Greek lemma entries with associated Strong number, Packard POS code, definition, and source/derivation fields.
- Logamar use: preferred Greek MVP source because the lemma, Strong number, POS, and definition associations already come from OpenScriptures.
- Converter:
  - Command: `python tools/convert_openscriptures.py greek-word-list --input openscriptures/GreekResources/GreekWordList.js --out-dir docs/data/generated`
  - Output: `docs/data/generated/greek.json`

### MorphGNT SBLGNT

- Repository: https://github.com/morphgnt/sblgnt
- Purpose: New Testament Greek lemma frequency counts and example references.
- License note: SBLGNT text is under the SBLGNT EULA; MorphGNT morphology and lemmatization are CC BY-SA 3.0. Review distribution obligations before bundling generated frequency data.
- Source shape: text files with seven columns: book/chapter/verse, POS, parsing, text, word, normalized word, lemma.
- Logamar use: optional frequency source. MorphGNT lemmas are mapped through `openscriptures/GreekResources/gntLookups.js` to Greek Word List keys, then to Strong's-linked terms.
- Converter command:
  - `python tools/convert_openscriptures.py greek-word-list --input openscriptures/GreekResources/GreekWordList.js --gnt-lookups openscriptures/GreekResources/gntLookups.js --morphgnt-dir vendor/morphgnt-sblgnt --out-dir docs/data/generated`

### OpenScriptures GreekResources LXX Lemmas

- Local source path: `openscriptures/GreekResources/LxxLemmas/`
- Purpose: Septuagint lemma data.
- Logamar use: optional later frequency source for LXX Greek study. Counts are stored separately as `frequencies.lxx` so they do not overwrite GNT study frequency.

## Selected Sources

### OpenScriptures Strong's Dictionaries

- Repository: https://github.com/openscriptures/strongs
- Purpose: Greek and Hebrew Strong's-linked dictionary entries.
- Source files expected by Logamar tooling:
  - `greek/strongs-greek-dictionary.js`
  - `hebrew/strongs-hebrew-dictionary.js`
- Notes:
  - The repository presents dictionary data as JavaScript object files.
  - Converter output should preserve source lemma, transliteration, KJV definition, Strong's definition, and derivation fields where present.
  - License/provenance must be reviewed before bundling full generated data in a release.

### OpenScriptures Hebrew Bible / morphhb

- Repository: https://github.com/openscriptures/morphhb
- Purpose: Hebrew lemma frequency counts and example references.
- License: CC BY 4.0 for lemma and morphology data. WLC text remains public domain.
- Required attribution from `LICENSE.md`: `Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb`.
- Source shape:
  - OSHB XML lives under `wlc/`.
  - The upstream repository includes `morphhbXML-to-JSON.py`, which can produce JSON shaped as book -> chapter -> verse -> word arrays.
  - Logamar's converter can read that generated JSON to count Hebrew lemma frequencies.

## Data Quality Rules

- Generated data must be reproducible from source files and script options.
- Generated JSON must be sorted deterministically.
- Converter scripts must fail loudly on malformed input.
- Converter scripts must write a manifest with source filenames, byte counts, SHA-256 hashes, generator name, and record counts.
- Source glosses and definitions should be copied or mechanically normalized only; no invented definitions.
- Frequency should be stored as occurrence count. For Greek, `frequency` means GNT count, while optional LXX count lives in `frequencies.lxx`. If we need rank later, add a separate `frequencyRank` field.
- Keep source data outside the app unless its license has been accepted for distribution.

## Suggested Local Layout

```text
vendor/
  morphgnt-sblgnt/
    *.txt
  openscriptures-strongs/
    greek/strongs-greek-dictionary.js
    hebrew/strongs-hebrew-dictionary.js
  openscriptures-morphhb/
    hebrew.json
```

`vendor/` is intentionally not required by the app. It is only an input location for local conversion.

## Generated App Files

```text
docs/data/greek.json
docs/data/hebrew.json
docs/data/data-manifest.json
```

The app currently loads `docs/data/generated/greek.json` for Greek and `docs/data/hebrew-sample.json` for Hebrew. The Hebrew sample remains a tiny handmade placeholder until full generated Hebrew files are intentionally added.
