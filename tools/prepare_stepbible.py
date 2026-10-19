#!/usr/bin/env python3
"""Fetch pinned STEPBible sources and retain only the fields Logamar uses.

The TBESH Meaning column is deliberately never written to the repository.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "src/stepbible"


def projection(content, kind):
    records = []
    for line in content.decode("utf-8-sig").splitlines():
        if kind == "tbesh" and re.match(r"^H\d", line):
            fields = line.split("\t")
            if len(fields) != 8:
                raise ValueError("Unexpected TBESH column count")
            records.append("\t".join(fields[:7]))
        elif kind == "tahot" and re.match(r"^[1-3]?[A-Za-z]+\.\d", line):
            fields = line.split("\t")
            if len(fields) < 12:
                raise ValueError("Unexpected TAHOT column count")
            records.append("\t".join([fields[0], fields[4], fields[5]]))
    if not records:
        raise ValueError("No source records found")
    header = "eStrong\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss" if kind == "tbesh" else "Reference\tdStrongs\tGrammar"
    return (header + "\n" + "\n".join(records) + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-directory", type=Path, help="Read original downloaded files locally instead of fetching")
    args = parser.parse_args()
    lock = json.loads((DIRECTORY / "sources.lock.json").read_bytes())
    outputs = {}
    for source in lock["sources"]:
        if args.from_directory:
            content = (args.from_directory / Path(source["upstreamPath"]).name).read_bytes()
        else:
            url = f"https://raw.githubusercontent.com/STEPBible/STEPBible-Data/{lock['commit']}/{quote(source['upstreamPath'])}"
            with urlopen(url, timeout=60) as response:
                content = response.read()
        if hashlib.sha256(content).hexdigest() != source["upstreamSha256"]:
            raise ValueError(f"Upstream source hash mismatch: {source['upstreamPath']}")
        slim = projection(content, source["kind"])
        if hashlib.sha256(slim).hexdigest() != source["sha256"]:
            raise ValueError(f"Projection hash mismatch: {source['path']}")
        outputs[ROOT / source["path"]] = slim
    for path, content in outputs.items():
        path.write_bytes(content)
    print(f"Prepared {len(outputs)} pinned source projections; long definitions excluded.")


if __name__ == "__main__":
    main()
