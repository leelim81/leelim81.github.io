#!/usr/bin/env python3
"""Check the frozen split, checksums, and that private filenames are absent."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANNED_NAMES = ("lee-nric", "nric-ocr", "lee-form", "funsd", "xfund", "formgym")


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def load_jsonl(name):
    rows = []
    for line in (ROOT / "data" / name).read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def main():
    checksums = (ROOT / "data" / "CHECKSUMS.sha256").read_text(encoding="utf-8").splitlines()
    for line in checksums:
        digest, rel = line.split("  ", 1)
        path = ROOT / rel
        if not path.is_file():
            fail("missing " + rel)
        got = hashlib.sha256(path.read_bytes()).hexdigest()
        if got != digest:
            fail("checksum mismatch " + rel)
    train, dev, test = load_jsonl("train.jsonl"), load_jsonl("dev.jsonl"), load_jsonl("test.jsonl")
    if not train or not dev or not test:
        fail("a split is empty")
    def ids(rows, key):
        return {row[key] for row in rows}
    for left_name, left in (("train", train), ("dev", dev)):
        for right_name, right in (("dev", dev), ("test", test)):
            if left_name == right_name:
                continue
            shared_people = ids(left, "persona_id") & ids(right, "persona_id")
            shared_templates = ids(left, "template_id") & ids(right, "template_id")
            shared_sources = ids(left, "source") & ids(right, "source")
            if shared_people or shared_templates or shared_sources:
                fail(left_name + " overlaps " + right_name)
    if ids(train, "persona_id") & ids(test, "persona_id"):
        fail("train/test persona overlap")
    empty = 0
    filled = 0
    for row in test:
        for value in row["gold"].values():
            if value == "":
                empty += 1
            else:
                filled += 1
        if set(row["gold"]) != {field["id"] for field in row["fields"]}:
            fail("gold keys differ from fields in " + row["id"])
        if "production_prompt" not in row or "production_schema" not in row:
            fail("missing production prompt " + row["id"])
    if empty / (empty + filled) < 0.3:
        fail("test abstention rate is below 30 percent")
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        lowered = path.name.lower()
        if any(token in lowered for token in BANNED_NAMES):
            fail("banned filename " + path.name)
    print(json.dumps({
        "train": len(train),
        "dev": len(dev),
        "test": len(test),
        "test_empty_gold_fields": empty,
        "test_filled_gold_fields": filled,
        "checksums": len(checksums),
    }))


if __name__ == "__main__":
    main()
