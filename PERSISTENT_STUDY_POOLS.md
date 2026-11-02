# Persistent study pools

Status: initial implementation available. This document retains the target design;
see the implementation notes below for current behavior and remaining extensions.

## Initial implementation notes

Implemented: named persistent pools; source groups and overlap-safe archival;
manual bulk release/restore and source exclusions; undo; normalized CSV generation
and staged import; dictionary-form passage imports with pasted references and
dependent dropdowns; pool/source progress reports; typed-gloss exam definitions,
resumable attempts and finalized exports; version-2 backups and migration; full
offline passage data.

This first implementation rotates by oldest pool review rather than explicit
coverage-pass records or weakness-weighted modes. Assignment revisions are kept
as separate groups rather than replaced through a difference editor. Unresolved
CSV items require correction (partial imports are not enabled). Reports support
pool/source scope but not date filtering. Teacher score adjustments, verified
submissions, passage surface forms, and additional exam question types remain
extensions. Backups reject conflicting pool/exam IDs atomically rather than
offering an in-app conflict editor. Report JSON preserves source snapshots and
fingerprints; normalized CSV is a flat vocabulary list, not a full pool backup.

## Purpose

Let a learner return to a deliberately chosen vocabulary set for an exam, sermon,
or other sustained project. Successful reviews affect practice priority but never
remove a word. Membership changes only through an explicit user action.

Support named pools such as “Greek midterm” and “Sermon preparation.” A pool can
contain multiple overlapping source groups: passages, CSV imports, and manually
added words. These are groups rather than strict partitions because a word can
belong to several sources at once.

## Relationship to the existing app

The current app has three distinct concepts:

| Current concept | Behavior | Proposed relationship |
| --- | --- | --- |
| Vocabulary catalog | Generated Greek, Hebrew, and Aramaic terms | Remains the shared catalog |
| Progress pools | Dynamic filters: all, revisit, due, unseen, learning, strong, studied | Remain available across the catalog or within a saved pool |
| Selected words | In-memory report selection, lost on reload | Can be saved into a named pool |

Relevant implementation: `docs/js/session-generator.js`, `progress.js`,
`study-context.js`, `render-setup.js`, `app.js`, and `db.js`.

The generator currently applies dictionary-form mapping, the progress filter,
language/POS/frequency filters, then session selection. “All” uses weighted category
quotas; other progress pools use shuffled or frequency-ordered selection. No
explicit progress pool fills a short session with unrelated terms. The setup UI
currently caps sessions at 50 terms.

Add **Vocabulary source: Entire catalog / Saved pool** separately from **Progress
filter**. For a saved pool, default the progress filter to All and the frequency
band to All terms. Show both the full pool size and the eligible session size.
Changing filters never changes saved membership. Preserve existing catalog
practice behavior.

“Release from this pool” means remove its active membership, retaining catalog
availability and all progress. Words already exist in the larger catalog; they
do not need to be transferred into it. Release must not set `retired`, reset
progress, or assert that the user has reached the app's Strong status.

## Membership and source groups

- Pools have names, optional target dates, and active/archived status. A target
  date is informational; it does not expire words automatically.
- Every import creates a named source group, initially labeled with its normalized
  passage or “CSV imported on {local date}.” Allow renaming.
- Manual additions belong to a Manual additions group.
- Active membership is the union of included terms in active source groups,
  minus words explicitly released from the pool.
- Within a pool, a term appears once in a session even when several groups contain
  it. Its word row lists every contributing group.
- Bulk **Remove from this source** excludes selected words from that group only.
  Bulk **Release from pool** excludes them across all its groups. Make these
  separate, clearly labeled actions.
- **Archive source** stops all of that source's contributions and preserves it for
  later restoration. Words also present in other active sources remain active.
- **Archive pool** removes it from the active-pool list and preserves its contents.
  Archiving a pool or group never alters review history.
- A later import containing released words shows “Previously released” and leaves
  them excluded unless the user explicitly chooses to restore them. Restoring an
  archived source likewise preserves explicit releases.

For an archive/removal operation, preview which words leave active membership and
which remain through another source. Offer undo after a successful operation.

### Sermon example

1. Add passages A and B to “Sermon preparation,” previewing and confirming each.
2. Practice their deduplicated union all week.
3. Archive source A when that sermon is finished.
4. Preview: “18 words leave active study; 12 stay because they also occur in B.”
   These numbers are illustrative.
5. Add passage C and confirm. The active vocabulary becomes B union C.

No manual set subtraction is needed. A word also added manually remains active
after its passage group is archived, unless explicitly released from the pool.

