#!/usr/bin/env python3
"""Frozen v2 fixture. Production field-id contract. Does not touch data/v1.

Writes data/v2/<split>.jsonl. Regeneration is byte-stable for a fixed seed.
Train, dev, and test use disjoint templates, people, and label families.
"""
import hashlib
import json
import random
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261108
R = random.Random(SEED)

FAMILIES = {
    "A": [
        ("full_name", "Full name", "name"),
        ("nric", "NRIC/FIN", "nric"),
        ("dob", "Date of birth", "dob"),
        ("mobile", "Mobile", "phone"),
        ("email", "Email", "email"),
        ("address", "Residential address", "address"),
        ("occupation", "Occupation", "job"),
        ("citizenship", "Citizenship", "citizenship"),
        ("bank", "Bank account", "bank"),
    ],
    "B": [
        ("applicant", "Applicant's name", "name"),
        ("identity", "Identification number", "nric"),
        ("birth", "Birth date", "dob"),
        ("phone", "Contact number", "phone"),
        ("mail", "E-mail address", "email"),
        ("street", "Street", "address"),
        ("job", "Job title", "job"),
        ("status", "Residential status", "citizenship"),
        ("account", "Account number", "bank"),
    ],
    "F": [
        ("member_name", "Name of member", "name"),
        ("id_no", "ID No.", "nric"),
        ("born", "D.O.B.", "dob"),
        ("handphone", "Handphone", "phone"),
        ("mail2", "Email (optional)", "email"),
        ("block", "Address: Block", "address"),
        ("role", "Designation", "job"),
        ("tick", "SC / PR / Foreigner", "citizenship"),
        ("acct", "Bank account no.", "bank"),
    ],
    "D": [
        ("visitor", "Visitor name", "name"),
        ("pass_no", "Pass or NRIC", "nric"),
        ("arrived", "Date of birth", "dob"),
        ("reach", "Phone", "phone"),
        ("inbox", "Email", "email"),
        ("place", "Premises", "address"),
        ("work", "What they do", "job"),
        ("nation", "Nationality stated", "citizenship"),
        ("payee", "Payee account", "bank"),
    ],
    "E": [
        ("claimant", "Claimant name", "name"),
        ("fin", "FIN or NRIC", "nric"),
        ("patient_dob_ignored", "Applicant date of birth", "dob"),
        ("callback", "Callback number", "phone"),
        ("note_mail", "Correspondence email", "email"),
        ("residence", "Home address", "address"),
        ("post", "Post held", "job"),
        ("residency", "Residency if stated", "citizenship"),
        ("giro", "GIRO account", "bank"),
    ],
}
TRAIN_TEMPLATES = ["nric_card", "letter", "payslip", "utility", "chat", "checkbox_note"]
DEV_TEMPLATES = ["visitor_slip", "courier_note"]
TEST_TEMPLATES = ["clinic_copy", "work_pass", "claim_note"]
SPLIT_FAMILY = {"train": ["A", "B", "F"], "dev": ["D"], "test": ["E"]}
COUNTS = {"train": 360, "dev": 36, "test": 36}


def nric(prefix):
    digits = [R.randint(0, 9) for _ in range(7)]
    weights = (2, 7, 6, 5, 4, 3, 2)
    total = sum(d * w for d, w in zip(digits, weights))
    if prefix in "TG":
        total += 4
    letters = "JZIHGFEDCBA" if prefix in "ST" else "XWUTRQPNMLK"
    return prefix + "".join(str(d) for d in digits) + letters[total % 11]


