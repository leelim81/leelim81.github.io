#!/usr/bin/env python3
"""v3 fixtures. Disjoint people, templates, and label wording. Does not read or write v1 or v2 test."""
import hashlib
import json
import random
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R = random.Random(20261109)

TRAIN_T = ["card_scan", "employer_letter", "pay_advice", "power_bill", "text_message", "tickbox_form", "emergency_note", "bank_letter"]
DEV_T = ["gate_log", "parcel_slip", "clinic_self", "school_form", "tenancy_mail", "hr_memo"]
TEST_T = ["ward_note", "foreign_pass", "rebate_claim", "hostel_register", "union_ballot", "insurer_email"]
FAM = {
    "train": ["A", "B", "C"],
    "dev": ["D", "E"],
    "test": ["F", "G"],
}
COUNTS = {"train": 480, "dev": 180, "test": 180}
TASKS = ["name", "dob", "phone", "email", "address", "job", "citizenship", "bank", "other_person"]

LABELS = {
    "A": [("Full name", "name"), ("NRIC/FIN", "nric"), ("Date of birth", "dob"), ("Handset", "phone"), ("Inbox", "email"), ("Residential address", "address"), ("Occupation", "job"), ("Citizenship", "citizenship"), ("Bank account", "bank")],
    "B": [("Applicant's name", "name"), ("Identification number", "nric"), ("Birth date", "dob"), ("Day number", "phone"), ("Mailbox", "email"), ("Street", "address"), ("Job title", "job"), ("Residential status", "citizenship"), ("Account number", "bank")],
    "C": [("Name of member", "name"), ("ID No.", "nric"), ("D.O.B.", "dob"), ("Callback handset", "phone"), ("Note inbox", "email"), ("Address block", "address"), ("Designation", "job"), ("SC / PR / Foreigner", "citizenship"), ("Bank account no.", "bank")],
    "D": [("Applicant name", "name"), ("Pass or NRIC", "nric"), ("DOB of visitor", "dob"), ("Gate handset", "phone"), ("Desk inbox", "email"), ("Premises", "address"), ("Designation here", "job"), ("Nationality stated", "citizenship"), ("Bank payee", "bank")],
    "E": [("Member name", "name"), ("Badge number", "nric"), ("DOB on site", "dob"), ("Reachable at", "phone"), ("Post mailbox", "email"), ("Site address", "address"), ("Occupation here", "job"), ("Status if written", "citizenship"), ("Bank settlement", "bank")],
    "F": [("Claimant name", "name"), ("FIN or NRIC", "nric"), ("Applicant date of birth", "dob"), ("Desk callback", "phone"), ("Note letterbox", "email"), ("Dwelling line", "address"), ("Work described", "job"), ("Residency if stated", "citizenship"), ("GIRO ledger", "bank")],
    "G": [("Name of claimant", "name"), ("Identity code", "nric"), ("Birth as printed", "dob"), ("Day callback", "phone"), ("Reply letterbox", "email"), ("Premises line", "address"), ("Role described", "job"), ("Citizen line", "citizenship"), ("Credit ledger", "bank")],
}


def nric(prefix):
    digits = [R.randint(0, 9) for _ in range(7)]
    total = sum(d * w for d, w in zip(digits, (2, 7, 6, 5, 4, 3, 2)))
    if prefix in "TG":
        total += 4
    letters = "JZIHGFEDCBA" if prefix in "ST" else "XWUTRQPNMLK"
    return prefix + "".join(map(str, digits)) + letters[total % 11]


GIVEN = ["Amina", "Budi", "Chia", "Dinesh", "Elina", "Farid", "Hafiz", "Irene", "Johan", "Kala", "Liam", "Mei", "Nabil", "Olivia", "Prakash", "Qin", "Ravi", "Siti", "Wei", "Yong", "Adele", "Boris", "Cara", "Dara", "Eden", "Faye", "Gita", "Hugo", "Ida", "Jules", "Kara", "Leif", "Mira", "Noor", "Omar", "Pia", "Quinn", "Rosa", "Sami", "Tara"]
FAMILY = ["Yusof", "Santoso", "Rao", "Ong", "Goh", "Teo", "Singh", "Koh", "Wong", "Rahman", "Poh", "Menon", "Das", "Osman", "Ng", "Lim", "Chan", "Tan", "Lee", "Ho", "Arun", "Beck", "Cruz", "Diaz", "Ewe", "Fern", "Gan", "Hart", "Iver", "Jain"]
USED_NAMES = set()