## Practice within a persistent pool

Offer two clear modes:

| Mode | Selection behavior |
| --- | --- |
| Focus practice (default) | Prioritize unseen, revisit, and due words while continuing to sample confident words |
| Review every word | Visit every eligible member once before beginning another pass |

For Focus practice, propose a deterministic coverage safeguard: first select
eligible words not yet reviewed in the current coverage pass, then prioritize
revisit/due words and oldest pool review, using global confidence as a tie-breaker.
Never exclude a word solely because it is Strong or not yet due. This ensures
confident words continue appearing while repeated passes can favor weaker words.
The exact balance is a tuning decision; coverage must take precedence over weights
so a 50+ word pool cannot indefinitely omit known words.

Persist coverage per pool and per member, separately from global progress. A
completed review advances coverage; merely generating a session does not. New
members start unreviewed. Count reviews made while studying that pool; studying
another source still updates global progress but does not silently finish this
pool's coverage pass. Save the pass identifier on session items so delayed answers
cannot advance a later pass accidentally.

Review every word can span several sessions. Support “All eligible words” or a
session size above 50, with progress such as “32 of 67 reviewed this pass.” A new
pass starts explicitly or when the next session is requested after completion.
Display the scope of any language/POS/progress filter; completing a filtered pass
must not mark excluded members reviewed. Coverage should be tracked against a
saved scope signature or separate pass so changing filters cannot lose coverage.

Continue recording ordinary Know/Revisit results and scheduling globally. The
current scheduler sets Know to three days and Revisit to ten minutes; a persistent
pool session can review earlier without rewriting those rules. Default daily
practice includes all members regardless of those dates. Users can deliberately
choose Due only when desired.

Session items are a snapshot. Changing a pool affects future sessions, not cards
already generated. A release action during a session should explicitly skip that
word for the remainder of that session.

## Shared import pipeline

Both CSV and passage imports use:

`Read input -> normalize -> resolve identities -> deduplicate -> stage -> confirm -> commit`

Staging writes no membership or progress. Editing the input or resolution options
invalidates the preview. Commit the source, memberships, and explicit restorations
in one IndexedDB transaction, with an operation ID to prevent double submission.
Recheck current membership at confirmation so another tab cannot make the counts
misleading; refresh the preview if the proposed changes differ.

The preview includes:

- Input row/token count, unique resolved terms, duplicates collapsed, unresolved
  or ambiguous items, new active members, and words already active.
- A selectable table with language, ID, dictionary form, gloss, source rows/verses,
  and disposition: New, Already active, Previously released, or Unresolved.
- Separate counts for new source associations and new active words. Adding an
  already-active word to a new source matters for later source removal.
- Correctable resolution errors. Commit requires resolving errors or explicitly
  excluding them; never silently discard unknown items.
- A confirmation button stating the actual effect, for example “Add 35 words;
  associate 12 existing words with this passage.” No-op imports explain why.

Use canonical term identity, never spelling or gloss, for deduplication. Keep
language distinctions and the existing Hebrew/Aramaic identities. Preserve input
provenance even after duplicate rows resolve to one term.

## CSV import

Allow file upload or pasted CSV. Require an explicit **First row is a header**
checkbox; a detected suggestion must remain editable. Allow choosing the identifier
column and optionally a language column. Parse quoted fields, embedded commas,
newlines, BOMs, and blank rows with a real CSV parser.

Initial identifier modes:

1. **Strong's ID**: normalize case and harmless padding, such as `g03056` to
   `G3056`. Bare numbers require a selected Greek or Hebrew/Aramaic namespace;
   do not infer the language from the number. Resolve Hebrew/Aramaic against the
   actual catalog rather than assuming every H-prefixed entry is Hebrew.
2. **Logamar term ID**: exact canonical lookup, useful for round trips and datasets
   whose IDs carry distinctions beyond base Strong's numbers.

Later: original-language lemma or transliteration lookup. These can yield several
candidates and need a disambiguation interface. An English gloss is search input,
not a reliable automatic identifier. Extended source IDs must use explicit mapping
rules; do not strip suffixes indiscriminately.

Reimporting an identical list should offer the existing group or a separately
named group and explain the difference. It must never duplicate active cards.

## Teacher vocabulary lists and normalized CSV exchange

Support this round trip as a first-class workflow:

`Teacher builds chapter list -> exports normalized CSV -> student previews/imports -> studies saved pool -> exports pool report or exam attempt`

