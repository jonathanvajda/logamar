# Logamar Data Tools

These tools convert manually downloaded OpenScriptures source files into Logamar's canonical JSON format. They do not fetch from the network and they do not generate lexical content.

## Canonical Greek rebuild and verification

The authoritative app dataset, `docs/data/generated/greek.json`, is built from
`openscriptures/GreekResources/GreekWordList.js` and `src/trparsed.json`:

```powershell
python tools/build_greek.py
python tools/build_greek.py --check
```

The build starts from the original lexical source, consolidates duplicate Strong's
IDs while preserving alternate entries, counts TR annotations, and merges those
counts. It never uses an already-generated Greek JSON file as its input. No KJV
files or network access are needed for this canonical build.

Outputs are `greek.json`, `greek-frequency-report.json`, and `data-manifest.json`.
The manifest records source and generator-script SHA-256 hashes, output hashes,
counts, counting policy, and TR source diagnostics. Paths are relative to the repo;
JSON uses UTF-8 and LF with sorted keys and no timestamps. `.gitattributes` preserves
LF for these inputs, scripts, and outputs across checkouts.

`--check` rebuilds using temporary lexical output and compares all three published
files byte-for-byte without modifying them. It exits nonzero on drift, including
source/script hash changes. The `Verify Greek data` GitHub Actions workflow runs
the Python tests and this check on pushes and pull requests. Commit the source
inputs, scripts, generated files, and manifest together for reproducible revisions.
When intentionally changing a source or generator, rebuild and review the diff.

The canonical output has 5,538 unique IDs (the former 5,542 rows included four
duplicates), 5,466 IDs with TR counts, and 140,361 total occurrences. No Strong's
IDs were removed. The app seed version was bumped to refresh existing installations.

## Canonical Hebrew rebuild and attribution

```powershell
python tools/build_hebrew.py
python tools/build_hebrew.py --check
python -m unittest discover -s tools -p 'test_*.py'
```

The local-only build reads `src/stepbible/tbesh.tsv` and the four `tahot-*.tsv`
projections, verifying their hashes against `sources.lock.json`. It writes
`hebrew.json`, `hebrew-frequency-report.json`, and `hebrew-manifest.json` under
`docs/data/generated/`. `--check` compares all three files byte-for-byte without
writing. CI verifies both Greek and Hebrew.

The result contains 9,296 lexical entries, including 655 explicitly Aramaic entries,
with 298,656 occurrences across 9,109 entries. All 39 OT books are represented.
There are 187 zero-count entries, retained because they belong to the lexicon.
These are TAHOT lexical-root annotation counts, not KJV tags or whole-word counts
including affixes. Extended eStrong suffixes remain distinct. Original unsuffixed
sample IDs remain available; the app now loads the full generated file.

TAHOT's main reading, including Qere and restored readings, is used. Reconstructed
LXX additions (152 rows), nonlexical roots (6,079), alternate-detail fields, and
interlinear displays are excluded. Matching multiword continuations (783) count
once. Fourteen empty Qere records are reported. Two unmatched continuation markers
are reported rather than interpreted as source corrections. Different lexical
roots on a single word are retained; multiple disambiguated roots mapping to the
same eStrong on that word count once.

Twenty-one missing dStrong mappings resolve via either an unambiguous numeric-base
entry or a documented override. The two ambiguous overrides are in
`src/stepbible/mapping-overrides.json`, with source-reference justifications.
Mapping resolutions and their occurrence counts are in the audit report. Unknown
or ambiguous tags without a resolution fail the build; no orphan entries or
invented glosses are generated.