def person(pid):
    for _ in range(80):
        given = R.choice(GIVEN)
        family = R.choice(FAMILY)
        name = given + " " + family
        if name not in USED_NAMES:
            USED_NAMES.add(name)
            break
    else:
        raise SystemExit("name pool exhausted")
    year = R.randint(1968, 2001)
    return {
        "id": pid,
        "name": name,
        "nric": nric("T" if year >= 2000 else "S"),
        "dob": f"{R.randint(1, 28):02d}.{R.randint(1, 12):02d}.{year}",
        "dob_slash": None,
        "phone": "+65 8" + "".join(str(R.randint(0, 9)) for _ in range(7)),
        "email": given.lower() + "." + family.lower() + str(R.randint(1, 99)) + "@example.com",
        "address": f"{R.randint(1, 240)} {R.choice(['HARBOUR LANE', 'NORTH QUAY', 'CEDAR WALK', 'RIVER CLOSE', 'PALM ROAD'])} {R.randint(100000, 829999)}",
        "job": R.choice(["clerk", "nurse", "driver", "teacher", "technician"]),
        "employer": R.choice(["Harbour Press", "Cedar Studio", "River Ledger", "Palm Works"]),
        "other": R.choice(["Pat Example", "Jo Sample", "Kim Fixture", "Lee Fixture"]),
        "other_dob": f"{R.randint(1, 28):02d}.{R.randint(1, 12):02d}.{R.randint(1972, 1998)}",
        "bank": "".join(str(R.randint(0, 9)) for _ in range(10)),
    }


def slash(dotted):
    d, m, y = dotted.split(".")
    return f"{d}/{m}/{y}"


def tail():
    return " This note is long enough that a form assistant may be asked about leftover fields. Handset, inbox, desk, mailbox, reachable, designation, occupation, nationality, status, citizenship, and bank remain topics even when a value was not supplied."


