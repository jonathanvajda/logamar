#!/usr/bin/env python3
"""Build Hebrew/Aramaic flashcards from pinned STEPBible projections."""
import argparse
from collections import Counter, defaultdict
import hashlib
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/stepbible"
ID = re.compile(r"H0*(\d+)([A-Za-z]*)")
REF = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:\([^)]*\))?#([^=]+)=(.+)$")
ROOT_TAG = re.compile(r"\{(H\d+[A-Za-z]*)\}(\+?)")
POLICY = "TAHOT primary word rows; Qere followed; L/Q/R/V and other main readings retained; X (reconstructed LXX additions) excluded; lexical roots only; bound affixes/punctuation (H9000+) excluded; identical root continuations after + counted once; dStrong senses aggregated to eStrong IDs, preserving eStrong suffixes; alternate-detail and interlinear rows not counted."


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def normalize(value):
    match = ID.fullmatch(value)
    if not match:
        raise ValueError(f"Invalid Hebrew ID: {value!r}")
    return f"H{int(match[1])}{match[2]}"


def key(value):
    match = ID.fullmatch(value)
    return int(match[1]), match[2]


def plain(value):
    return " ".join(html.unescape(value).split())


def pos(morph):
    if morph.startswith("N:"):
        return "proper-noun"
    category = morph.split(":", 1)[-1].split("-", 1)[0].split(" ")[0].split("+")[0]
    return {"N": "noun", "V": "verb", "A": "adjective", "Adv": "adverb",
            "Prep": "preposition", "Conj": "conjunction", "Part": "particle",
            "Neg": "particle", "Cond": "conjunction", "Intj": "interjection",
            "Intg": "pronoun", "PerP": "pronoun", "DemP": "pronoun",
            "RelP": "pronoun", "IndP": "pronoun"}.get(category, "unknown")


def lexical_rows(lines):
    groups = defaultdict(list)
    aliases = {}
    excluded = 0
    for number, line in enumerate(lines, 2):
        row = line.split("\t")
        if len(row) != 7:
            raise ValueError(f"TBESH row {number}: expected exactly seven safe columns")
        e, disambiguated, unified, lemma, transliteration, morph, gloss = row
        identity = normalize(e)
        match = re.match(r"H\d+[A-Za-z]*", disambiguated)
        if not match or not lemma.strip() or not gloss.strip():
            raise ValueError(f"Incomplete TBESH row {number}")
        alias = normalize(match[0])
        if alias in aliases and aliases[alias] != identity:
            raise ValueError(f"Conflicting lexical mapping for {alias}")
        aliases[alias] = identity
        if key(identity)[0] >= 9000:
            excluded += 1
            continue
        groups[identity].append({"lemma": plain(lemma), "transliteration": plain(transliteration),
                                 "gloss": plain(gloss), "morph": morph.strip(),
                                 "dStrong": alias, "uStrong": unified.strip()})
    return groups, aliases, excluded


def count_rows(rows, aliases, overrides=None):
    overrides = overrides or {}
    numeric_targets = defaultdict(set)
    for target in aliases.values():
        numeric_targets[key(target)[0]].add(target)
    counts = Counter()
    examples = defaultdict(list)
    diagnostics = {"wordRows": 0, "excludedLxxAdditionRows": 0, "emptyQereRows": [],
                   "excludedAffixRoots": 0, "multiwordContinuationsSkipped": 0,
                   "unresolvedContinuationMarkers": [], "unmappedTags": Counter(), "fallbackMappings": {}}
    seen = set()
    books = set()
    pending = set()
    previous_verse = None
    for reference, tags, grammar in rows:
        match = REF.fullmatch(reference)
        if not match or reference.split("=", 1)[0] in seen:
            raise ValueError(f"Invalid or duplicate word reference: {reference}")
        seen.add(reference.split("=", 1)[0])
        book, chapter, verse, word, text_type = match.groups()
        books.add(book)
        ref = f"{book} {int(chapter)}:{int(verse)}"
        diagnostics["wordRows"] += 1
        if text_type.startswith("X"):
            diagnostics["excludedLxxAdditionRows"] += 1
            continue
        roots = ROOT_TAG.findall(tags)
        if not roots:
            if tags.strip() or grammar.strip() or not text_type.startswith("Q"):
                raise ValueError(f"Missing or malformed lexical roots: {reference}: {tags}")
            diagnostics["emptyQereRows"].append(reference)
            continue
        root_ids = {normalize(tag) for tag, continuation in roots}
        skipped = pending & root_ids if ref == previous_verse else set()
        if pending - skipped:
            diagnostics["unresolvedContinuationMarkers"].append({"nextReference": reference, "tags": sorted(pending - skipped)})
        diagnostics["multiwordContinuationsSkipped"] += len(skipped)
        # Distinct roots within a single word can map to the same lexical ID.
        lexical_ids = set()
        for tag in root_ids - skipped:
            identity = aliases.get(tag)
            if not identity:
                candidates = numeric_targets[key(tag)[0]]
                if tag in overrides:
                    identity = overrides[tag]["target"]
                    if identity not in candidates:
                        raise ValueError(f"Invalid mapping override for {tag}")
                    reason = overrides[tag]["reason"]
                elif len(candidates) == 1:
                    identity = next(iter(candidates))
                    reason = "dStrong absent from lexicon; numeric Strong's base has exactly one eStrong entry"
                else:
                    reason = None
                if identity:
                    entry = diagnostics["fallbackMappings"].setdefault(tag, {"target": identity, "reason": reason, "occurrences": 0})
                    entry["occurrences"] += 1
            if not identity:
                diagnostics["unmappedTags"][tag] += 1
            elif key(identity)[0] >= 9000:
                diagnostics["excludedAffixRoots"] += 1
            else:
                lexical_ids.add(identity)
        for identity in sorted(lexical_ids, key=key):
            counts[identity] += 1
            if len(examples[identity]) < 3 and ref not in examples[identity]:
                examples[identity].append(ref)
        pending = {normalize(tag) for tag, continuation in roots if continuation}
        previous_verse = ref
    if pending:
        diagnostics["unresolvedContinuationMarkers"].append({"nextReference": "end of source", "tags": sorted(pending)})
    diagnostics["books"] = sorted(books)
    diagnostics["unmappedTags"] = dict(sorted(diagnostics["unmappedTags"].items(), key=lambda item: key(item[0])))
    return counts, examples, diagnostics


