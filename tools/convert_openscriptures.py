#!/usr/bin/env python3
"""Convert vetted OpenScriptures source files into Logamar canonical JSON.

This script is intentionally deterministic and local-only:
- no network access
- no AI-generated lexical content
- stable sorting and JSON formatting
- manifest with source SHA-256 hashes
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


JS_OBJECT_ASSIGNMENT_RE = re.compile(r"(?:var\s+)?\w+\s*=\s*(\{.*\})\s*;?\s*$", re.DOTALL)
PUNCT_SPLIT_RE = re.compile(r"\s*[,;/]\s*")
HEBREW_LEMMA_RE = re.compile(r"H?0*([0-9]+)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert OpenScriptures data to Logamar JSON.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    strongs = subparsers.add_parser("strongs", help="Convert OpenScriptures Strong's dictionary files.")
    strongs.add_argument(
        "--language",
        choices=["greek", "hebrew", "both"],
        default="greek",
        help="Which language data to generate. Defaults to greek.",
    )
    strongs.add_argument("--greek", type=Path, help="Path to strongs-greek-dictionary.js")
    strongs.add_argument("--hebrew", type=Path, help="Path to strongs-hebrew-dictionary.js")
    strongs.add_argument("--morphhb-json", type=Path, help="Optional morphhb-generated Hebrew JSON for frequencies.")
    strongs.add_argument("--out-dir", type=Path, required=True, help="Directory for generated JSON files.")

    greek_word_list = subparsers.add_parser(
        "greek-word-list",
        help="Convert OpenScriptures GreekResources/GreekWordList.js to Logamar JSON.",
    )
    greek_word_list.add_argument("--input", type=Path, required=True, help="Path to GreekWordList.js")
    greek_word_list.add_argument("--gnt-lookups", type=Path, help="Optional path to GreekResources/gntLookups.js")
    greek_word_list.add_argument("--morphgnt-dir", type=Path, help="Optional directory containing MorphGNT .txt files")
    greek_word_list.add_argument("--lxx-lemmas-dir", type=Path, help="Optional directory containing GreekResources/LxxLemmas/*.js")
    greek_word_list.add_argument("--out-dir", type=Path, required=True, help="Directory for generated JSON files.")

    args = parser.parse_args()

    if args.command == "strongs":
        convert_strongs(args.language, args.greek, args.hebrew, args.morphhb_json, args.out_dir)
        return 0
    if args.command == "greek-word-list":
        convert_greek_word_list(
            input_path=args.input,
            out_dir=args.out_dir,
            gnt_lookups_path=args.gnt_lookups,
            morphgnt_dir=args.morphgnt_dir,
            lxx_lemmas_dir=args.lxx_lemmas_dir,
        )
        return 0

    parser.error("Unknown command")
    return 2


def convert_strongs(
    language: str,
    greek_path: Path | None,
    hebrew_path: Path | None,
    morphhb_path: Path | None,
    out_dir: Path,
) -> None:
    if language in {"greek", "both"} and not greek_path:
        raise ValueError("--greek is required when --language is greek or both")
    if language in {"hebrew", "both"} and not hebrew_path:
        raise ValueError("--hebrew is required when --language is hebrew or both")
    if morphhb_path and language == "greek":
        raise ValueError("--morphhb-json only applies when generating Hebrew data")

    if greek_path:
        require_file(greek_path)
    if hebrew_path:
        require_file(hebrew_path)
    if morphhb_path:
        require_file(morphhb_path)

    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    sources: list[Path] = []

    if language in {"greek", "both"}:
        assert greek_path is not None
        greek_source = parse_strongs_js(greek_path)
        greek_terms = [
            strongs_entry_to_term(strongs_id, entry, "greek", frequency=0, examples=[])
            for strongs_id, entry in sorted(greek_source.items(), key=lambda item: strongs_sort_key(item[0]))
        ]
        write_json(out_dir / "greek.json", greek_terms)
        counts["greekTerms"] = len(greek_terms)
        sources.append(greek_path)

    if language in {"hebrew", "both"}:
        assert hebrew_path is not None
        hebrew_source = parse_strongs_js(hebrew_path)
        hebrew_frequency, hebrew_examples = ({}, {}) if not morphhb_path else parse_morphhb_frequency(morphhb_path)
        hebrew_terms = [
            strongs_entry_to_term(
                strongs_id,
                entry,
                "hebrew",
                frequency=hebrew_frequency.get(strongs_id, 0),
                examples=hebrew_examples.get(strongs_id, []),
            )
            for strongs_id, entry in sorted(hebrew_source.items(), key=lambda item: strongs_sort_key(item[0]))
        ]
        write_json(out_dir / "hebrew.json", hebrew_terms)
        counts["hebrewTerms"] = len(hebrew_terms)
        counts["hebrewTermsWithFrequency"] = sum(1 for term in hebrew_terms if term["frequency"] > 0)
        sources.append(hebrew_path)
        if morphhb_path:
            sources.append(morphhb_path)

    write_json(out_dir / "data-manifest.json", build_manifest(
        sources=sources,
        counts=counts,
    ))


def convert_greek_word_list(
    input_path: Path,
    out_dir: Path,
    gnt_lookups_path: Path | None = None,
    morphgnt_dir: Path | None = None,
    lxx_lemmas_dir: Path | None = None,
) -> None:
    require_file(input_path)
    if bool(gnt_lookups_path) != bool(morphgnt_dir):
        raise ValueError("--gnt-lookups and --morphgnt-dir must be provided together")
    if gnt_lookups_path:
        require_file(gnt_lookups_path)
    if morphgnt_dir:
        require_dir(morphgnt_dir)
    if lxx_lemmas_dir:
        require_dir(lxx_lemmas_dir)

    source = parse_js_object_assignment(input_path)
    lookup_to_strongs_id = greek_word_list_lookup_to_strongs_id(source)
    gnt_frequency = FrequencyResult()
    lxx_frequency = FrequencyResult()

    if gnt_lookups_path and morphgnt_dir:
        gnt_frequency = parse_morphgnt_frequency(gnt_lookups_path, morphgnt_dir, lookup_to_strongs_id)

    if lxx_lemmas_dir:
        lxx_frequency = parse_lxx_lemma_frequency(lxx_lemmas_dir, lookup_to_strongs_id)

    terms = []
    skipped_without_strong = 0
    skipped_invalid_strong = 0
    duplicate_strongs: Counter[str] = Counter()
    for lookup_key, entry in sorted(source.items(), key=lambda item: item[0]):
        strong_number = clean_text(entry.get("strong", ""))
        if not strong_number:
            skipped_without_strong += 1
            continue

        normalized_strongs_id = normalize_greek_strongs_id(strong_number)
        if not normalized_strongs_id:
            skipped_invalid_strong += 1
            continue

        duplicate_strongs.update([normalized_strongs_id])
        terms.append(greek_word_list_entry_to_term(
            lookup_key=lookup_key,
            entry=entry,
            strongs_id=normalized_strongs_id,
            gnt_count=gnt_frequency.counts.get(normalized_strongs_id, 0),
            gnt_examples=gnt_frequency.examples.get(normalized_strongs_id, []),
            lxx_count=lxx_frequency.counts.get(normalized_strongs_id, 0),
            lxx_examples=lxx_frequency.examples.get(normalized_strongs_id, []),
        ))

    raw_term_count = len(terms)
    duplicate_count = sum(1 for count in duplicate_strongs.values() if count > 1)
    terms = collapse_duplicate_terms(terms)
    terms.sort(key=lambda term: strongs_sort_key(term["id"]))

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "greek.json", terms)
    write_json(out_dir / "data-manifest.json", build_manifest(
        sources=[
            input_path,
            *([gnt_lookups_path] if gnt_lookups_path else []),
            *(sorted(morphgnt_dir.glob("*.txt")) if morphgnt_dir else []),
            *(sorted(lxx_lemmas_dir.glob("*.js")) if lxx_lemmas_dir else []),
        ],
        counts={
            "greekRawStrongEntries": raw_term_count,
            "greekTerms": len(terms),
            "greekWordListEntriesWithoutStrong": skipped_without_strong,
            "greekWordListEntriesWithInvalidStrong": skipped_invalid_strong,
            "duplicateStrongNumbers": duplicate_count,
            "mergedDuplicateEntries": raw_term_count - len(terms),
            "gntTokensCounted": gnt_frequency.tokens_counted,
            "gntTokensUnmapped": gnt_frequency.tokens_unmapped,
            "gntTermsWithFrequency": len(gnt_frequency.counts),
            "lxxTokensCounted": lxx_frequency.tokens_counted,
            "lxxTokensUnmapped": lxx_frequency.tokens_unmapped,
            "lxxTermsWithFrequency": len(lxx_frequency.counts),
        },
    ))


def greek_word_list_entry_to_term(
    lookup_key: str,
    entry: dict[str, Any],
    strongs_id: str,
    gnt_count: int,
    gnt_examples: list[str],
    lxx_count: int,
    lxx_examples: list[str],
) -> dict[str, Any]:
    lemma = clean_text(entry.get("lemma", ""))
    definition = clean_text(entry.get("def", ""))
    source = clean_text(entry.get("src", ""))
    derivation = clean_text(entry.get("deriv", ""))
    pos = clean_text(entry.get("pos", ""))

    return {
        "id": strongs_id,
        "language": "greek",
        "lemma": lemma,
        "transliteration": "",
        "glosses": split_glosses(definition),
        "partOfSpeech": normalize_packard_pos(pos),
        "frequency": gnt_count,
        "frequencies": {
            "gnt": gnt_count,
            "lxx": lxx_count,
        },
        "sourceRefs": gnt_examples[:3],
        "morphologyHints": [derivation] if derivation else [],
        "exampleRefs": gnt_examples[:3],
        "source": {
            "name": "OpenScriptures Greek Word List",
            "lookupKey": lookup_key,
            "packardPos": pos,
            "src": source,
            "def": definition,
            "view": clean_text(entry.get("v", "")),
            "frequencyRefs": {
                "gnt": gnt_examples[:3],
                "lxx": lxx_examples[:3],
            },
        },
    }


def collapse_duplicate_terms(terms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for term in terms:
        by_id[term["id"]].append(term)

    collapsed = []
    for strongs_id, entries in by_id.items():
        if len(entries) == 1:
            collapsed.append(entries[0])
            continue

        ordered = sorted(entries, key=duplicate_primary_sort_key)
        primary = dict(ordered[0])
        primary["glosses"] = unique_preserve_order([
            gloss
            for entry in ordered
            for gloss in entry.get("glosses", [])
        ])
        primary["frequency"] = sum(entry.get("frequencies", {}).get("gnt", 0) for entry in ordered)
        primary["frequencies"] = {
            "gnt": primary["frequency"],
            "lxx": sum(entry.get("frequencies", {}).get("lxx", 0) for entry in ordered),
        }
        primary["sourceRefs"] = unique_preserve_order([
            ref
            for entry in ordered
            for ref in entry.get("sourceRefs", [])
        ])[:3]
        primary["exampleRefs"] = unique_preserve_order([
            ref
            for entry in ordered
            for ref in entry.get("exampleRefs", [])
        ])[:3]
        primary["morphologyHints"] = unique_preserve_order([
            hint
            for entry in ordered
            for hint in entry.get("morphologyHints", [])
        ])
        primary["alternateLemmas"] = unique_preserve_order([
            entry["lemma"]
            for entry in ordered
            if entry["lemma"] != primary["lemma"]
        ])
        primary["source"] = {
            **primary["source"],
            "frequencyRefs": {
                "gnt": primary["sourceRefs"],
                "lxx": unique_preserve_order([
                    ref
                    for entry in ordered
                    for ref in entry.get("source", {}).get("frequencyRefs", {}).get("lxx", [])
                ])[:3],
            },
            "alternateEntries": [
                {
                    "lemma": entry["lemma"],
                    "lookupKey": entry["source"].get("lookupKey", ""),
                    "packardPos": entry["source"].get("packardPos", ""),
                    "def": entry["source"].get("def", ""),
                    "src": entry["source"].get("src", ""),
                    "view": entry["source"].get("view", ""),
                }
                for entry in ordered
                if entry is not ordered[0]
            ],
        }
        collapsed.append(primary)

    return collapsed


def duplicate_primary_sort_key(term: dict[str, Any]) -> tuple[int, str]:
    score = 0
    if term.get("partOfSpeech") != "unknown":
        score -= 4
    if term.get("source", {}).get("view"):
        score += 2
    if term.get("glosses"):
        score -= 1
    return (score, term.get("source", {}).get("lookupKey", ""))


class FrequencyResult:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()
        self.examples: dict[str, list[str]] = defaultdict(list)
        self.tokens_counted = 0
        self.tokens_unmapped = 0


def greek_word_list_lookup_to_strongs_id(source: dict[str, dict[str, Any]]) -> dict[str, str]:
    lookup_to_strongs_id = {}
    for lookup_key, entry in source.items():
        strong_number = clean_text(entry.get("strong", ""))
        if not strong_number:
            continue
        strongs_id = normalize_greek_strongs_id(strong_number)
        if strongs_id:
            lookup_to_strongs_id[lookup_key] = strongs_id
    return lookup_to_strongs_id


def parse_morphgnt_frequency(
    gnt_lookups_path: Path,
    morphgnt_dir: Path,
    lookup_to_strongs_id: dict[str, str],
) -> FrequencyResult:
    lemma_to_lookup = parse_js_object_assignment(gnt_lookups_path)
    result = FrequencyResult()

    for path in sorted(morphgnt_dir.rglob("*.txt")):
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            fields = line.split()
            if len(fields) < 7:
                raise ValueError(f"Expected at least 7 MorphGNT fields in {path}:{line_number}")

            passage = fields[0]
            lemma = fields[6]
            lookup_key = lemma_to_lookup.get(lemma)
            strongs_id = lookup_to_strongs_id.get(lookup_key or "")
            if not strongs_id:
                result.tokens_unmapped += 1
                continue

            result.tokens_counted += 1
            result.counts[strongs_id] += 1
            add_example(result.examples, strongs_id, morphgnt_ref(passage))

    return result


def parse_lxx_lemma_frequency(lxx_lemmas_dir: Path, lookup_to_strongs_id: dict[str, str]) -> FrequencyResult:
    result = FrequencyResult()

    for path in sorted(lxx_lemmas_dir.glob("*.js")):
        if path.name.lower() == "readme.md":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"Expected LXX lemma JSON object in {path}")

        for ref, words in sorted(data.items()):
            if not isinstance(words, list):
                raise ValueError(f"Expected word list for {ref} in {path}")
            for word in words:
                lookup_key = clean_text(word.get("key", ""))
                strongs_id = lookup_to_strongs_id.get(lookup_key)
                if not strongs_id:
                    result.tokens_unmapped += 1
                    continue
                result.tokens_counted += 1
                result.counts[strongs_id] += 1
                add_example(result.examples, strongs_id, ref)

    return result


def add_example(examples: dict[str, list[str]], strongs_id: str, ref: str) -> None:
    if ref and len(examples[strongs_id]) < 3 and ref not in examples[strongs_id]:
        examples[strongs_id].append(ref)


def morphgnt_ref(passage: str) -> str:
    if len(passage) < 6 or not passage[:6].isdigit():
        return passage
    book = int(passage[:2])
    chapter = int(passage[2:4])
    verse = int(passage[4:6])
    return f"{book:02d} {chapter}:{verse}"


def parse_strongs_js(path: Path) -> dict[str, dict[str, Any]]:
    return parse_js_object_assignment(path)


def parse_js_object_assignment(path: Path) -> dict[str, dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    match = JS_OBJECT_ASSIGNMENT_RE.search(text)
    if not match:
        raise ValueError(f"Could not find a JavaScript object assignment in {path}")

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path} did not parse as JSON after extracting the JavaScript object: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Expected top-level object in {path}")
    return data


def strongs_entry_to_term(
    strongs_id: str,
    entry: dict[str, Any],
    language: str,
    frequency: int,
    examples: list[str],
) -> dict[str, Any]:
    lemma = clean_text(entry.get("lemma", ""))
    transliteration = clean_text(entry.get("translit", ""))
    kjv_def = clean_text(entry.get("kjv_def", ""))
    strongs_def = clean_text(entry.get("strongs_def", ""))
    derivation = clean_text(entry.get("derivation", ""))

    return {
        "id": strongs_id,
        "language": language,
        "lemma": lemma,
        "transliteration": transliteration,
        "glosses": split_glosses(kjv_def),
        "partOfSpeech": infer_part_of_speech(strongs_def, kjv_def, derivation),
        "frequency": frequency,
        "sourceRefs": examples[:3],
        "morphologyHints": [derivation] if derivation else [],
        "exampleRefs": examples[:3],
        "source": {
            "name": "OpenScriptures Strong's Dictionaries",
            "strongsDef": strongs_def,
            "kjvDef": kjv_def,
        },
    }


def parse_morphhb_frequency(path: Path) -> tuple[dict[str, int], dict[str, list[str]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected morphhb JSON object keyed by book name in {path}")

    counts: Counter[str] = Counter()
    examples: dict[str, list[str]] = defaultdict(list)

    for book, chapters in data.items():
        for chapter_index, chapter in enumerate(chapters, start=1):
            for verse_index, verse in enumerate(chapter, start=1):
                ref = f"{book} {chapter_index}:{verse_index}"
                for word in verse:
                    if len(word) < 2 or not word[1]:
                        continue
                    for strongs_id in normalize_hebrew_lemmas(str(word[1])):
                        counts[strongs_id] += 1
                        if len(examples[strongs_id]) < 3:
                            examples[strongs_id].append(ref)

    return dict(sorted(counts.items(), key=lambda item: strongs_sort_key(item[0]))), dict(examples)


def normalize_hebrew_lemmas(raw: str) -> list[str]:
    ids: list[str] = []
    for part in raw.replace("+", "/").split("/"):
        match = HEBREW_LEMMA_RE.search(part)
        if match:
            ids.append(f"H{int(match.group(1))}")
    return ids


def normalize_greek_strongs_id(raw: str) -> str | None:
    match = re.fullmatch(r"G?0*([0-9]+)([A-Za-z]*)", raw.strip())
    if not match:
        return None
    return f"G{int(match.group(1))}{match.group(2)}"


def split_glosses(value: str) -> list[str]:
    glosses = []
    for item in PUNCT_SPLIT_RE.split(value):
        item = item.strip(" -")
        if item and not item.startswith("X "):
            glosses.append(item)
    return unique_preserve_order(glosses)


def infer_part_of_speech(strongs_def: str, kjv_def: str, derivation: str) -> str:
    text = f"{strongs_def} {kjv_def} {derivation}".lower()
    if "verb" in text or text.startswith("to "):
        return "verb"
    if "adverb" in text:
        return "adverb"
    if "preposition" in text:
        return "preposition"
    if "conjunction" in text:
        return "conjunction"
    if "pronoun" in text:
        return "pronoun"
    if "particle" in text:
        return "particle"
    if "adjective" in text:
        return "adjective"
    return "unknown"


def normalize_packard_pos(pos: str) -> str:
    if " " in pos:
        pos = pos.split()[0]
    return {
        "N": "noun",
        "Np": "proper-noun",
        "V": "verb",
        "A": "adjective",
        "R": "pronoun",
        "C": "conjunction",
        "X": "particle",
        "I": "interjection",
        "M": "number",
        "P": "preposition",
        "D": "adverb",
    }.get(pos, "unknown")


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def unique_preserve_order(values: list[str]) -> list[str]:
    seen = set()
    unique = []
    for value in values:
        key = value.casefold()
        if key not in seen:
            unique.append(value)
            seen.add(key)
    return unique


def strongs_sort_key(strongs_id: str) -> tuple[str, int, str]:
    match = re.match(r"([GH])0*([0-9]+)(.*)", strongs_id)
    if not match:
        return (strongs_id[:1], 0, strongs_id)
    return (match.group(1), int(match.group(2)), match.group(3))


def build_manifest(sources: list[Path], counts: dict[str, int]) -> dict[str, Any]:
    return {
        "generator": "tools/convert_openscriptures.py",
        "sources": [
            {
                "path": str(path.as_posix()),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in sources
        ],
        "counts": counts,
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"Required source file not found: {path}")


def require_dir(path: Path) -> None:
    if not path.is_dir():
        raise NotADirectoryError(f"Required source directory not found: {path}")


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