def document(kind, p):
    """Returns excerpt, semantic gold by canonical key, and a pair tag."""
    gold = {k: "" for k in TASKS if k != "other_person"}
    gold["name"] = p["name"]
    mode = kind
    pair = ""
    if kind == "card_scan":
        text = f"IDENTITY CARD NO. {p['nric']}\nName\n{p['name'].upper()}\nThe applicant date is written {p['dob']} without a birth label.\n" + tail()
        gold["nric"] = p["nric"]
        gold["dob"] = slash(p["dob"])
    elif kind == "employer_letter":
        text = f"The applicant is {p['name']}. Designation: {p['job']}. Employer: {p['employer']}. Handset {p['phone']}. Inbox {p['email']}. Patient listed: {p['other']} born {p['other_dob']}. Citizenship was not provided. Bank details were not supplied.\n" + tail()
        gold["phone"] = p["phone"]
        gold["email"] = p["email"]
        gold["job"] = p["job"]
        gold["dob"] = ""
        pair = "patient-is-not-applicant"
    elif kind == "pay_advice":
        text = f"PAY ADVICE for {p['name']} ID {p['nric']}. Designation: {p['job']}. Employer: {p['employer']}. Bank account number: {p['bank']}.\n" + tail()
        gold["nric"] = p["nric"]
        gold["job"] = p["job"]
        gold["bank"] = p["bank"]
    elif kind == "power_bill":
        text = f"UTILITY BILL. Account holder is the occupier. Premises: {p['address']}. Handset was not given. Inbox was not given. Bank details were not supplied. Citizenship was not provided.\n" + tail()
        gold["name"] = ""
        gold["phone"] = ""
        gold["email"] = ""
        gold["address"] = p["address"]
    elif kind == "text_message":
        text = f"Hello, the applicant is {p['name']}. The patient is the applicant. Handset {p['phone']}. Inbox {p['email']}. Patient born {p['dob']}.\n" + tail()
        gold["phone"] = p["phone"]
        gold["email"] = p["email"]
        gold["dob"] = slash(p["dob"])
        pair = "patient-is-applicant"
    elif kind == "tickbox_form":
        text = f"Tickbox draft for {p['name']} {p['nric']}. Sex is not a model field here. Citizenship: Permanent Resident. Designation: {p['job']}.\n" + tail()
        gold["nric"] = p["nric"]
        gold["job"] = p["job"]
        gold["citizenship"] = "Permanent Resident"
    elif kind == "emergency_note":
        text = f"The applicant is {p['name']}. Emergency contact {p['other']} shares the phone {p['phone']}. Do not treat the shared phone as belonging to one person only.\n" + tail()
        gold["phone"] = ""
        pair = "shared-phone"
    elif kind == "bank_letter":
        text = f"The applicant is {p['name']}. Bank account number: {p['bank']}. Citizenship was not provided.\n" + tail()
        gold["bank"] = p["bank"]
    elif kind == "gate_log":
        text = f"GATE LOG. The applicant is {p['name']}. Reachable at {p['phone']}. Premises: {p['address']}. Citizenship was not provided.\n" + tail()
        gold["phone"] = p["phone"]
        gold["address"] = p["address"]
    elif kind == "parcel_slip":
        text = f"PARCEL. The occupier is unnamed. Inbox {p['email']}. Reachable at {p['phone']}. Designation: {p['job']}. Occupation here is {p['job']}. Bank details were not supplied. Citizenship was not provided. Nationality stated nowhere. Status if written nowhere.\n" + tail()
        gold["name"] = ""
        gold["email"] = p["email"]
        gold["phone"] = p["phone"]
        gold["job"] = p["job"]
    elif kind == "clinic_self":
        text = f"The patient is the applicant. The applicant is {p['name']}. Patient born {p['dob']}. Callback {p['phone']}.\n" + tail()
        gold["dob"] = slash(p["dob"])
        gold["phone"] = p["phone"]
        pair = "patient-is-applicant"
    elif kind == "school_form":
        text = f"SCHOOL. The applicant is {p['name']} ID {p['nric']}. The date {p['dob']} belongs to the applicant. Citizenship: Foreigner. Nationality stated: Foreigner. Status if written: Foreigner.\n" + tail()
        gold["nric"] = p["nric"]
        gold["dob"] = slash(p["dob"])
        gold["citizenship"] = "Foreigner"
    elif kind == "tenancy_mail":
        text = f"TENANCY. The applicant is {p['name']}. Premises: {p['address']}. Email: {p['email']}. Bank account number: {p['bank']}.\n" + tail()
        gold["address"] = p["address"]
        gold["email"] = p["email"]
        gold["bank"] = p["bank"]
    elif kind == "hr_memo":
        text = f"HR MEMO. The applicant is {p['name']}. Designation: {p['job']}. Employer: {p['employer']}. Patient listed: {p['other']} born {p['other_dob']}. Handset was not given. Inbox was not given. Citizenship was not provided.\n" + tail()
        gold["job"] = p["job"]
        gold["dob"] = ""
        gold["phone"] = ""
        gold["email"] = ""
        pair = "patient-is-not-applicant"
    elif kind == "ward_note":
        text = f"WARD NOTE about another person. Patient listed: {p['other']} born {p['other_dob']}. Accompanied by the applicant. The applicant is {p['name']}. Desk callback {p['phone']}. Birth as printed is not the patient date.\n" + tail()
        gold["dob"] = ""
        gold["phone"] = p["phone"]
        pair = "patient-is-not-applicant"
    elif kind == "foreign_pass":
        text = f"PASS. The applicant is {p['name']}. The citizen status is Foreigner and the residency is Foreigner. Work described: {p['job']}.\n" + tail()
        gold["citizenship"] = "Foreigner"
        gold["job"] = p["job"]
    elif kind == "rebate_claim":
        text = f"REBATE. The occupier is unnamed. Premises: {p['address']}. The dwelling line is that premises. Ledger was not supplied.\n" + tail()
        gold["name"] = ""
        gold["address"] = p["address"]
        gold["bank"] = ""
    elif kind == "hostel_register":
        text = f"HOSTEL. The patient is the applicant. The applicant is {p['name']}. Patient born {p['dob']}. Reply letterbox {p['email']}. A different resident {p['other']} was born {p['other_dob']}. Birth as printed refers to the applicant.\n" + tail()
        gold["dob"] = slash(p["dob"])
        gold["email"] = p["email"]
        pair = "patient-is-applicant"
    elif kind == "union_ballot":
        text = f"BALLOT. The applicant is {p['name']}. Work described was not supplied. The citizen status was not written and the residency was not stated. The dwelling line was not supplied and the premises line was not supplied.\n" + tail()
        gold["job"] = ""
        gold["citizenship"] = ""
        gold["address"] = ""
    elif kind == "insurer_email":
        text = f"INSURER. The applicant is {p['name']}. Reply letterbox {p['email']}. Desk callback {p['phone']}. Ledger account {p['bank']}.\n" + tail()
        gold["email"] = p["email"]
        gold["phone"] = p["phone"]
        gold["bank"] = p["bank"]
    else:
        raise SystemExit(kind)
    return text, gold, pair


def slug(label, seen):
    fid = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:42] or "field"
    if fid in seen:
        fid = fid[:36] + "_" + str(seen[fid])
    seen[fid] = seen.get(fid, 0) + 1
    return fid


