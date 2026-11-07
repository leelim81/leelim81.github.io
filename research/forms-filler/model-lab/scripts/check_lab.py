#!/usr/bin/env python3
"""Check frozen v1 bytes and rescore the stored CPU baselines.

Does not load a model and does not write into data/v1.
gen.py itself still writes data/<split>.jsonl relative to the current
directory. Regeneration is done in a temporary directory and compared.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from common import score, norm

FROZEN = {
    "data/train.jsonl": ("data/v1/train.jsonl", "d8b5fc523e2b2e608c2ab1727833fc2310d5574e2189aa44ced2fdc689264ce3"),
    "data/dev.jsonl": ("data/v1/dev.jsonl", "9372355861ae6fe5c9d450efcae19cd7e63b307c2f5241b9683c9529d00b248b"),
    "data/test.jsonl": ("data/v1/test.jsonl", "2b2b953c8dc47b374e678ed9aa6ff6df212316af229cc17b41c140bba1506186"),
    "gen.py": ("scripts/gen.py", "0ed9f709534a2ffd3b32754ae2ab6189c6c864f0328189472588f72e5afbef69"),
}
COUNT_KEYS = ["tp", "wrong", "fp_on_null", "fn", "tn", "parse_fail", "n", "precision", "recall", "wrong_fill_rate", "abstain_acc", "field_acc"]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def parse_gap(rows):
    tn = fn = fields = 0
    for row in rows:
        if row.get("pred") is not None:
            continue
        fields += len(row["gold"])
        for value in row["gold"].values():
            if value is None:
                tn += 1
            else:
                fn += 1
    return fields, tn, fn


def check_hashes():
    listed = (ROOT / "data/v1/FROZEN.sha256").read_text(encoding="utf-8").strip().splitlines()
    if len(listed) != len(FROZEN):
        fail("FROZEN.sha256 entry count changed")
    for line in listed:
        digest, name = line.split()
        rel, expect = FROZEN[name]
        if digest != expect:
            fail("FROZEN.sha256 text differs for " + name)
        got = sha256(ROOT / rel)
        if got != expect:
            fail(rel + " hash " + got)
    print("frozen hashes match", len(FROZEN), "files")


def check_scores():
    report = []
    for path in sorted((ROOT / "results").glob("base_*.jsonl")):
        rows = load_jsonl(path)
        got = score(rows)
        stored = json.loads(path.with_name(path.name.replace(".jsonl", ".metrics.json")).read_text(encoding="utf-8"))
        for key in COUNT_KEYS:
            if got[key] != stored[key]:
                fail(path.name + " " + key + " rescore " + str(got[key]) + " stored " + str(stored[key]))
        filled = got["tp"] + got["wrong"] + got["fp_on_null"]
        fields, tn, fn = parse_gap(rows)
        if filled != got["tp"] + got["wrong"] + got["fp_on_null"]:
            fail("denominator")
        report.append({
            "file": path.name,
            "forms": len(rows),
            "wrong_fill_rate": got["wrong_fill_rate"],
            "wrong_fill_denominator_filled_fields": filled,
            "value_mismatch": got["wrong"],
            "spurious_fill_when_gold_null": got["fp_on_null"],
            "recall": got["recall"],
            "parse_fail_forms": got["parse_fail"],
            "fields_inside_unparsed_forms": fields,
            "unparsed_fields_counted_as_abstain": tn,
            "unparsed_fields_counted_as_miss": fn,
            "abstain_acc": got["abstain_acc"],
        })
    prod_path = ROOT / "results/prod_base_qwen25-0.5b.jsonl"
    prod = load_jsonl(prod_path)
    stored = json.loads((ROOT / "results/prod_base_qwen25-0.5b.metrics.json").read_text(encoding="utf-8"))
    counts = dict(tp=0, wrong=0, fp_on_null=0, fn=0, tn=0, parse_fail=0, n=0)
    for row in prod:
        pred = row["pred"]
        if pred is None:
            counts["parse_fail"] += 1
            pred = {}
        for key, gold in row["gold"].items():
            counts["n"] += 1
            got = norm(pred.get(key)) if isinstance(pred, dict) else None
            want = norm(gold)
            if want is None:
                counts["tn" if got is None else "fp_on_null"] += 1
            elif got is None:
                counts["fn"] += 1
            elif got == want:
                counts["tp"] += 1
            else:
                counts["wrong"] += 1
    for key in ("tp", "wrong", "fp_on_null", "fn", "tn", "parse_fail", "n"):
        if counts[key] != stored[key]:
            fail("prod " + key)
    if counts["wrong"] != 0 or counts["fp_on_null"] != 12 or len(prod) != 22:
        fail("prod partition")
    filled = counts["tp"] + counts["wrong"] + counts["fp_on_null"]
    report.append({
        "file": "prod_base_qwen25-0.5b.jsonl",
        "records": len(prod),
        "fields": counts["n"],
        "value_mismatch": counts["wrong"],
        "matched_fills": counts["tp"],
        "spurious_fill_when_gold_empty": counts["fp_on_null"],
        "wrong_fill_denominator_filled_fields": filled,
        "wrong_fill_rate_among_filled": round((counts["wrong"] + counts["fp_on_null"]) / filled, 3),
        "note": "Do not quote value_mismatch alone. 12 of 22 fills were unsupported.",
    })
    print(json.dumps(report, indent=2))


def check_regen():
    before = {name: sha256(ROOT / rel) for name, (rel, _) in FROZEN.items()}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        (work / "data").mkdir()
        shutil.copy(ROOT / "scripts/gen.py", work / "gen.py")
        subprocess.check_call([sys.executable, "gen.py"], cwd=work)
        for split, digest in (
            ("train", FROZEN["data/train.jsonl"][1]),
            ("dev", FROZEN["data/dev.jsonl"][1]),
            ("test", FROZEN["data/test.jsonl"][1]),
        ):
            got = sha256(work / "data" / (split + ".jsonl"))
            if got != digest:
                fail("regen " + split + " " + got)
    after = {name: sha256(ROOT / rel) for name, (rel, _) in FROZEN.items()}
    if before != after:
        fail("regen touched frozen files")
    print("regen matches data/v1 and did not modify it")


def check_lora():
    dev = json.loads((ROOT / "results/lora_e1_dev.metrics.json").read_text(encoding="utf-8"))
    test = json.loads((ROOT / "results/lora_e1_test.metrics.json").read_text(encoding="utf-8"))
    prod = json.loads((ROOT / "results/prod_lora_e1.metrics.json").read_text(encoding="utf-8"))
    if dev["precision"] != 0.941 or dev["recall"] != 0.974 or dev["parse_fail"] != 0:
        fail("lora dev metrics")
    if test["parse_fail"] != 80 or test["tp"] != 0 or test["recall"] != 0.0 or test["n_forms"] != 80:
        fail("lora test metrics")
    if test["tp"] + test["wrong"] + test["fp_on_null"] != 0:
        fail("official tuned test produced fills; the stored failure was total parse loss")
    if prod["tp"] != 9 or prod["wrong"] != 1 or prod["fp_on_null"] != 10 or prod["fn"] != 0 or prod["tn"] != 24:
        fail("prod lora partition")
    # rescore official files
    for name in ("lora_e1_dev", "lora_e1_test"):
        rows = load_jsonl(ROOT / "results" / (name + ".jsonl"))
        got = score(rows)
        stored = json.loads((ROOT / "results" / (name + ".metrics.json")).read_text(encoding="utf-8"))
        for key in COUNT_KEYS:
            if got[key] != stored[key]:
                fail(name + " rescore " + key)
    print("lora official scores match; test parse_fail 80/80 is a failure, not a zero wrong-fill")


def check_v2():
    expect = {
        "train": "86c42a7f06cf09d4cc5544a26751c9652ec25ffa35d476e8f5a1d0953b7f2d4e",
        "dev": "630e72f0871050d5c15c92f41759d47d9b63e651f5616f4d606b7d2de6f164a0",
        "test": "d3b36c744e9bed4a56558f94390b79a7e688f35a25671e99e3d8c221753cde02",
    }
    rows = []
    for split, digest in expect.items():
        path = ROOT / "data/v2" / (split + ".jsonl")
        if sha256(path) != digest:
            fail("v2 " + split)
        rows.extend(load_jsonl(path))
    def bag(split, key):
        return {row[key] for row in rows if row["split"] == split}
    for left, right in (("train", "dev"), ("train", "test"), ("dev", "test")):
        if bag(left, "template_id") & bag(right, "template_id"):
            fail("v2 template overlap " + left)
        if bag(left, "label_family") & bag(right, "label_family"):
            fail("v2 family overlap " + left)
        if bag(left, "persona_id") & bag(right, "persona_id"):
            fail("v2 person overlap " + left)
    print("v2 frozen and disjoint; not regenerated, because later parser fixes would change it")
    check_v3()


def check_v3():
    expect = {
        "train": "11e2ac69475f970b94595639a584656b55a4db5eff17957b0c07d83b3539a403",
        "dev": "6a703d22ee3ebd8e39fa868a4cbb133a1f6e60733f159c0d11556c3e975906f9",
        "test": "92936e65321e904613d08a309d9f76f00dd219bdd9079347da3983709799978c",
    }
    for split, digest in expect.items():
        if sha256(ROOT / "data" / "v3" / (split + ".jsonl")) != digest:
            fail("v3 hash " + split)
    rows = []
    for split in expect:
        path = ROOT / "data" / "v3" / (split + ".jsonl")
        rows.extend(load_jsonl(path))
    def bag(split, key):
        return {row[key] for row in rows if row["split"] == split}
    for left, right in (("train", "dev"), ("train", "test"), ("dev", "test")):
        if bag(left, "template_id") & bag(right, "template_id"):
            fail("v3 templates " + left)
        if bag(left, "label_family") & bag(right, "label_family"):
            fail("v3 families " + left)
        if bag(left, "persona_id") & bag(right, "persona_id"):
            fail("v3 people " + left)
        names_l = {row["parser_facts"].get("name") for row in rows if row["split"] == left and row["parser_facts"].get("name")}
        names_r = {row["parser_facts"].get("name") for row in rows if row["split"] == right and row["parser_facts"].get("name")}
        if names_l & names_r:
            fail("v3 names " + left)
        labels_l = {field["label"] for row in rows if row["split"] == left for field in row["fields"]}
        labels_r = {field["label"] for row in rows if row["split"] == right for field in row["fields"]}
        if labels_l & labels_r:
            fail("v3 label wording " + left)
    dev_calls = sum(1 for row in rows if row["split"] == "dev" and row["model_fields"])
    test_calls = sum(1 for row in rows if row["split"] == "test" and row["model_fields"])
    if dev_calls < 150 or test_calls < 150:
        fail("v3 model calls")
    if len(bag("dev", "template_id")) < 6 or len(bag("test", "template_id")) < 6:
        fail("v3 template families")
    print("v3 disjoint", "dev_calls", dev_calls, "test_calls", test_calls)


def main():
    check_hashes()
    check_scores()
    check_regen()
    check_lora()
    check_v2()
    print("model-lab checks passed")


if __name__ == "__main__":
    main()