def person(pid):
    given = R.choice(["Amina", "Budi", "Chia", "Dinesh", "Elina", "Farid", "Grace", "Hafiz", "Irene", "Johan", "Kala", "Liam", "Mei", "Nabil", "Olivia", "Prakash", "Qin", "Ravi", "Siti", "Tan"])
    family = R.choice(["Yusof", "Santoso", "Ling", "Rao", "Tan", "Ong", "Lim", "Chan", "Goh", "Teo", "Singh", "Koh", "Wong", "Rahman", "Poh", "Menon", "Yee", "Das", "Osman", "Ng"])
    year = R.randint(1968, 2001)
    prefix = "T" if year >= 2000 else "S"
    dob = f"{R.randint(1, 28):02d}/{R.randint(1, 12):02d}/{year}"
    return {
        "id": pid,
        "name": given + " " + family,
        "nric": nric(prefix),
        "dob": dob,
        "sex": R.choice(["Male", "Female"]),
        "phone": "+65 8" + "".join(str(R.randint(0, 9)) for _ in range(7)),
        "email": given.lower() + "." + family.lower() + "@example.com",
        "address": f"{R.randint(1, 200)} {R.choice(['HARBOUR LANE', 'NORTH QUAY', 'CEDAR WALK', 'MARKET STREET', 'RIVER CLOSE'])} {R.randint(100000, 829999)}",
        "job": R.choice(["clerk", "nurse", "driver", "teacher", "technician"]),
        "employer": R.choice(["Harbour Press", "North Quay Books", "Cedar Studio", "River Ledger"]),
        "other_name": R.choice(["Pat Example", "Jo Sample", "Kim Fixture"]),
        "other_nric": nric("G"),
        "other_dob": f"{R.randint(1, 28):02d}/{R.randint(1, 12):02d}/{R.randint(1970, 1999)}",
        "bank_no": "".join(str(R.randint(0, 9)) for _ in range(10)),
    }


def document(template, p, explicit_citizenship, explicit_bank):
    cit = ""
    if explicit_citizenship:
        cit = "Citizenship: Permanent Resident\n"
    bank = ""
    if explicit_bank:
        bank = f"Bank account number: {p['bank_no']}\n"
    if template == "nric_card":
        text = f"REPUBLIC OF SINGAPORE\nIDENTITY CARD NO. {p['nric']}\nName\n{p['name'].upper()}\nDate of birth {p['dob']} Sex {p['sex'][0]}\n"
    elif template == "letter":
        if not explicit_citizenship:
            cit = "Citizenship was not provided.\n"
        text = f"Full name: {p['name']}\nNRIC/FIN: {p['nric']}\nDate of birth: {p['dob']}\nPhone: {p['phone']}\nEmail: {p['email']}\n{cit}Employer: {p['employer']}\nThe holder works as a {p['job']}.\n"
    elif template == "payslip":
        text = f"PAYSLIP\nEmployee: {p['name']}\nNRIC/FIN: {p['nric']}\nDesignation: {p['job']}\nEmployer: {p['employer']}\n{bank}"
    elif template == "utility":
        text = f"UTILITY BILL\nAccount holder: {p['name']}\nNRIC/FIN: {p['nric']}\nPremises: {p['address']}\nBank details were not supplied.\nAmount due 42.00\n"
    elif template == "chat":
        text = f"Full name: {p['name']}\nMy HP is {p['phone']}. I was born on {p['dob']}. Email: {p['email']}\n"
    elif template == "checkbox_note":
        text = f"Full name: {p['name']}\nNRIC/FIN: {p['nric']}\nSex: {p['sex']}\n{cit}{bank}Designation: {p['job']}\n"
    elif template == "visitor_slip":
        text = f"VISITOR SLIP\nFull name: {p['name']}\nPass or NRIC: {p['nric']}\nPhone: {p['phone']}\nPremises: {p['address']}\nNationality was not stated.\n"
    elif template == "courier_note":
        text = f"DELIVERY NOTE\nFull name: {p['name']}\nContact number: {p['phone']}\nEmail: {p['email']}\nDesignation: {p['job']}\n"
    elif template == "clinic_copy":
        text = (
            f"CLINIC COPY about another person\nPatient listed: {p['other_name']} FIN {p['other_nric']} born {p['other_dob']}\n"
            f"Accompanied by applicant.\nFull name: {p['name']}\nCallback number: {p['phone']}\n"
        )
    elif template == "work_pass":
        text = f"Employment pass\nFull name: {p['name']}\nFIN: {p['nric']}\nPass type: S Pass\nCitizenship: Foreigner\nOccupation: {p['job']}\n"
    elif template == "claim_note":
        text = f"CLAIM NOTE\nFull name: {p['name']}\nNRIC/FIN: {p['nric']}\nDate of birth: {p['dob']}\nHome address: {p['address']}\nPlease leave bank blank.\n"
    else:
        raise SystemExit(template)
    return text


