#!/usr/bin/env python3
"""Count local TR lexical annotations and KJV tags separately; no dependencies."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re


ID = re.compile(r"([GH])0*([1-9][0-9]*)([a-zA-Z]*)")
TAG = re.compile(r"\[([GH][0-9]+)\]")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"), object_pairs_hook=unique_keys)


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON object key: {key}")
        result[key] = value
    return result


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_id(value):
    match = ID.fullmatch(value)
    if not match:
        raise ValueError(f"Invalid Strong's ID: {value!r}")
    return f"{match[1]}{int(match[2])}{match[3]}"


def id_key(value):
    match = ID.fullmatch(value)
    return match[1], int(match[2]), match[3]


def source_info(path):
    path = Path(path)
    return {"path": path.as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


class Totals:
    def __init__(self):
        self.counts = Counter()
        self.examples = defaultdict(list)
        self.verses = 0
        self.without_tags = []

    def add(self, ref, ids):
        self.verses += 1
        if not ids:
            self.without_tags.append(ref)
        self.counts.update(ids)
        for strongs_id in dict.fromkeys(ids):
            if len(self.examples[strongs_id]) < 3:
                self.examples[strongs_id].append(ref)

    def result(self, **metadata):
        return {
            **metadata,
            "verseRecords": self.verses,
            "occurrences": sum(self.counts.values()),
            "uniqueStrongsIds": len(self.counts),
            "versesWithoutTags": self.without_tags,
            "counts": dict(sorted(self.counts.items(), key=lambda item: id_key(item[0]))),
            "exampleRefs": {key: self.examples[key] for key in sorted(self.counts, key=id_key)},
        }


def tr_ids(text):
    """Return lexical codes only; keep first reading and omit subscriptions.

    This local export has one VAR2: ... } segment and bracketed end-of-book
    subscriptions. G5625+ are parsing codes, not dictionary headwords.
    Reject unknown markup instead of silently counting it.
    """
    variants = text.count("VAR2:")
    if variants:
        text, removed = re.subn(r"VAR2:.*?\}", " ", text)
        if removed != variants:
            raise ValueError("Unclosed VAR2 segment")
    subscription = "[" in text
    if subscription:
        body, suffix = text.split("[", 1)
        if suffix.count("]") != 1 or "[" in suffix:
            raise ValueError("Unexpected subscription markup")
        # In this export, the closing bracket precedes the final word's codes.
        tail = suffix.split("]", 1)[1].split()
        if any(not re.fullmatch(r"G[0-9]+|[A-Z0-9:-]+", token) for token in tail):
            raise ValueError("Unexpected text after subscription")
        text = body
    if any(mark in text for mark in ("VAR", "{", "}", "[", "]")):
        raise ValueError("Unknown TR variant/annotation markup")
    ids = []
    parsing = 0
    alternatives = []
    # A word may have multiple analyses. Count its first lexical ID once.
    tokens = text.split()
    index = 0
    while index < len(tokens):
        word = tokens[index]
        if not re.search(r"[\u0370-\u03ff\u1f00-\u1fff]", word):
            raise ValueError(f"Expected Greek word, found {word!r}")
        index += 1
        while index < len(tokens) and re.fullmatch(r"[\u0370-\u03ff\u1f00-\u1fff]+", tokens[index]):
            word += " " + tokens[index]
            index += 1
        codes = []
        while index < len(tokens) and re.fullmatch(r"G[0-9]+", tokens[index]):
            group = []
            while index < len(tokens) and re.fullmatch(r"G[0-9]+", tokens[index]):
                code = normalize_id(tokens[index])
                if int(code[1:]) <= 5624:
                    group.append(code)
                else:
                    parsing += 1
                index += 1
            if not group or index == len(tokens) or not re.fullmatch(r"[A-Z][A-Z0-9:-]*", tokens[index]):
                raise ValueError(f"Missing lexical code or morphology after {word!r}")
            codes.extend(group)
            index += 1
        if not codes:
            raise ValueError(f"Missing annotations after {word!r}")
        ids.append(codes[0])
        if len(codes) > 1:
            alternatives.append({"word": word, "selected": codes[0], "annotations": codes})
    return ids, parsing, variants, subscription, alternatives


def count_tr(path):
    data = read_json(path)
    totals = Totals()
    seen = set()
    books = set()
    parsing = variants = subscriptions = 0
    empty = []
    alternatives = []
    for verse in data["verses"]:
        key = (verse["book"], verse["chapter"], verse["verse"])
        if key in seen or not 40 <= key[0] <= 66 or any(type(n) is not int or n < 1 for n in key):
            raise ValueError(f"Duplicate or invalid TR verse: {key}")
        seen.add(key)
        books.add(key[0])
        ref = f"{verse['book_name']} {key[1]}:{key[2]}"
        try:
            ids, p, v, s, analyses = tr_ids(verse["text"])
        except ValueError as error:
            raise ValueError(f"{ref}: {error}") from error
        parsing += p
        variants += v
        subscriptions += s
        alternatives.extend({"ref": ref, **analysis} for analysis in analyses)
        if not verse["text"].strip():
            empty.append(ref)
        totals.add(ref, ids)
    if books != set(range(40, 67)):
        raise ValueError("TR input must contain all 27 NT books")
    return totals.result(
        name="Textus Receptus Parsed NT (local export)",
        unit="lexical Strong's annotations in supplied Greek text",
        policy="G1-G5624; first lexical annotation per word; first reading; bracketed subscriptions excluded; no lemma consolidation",
        sourceMetadata=data.get("metadata", {}), sources=[source_info(path)],
        excludedParsingCodes=parsing, excludedVariantSegments=variants,
        excludedSubscriptions=subscriptions, emptyVerseRecords=empty,
        wordsWithMultipleAnnotations=alternatives,
    )


def kjv_book(path, abbr, recover=False):
    """Recover only explicit English string fields, never foreign-language text.

    Recovery is opt-in and checks every verse-key declaration is captured once.
    Foreign appended books are reported and excluded by the requested filename.
    """
    notes = {"path": path.as_posix()}
    try:
        data = read_json(path)
    except json.JSONDecodeError as error:
        if not recover:
            raise ValueError(f"{path}: invalid JSON; inspect source or use --recover-kjv-english") from error
        text = path.read_text(encoding="utf-8-sig")
        declarations = re.findall(r'"([A-Za-z0-9]+\|[0-9]+\|[0-9]+)"\s*:\s*\{', text)
        matches = list(re.finditer(
            r'"([A-Za-z0-9]+\|[0-9]+\|[0-9]+)"\s*:\s*\{\s*"en"\s*:\s*("(?:[^"\\]|\\.)*")\s*[,}]', text,
        ))
        if [match[1] for match in matches] != declarations or not declarations:
            raise ValueError(f"Cannot recover every English verse safely in {path}") from error
        records = [(match[1], json.loads(match[2])) for match in matches]
        notes.update(jsonError=str(error), recovery="English fields only; every verse declaration accounted for")
    else:
        if len(data) != 1:
            raise ValueError(f"Expected exactly one book in {path}")
        records = [(ref, verse["en"]) for verses in next(iter(data.values())).values() for ref, verse in verses.items()]
    chapters = {}
    foreign = Counter()
    seen = {}
    duplicates = 0
    for ref, text in records:
        book = ref.split("|")[0]
        if book != abbr:
            if not recover:
                raise ValueError(f"Foreign verse in {path}: {ref}")
            foreign[book] += 1
            continue
        if ref in seen:
            if not recover or seen[ref] != text:
                raise ValueError(f"Duplicate/conflicting English verse in {path}: {ref}")
            duplicates += 1
            continue
        seen[ref] = text
        chapters.setdefault(ref.rsplit("|", 1)[0], {})[ref] = {"en": text}
    if duplicates or foreign:
        notes.update(identicalDuplicateVerseRecordsExcluded=duplicates, excludedForeignBookVerses=dict(foreign))
    return chapters, notes if len(notes) > 1 else None


def count_kjv(directory, recover=False):
    directory = Path(directory)
    books_path = directory / "books.json"
    books = read_json(books_path)["books"]
    abbreviations = [abbr for book in books for abbr in book.values()]
    if len(books) != 66 or len(set(abbreviations)) != 66:
        raise ValueError("books.json must list 66 distinct books in canonical order")
    totals = {"kjv_ot": Totals(), "kjv_nt": Totals()}
    chapters_path = directory / "chapter_count.json"
    chapter_counts = read_json(chapters_path)
    sources = {key: [source_info(books_path), source_info(chapters_path)] for key in totals}
    recoveries = {key: [] for key in totals}
    for number, abbr in enumerate(abbreviations, 1):
        path = directory / f"{abbr}.json"
        corpus = "kjv_ot" if number <= 39 else "kjv_nt"
        expected_prefix = "H" if number <= 39 else "G"
        chapters, recovery = kjv_book(path, abbr, recover)
        if recovery:
            recoveries[corpus].append(recovery)
        expected_chapters = {f"{abbr}|{n}" for n in range(1, int(chapter_counts[abbr]) + 1)}
        if set(chapters) != expected_chapters:
            raise ValueError(f"Unexpected book structure in {path}")
        sources[corpus].append(source_info(path))
        for chapter, verses in chapters.items():
            if not re.fullmatch(re.escape(abbr) + r"\|[1-9][0-9]*", chapter) or not verses:
                raise ValueError(f"Invalid chapter: {chapter}")
            if set(verses) != {f"{chapter}|{n}" for n in range(1, len(verses) + 1)}:
                raise ValueError(f"Missing or invalid verse sequence: {chapter}")
            for ref, verse in verses.items():
                if not re.fullmatch(re.escape(chapter) + r"\|[1-9][0-9]*", ref):
                    raise ValueError(f"Invalid verse: {ref}")
                text = verse["en"]
                ids = [normalize_id(tag) for tag in TAG.findall(text)]
                if any(not tag.startswith(expected_prefix) for tag in ids):
                    raise ValueError(f"Unexpected Strong's language in {ref}")
                remainder = re.sub(r"\[\[.*?\]\]|\[fn\]", "", TAG.sub("", text))
                if "[" in remainder or "]" in remainder:
                    raise ValueError(f"Unrecognized tag in {ref}")
                totals[corpus].add(ref.replace("|", " ", 1).replace("|", ":"), ids)
    return {key: value.result(
        name=f"KJV local tagged export ({'OT' if key.endswith('ot') else 'NT'})",
        unit="explicit Strong's tags in English en fields",
        policy="Count every explicit tag, including repeated tags and tags in headings/subscriptions; do not infer untagged words; identical duplicate verse records counted once",
        sources=sources[key], sourceRecoveries=recoveries[key],
    ) for key, value in totals.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tr", type=Path, default=Path("src/trparsed.json"))
    parser.add_argument("--kjv-dir", type=Path, default=Path("src/kjv-main"))
    parser.add_argument("--output", type=Path, default=Path("docs/data/generated/strongs-frequencies.json"))
    parser.add_argument("--recover-kjv-english", action="store_true", help="Explicitly recover English verse fields from malformed multilingual KJV JSON; report all recoveries")
    args = parser.parse_args()
    corpora = {"tr_nt": count_tr(args.tr), **count_kjv(args.kjv_dir, args.recover_kjv_english)}
    if args.output.resolve() in {args.tr.resolve(), *[p.resolve() for p in args.kjv_dir.glob("*.json")]}:
        parser.error("Output must not overwrite source files")
    write_json(args.output, {"schemaVersion": 1, "generator": "tools/count_strongs.py", "corpora": corpora})
    for name, result in corpora.items():
        print(f"{name}: {result['occurrences']:,} occurrences; {result['uniqueStrongsIds']:,} IDs; {result['verseRecords']:,} verses")


if __name__ == "__main__":
    main()
