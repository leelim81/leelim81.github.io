#!/usr/bin/env python3
"""Reproduce the partial v3 dev scores against frozen data/v3.

Runs the trial's score3.py. Does not read test gold values. Does not
rewrite predictions, fixtures, or the production guard.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB = HERE.parents[1]
REPO = HERE.parents[4]
GOLD = LAB / "data" / "v3" / "dev.jsonl"
TEST = LAB / "data" / "v3" / "test.jsonl"
TRAIN = LAB / "data" / "v3" / "train.jsonl"
V2_TRAIN = LAB / "data" / "v2" / "train.jsonl"
TOOLS = REPO / "tools" / "forms-filler"

V3 = {
    "train": "11e2ac69475f970b94595639a584656b55a4db5eff17957b0c07d83b3539a403",
    "dev": "6a703d22ee3ebd8e39fa868a4cbb133a1f6e60733f159c0d11556c3e975906f9",
    "test": "92936e65321e904613d08a309d9f76f00dd219bdd9079347da3983709799978c",
}
V2_TRAIN_SHA = "86c42a7f06cf09d4cc5544a26751c9652ec25ffa35d476e8f5a1d0953b7f2d4e"
GUARD = {
    "facts.js": "02fc56528418a16eba5096b6086d8f784a7bea722ebfdcda2ec7bd936eb6f9f7",
    "llm.js": "d8622f1d7b8821383d6715fd51e0b7dec37e99e446b0aff1df67590e8bc6e031",
    "sanitize.js": "48af4e45223764f24d94cd73a60026729f48f22ec986e2742a6b0fef0f602d22",
    "app.js": "8bc27de76077aca133788a99e75955a4fac9059709314f66cd654e26d4dfe19f",
}
# After the 9c2d5b8 postfilter. Order is 1.5B, 0.6B Q8, 0.5B.
POST = {
    "v3_qwen25-1.5b-q4km_dev_schemareq.postfilter.jsonl": {
        "forms": 180, "parse_fail": 0, "matched": 344, "wrong_value": 31,
        "spurious_unsupported": 102, "spurious_wrong_person_dob": 0, "missed": 135,
        "correct_empty": 738, "wrong_fill_rate": 0.279, "recall": 0.675,
    },
    "v3_qwen3-0.6b-q8_dev_schemareq.postfilter.jsonl": {
        "forms": 180, "parse_fail": 0, "matched": 216, "wrong_value": 29,
        "spurious_unsupported": 15, "spurious_wrong_person_dob": 0, "missed": 265,
        "correct_empty": 825, "wrong_fill_rate": 0.169, "recall": 0.424,
    },
    "v3_qwen25-0.5b-q4km_dev_schemareq.postfilter.jsonl": {
        "forms": 180, "parse_fail": 0, "matched": 264, "wrong_value": 48,
        "spurious_unsupported": 113, "spurious_wrong_person_dob": 0, "missed": 198,
        "correct_empty": 727, "wrong_fill_rate": 0.379, "recall": 0.518,
    },
}
RAW_PARSE = {
    "v3_qwen25-1.5b-q4km_dev_schemareq.jsonl": (24, 31),
    "v3_qwen3-0.6b-q8_dev_schemareq.jsonl": (58, 64),
    "v3_qwen25-0.5b-q4km_dev_schemareq.jsonl": (30, 34),
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def ids(path):
    return {json.loads(line)["id"] for line in path.read_text().splitlines() if line.strip()}


def score(pred):
    work = Path(tempfile.mkdtemp(prefix="v3trial-"))
    bundle = work / "v2" / "v2-bundle" / "scripts"
    bundle.mkdir(parents=True)
    shutil.copy(HERE / "scripts" / "score_v2_normalizer.py", bundle / "score_v2.py")
    shutil.copy(HERE / "scripts" / "score3.py", work / "score3.py")
    proc = subprocess.run(
        [sys.executable, "score3.py", str(GOLD), str(pred)],
        cwd=work, capture_output=True, text=True, check=False,
    )
    shutil.rmtree(work)
    if proc.returncode != 0:
        fail(proc.stderr or proc.stdout)
    return json.loads(proc.stdout)


def main():
    counts = {"train": 480, "dev": 180, "test": 180}
    for split, digest in V3.items():
        path = {"train": TRAIN, "dev": GOLD, "test": TEST}[split]
        if sha256(path) != digest:
            fail("v3 hash " + split)
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        if len(rows) != counts[split]:
            fail("v3 count " + split)
        if sum(1 for row in rows if row["model_fields"]) != counts[split]:
            fail("v3 model calls " + split)
    if sha256(V2_TRAIN) != V2_TRAIN_SHA:
        fail("v2 train hash")
    if sum(1 for line in V2_TRAIN.read_text().splitlines() if line.strip()) != 360:
        fail("v2 train is not 360")
    for name, digest in GUARD.items():
        if sha256(TOOLS / name) != digest:
            fail("guard hash " + name)
    dev_ids = ids(GOLD)
    test_ids = ids(TEST)
    if dev_ids & test_ids:
        fail("dev and test ids overlap")
    for name, expect in POST.items():
        got = score(HERE / "results" / name)
        if got != expect:
            fail(name + " " + json.dumps(got))
        pred_ids = ids(HERE / "results" / name)
        if pred_ids != dev_ids:
            fail(name + " is not the full dev split")
        if pred_ids & test_ids:
            fail(name + " includes a test id")
    for name, (parse_fail, truncated) in RAW_PARSE.items():
        rows = [json.loads(line) for line in (HERE / "results" / name).read_text().splitlines() if line.strip()]
        if sum(1 for row in rows if not isinstance(row.get("pred"), dict)) != parse_fail:
            fail("raw parse " + name)
        if sum(1 for row in rows if row.get("finish") == "length") != truncated:
            fail("truncation " + name)
        if ids(HERE / "results" / name) & test_ids:
            fail(name + " includes a test id")
    print(json.dumps({
        "v3": "480/180/180",
        "v2_train_left_frozen": 360,
        "guard": "9c2d5b8",
        "dev_postfilter_wrong_person_dob": 0,
        "test_scored": False,
        "check": "passed",
    }))


if __name__ == "__main__":
    main()
