#!/usr/bin/env python3
"""Rebuild canonical Greek data from local lexical/TR sources, or verify it."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tempfile

from convert_openscriptures import convert_greek_word_list
from count_strongs import count_tr, read_json
from merge_strongs_frequencies import merge

ROOT = Path(__file__).resolve().parents[1]
LEXICON = "openscriptures/GreekResources/GreekWordList.js"
TR = "src/trparsed.json"
STUDY_FORMS = "src/greek-study-forms.json"
SCRIPTS = ["tools/build_greek.py", "tools/convert_openscriptures.py",
           "tools/count_strongs.py", "tools/merge_strongs_frequencies.py"]


def encode(value):
    # Explicit bytes avoid platform-dependent CRLF conversion.
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def fingerprint(path):
    content = (ROOT / path).read_bytes()
    return {"path": path, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}


def add_study_forms(terms, mapping):
    by_id = {term["id"]: term for term in terms}
    parents = {}
    for parent, children in mapping["groups"].items():
        if parent not in by_id:
            raise ValueError(f"Unknown Greek headword: {parent}")
        for child in children:
            if child not in by_id or child in parents or child == parent or child in mapping["groups"]:
                raise ValueError(f"Invalid or conflicting Greek form: {child}")
            parents[child] = parent
    for term in terms:
        parent = parents.get(term["id"], term["id"])
        term["lemmaId"] = parent
        term["isInflected"] = parent != term["id"]
        term["dictionaryLemma"] = by_id[parent]["lemma"]
        if term["isInflected"] and term["partOfSpeech"] == "unknown":
            term["partOfSpeech"] = by_id[parent]["partOfSpeech"]
    for term in terms:
        group = [term["id"], *mapping["groups"].get(term["id"], [])]
        term["lemmaFrequency"] = sum(by_id[identity]["frequency"] for identity in group)
    return len(parents)


def build():
    with tempfile.TemporaryDirectory(prefix="logamar-greek-") as temporary:
        destination = Path(temporary)
        convert_greek_word_list(ROOT / LEXICON, destination)
        base = read_json(destination / "greek.json")
        lexical_counts = read_json(destination / "data-manifest.json")["counts"]
    corpus = count_tr(ROOT / TR)
    # Paths in published provenance must not depend on checkout location.
    corpus["sources"] = [fingerprint(TR)]
    terms, report = merge(base, {"schemaVersion": 1, "corpora": {"tr_nt": corpus}}, "tr_nt")
    if report["unmatchedFrequencyIds"]:
        raise ValueError("TR IDs lack lexical entries; review mappings before publishing")
    if len({term["id"] for term in terms}) != len(terms):
        raise ValueError("Canonical Greek data must have unique IDs")
    study_mapping = read_json(ROOT / STUDY_FORMS)
    form_count = add_study_forms(terms, study_mapping)
    report["studyForms"] = {"policy": study_mapping["policy"], "groups": study_mapping["groups"], "inflectedEntries": form_count}
    report["sources"] = [fingerprint(LEXICON), fingerprint(TR), fingerprint(STUDY_FORMS)]
    outputs = {"greek.json": encode(terms), "greek-frequency-report.json": encode(report)}
    manifest = {
        "generator": "tools/build_greek.py",
        "schemaVersion": 1,
        "rebuildCommand": "python tools/build_greek.py",
        "verifyCommand": "python tools/build_greek.py --check",
        "sources": [fingerprint(LEXICON), fingerprint(TR), fingerprint(STUDY_FORMS)],
        "studyFormsPolicy": study_mapping["policy"],
        "scripts": [fingerprint(path) for path in SCRIPTS],
        "counts": {**lexical_counts, "trOccurrences": corpus["occurrences"],
                   "trTermsWithFrequency": corpus["uniqueStrongsIds"],
                   "unmatchedTrOccurrences": report["unmatchedOccurrences"], "inflectedStudyEntries": form_count,
                   "dictionaryStudyTerms": len(terms) - form_count},
        "frequencyProvenance": corpus,
        "outputs": [{"path": f"docs/data/generated/{name}", "bytes": len(content),
                     "sha256": hashlib.sha256(content).hexdigest()} for name, content in outputs.items()],
    }
    outputs["data-manifest.json"] = encode(manifest)
    return outputs, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Rebuild in memory; fail on any difference without changing files")
    args = parser.parse_args()
    outputs, manifest = build()
    directory = ROOT / "docs/data/generated"
    if args.check:
        mismatches = [name for name, content in outputs.items()
                      if not (directory / name).is_file() or (directory / name).read_bytes() != content]
        if mismatches:
            parser.exit(1, "Reproducibility check failed: " + ", ".join(mismatches) + "\nRun python tools/build_greek.py and review the changes.\n")
        print("Verified: all Greek outputs and source/script hashes match a fresh rebuild byte-for-byte.")
    else:
        directory.mkdir(parents=True, exist_ok=True)
        for name, content in outputs.items():
            (directory / name).write_bytes(content)
        print(f"Generated {manifest['counts']['greekTerms']:,} unique Greek entries with {manifest['counts']['trOccurrences']:,} TR occurrences; no unmatched TR IDs.")


if __name__ == "__main__":
    main()