def fields_for(family):
    out = []
    seen = {}
    for _key, label, canonical in FAMILIES[family]:
        fid = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:42] or "field"
        if fid in seen:
            fid = fid[:38] + "_" + str(seen[fid])
        seen[fid] = seen.get(fid, 0) + 1
        out.append({"id": fid, "label": label, "type": "text", "canonical": canonical})
    return out


def semantic(p, template, explicit_citizenship, explicit_bank):
    """Values the applicant evidence supports. Empty string means abstain."""
    gold = {k: "" for k in ["name", "nric", "dob", "phone", "email", "address", "job", "citizenship", "bank"]}
    gold["name"] = p["name"]
    if template != "courier_note":
        gold["nric"] = p["nric"]
    if template in ("nric_card", "letter", "chat", "claim_note"):
        gold["dob"] = p["dob"]
    if template in ("letter", "chat", "visitor_slip", "courier_note", "clinic_copy"):
        gold["phone"] = p["phone"]
    if template in ("letter", "chat", "courier_note"):
        gold["email"] = p["email"]
    if template in ("utility", "visitor_slip", "claim_note"):
        gold["address"] = p["address"]
    if template in ("letter", "payslip", "checkbox_note", "courier_note", "work_pass"):
        gold["job"] = p["job"]
    if explicit_citizenship or template == "work_pass":
        gold["citizenship"] = "Foreigner" if template == "work_pass" else "Permanent Resident"
    if explicit_bank:
        gold["bank"] = p["bank_no"]
    if template == "clinic_copy":
        gold["nric"] = ""
        gold["dob"] = ""
    return gold


def main():
    pools = {
        "train": [person(f"t{i:03d}") for i in range(COUNTS["train"])],
        "dev": [person(f"d{i:03d}") for i in range(COUNTS["dev"])],
        "test": [person(f"e{i:03d}") for i in range(COUNTS["test"])],
    }
    ids = [p["nric"] for group in pools.values() for p in group]
    if len(ids) != len(set(ids)):
        raise SystemExit("nric collision")
    staging = []
    templates = {"train": TRAIN_TEMPLATES, "dev": DEV_TEMPLATES, "test": TEST_TEMPLATES}
    for split, people in pools.items():
        fams = SPLIT_FAMILY[split]
        temps = templates[split]
        for i, p in enumerate(people):
            template = temps[i % len(temps)]
            family = fams[i % len(fams)]
            explicit_citizenship = template in ("letter", "checkbox_note") and i % 5 == 0
            explicit_bank = template == "payslip" and i % 4 == 0
            excerpt = document(template, p, explicit_citizenship, explicit_bank)
            fields = fields_for(family)
            sem = semantic(p, template, explicit_citizenship, explicit_bank)
            staging.append({
                "id": f"{split}-{template}-{p['id']}",
                "split": split,
                "template_id": template,
                "label_family": family,
                "persona_id": p["id"],
                "source": "synthetic:" + template,
                "excerpt": excerpt,
                "fields": fields,
                "semantic": sem,
            })
    out_dir = ROOT / "data" / "v2"
    out_dir.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["node", str(ROOT / "scripts" / "attach_v2.mjs")],
        input=json.dumps(staging),
        text=True,
        capture_output=True,
        check=True,
    )
    attached = json.loads(proc.stdout)
    by_split = {"train": [], "dev": [], "test": []}
    for row in attached:
        by_split[row["split"]].append(row)
    manifest = {}
    for split, rows in by_split.items():
        path = out_dir / (split + ".jsonl")
        path.write_text("".join(json.dumps(r, ensure_ascii=True, sort_keys=True) + "\n" for r in rows), encoding="utf-8")
        manifest[split] = {
            "n": len(rows),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "templates": sorted({r["template_id"] for r in rows}),
            "label_families": sorted({r["label_family"] for r in rows}),
            "personas": len({r["persona_id"] for r in rows}),
        }
    (out_dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
