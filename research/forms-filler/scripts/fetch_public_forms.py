#!/usr/bin/env python3
"""Record public blank-form URLs and hashes. Does not vendor the files.

FUNSD, XFUND, and FormGym are refused. A public download URL is not
permission to commit the PDF. This script never writes into the repository.
"""
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "public-forms-not-vendored.json"
REFUSED = ("funsd", "xfund", "formgym", "formfactory")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Download into --dest, outside the repo by default")
    parser.add_argument("--dest", default="")
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    print(json.dumps({"entries": len(catalog["forms"]), "vendored": False, "excluded": catalog["excluded"]}, indent=2))
    if not args.fetch:
        print("No files downloaded. Pass --fetch and --dest to save copies outside the repository.")
        return
    if not args.dest:
        print("--dest is required", file=sys.stderr)
        sys.exit(2)
    dest = Path(args.dest).resolve()
    if ROOT in dest.parents or dest == ROOT:
        print("refusing to write fetched forms inside the repository", file=sys.stderr)
        sys.exit(2)
    dest.mkdir(parents=True, exist_ok=True)
    for form in catalog["forms"]:
        lowered = (form["id"] + form["url"]).lower()
        if any(token in lowered for token in REFUSED):
            print("refusing " + form["id"], file=sys.stderr)
            sys.exit(2)
        request = urllib.request.Request(form["url"], headers={"User-Agent": "forms-filler-research"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        digest = hashlib.sha256(data).hexdigest()
        if digest != form["sha256"]:
            print(form["id"] + " hash " + digest + " != " + form["sha256"], file=sys.stderr)
            sys.exit(1)
        (dest / (form["id"] + ".pdf")).write_bytes(data)
        print("saved", form["id"], digest)


if __name__ == "__main__":
    main()
