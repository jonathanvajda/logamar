#!/usr/bin/env python3
"""Merge one named corpus into Logamar terms by Strong's ID, with an audit report."""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from pathlib import Path

from count_strongs import id_key, normalize_id, read_json, source_info, write_json


def merge(terms, dataset, corpus):
    if dataset.get("schemaVersion") != 1:
        raise ValueError("Unsupported frequency schema")
    data = dataset["corpora"][corpus]
    prefix = "H" if corpus == "kjv_ot" else "G"
    language = "hebrew" if prefix == "H" else "greek"
    counts = data["counts"]
    for key, count in counts.items():
        if normalize_id(key) != key or not key.startswith(prefix) or type(count) is not int or count < 0:
            raise ValueError(f"Invalid frequency entry: {key}: {count}")
    if sum(counts.values()) != data["occurrences"] or len(counts) != data["uniqueStrongsIds"]:
        raise ValueError("Frequency summary does not match counts")
    if not isinstance(terms, list) or not terms:
        raise ValueError("Expected nonempty Logamar term array")
    merged = deepcopy(terms)
    ids = Counter()
    for term in merged:
        key = term["id"]
        if normalize_id(key) != key or not key.startswith(prefix) or term["language"] != language:
            raise ValueError(f"Corpus {corpus} does not match term {key}")
        ids[key] += 1
        count = counts.get(key, 0)
        term["frequency"] = count
        term.setdefault("frequencies", {})[corpus] = count
        if corpus == "tr_nt":
            term["frequencies"]["gnt"] = count
        refs = data["exampleRefs"].get(key, [])[:3]
        term["sourceRefs"] = refs
        term["exampleRefs"] = refs
        term.setdefault("source", {})["frequencySource"] = {
            "corpus": corpus, "name": data["name"], "unit": data["unit"], "policy": data["policy"],
        }
    missing = sorted(counts.keys() - ids.keys(), key=id_key)
    report = {
        "corpus": corpus, "termRecords": len(terms), "uniqueTermIds": len(ids),
        "duplicateTermIds": {key: n for key, n in ids.items() if n > 1},
        "duplicatePolicy": "Preserve existing rows; assign the same total to each duplicate; never sum duplicated totals",
        "matchedUniqueIds": len(ids.keys() & counts.keys()),
        "termsWithoutOccurrences": sorted(ids.keys() - counts.keys(), key=id_key),
        "unmatchedFrequencyIds": {key: counts[key] for key in missing},
        "unmatchedOccurrences": sum(counts[key] for key in missing),
        "matchedOccurrences": sum(counts[key] for key in ids.keys() & counts.keys()),
    }
    return merged, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terms", type=Path, default=Path("docs/data/generated/greek.json"))
    parser.add_argument("--frequencies", type=Path, default=Path("docs/data/generated/strongs-frequencies.json"))
    parser.add_argument("--corpus", choices=["tr_nt", "kjv_nt", "kjv_ot"], default="tr_nt")
    parser.add_argument("--output", type=Path, default=Path("docs/data/generated/greek-with-frequencies.json"))
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()
    report_path = args.report or args.output.with_suffix(".report.json")
    paths = [args.terms, args.frequencies, args.output, report_path]
    if len({p.resolve() for p in paths}) != len(paths):
        parser.error("Inputs, output, and report must be distinct paths")
    terms, report = merge(read_json(args.terms), read_json(args.frequencies), args.corpus)
    report["sources"] = [source_info(args.terms), source_info(args.frequencies)]
    write_json(args.output, terms)
    write_json(report_path, report)
    print(f"Merged {report['matchedUniqueIds']:,} IDs; {len(report['unmatchedFrequencyIds']):,} unmatched frequency IDs; {len(report['duplicateTermIds'])} duplicate term IDs (preserved).")


if __name__ == "__main__":
    main()
