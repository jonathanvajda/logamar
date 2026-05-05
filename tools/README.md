# Logamar Data Tools

These tools convert manually downloaded OpenScriptures source files into Logamar's canonical JSON format. They do not fetch from the network and they do not generate lexical content.

## Recommended Greek Source: Greek Word List

For Greek MVP data, prefer OpenScriptures' `GreekResources/GreekWordList.js`. It already associates the relevant lemma, Strong number, part of speech, and definition fields. Logamar's converter only normalizes those existing associations into the app schema.

```powershell
python tools/convert_openscriptures.py greek-word-list `
  --input openscriptures/GreekResources/GreekWordList.js `
  --out-dir docs/data/generated
```

This writes:

```text
docs/data/generated/greek.json
docs/data/generated/data-manifest.json
```

## Greek Word List With GNT Frequency

Download or clone MorphGNT SBLGNT separately, then include its text files and the OpenScriptures GNT lookup map:

```powershell
python tools/convert_openscriptures.py greek-word-list `
  --input openscriptures/GreekResources/GreekWordList.js `
  --gnt-lookups openscriptures/GreekResources/gntLookups.js `
  --morphgnt-dir vendor/morphgnt-sblgnt `
  --out-dir docs/data/generated
```

The converter counts MorphGNT lemmas, maps them through `gntLookups.js` to Greek Word List keys, and then maps those keys to Strong's-linked Logamar terms. GNT count becomes `frequency` and is also stored as `frequencies.gnt`.

## Optional LXX Frequency

LXX frequency can be added later without changing the output schema:

```powershell
python tools/convert_openscriptures.py greek-word-list `
  --input openscriptures/GreekResources/GreekWordList.js `
  --gnt-lookups openscriptures/GreekResources/gntLookups.js `
  --morphgnt-dir vendor/morphgnt-sblgnt `
  --lxx-lemmas-dir openscriptures/GreekResources/LxxLemmas `
  --out-dir docs/data/generated
```

LXX count is stored as `frequencies.lxx`. For New Testament study selection, Logamar still uses `frequency`, which is the GNT count when present.

## Alternate Greek Source: Strong's Dictionary

Download or clone `openscriptures/strongs`, then run:

```powershell
python tools/convert_openscriptures.py strongs `
  --language greek `
  --greek vendor/openscriptures-strongs/greek/strongs-greek-dictionary.js `
  --out-dir docs/data/generated
```

## Hebrew Strong's Dictionary

Hebrew is optional. To generate Hebrew dictionary data without morphhb frequencies:

```powershell
python tools/convert_openscriptures.py strongs `
  --language hebrew `
  --hebrew vendor/openscriptures-strongs/hebrew/strongs-hebrew-dictionary.js `
  --out-dir docs/data/generated
```

## Hebrew Frequency From morphhb JSON

First use the upstream `openscriptures/morphhb` tooling to generate JSON, or provide an equivalent JSON file with this shape:

```text
book -> chapters[] -> verses[] -> words[]
word = [wordString, lemma, morphology]
```

Then run:

```powershell
python tools/convert_openscriptures.py strongs `
  --language hebrew `
  --hebrew vendor/openscriptures-strongs/hebrew/strongs-hebrew-dictionary.js `
  --morphhb-json vendor/openscriptures-morphhb/hebrew.json `
  --out-dir docs/data/generated
```

The converter writes stable JSON and a `data-manifest.json` with source hashes and record counts.