The attribution is **STEP Bible (https://www.STEPBible.org), based on work at
Tyndale House Cambridge**, under **CC BY 4.0**. The app footer links to credits;
`docs/data-sources.html`, per-entry provenance, `src/stepbible/NOTICE.md`, and the
manifest record license, source revision, transformations, and upstream links.
The data license remains distinct from the software license.

Only TBESH's first seven columns are retained. **Its long Meaning definitions
are excluded entirely** because the upstream header identifies separate Online
Bible permission requirements. Short glosses are credited to Tyndale scholars.
The source projections do not redistribute the complete original datasets.

To recreate the source projections from the pinned upstream revision:

```powershell
python tools/prepare_stepbible.py
```

This optional network step verifies original source SHA-256 hashes, discards unused
columns in memory, verifies projection hashes, and writes only the safe projections.
Normal builds require no network or full upstream files. Source updates require
intentional review of the pinned revision, hashes, mappings, and generated diffs.

## Local TR / KJV Strong's frequency pipeline

Run from the repository root with Python 3.10+; no third-party packages are required:

```powershell
python tools/count_strongs.py --recover-kjv-english
python tools/merge_strongs_frequencies.py
python -m unittest discover -s tools -p 'test_*.py'
```

These commands create:

- `docs/data/generated/strongs-frequencies.json`: separate `tr_nt`, `kjv_nt`, and `kjv_ot` corpora with per-ID counts, three example references, source SHA-256 hashes, counting policies, and source-quality diagnostics.
- `docs/data/generated/greek-with-frequencies.json`: the existing Greek term array enriched with TR counts in `frequency`, `frequencies.tr_nt`, and `frequencies.gnt`, example references, and frequency provenance.
- `docs/data/generated/greek-with-frequencies.report.json`: matched and unmatched IDs, zero-count term IDs, duplicate term IDs, and input hashes.

These standalone counting/merge commands do not change `greek.json`, the source
files, app seed configuration, or canonical manifest. Use `build_greek.py` above
to regenerate the authoritative app file. `greek-with-frequencies.json` is an
optional merge preview, not the canonical build output.

### Counting rules and source limitations

`trparsed.json` is the preferred Greek source here because it annotates Greek directly. Its metadata identifies Stephens 1550 with Scrivener variants and states public-domain status. Counts describe this particular local export, not every NT edition or a consolidated dictionary lemma.

- Count the first lexical Strong's annotation per Greek word or annotated phrase. Repeated words count repeatedly; repeated grammatical analyses of one word count once. There are 126 words with multiple annotations, including 53 with different lexical IDs; all are listed in `wordsWithMultipleAnnotations` so the first-assignment policy is auditable.
- Exclude G5625+ parsing codes, the single `VAR2: ... }` alternate segment, and 14 bracketed end-of-book subscriptions. The excluded parsing-code total applies to the retained text.
- Reject unknown markup, missing annotations, duplicate verse references, and incomplete NT book coverage. Report empty verses; the supplied TR export has an empty Luke 17:36. Do not fill it from another edition.
- Strong's IDs for inflected forms remain separate where the source assigns separate IDs. Suffix IDs such as `G32a` are matched exactly, not collapsed into `G32`.

KJV counts are **explicit English-field tag totals**, not guaranteed original-language word frequencies. For example, Genesis 1:3 repeats “light” but tags only the first occurrence. Count every explicit tag, including tags in Psalm headings or subscriptions; do not infer missing tags or count other language fields. The supplied files yield 307 G3056 tags versus 330 G3056 assignments in the TR export.

The supplied KJV directory requires the explicit `--recover-kjv-english` option:

- Seven files contain invalid JSON: `1Co`, `1Ki`, `2Ch`, `Act`, `Isa`, `Mar`, and `Phm`. Recovery reads complete JSON English string values only and requires every verse declaration to be accounted for. It does not edit the originals.
- Numbered-book files repeat earlier verse records in later chapter containers. Recovery groups by the verse's own reference and counts identical English copies once. Conflicting copies cause an error.
- `Phm.json` also contains an appended Philippians book. Recovery excludes that foreign book and records it; Philippians is counted from `Phl.json`.
- Every requested book must exist, chapter coverage must match `chapter_count.json`, and verse numbers within a chapter must be contiguous. These checks cannot prove that the source has no omitted final verses or missing tags. Recovery details and verses without tags are included in the output.

Without that option the counter fails on malformed/duplicated sources. The KJV README says the material was scraped and supplies no clear reuse license; these scripts make no additional licensing claim for that dataset.

For the supplied sources, the generated totals are:

| Corpus | Verse records | Distinct Strong's IDs | Counted occurrences |
| --- | ---: | ---: | ---: |
| TR NT | 7,958 | 5,466 | 140,361 |
| KJV NT | 7,957 | 5,324 | 115,746 |
| KJV OT | 23,145 | 8,330 | 210,935 |

All 5,466 TR IDs match the existing Greek dataset. Its four duplicate IDs are preserved, with the same count assigned to each row; counts are never summed across duplicate rows. The report calculates matched totals by unique ID.

### Other merges

The merge script accepts a Logamar term array, frequency dataset, named corpus, output, and optional report path:

```powershell
python tools/merge_strongs_frequencies.py --terms docs/data/generated/greek.json --corpus kjv_nt --output docs/data/generated/greek-kjv-tags.json
python tools/merge_strongs_frequencies.py --terms docs/data/hebrew-sample.json --corpus kjv_ot --output docs/data/generated/hebrew-sample-with-frequencies.json
```

`kjv_ot` requires Hebrew terms and `tr_nt` / `kjv_nt` require Greek terms. Missing IDs get zero and are reported; unmatched frequency IDs are retained in the report. Other term fields and frequency corpora are preserved. Inputs, merged output, and report must have distinct paths. The Hebrew example enriches only the sample; it does not generate a full Hebrew dictionary.

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
