#!/usr/bin/env python3
"""Rescore the published v3 trial. Does not read beyond id equality on gold files.

Gold values are the frozen data/v3 files. Test was scored once; this script
only repeats that score. It does not train and it does not load weights.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB = HERE.parents[1]
REPO = HERE.parents[4]
DATA = LAB / "data" / "v3"
TOOLS = REPO / "tools" / "forms-filler"
SCORE = HERE / "scripts" / "score3.py"

V3 = {
    "train": ("11e2ac69475f970b94595639a584656b55a4db5eff17957b0c07d83b3539a403", 480),
    "dev": ("6a703d22ee3ebd8e39fa868a4cbb133a1f6e60733f159c0d11556c3e975906f9", 180),
    "test": ("92936e65321e904613d08a309d9f76f00dd219bdd9079347da3983709799978c", 180),
}
GUARD = {
    "facts.js": "02fc56528418a16eba5096b6086d8f784a7bea722ebfdcda2ec7bd936eb6f9f7",
    "llm.js": "d8622f1d7b8821383d6715fd51e0b7dec37e99e446b0aff1df67590e8bc6e031",
    "sanitize.js": "48af4e45223764f24d94cd73a60026729f48f22ec986e2742a6b0fef0f602d22",
    "app.js": "8bc27de76077aca133788a99e75955a4fac9059709314f66cd654e26d4dfe19f",
}
SYNTHETIC_TEST = "5af8e8e2cd3a017ad9f30825932ddd69b919b0302f6afc4dc733abeaf60ab2b3"
PRIVATE_TEST_RECORD = "39ab2a6a85be943c00196ae6820062dc2241821dc1c5174f8674ec76e46db08c"

# Five comparators, one look at test. Values are the score3 dictionaries.
TEST = {
    "v3_qwen25-1.5b-q4km_test_schemareq": {
        "raw": {"forms": 180, "parse_fail": 0, "matched": 358, "wrong_value": 50, "spurious_unsupported": 111, "spurious_wrong_person_dob": 30, "missed": 12, "correct_empty": 279, "wrong_fill_rate": 0.348, "recall": 0.852},
        "post": {"forms": 180, "parse_fail": 0, "matched": 330, "wrong_value": 43, "spurious_unsupported": 10, "spurious_wrong_person_dob": 0, "missed": 47, "correct_empty": 410, "wrong_fill_rate": 0.138, "recall": 0.786},
    },
    "v3_own-v3lora05-q4km_test_schemareq": {
        "raw": {"forms": 180, "parse_fail": 0, "matched": 251, "wrong_value": 26, "spurious_unsupported": 43, "spurious_wrong_person_dob": 30, "missed": 143, "correct_empty": 347, "wrong_fill_rate": 0.283, "recall": 0.598},
        "post": {"forms": 180, "parse_fail": 0, "matched": 236, "wrong_value": 13, "spurious_unsupported": 0, "spurious_wrong_person_dob": 0, "missed": 171, "correct_empty": 420, "wrong_fill_rate": 0.052, "recall": 0.562},
    },
    "v3_own-base05-q4km_test_schemareq": {
        "raw": {"forms": 180, "parse_fail": 0, "matched": 262, "wrong_value": 58, "spurious_unsupported": 61, "spurious_wrong_person_dob": 30, "missed": 100, "correct_empty": 329, "wrong_fill_rate": 0.363, "recall": 0.624},
        "post": {"forms": 180, "parse_fail": 0, "matched": 232, "wrong_value": 41, "spurious_unsupported": 15, "spurious_wrong_person_dob": 0, "missed": 147, "correct_empty": 405, "wrong_fill_rate": 0.194, "recall": 0.552},
    },
    "v3_qwen25-0.5b-q4km_test_schemareq": {
        "raw": {"forms": 180, "parse_fail": 0, "matched": 329, "wrong_value": 78, "spurious_unsupported": 325, "spurious_wrong_person_dob": 30, "missed": 13, "correct_empty": 65, "wrong_fill_rate": 0.568, "recall": 0.783},
        "post": {"forms": 180, "parse_fail": 0, "matched": 303, "wrong_value": 45, "spurious_unsupported": 160, "spurious_wrong_person_dob": 0, "missed": 72, "correct_empty": 260, "wrong_fill_rate": 0.404, "recall": 0.721},
    },
    "v3_qwen3-0.6b-q8_test_schemareq": {
        "raw": {"forms": 180, "parse_fail": 9, "matched": 271, "wrong_value": 42, "spurious_unsupported": 40, "spurious_wrong_person_dob": 15, "missed": 107, "correct_empty": 365, "wrong_fill_rate": 0.264, "recall": 0.645},
        "post": {"forms": 180, "parse_fail": 0, "matched": 271, "wrong_value": 8, "spurious_unsupported": 10, "spurious_wrong_person_dob": 0, "missed": 141, "correct_empty": 410, "wrong_fill_rate": 0.062, "recall": 0.645},
    },
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def ids(path):
    seen = []
    for line in path.read_text().splitlines():
        if line.strip():
            seen.append(json.loads(line)["id"])
    if len(seen) != len(set(seen)):
        fail("duplicate ids " + path.name)
    return set(seen)


def score(gold, pred):
    proc = subprocess.run(
        [sys.executable, str(SCORE), str(gold), str(pred)],
        capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0:
        fail(proc.stderr or proc.stdout)
    return json.loads(proc.stdout)


def main():
    for split, (digest, count) in V3.items():
        path = DATA / (split + ".jsonl")
        if sha256(path) != digest:
            fail("v3 hash " + split)
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        if len(rows) != count or sum(1 for row in rows if row["model_fields"]) != count:
            fail("v3 count " + split)
    for name, digest in GUARD.items():
        if sha256(TOOLS / name) != digest or sha256(HERE / "postfilter" / name) != digest:
            fail("guard bytes " + name)
    synthetic = HERE / "postfilter" / "facts.test.mjs"
    if sha256(synthetic) != SYNTHETIC_TEST or sha256(TOOLS / "facts.test.mjs") != SYNTHETIC_TEST:
        fail("synthetic facts.test.mjs hash")
    if sha256(synthetic) == PRIVATE_TEST_RECORD:
        fail("private fixture restored")
    version = (HERE / "postfilter" / "VERSION").read_text()
    if PRIVATE_TEST_RECORD not in version:
        fail("original fixture hash record missing")
    meta = json.loads((HERE / "results" / "train" / "train_meta.json").read_text())
    if meta["examples_seen"] != 960 or meta["optimizer_steps"] != 120:
        fail("training steps")
    if meta["train_sec"] != 3217 or meta["peak_rss_MB"] != 3741:
        fail("training time or memory")
    if meta["r"] != 8 or meta["lr"] != 0.0001 or meta["threads"] != 4 or meta["epochs"] != 2 or meta["accum"] != 8:
        fail("training hyperparameters")
    if list((HERE / "results" / "train").glob("*.safetensors")) or list(HERE.rglob("*.gguf")):
        fail("weights published")
    run = json.loads((HERE / "results" / "test" / "v3_qwen25-1.5b-q4km_test_schemareq.run.json").read_text())
    if run["truncated_96"] != 0 or run["model_calls"] != 180 or run["sec_mean"] != 3.4:
        fail("1.5B test runtime")
    test_ids = ids(DATA / "test.jsonl")
    dev_ids = ids(DATA / "dev.jsonl")
    if test_ids & dev_ids:
        fail("dev and test overlap")
    for stem, expect in TEST.items():
        raw = HERE / "results" / "test" / (stem + ".jsonl")
        post = HERE / "results" / "test" / (stem + ".postfilter.jsonl")
        if ids(raw) != test_ids or ids(post) != test_ids:
            fail(stem + " is not the full test split once")
        if score(DATA / "test.jsonl", raw) != expect["raw"]:
            fail(stem + " raw")
        if score(DATA / "test.jsonl", post) != expect["post"]:
            fail(stem + " post")
    base = sha256(HERE / "results" / "test" / "v3_own-base05-q4km_test_schemareq.jsonl")
    tuned = sha256(HERE / "results" / "test" / "v3_own-v3lora05-q4km_test_schemareq.jsonl")
    if base == tuned:
        fail("own base and tuned predictions are the same file")
    print(json.dumps({
        "v3": "480/180/180",
        "guard": "9c2d5b8",
        "test_models": 5,
        "tuned_post_wrong_fill": 0.052,
        "tuned_post_recall": 0.562,
        "current_1_5b_post_wrong_fill": 0.138,
        "current_1_5b_post_recall": 0.786,
        "production_ready": False,
        "check": "passed",
    }))


if __name__ == "__main__":
    main()
