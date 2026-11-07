#!/usr/bin/env python3
"""Fail if a fresh parser score differs from the committed parser-only report."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score_predictions import score

ROOT = Path(__file__).resolve().parents[1]


def fresh():
    gold = []
    for name in ("train.jsonl", "dev.jsonl", "test.jsonl"):
        for line in (ROOT / "data" / name).read_text(encoding="utf-8").splitlines():
            if line.strip():
                gold.append(json.loads(line))
    pred = {item["id"]: item for item in json.loads((ROOT / "results" / "parser-only" / "mapped-predictions.json").read_text(encoding="utf-8"))}
    out = {}
    for split in ("train", "dev", "test"):
        report = score([row for row in gold if row["split"] == split], pred)
        report.pop("cases")
        out[split] = report
    return out


def main():
    committed = json.loads((ROOT / "results" / "parser-only" / "score.json").read_text(encoding="utf-8"))
    if committed.get("model") is not None:
        sys.exit("parser score file must keep model null")
    got = fresh()
    if got != committed["by_split"]:
        print(json.dumps({"committed": committed["by_split"], "fresh": got}, indent=2))
        sys.exit(1)
    print("parser-only score matches the committed report")


if __name__ == "__main__":
    main()