A teacher can build a list from catalog selections, passage groups, an existing
pool, or a rough CSV resolved through staging. Offer **Download normalized CSV**
from both the staging preview and a saved pool/source group. Generating a list
must not require studying its words or creating progress records. A textbook
chapter is a user-supplied label; automatic textbook content extraction is outside
this feature.

### Version-1 exchange format

Use UTF-8 CSV with a required header, standard CSV quoting, one canonical
dictionary term per row, and deterministic ordering by language then canonical
ID. Export the entire chosen pool/group by default, with any filtered/selected
subset explicitly labeled before download. Exclude released and inactive words
unless the user deliberately exports an archived list.

Required columns:

| Column | Meaning |
| --- | --- |
| format_version | `1` on every row |
| list_id | Stable identifier for this distributed list |
| list_revision | Explicit revision of the vocabulary list |
| list_name | For example, “Textbook chapter 7” |
| language | Logamar language identifier |
| term_id | Canonical Logamar dictionary-term ID; authoritative for import |

Optional informational columns: `strongs_id`, `lemma`, `transliteration`,
`display_gloss`, and `source_label`. These aid human review but never override the
canonical ID or install new catalog definitions. Source labels are descriptive;
this flat format imports as one source group. Full source-group structure belongs
in the richer JSON backup format.

Record a dataset version and a deterministic fingerprint of the resolved vocabulary
in the export/report metadata. A vocabulary fingerprint covers sorted language/ID
pairs and dictionary mode, independent of row order or cosmetic labels. List
identity/revision and fingerprint let a teacher distinguish revisions and detect
membership mismatches; they do not authenticate a submission. A future exam
definition needs its own fingerprint covering questions and scoring rules.

Recognize normalized exports automatically, show the header/column interpretation,
and use the same confirmation table as other imports. Validate consistent list
metadata across rows and supported format versions. Unknown IDs or conflicting
language values require correction or explicit exclusion; an exclusion means the
result is a partial assigned list, visibly marked in later reports. Preserve the
original assignment identity and fingerprint alongside the actual imported set.

Import into a new pool or a new group in an existing pool. Reimporting the same
list/revision is idempotent. A changed revision offers a difference preview and
an explicit choice to replace that assignment group's membership or keep both
revisions separately. Replacing a group preserves words contributed by other
groups and preserves explicit pool releases unless the user restores them.

Export labels and other user-controlled spreadsheet text safely so opening CSVs
does not execute spreadsheet formulas. Keep machine identifier fields lossless
and define any text escaping reversibly for normalized reimport.

## Pool progress reports and exam results

Provide **Report for this pool**, optionally scoped to a source group/assignment.
Offer a printable report and CSV download, plus versioned JSON for a complete
machine-readable record. Reports are local artifacts the student downloads and
submits; automatic delivery and teacher accounts are separate features.

### Study progress report

Show pool/list name, assignment identity/revision, assigned and actual vocabulary
fingerprints, dataset version, generation time with timezone, optional student
name/identifier, date range, and exact scope. Include active member count, coverage,
unreviewed members, learning status, and Know/Revisit totals. Label Know rate as
self-assessed practice rather than a test score.

Distinguish global learning status from practice performed in this pool. Report
pool-scoped activity from session items tagged with pool ID, source/assignment
scope, and membership snapshot; do not attribute earlier catalog reviews to the
assignment. Per-word rows show ID, lemma, global status, pool review count, last
pool review, and coverage. No activity must display as zero/unreviewed.

Reports use a membership snapshot taken at generation. An assignment report uses
the assigned revision as its denominator and shows released, missing, or excluded
words explicitly; removing a difficult word cannot silently improve assignment
coverage. An ordinary active-pool report can use current membership, clearly
labeled. Historical reports retain their original denominators.

### Scored exam attempt

An in-app exam is an additional assessment feature. Existing flashcards ask the
learner to rate themselves; those ratings cannot become a scored exam result.
The repository has typed-answer checking helpers, but the current UI implements
flashcards and does not yet deliver a complete exam workflow.

Start with a teacher-defined vocabulary exam using typed gloss answers. The exam
definition fixes the assignment revision, term set (all assigned words by default),
prompt direction, accepted answers, normalization policy, question weights, and
feedback policy. Preview these before distribution. If questions are sampled,
record the actual sample and label the assessed scope. A vocabulary CSV defines
membership only; distribute scoring/settings separately in a versioned exam JSON
definition rather than implying that a display gloss is an authoritative rubric.

At attempt start, freeze the definition, vocabulary, prompts, accepted answers,
and scoring version. Save each response and support resuming an unfinished
attempt. Withhold answer reveal until submission by default. Submission finalizes
the attempt; another try creates a separate attempt ID. Study ratings and later
catalog changes never rewrite a submitted result. Keep exam scoring separate from
the flashcard scheduler initially.

