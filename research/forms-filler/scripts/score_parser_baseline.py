#!/usr/bin/env python3
"""Map parser facts onto gold field ids and score them.

The report is parser-only. Empty gold fields that the parser also leaves
empty count as abstentions. Occupation is expected to be missed: it is only
in a sentence, which this parser does not read.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = {
    "harbour-membership": {"name": "full_name", "nric": "nric", "dob": "dob", "phone": "mobile", "email": "email", "address": "address"},
    "harbour-payslip": {"name": "employee", "nric": "nric", "company": "employer"},
    "northwind-visitor": {"firstName": "given", "lastName": "family", "nric": "fin", "dob": "birth", "phone": "phone", "email": "email"},
    "cedar-clinic": {"name": "patient", "nric": "identity", "address": "address", "phone": "contact", "sex": "sex"},
}


def main():
    gold = {}
    for name in ("train.jsonl", "dev.jsonl", "test.jsonl"):
        for line in (ROOT / "data" / name).read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                gold[row["id"]] = row
    preds = []
    for line in (ROOT / "results" / "parser-only" / "from-text.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        raw = json.loads(line)
        row = gold[raw["id"]]
        fields = {key: "" for key in row["gold"]}
        for fact, field in BRIDGE[row["template_id"]].items():
            if raw["facts"].get(fact):
                fields[field] = raw["facts"][fact]
        preds.append({"id": raw["id"], "fields": fields})
    (ROOT / "results" / "parser-only" / "mapped-predictions.json").write_text(json.dumps(preds, indent=2) + "\n", encoding="utf-8")
    print("wrote mapped predictions", len(preds))


if __name__ == "__main__":
    main()
