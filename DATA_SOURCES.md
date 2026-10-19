# Logamar Data Sources

Logamar's canonical lexical JSON must be generated deterministically from vetted source files. Do not use AI-generated lexical entries.

## Reproducing the current Greek app data

Run `python tools/build_greek.py` from any working directory, then
`python tools/build_greek.py --check` to verify the result without changing files
(use the script's absolute path when outside the repository).
The build uses the local Greek Word List and `src/trparsed.json`, not an existing
generated vocabulary file. `docs/data/generated/data-manifest.json` records source,
script, and output SHA-256 hashes plus counting diagnostics; GitHub Actions runs
the reproducibility check. See `tools/README.md` for the complete workflow.

The local `src/greek-study-forms.json` is also a build input. It contains reviewed
inflection/paradigm mappings for default dictionary study; it does not collapse
arbitrary derivations. Original per-ID frequencies remain intact, with combined
`lemmaFrequency` used for dictionary ordering. Hard mode keeps the original separate
entries. Conventional Greek dictionary forms can still be first-person singular;
no artificial uninflected Greek stems are generated.

### Local Textus Receptus Parsed NT export

- Source: `src/trparsed.json`; source metadata identifies Stephens 1550 with
  Scrivener 1894 variants and states that the text is public domain.
- Current Greek frequency source: first lexical annotation per word/phrase,
  excluding parsing IDs above G5624, alternate `VAR2` segments, and subscriptions.
- Counts describe this specific export. Multiple lexical analyses use the first
  assignment and are listed in the manifest. The empty Luke 17:36 is reported.
- `frequency`, `frequencies.tr_nt`, and `frequencies.gnt` contain these TR counts.
  The canonical build does not use MorphGNT or KJV tag counts.

The app uses Greek data from OpenScriptures' Greek Word List with TR frequencies,
and Hebrew/Aramaic short glosses and counts from STEPBible TBESH/TAHOT.
OpenScriptures Strong's and morphhb are alternate conversion inputs.

## Current Hebrew/Aramaic dataset: STEPBible TBESH and TAHOT

- Creator credit: [STEP Bible](https://www.STEPBible.org), based on work at Tyndale House Cambridge.
- Repository: https://github.com/STEPBible/STEPBible-Data
- Pinned revision: `ed476a8ee6e3f7b3a46fc48af6c7dabc02387b1d`.
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
  This applies to the adapted data independently of the software license.
- TBESH provides forms, transliterations, grammar, and short glosses. Its long
  Meaning definitions, credited to Online Bible and subject to separate permission,
  are entirely excluded from both source projections and app data.
- Four TAHOT sections provide root annotations from all 39 OT books. Main/Qere
  readings are counted; X additions, nonlexical affixes, alternate-detail columns,
  and repeated interlinear displays are excluded. Matching multiword continuations
  count once. Counts are stored in `frequency` and `frequencies.tahot`.
- Disambiguated tags map to extended Strong's lexical IDs with suffixes preserved.
  Missing mappings must resolve unambiguously or have a documented override;
  otherwise the build fails. All mapping fallbacks and source anomalies are audited.
- Source projections, source hashes, and modification notices: `src/stepbible/`.
  Full original datasets are not mirrored; use upstream for original data.
- Rebuild: `python tools/build_hebrew.py`; verify: `python tools/build_hebrew.py --check`.
- App attribution: `docs/data-sources.html` and the visible footer. Exact changes,
  script/source/output hashes, and mapping audit are in `hebrew-manifest.json` and
  `hebrew-frequency-report.json` in `docs/data/generated/`.

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
docs/data/generated/greek.json
docs/data/generated/hebrew.json
docs/data/generated/aramaic.json
docs/data/generated/data-manifest.json
docs/data/generated/hebrew-manifest.json
```

The app loads all three generated vocabulary files. `hebrew-sample.json` is retained
only as a historical fixture; it is not loaded by the app.

TBESH's explicit `A:` language classification determines the 655 entries placed in
`aramaic.json`. Hebrew retains 8,641 entries, including shared/proper names without
explicit Aramaic identification. Strong's IDs, frequency attribution, short-gloss
restrictions, and stored user progress are unchanged by this collection split.