Export an attempt report containing:

- Student-entered identifier, assignment/list revision, exam definition fingerprint,
  attempt ID, app/dataset/scoring versions, and vocabulary fingerprints.
- Started/submitted timestamps, elapsed time, completion status, question count,
  correct/incorrect/unanswered counts, points earned/possible, and percentage.
- Item-level prompt, term identity, submitted response, correctness, and awarded
  points; include the rubric in the teacher-facing detailed export after submission.
- Incomplete attempts explicitly labeled; on submission unanswered items earn zero
  under the initial rubric. Do not present a partial attempt as a completed exam.
- Any teacher adjustments as separate annotations with reason and original score
  preserved; alternative valid glosses may need review beyond exact matching.

The current offline, client-controlled app can support practice tests and
teacher-accepted honor-system submissions. Exported files and student identity
are self-reported and editable; fingerprints establish content matching, not
verified authorship, proctoring, or tamper resistance. Verified submissions would
require a separately designed trusted service. State this briefly in exam/report
help so a teacher can decide whether this submission method suits the class.

## Passage import

Provide two equivalent entry methods that produce the same validated range:

- Paste a reference or several references, one per line.
- Choose book, starting chapter/verse, and ending chapter/verse. Initially support
  ranges within a single book; use multiple references for multiple books.

Populate dropdowns from a bundled corpus manifest. Dependent options update when
book/chapter changes. Single-chapter books show chapter 1. Validate boundaries,
inclusive endpoints, range order, missing verses, and corpus coverage. Do not
silently reverse endpoints or substitute another textual source.

Normalize recognized book aliases, case, periods, spaces, and supported range
punctuation. Show the interpreted reference before resolving words. Use explicit
alias tables rather than guessing ambiguous abbreviations. For example, accept
`1.Jo1:4` as `1 John 1:4` only if `Jo` is an unambiguous supported alias.
`1.Jo14` is ambiguous: it might intend 1 John 1:4, while `1 John 14` looks like
a nonexistent chapter. Ask the user to clarify rather than silently inserting a
colon. Validate single-chapter shorthand such as `Jude 5-8` using documented rules.

Label the original-language corpus/edition. Passage vocabulary depends on its
text; an English translation reference does not determine an exact Greek/Hebrew
word list. Store corpus identity/version and normalized references with each
source. Save resolved membership as a snapshot so dataset updates cannot silently
change a user's pool; provide an explicit refresh with a difference preview.

### Dictionary forms versus passage forms

Use **Dictionary forms (lemmas)** as the initial mode. “Root” is a different
linguistic concept and should not label this option. For example, a passage form
such as logou resolves to the dictionary entry logos.

The existing Greek dictionary-mode map groups 43 reviewed inflection/paradigm
entries. Hard mode does not represent every surface form in a passage. Supporting
**Forms as they appear in the passage** requires occurrence-level surface text,
morphology, distinct form identity, rendering, and a defined progress model; it
should be a later feature, not presented as the existing hard-mode toggle.

Store initial pool membership using canonical dictionary IDs. Keep source IDs as
provenance. Do not allow the current hard-mode setting to expand a fixed pool
silently; initially saved pools use dictionary mode explicitly.

### Available repository data and required build work

`src/trparsed.json` contains Greek verse references and parsed word/Strong's text.
The STEP TAHOT TSVs contain OT verse/token references and extended Strong's and
grammar fields. These are inputs to investigate for a compact passage index;
the app does not currently ship a runtime passage-to-vocabulary resolver.

Generate and validate a verse-to-canonical-term index plus book/chapter/verse
metadata. Reuse existing lexical mapping rules where appropriate, documenting
unmapped tokens, variant readings, morphology-only codes, compound IDs, and
Hebrew prefixes. Do not treat every Strong's-looking code as a vocabulary entry.
Audit the relevant source notices before publishing new derived artifacts; the
availability of raw files alone is not a release decision.

Keep the index local/offline. Measure generated and compressed sizes before
choosing full precaching versus book downloads. Any download-on-demand design
must say which books are available offline. Full passage-form practice may need
additional source data, especially for OT surface text.

## Persistence and integration

Proposed records:

