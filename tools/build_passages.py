#!/usr/bin/env python3
"""Generate an offline dictionary-ID passage index using existing corpus policies."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from build_hebrew import lexical_rows, count_rows
from count_strongs import tr_ids

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/data/generated/passages.json"
OT_NAMES = "Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Songs|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi".split("|")
OT_IDS = "Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal".split()
NT_IDS = "Mat Mar Luk Jhn Act Rom 1Co 2Co Gal Eph Phl Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jde Rev".split()


def build():
    terms = [t for language in ["greek", "hebrew", "aramaic"] for t in json.loads((ROOT / f"docs/data/generated/{language}.json").read_bytes())]
    canonical = {t["id"]: t.get("lemmaId", t["id"]) for t in terms}
    verses = defaultdict(set)
    def add(ref, ids):
        unknown = {identity for identity in ids if identity not in canonical}
        if unknown:
            raise ValueError(f"Unknown passage vocabulary in {ref}: {unknown}")
        verses[ref].update(canonical[i] for i in ids)

    source = ROOT / "src/stepbible"
    _, aliases, _ = lexical_rows((source / "tbesh.tsv").read_text(encoding="utf-8").splitlines()[1:])
    rows = [line.split("\t") for path in sorted(source.glob("tahot-*.tsv")) for line in path.read_text(encoding="utf-8").splitlines()[1:]]
    _, _, diagnostics = count_rows(rows, aliases, json.loads((source / "mapping-overrides.json").read_bytes()), on_word=add)
    if diagnostics["unmappedTags"]:
        raise ValueError(diagnostics["unmappedTags"])
    names = dict(zip(OT_IDS, OT_NAMES))
    for verse in json.loads((ROOT / "src/trparsed.json").read_bytes())["verses"]:
        book = NT_IDS[int(verse["book"]) - 40]
        names[book] = verse["book_name"]
        add(f"{book} {verse['chapter']}:{verse['verse']}", tr_ids(verse["text"])[0])
    books = {book: {"id": book, "name": names[book], "chapters": {}} for book in [*OT_IDS, *NT_IDS]}
    for ref, ids in verses.items():
        book, location = ref.split(" ")
        chapter, verse = location.split(":")
        books[book]["chapters"].setdefault(chapter, {})[verse] = sorted(ids)
    payload = {"version": 1, "corpus": "TR Parsed NT / STEPBible TAHOT OT", "mode": "dictionary", "books": list(books.values())}
    return (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != result:
            parser.exit(1, "Passage index is stale; run python tools/build_passages.py\n")
        print("Passage index verified.")
    else:
        OUTPUT.write_bytes(result)
        print(f"Generated passage index ({len(result):,} bytes).")
