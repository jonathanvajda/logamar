# STEPBible source projections used by Logamar

Data adapted from [STEP Bible](https://www.STEPBible.org), based on work at
Tyndale House Cambridge, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: [STEPBible-Data](https://github.com/STEPBible/STEPBible-Data), revision
`ed476a8ee6e3f7b3a46fc48af6c7dabc02387b1d`.

These are limited field projections for Logamar, not mirrors of the upstream
datasets. Consult upstream for original data, documentation, and current versions.
The source license applies to the adapted data independently of the app's license.

## Modifications

- `tbesh.tsv`: only eStrong, dStrong, uStrong, Hebrew, Transliteration, Morph,
  and Gloss columns. **Meaning is entirely excluded**, including Online Bible's
  abridged BDB definitions, for which the TBESH header requests separate permission.
  The header identifies the short glosses as Tyndale scholars' work.
- `tahot-*.tsv`: only the primary word-row Reference, dStrongs, and Grammar columns.
  Hebrew text, translations, comments, repeated interlinear displays, expanded-tag
  descriptions, and alternate-detail fields are omitted. Qere and main-reading
  source markers remain intact. Original source bytes are not redistributed here.
- The downstream build groups senses by extended Strong's ID, preserves alternate
  forms and glosses, and mechanically normalizes whitespace/HTML entities.
- `studyGlosses` uses the first entry's head before a colon for concise cards.
  The original short glosses remain intact in `glosses` and available in an
  expandable source-senses disclosure. The first entry is not a sense-frequency ranking.
- Root counts exclude H9000+ bound affixes/punctuation and reconstructed LXX
  additions. Qere/main readings are used; matching multiword continuations count once.
- Missing dStrong tags can fall back to a numeric base only when there is exactly
  one dictionary target. Two otherwise ambiguous mappings are documented in
  `mapping-overrides.json`. No definitions are invented or source tags rewritten.

TAHOT documentation credits Westminster Leningrad via OpenScriptures and ETCBC
morphology among its underlying resources. The projections and generated vocabulary
are attributed to STEP Bible as requested by the repository.

`sources.lock.json` records exact upstream paths, revision, original SHA-256 hashes,
and projection hashes. `python tools/prepare_stepbible.py` recreates the projections
by downloading the pinned originals, verifying their hashes, and discarding unused
fields in memory. The normal Hebrew build is local-only.

User-facing attribution and transformation details are in `docs/data-sources.html`.

Entries explicitly marked Aramaic (`A:` morphology) are now written to a separate
`aramaic.json` collection, retaining the same Strong's IDs. Shared/proper names
without that explicit classification remain in the Hebrew collection. This is a
collection change, not a change to the source definitions or underlying counts.