| Record | Essential fields |
| --- | --- |
| Study pool | id, name, targetDate, archivedAt, createdAt, updatedAt |
| Source group | id, poolId, type, label, normalized input, corpus/version, archivedAt |
| Source member | id, sourceId, poolId, termId, provenance, excludedAt |
| Pool word state | id, poolId, termId, releasedAt, coverage/review metadata |
| Coverage pass | id, poolId, scope, startedAt, completedAt |
| Assignment list | listId, revision, assigned vocabulary snapshot/fingerprint, local sourceId |
| Exam definition | id, version, assignment revision, frozen rubric/settings, fingerprint |
| Exam attempt | id, definition snapshot, student label, timestamps, status, responses, score |

Enforce uniqueness for sourceId + termId and poolId + termId. Source provenance
retains original IDs/row numbers/references, not necessarily an entire uploaded
file. Multiple source memberships are expected; multiple active cards are not.

Raise IndexedDB's version from 1, preserving every existing store. Include pools,
groups, membership, releases, and coverage in a versioned backup. Accept existing
version-1 backups as having no saved pools. Define merge/import conflict behavior:
preview colliding IDs, retain the existing local pool by default, and allow an
explicit replace or import-as-copy; never combine incompatible memberships silently.

Extend generator options with a saved-pool scope and allowed canonical IDs. Apply
that scope before the existing progress and other filters. Do not simply reuse
the current selected-pool branch: it is temporary and its random/frequency-only
selection has no coverage guarantee. Keep progress/global scheduling in their
current modules; implement membership, staged resolution, and coverage as separate
pure logic with storage handled by the DB layer.

Add pool management, source detail, import preview, and selection-to-pool actions.
Unify setup counts and generator eligibility so preview counts match actual
sessions. Update offline manifests whenever shipped app assets change.

## Suggested implementation sequence

1. **Persistent membership:** named pools, save report selections, manual/bulk
   add/release, source groups, overlap-safe archive, DB migration, backup support,
   scoped sessions, and persistent coverage. This validates the core study model
   before passage parsing is involved.
2. **CSV staging:** Strong's/canonical IDs, header and column options, resolution
   errors, preview, deduplication, atomic confirmation, and reimport handling.
3. **Teacher exchange and reports:** normalized CSV generation/reimport, list
   identities/revisions, assignment snapshots, pool activity tagging, and printable,
   CSV, and JSON progress reports. Ship the vocabulary round trip with CSV staging
   where practical.
4. **Passage staging:** generated index/manifest, dictionary-form resolution,
   normalized pasted references, dependent dropdowns, provenance, and offline data.
5. **Vocabulary exams:** versioned exam definitions, frozen scored attempts,
   resume/submit behavior, and downloadable results distinct from progress reports.
6. **Passage forms:** separately specify form identity and progress before adding
   the user-facing option.

## Acceptance checks

- Four or more Know ratings never remove a saved member; reload retains the pool.
- A 67-word pool can complete coverage across short sessions, including Strong
  words, without unrelated catalog cards or duplicate cards from overlapping groups.
- A failed/incomplete session advances only reviews actually saved.
- Archiving A removes A-only words while retaining A/B overlaps and manual adds.
- Explicit release survives another import until explicitly restored.
- CSV header choices, quoted fields, duplicate rows, unknown IDs, and ambiguous
  language are reflected accurately in preview and commit.
- Dictionary mapping can collapse several input IDs without losing provenance.
- A teacher's normalized CSV imports the same canonical set on another device;
  reimporting the same revision creates no duplicate memberships. Dataset mismatch
  or excluded rows are disclosed rather than reported as an exact assignment match.
- A revised assignment previews additions/removals and preserves overlapping groups.
- Pool reports distinguish global history from pool activity; assignment coverage
  retains its assigned denominator after a student releases words.
- A scored attempt exports independently of self-rated practice; later membership,
  catalog, or rating changes cannot alter the submitted score or rubric snapshot.
- Incomplete and unanswered exams are labeled/scored consistently; a second attempt
  retains the first attempt. Exam and assignment records survive backup/restore.
- Invalid or ambiguous references require correction; Jude's dropdown has one
  chapter; cross-chapter and overlapping ranges resolve and deduplicate correctly.
- A changed preview cannot commit stale membership counts; double submission does
  not create duplicate groups or members.
- Migration preserves existing progress; backups restore all new records; old
  backups still import; unsupported newer backup versions fail clearly.
- Pool removal/archival leaves global history intact, and ordinary catalog
  sessions retain existing behavior.

## Decisions to settle before implementation

The recommended defaults above are multiple named pools, overlapping source groups,
dictionary forms first, shared global learning progress, and separate pool coverage.
The main remaining product decision is whether initial Focus practice needs a
more elaborate weakness-weighted balance than coverage-first ordering. Exact
passage-source coverage and offline packaging depend on the index build audit.