def main():
    pools = {}
    n = 0
    for split, count in COUNTS.items():
        pools[split] = []
        for i in range(count):
            n += 1
            pools[split].append(person({"train": "tr", "dev": "dv", "test": "te"}[split] + f"{i:03d}"))
    seen_ids = [p["nric"] for group in pools.values() for p in group]
    if len(seen_ids) != len(set(seen_ids)):
        raise SystemExit("nric collision")
    seen_names = [p["name"] for group in pools.values() for p in group]
    if len(seen_names) != len(set(seen_names)):
        raise SystemExit("name collision")
    temps = {"train": TRAIN_T, "dev": DEV_T, "test": TEST_T}
    staging = []
    for split, people in pools.items():
        for i, p in enumerate(people):
            template = temps[split][i % len(temps[split])]
            family = FAM[split][(i // len(temps[split])) % len(FAM[split])]
            excerpt, sem, pair = document(template, p)
            seen = {}
            fields = []
            for label, canonical in LABELS[family]:
                fields.append({"id": slug(label, seen), "label": label, "type": "text", "canonical": canonical})
            staging.append({
                "id": f"{split}-{template}-{p['id']}",
                "split": split,
                "template_id": template,
                "label_family": family,
                "persona_id": p["id"],
                "source": "synthetic:" + template,
                "pair": pair,
                "excerpt": excerpt,
                "fields": fields,
                "semantic": sem,
            })
    proc = subprocess.run(
        ["node", str(ROOT / "scripts" / "attach_v3.mjs")],
        input=json.dumps(staging),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.stderr)
    rows = json.loads(proc.stdout)
    problems = coverage_problems(rows)
    if problems:
        raise SystemExit("coverage failed:\n" + "\n".join(problems))
    out = ROOT / "data" / "v3"
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for split in ("train", "dev", "test"):
        chosen = [row for row in rows if row["split"] == split]
        path = out / (split + ".jsonl")
        path.write_text("".join(json.dumps(row, ensure_ascii=True, sort_keys=True) + "\n" for row in chosen), encoding="utf-8")
        manifest[split] = {
            "n": len(chosen),
            "sha256": hashlib_file(path),
            "model_calls": sum(1 for row in chosen if row["model_fields"]),
            "templates": sorted({row["template_id"] for row in chosen}),
            "label_families": sorted({row["label_family"] for row in chosen}),
            "null_frac": round(
                sum(1 for row in chosen for value in row["gold"].values() if not value)
                / max(1, sum(len(row["gold"]) for row in chosen)),
                3,
            ),
        }
    report = coverage_report(rows)
    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (out / "COVERAGE.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


def hashlib_file(path):
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def task_of(field, row):
    canonical = field.get("canonical")
    if canonical:
        return canonical
    for item in row.get("fields") or []:
        if item["id"] == field["id"]:
            return item.get("canonical") or ""
    return ""


def coverage_report(rows):
    report = {"by_split": {}}
    for split in ("train", "dev", "test"):
        chosen = [row for row in rows if row["split"] == split]
        matrix = {task: {"positive": 0, "negative": 0} for task in TASKS if task != "other_person"}
        matrix["other_person"] = {"positive_patient_is_applicant": 0, "negative_other_person": 0}
        for row in chosen:
            fields = {item["id"]: item for item in row["fields"]}
            for field in row["model_fields"]:
                canonical = fields[field["id"]]["canonical"]
                filled = bool(row["gold"].get(field["id"]))
                if canonical == "dob" and row["pair"] == "patient-is-applicant" and filled:
                    matrix["other_person"]["positive_patient_is_applicant"] += 1
                if canonical == "dob" and row["pair"] == "patient-is-not-applicant" and not filled:
                    matrix["other_person"]["negative_other_person"] += 1
                if canonical in matrix and canonical != "other_person":
                    matrix[canonical]["positive" if filled else "negative"] += 1
        report["by_split"][split] = {
            "records": len(chosen),
            "model_calls": sum(1 for row in chosen if row["model_fields"]),
            "templates": sorted({row["template_id"] for row in chosen}),
            "families": sorted({row["label_family"] for row in chosen}),
            "tasks": matrix,
        }
    return report


def coverage_problems(rows):
    report = coverage_report(rows)
    problems = []
    for split, need_calls, need_templates in (("dev", 150, 6), ("test", 150, 6)):
        block = report["by_split"][split]
        if block["model_calls"] < need_calls:
            problems.append(split + " model calls " + str(block["model_calls"]))
        if len(block["templates"]) < need_templates:
            problems.append(split + " templates " + str(block["templates"]))
    for split in ("train", "dev", "test"):
        tasks = report["by_split"][split]["tasks"]
        for task, counts in tasks.items():
            if task == "other_person":
                if counts["positive_patient_is_applicant"] < 1 or counts["negative_other_person"] < 1:
                    problems.append(split + " other_person " + str(counts))
            elif counts["positive"] < 1 or counts["negative"] < 1:
                problems.append(split + " " + task + " " + str(counts))
    train_t = set(report["by_split"]["train"]["templates"])
    dev_t = set(report["by_split"]["dev"]["templates"])
    test_t = set(report["by_split"]["test"]["templates"])
    if train_t & dev_t or train_t & test_t or dev_t & test_t:
        problems.append("template overlap")
    return problems


if __name__ == "__main__":
    main()
