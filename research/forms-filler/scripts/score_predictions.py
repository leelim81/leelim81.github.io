#!/usr/bin/env python3
"""Score reference-to-field predictions. This does not run a model."""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def norm(value):
    text = str(value or "").strip().lower()
    text = text.replace("#", "")
    text = re.sub(r"\s+", " ", text)
    digits = re.sub(r"\D", "", text)
    if re.fullmatch(r"\+?\d[\d\s-]{6,}", str(value or "").strip()):
        return digits
    if re.fullmatch(r"\d{6}", digits) and len(text) <= 8:
        return digits
    return text


def score(gold_rows, pred_by_id):
    correct = wrong = missed = abstain = 0
    cases = []
    for row in gold_rows:
        pred = pred_by_id.get(row["id"], {})
        fields = pred.get("fields", pred)
        for key, expected in row["gold"].items():
            got = fields.get(key, "")
            if expected == "" and str(got).strip() == "":
                abstain += 1
                kind = "abstain"
            elif expected == "":
                wrong += 1
                kind = "wrong"
            elif str(got).strip() == "":
                missed += 1
                kind = "missed"
            elif norm(got) == norm(expected):
                correct += 1
                kind = "correct"
            else:
                wrong += 1
                kind = "wrong"
            cases.append({"id": row["id"], "field": key, "kind": kind})
    decided = correct + wrong + missed
    return {
        "correct": correct,
        "wrong": wrong,
        "missed": missed,
        "abstain_ok": abstain,
        "wrong_fill_rate": (wrong / decided) if decided else None,
        "cases": cases,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", default="")
    parser.add_argument("--pred", default="")
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()
    if args.smoke:
        gold = json.loads((ROOT / "results" / "scorer-smoke" / "gold.json").read_text(encoding="utf-8"))
        pred = json.loads((ROOT / "results" / "scorer-smoke" / "predictions.json").read_text(encoding="utf-8"))
    else:
        if not args.gold or not args.pred:
            print("pass --gold and --pred, or --smoke", file=sys.stderr)
            sys.exit(2)
        gold = [json.loads(line) for line in Path(args.gold).read_text(encoding="utf-8").splitlines() if line.strip()]
        pred = json.loads(Path(args.pred).read_text(encoding="utf-8"))
    pred_by_id = {item["id"]: item for item in pred}
    report = score(gold, pred_by_id)
    if args.smoke:
        report.pop("cases")
        expected = {"correct": 1, "wrong": 1, "missed": 1, "abstain_ok": 1}
        for key, value in expected.items():
            if report[key] != value:
                print(json.dumps(report))
                sys.exit(1)
        report["smoke"] = "passed"
        report["note"] = "Scorer self-check only. Not a model baseline."
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