def fingerprint(path):
    content = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest()}


def build():
    lock = json.loads((SOURCE / "sources.lock.json").read_bytes())
    inputs = []
    rows = []
    groups = aliases = None
    excluded = 0
    for source in lock["sources"]:
        path = ROOT / source["path"]
        info = fingerprint(path)
        if info["sha256"] != source["sha256"]:
            raise ValueError(f"Pinned projection hash mismatch: {path}")
        inputs.append(info)
        lines = path.read_text(encoding="utf-8").splitlines()[1:]
        if source["kind"] == "tbesh":
            groups, aliases, excluded = lexical_rows(lines)
        else:
            for line in lines:
                fields = line.split("\t")
                if len(fields) != 3:
                    raise ValueError(f"Invalid TAHOT projection: {path}")
                rows.append(fields)
    if not groups or not aliases:
        raise ValueError("Missing lexicon")
    overrides_path = SOURCE / "mapping-overrides.json"
    counts, examples, diagnostics = count_rows(rows, aliases, json.loads(overrides_path.read_bytes()))
    if len(diagnostics["books"]) != 39:
        raise ValueError("Expected all 39 Old Testament books")
    if diagnostics["unmappedTags"]:
        raise ValueError(f"Unmapped TAHOT tags: {diagnostics['unmappedTags']}")
    terms = []
    for identity in sorted(groups, key=key):
        entries = groups[identity]
        primary = entries[0]
        languages = sorted({"aramaic" if e["morph"].startswith("A:") else "hebrew" if e["morph"].startswith("H:") else "proper-name" for e in entries})
        terms.append({
            "id": identity, "language": "hebrew", "biblicalLanguages": languages,
            "lemma": primary["lemma"], "transliteration": primary["transliteration"],
            "glosses": list(dict.fromkeys(e["gloss"] for e in entries)),
            "partOfSpeech": pos(primary["morph"]), "frequency": counts[identity],
            "frequencies": {"tahot": counts[identity]}, "sourceRefs": examples[identity],
            "exampleRefs": examples[identity], "morphologyHints": list(dict.fromkeys(e["morph"] for e in entries)),
            "alternateLemmas": list(dict.fromkeys(e["lemma"] for e in entries if e["lemma"] != primary["lemma"])),
            "source": {"name": "STEP Bible TBESH (short glosses) and TAHOT", "url": lock["repository"],
                       "revision": lock["commit"], "license": lock["license"], "licenseUrl": lock["licenseUrl"],
                       "attribution": lock["attribution"], "dStrongIds": [e["dStrong"] for e in entries],
                       "frequencySource": {"corpus": "tahot", "policy": POLICY}},
        })
    report = {"policy": POLICY, "termCount": len(terms), "termsWithFrequency": len(counts),
              "occurrences": sum(counts.values()), "excludedNonlexicalLexiconRows": excluded,
              "termsWithoutOccurrences": [t["id"] for t in terms if t["frequency"] == 0],
              "diagnostics": diagnostics}
    outputs = {"hebrew.json": encode(terms), "hebrew-frequency-report.json": encode(report)}
    manifest = {"generator": "tools/build_hebrew.py", "schemaVersion": 1,
                "upstream": lock, "sources": inputs,
                "scripts": [fingerprint(ROOT / name) for name in ["tools/build_hebrew.py", "tools/prepare_stepbible.py"]],
                "sourceLock": fingerprint(SOURCE / "sources.lock.json"), "mappingOverrides": fingerprint(overrides_path),
                "counts": {k: report[k] for k in ["termCount", "termsWithFrequency", "occurrences"]},
                "changes": lock["changes"] + " " + POLICY + " Unicode whitespace normalized; gloss HTML entities decoded; senses merged by eStrong, alternate forms retained. No long definitions imported.",
                "outputs": [{"path": "docs/data/generated/" + name, "sha256": hashlib.sha256(data).hexdigest()} for name, data in outputs.items()]}
    outputs["hebrew-manifest.json"] = encode(manifest)
    return outputs, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs, manifest = build()
    directory = ROOT / "docs/data/generated"
    if args.check:
        bad = [name for name, data in outputs.items() if not (directory / name).exists() or (directory / name).read_bytes() != data]
        if bad:
            parser.exit(1, "Hebrew reproducibility check failed: " + ", ".join(bad) + "\n")
        print("Hebrew outputs and source/script hashes verified byte-for-byte.")
    else:
        for name, data in outputs.items():
            (directory / name).write_bytes(data)
        print(json.dumps(manifest["counts"]))


if __name__ == "__main__":
    main()
