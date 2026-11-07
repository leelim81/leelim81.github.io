#!/usr/bin/env python3
"""Score v2 predictions. Official path does not repair JSON.

Predictions file: JSONL with id, raw, and pred (object or null).
Gold file: data/dev.jsonl or data/test.jsonl from this bundle.
"""
import argparse
import json
import re
import sys
from pathlib import Path


def norm(value):
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.upper() in ("NULL", "NONE", "N/A", "-"):
        return None
    text = text.upper()
    match = re.fullmatch(r"(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})", text)
    if match:
        return f"{int(match[1]):02d}/{int(match[2]):02d}/{match[3]}"
    digits = re.sub(r"\D", "", text)
    if re.fullmatch(r"[+()\d \-]+", text) and len(digits) >= 8:
        return digits[-8:]
    text = text.lstrip("#").replace("SINGAPORE CITIZEN", "SC").replace("PERMANENT RESIDENT", "PR")
    return re.sub(r"\s+", " ", text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", required=True)
    parser.add_argument("--pred", required=True)
    args = parser.parse_args()
    gold = {row["id"]: row for row in map(json.loads, Path(args.gold).read_text().splitlines()) if row}
    preds = [json.loads(line) for line in Path(args.pred).read_text().splitlines() if line.strip()]
    tp = wrong = spurious = missed = empty_ok = 0
    parse_fail = 0
    for row in preds:
        gold_row = gold.get(row["id"])
        if gold_row is None:
            print("unknown id " + row["id"], file=sys.stderr)
            sys.exit(1)
        pred = row.get("pred")
        if pred is None:
            parse_fail += 1
            pred = {}
        if not isinstance(pred, dict):
            parse_fail += 1
            pred = {}
        for key, expected in gold_row["gold"].items():
            got = norm(pred.get(key))
            want = norm(expected)
            if want is None and got is None:
                empty_ok += 1
            elif want is None:
                spurious += 1
            elif got is None:
                missed += 1
            elif got == want:
                tp += 1
            else:
                wrong += 1
    filled = tp + wrong + spurious
    supported = tp + wrong + missed
    print(json.dumps({
        "forms": len(preds),
        "parse_fail_forms": parse_fail,
        "parse_success_forms": len(preds) - parse_fail,
        "matched": tp,
        "value_mismatch": wrong,
        "spurious_unsupported": spurious,
        "missed": missed,
        "correct_empty": empty_ok,
        "filled_fields": filled,
        "wrong_fill_rate_among_filled": None if filled == 0 else round((wrong + spurious) / filled, 3),
        "recall_among_supported": None if supported == 0 else round(tp / supported, 3),
        "note": "wrong_fill_rate divides by filled fields only. Parse failures are empty answers and are not a success."
    }, indent=2))


if __name__ == "__main__":
    main()
