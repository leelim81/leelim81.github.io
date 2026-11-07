#!/usr/bin/env python3
"""Seeded generator for the forms-filler research split.

Running this file rewrites data/*.jsonl and fixtures/ under this project.
The committed bytes are the frozen suite. Integrity checks compare hashes
and do not need to regenerate.
"""
import hashlib
import json
import random
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 1412

TRAIN_TEMPLATES = {"harbour-membership", "harbour-payslip"}
DEV_TEMPLATES = {"northwind-visitor"}
TEST_TEMPLATES = {"cedar-clinic"}


def nric(prefix, digits):
    weights = (2, 7, 6, 5, 4, 3, 2)
    total = sum(int(ch) * w for ch, w in zip(digits, weights))
    if prefix in "TG":
        total += 4
    letters = "JZIHGFEDCBA" if prefix in "ST" else "XWUTRQPNMLK"
    return prefix + digits + letters[total % 11]


def persona(pid, given, family, prefix, digits, dob, sex, phone, email, blk, street, unit, postal, employer, role):
    return {
        "id": pid,
        "given": given,
        "family": family,
        "name": given + " " + family,
        "nric": nric(prefix, digits),
        "dob": dob,
        "sex": sex,
        "phone": phone,
        "email": email,
        "blk": blk,
        "street": street,
        "unit": unit,
        "postal": postal,
        "address": blk + " " + street + " #" + unit + " " + postal,
        "employer": employer,
        "role": role,
    }


PEOPLE = [
    persona("p01", "Amina", "Yusof", "S", "1029384", "02/01/1990", "Female", "+65 8000 1001", "amina.yusof@example.com", "12", "HARBOUR LANE", "04-12", "111111", "Harbour Press", "clerk"),
    persona("p02", "Budi", "Santoso", "S", "2938471", "15/04/1988", "Male", "+65 8000 1002", "budi.santoso@example.com", "8", "NORTH QUAY", "02-08", "222222", "North Quay Books", "driver"),
    persona("p03", "Chia", "Ling", "S", "3847562", "30/07/1994", "Female", "+65 8000 1003", "chia.ling@example.com", "4", "CEDAR WALK", "11-04", "333333", "Cedar Studio", "nurse"),
    persona("p04", "Dinesh", "Rao", "S", "4758693", "11/11/1985", "Male", "+65 8000 1004", "dinesh.rao@example.com", "19", "MARKET STREET", "06-19", "444444", "Market Goods", "analyst"),
    persona("p05", "Elina", "Tan", "S", "5601928", "09/02/1992", "Female", "+65 8000 1005", "elina.tan@example.com", "3", "RIVER CLOSE", "08-03", "555555", "River Ledger", "teacher"),
    persona("p06", "Farid", "Ong", "S", "6712034", "21/06/1987", "Male", "+65 8000 1006", "farid.ong@example.com", "27", "PALM ROAD", "01-27", "666666", "Palm Works", "technician"),
    persona("p07", "Grace", "Lim", "S", "7803145", "05/09/1996", "Female", "+65 8000 1007", "grace.lim@example.com", "6", "ORCHARD PLACE", "09-06", "777777", "Orchard Desk", "designer"),
    persona("p08", "Hafiz", "Chan", "S", "8914256", "18/12/1983", "Male", "+65 8000 1008", "hafiz.chan@example.com", "15", "HILL VIEW", "03-15", "888888", "Hill View Co", "supervisor"),
    persona("p09", "Irene", "Goh", "T", "1029384", "03/03/1991", "Female", "+65 8000 2009", "irene.goh@example.com", "21", "VISITOR BAY", "05-21", "121212", "Visitor Bay", "guide"),
    persona("p10", "Johan", "Teo", "T", "2938471", "14/08/1989", "Male", "+65 8000 2010", "johan.teo@example.com", "9", "FERRY ROAD", "07-09", "131313", "Ferry Road", "porter"),
    persona("p11", "Kala", "Singh", "T", "3847562", "27/05/1993", "Female", "+65 8000 2011", "kala.singh@example.com", "33", "PIER STREET", "10-33", "141414", "Pier Street", "cashier"),
    persona("p12", "Liam", "Koh", "T", "4758693", "08/10/1986", "Male", "+65 8000 2012", "liam.koh@example.com", "2", "DOCK LANE", "12-02", "151515", "Dock Lane", "planner"),
    persona("p13", "Mei", "Wong", "F", "1029387", "19/01/1995", "Female", "+65 8000 3013", "mei.wong@example.com", "44", "CLINIC DRIVE", "02-44", "161616", "Cedar Press", "clerk"),
    persona("p14", "Nabil", "Rahman", "F", "2938476", "22/04/1984", "Male", "+65 8000 3014", "nabil.rahman@example.com", "7", "WARD ROAD", "04-07", "171717", "Ward Road", "orderly"),
    persona("p15", "Olivia", "Poh", "G", "3847561", "13/07/1997", "Female", "+65 8000 3015", "olivia.poh@example.com", "18", "NURSE WAY", "06-18", "181818", "Nurse Way", "nurse"),
    persona("p16", "Prakash", "Menon", "G", "4758690", "29/09/1982", "Male", "+65 8000 3016", "prakash.menon@example.com", "5", "RECORD LANE", "08-05", "191919", "Record Lane", "clerk"),
    persona("p17", "Qin", "Yee", "M", "5601938", "06/02/1998", "Female", "+65 8000 3017", "qin.yee@example.com", "11", "INTAKE ROAD", "01-11", "202020", "Intake Road", "receptionist"),
    persona("p18", "Ravi", "Das", "M", "6712049", "17/11/1980", "Male", "+65 8000 3018", "ravi.das@example.com", "28", "ARCHIVE STREET", "03-28", "212121", "Archive Street", "archivist"),
]


def prompt_for(facts, fields, excerpt):
    bits = "; ".join(field["id"] + " = " + field["label"][:48] for field in fields)
    return "\n".join([
        "Fill only these form fields from the identity facts and the excerpt.",
        "Reply with a JSON object whose keys are the field ids. Use an empty string when the excerpt does not contain the value.",
        "Never answer with SINGAPORE or REPUBLIC OF SINGAPORE unless that is the whole street or country the field asks for, and never invent a phone or email.",
        "Facts: " + json.dumps(facts, ensure_ascii=True, separators=(",", ":")),
        "Fields: " + bits,
        "Excerpt: " + excerpt[:900],
    ])


def schema_for(fields):
    properties = {}
    for field in fields:
        description = "".join(ch if 32 <= ord(ch) < 127 else " " for ch in field["label"])
        description = " ".join(description.split())[:48] or field["id"]
        properties[field["id"]] = {"type": "string", "description": description}
    return {"type": "object", "properties": properties, "additionalProperties": False}


def letter(person):
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    day, month, year = person["dob"].split("/")
    born = str(int(day)) + " " + months[int(month) - 1] + " " + year
    sex = "F" if person["sex"] == "Female" else "M"
    return (
        "SYNTHETIC REFERENCE — not a real person\n"
        "Full name: " + person["name"] + "\n"
        "First name: " + person["given"] + "\n"
        "Last name: " + person["family"] + "\n"
        "NRIC/FIN: " + person["nric"] + "\n"
        "Date of birth: " + born + "\n"
        "Sex: " + sex + "\n"
        "Phone: " + person["phone"] + "\n"
        "Email: " + person["email"] + "\n"
        "Employer: " + person["employer"] + "\n"
        "APT BLK " + person["blk"] + " " + person["street"] + " #" + person["unit"] + "\n"
        + person["postal"] + "\n"
        "The holder works as a " + person["role"] + " at " + person["employer"] + ".\n"
    )


def record(split, template, person, fields, gold, parser_facts, model_fields):
    excerpt = letter(person)
    return {
        "id": split + "-" + template + "-" + person["id"],
        "split": split,
        "template_id": template,
        "persona_id": person["id"],
        "source": "synthetic:" + template,
        "task": "reference-to-fields",
        "reference_text": excerpt,
        "fields": fields,
        "parser_facts": parser_facts,
        "model_fields": model_fields,
        "gold": gold,
        "production_prompt": prompt_for(parser_facts, model_fields, excerpt),
        "production_schema": schema_for(model_fields),
    }


def membership_fields():
    return [
        {"id": "full_name", "label": "Full name", "type": "text"},
        {"id": "nric", "label": "NRIC/FIN", "type": "text"},
        {"id": "dob", "label": "Date of birth", "type": "text"},
        {"id": "mobile", "label": "Mobile", "type": "text"},
        {"id": "email", "label": "Email", "type": "text"},
        {"id": "address", "label": "Residential address", "type": "text"},
        {"id": "citizenship", "label": "Citizenship", "type": "text"},
    ]


def payslip_fields():
    return [
        {"id": "employee", "label": "Employee name", "type": "text"},
        {"id": "nric", "label": "Identity number", "type": "text"},
        {"id": "employer", "label": "Employer", "type": "text"},
        {"id": "net_pay", "label": "Net pay", "type": "text"},
    ]


def visitor_fields():
    return [
        {"id": "given", "label": "Given name", "type": "text"},
        {"id": "family", "label": "Family name", "type": "text"},
        {"id": "fin", "label": "FIN", "type": "text"},
        {"id": "birth", "label": "Birth date", "type": "text"},
        {"id": "phone", "label": "Phone", "type": "text"},
        {"id": "email", "label": "Email", "type": "text"},
        {"id": "nationality", "label": "Nationality", "type": "text"},
    ]


def clinic_fields():
    return [
        {"id": "patient", "label": "Patient name", "type": "text"},
        {"id": "identity", "label": "Identity card number", "type": "text"},
        {"id": "address", "label": "Residential address", "type": "text"},
        {"id": "contact", "label": "Contact number", "type": "text"},
        {"id": "sex", "label": "Sex", "type": "text"},
        {"id": "occupation", "label": "Occupation", "type": "text"},
        {"id": "dependant", "label": "Name of dependant", "type": "text"},
        {"id": "citizenship", "label": "Citizenship", "type": "text"},
        {"id": "bank", "label": "Bank account", "type": "text"},
    ]


def build_rows():
    by_id = {person["id"]: person for person in PEOPLE}
    rows = []
    for pid in ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08"]:
        person = by_id[pid]
        fields = membership_fields()
        parser = {
            "name": person["name"],
            "nric": person["nric"],
            "dob": person["dob"],
            "phone": person["phone"],
            "email": person["email"],
            "address": person["address"],
        }
        gold = {
            "full_name": person["name"],
            "nric": person["nric"],
            "dob": person["dob"],
            "mobile": person["phone"],
            "email": person["email"],
            "address": person["address"],
            "citizenship": "",
        }
        model_fields = [field for field in fields if field["id"] == "citizenship"]
        rows.append(record("train", "harbour-membership", person, fields, gold, parser, model_fields))
    for pid in ["p01", "p02", "p03", "p04"]:
        person = by_id[pid]
        fields = payslip_fields()
        parser = {"name": person["name"], "nric": person["nric"], "company": person["employer"]}
        gold = {
            "employee": person["name"],
            "nric": person["nric"],
            "employer": person["employer"],
            "net_pay": "",
        }
        model_fields = [field for field in fields if field["id"] in ("employer", "net_pay")]
        rows.append(record("train", "harbour-payslip", person, fields, gold, parser, model_fields))
    for pid in ["p09", "p10", "p11", "p12"]:
        person = by_id[pid]
        fields = visitor_fields()
        parser = {
            "firstName": person["given"],
            "lastName": person["family"],
            "nric": person["nric"],
            "dob": person["dob"],
            "phone": person["phone"],
            "email": person["email"],
        }
        gold = {
            "given": person["given"],
            "family": person["family"],
            "fin": person["nric"],
            "birth": person["dob"],
            "phone": person["phone"],
            "email": person["email"],
            "nationality": "",
        }
        model_fields = [field for field in fields if field["id"] == "nationality"]
        rows.append(record("dev", "northwind-visitor", person, fields, gold, parser, model_fields))
    for pid in ["p13", "p14", "p15", "p16", "p17", "p18"]:
        person = by_id[pid]
        fields = clinic_fields()
        parser = {
            "name": person["name"],
            "nric": person["nric"],
            "address": person["address"],
            "phone": person["phone"],
            "sex": person["sex"],
        }
        gold = {
            "patient": person["name"],
            "identity": person["nric"],
            "address": person["address"],
            "contact": person["phone"],
            "sex": person["sex"],
            "occupation": person["role"],
            "dependant": "",
            "citizenship": "",
            "bank": "",
        }
        model_fields = [field for field in fields if field["id"] in ("occupation", "dependant", "citizenship", "bank")]
        rows.append(record("test", "cedar-clinic", person, fields, gold, parser, model_fields))
    return rows


def pdf_escape(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_pdf(path, lines):
    """One-page Helvetica PDF. lines are (x, y, size, text) with origin bottom-left."""
    commands = ["BT"]
    for x, y, size, text in lines:
        commands.append("/F1 " + str(size) + " Tf")
        commands.append("1 0 0 1 " + str(x) + " " + str(y) + " Tm")
        commands.append("(" + pdf_escape(text) + ") Tj")
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1", "replace")
    objects = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objects.append(b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
    objects.append(b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n")
    objects.append(b"4 0 obj << /Length " + str(len(stream)).encode() + b" >> stream\n" + stream + b"\nendstream\nendobj\n")
    objects.append(b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref = len(out)
    out.extend(("xref\n0 6\n0000000000 65535 f \n").encode())
    for offset in offsets[1:]:
        out.extend(("{:010d} 00000 n \n".format(offset)).encode())
    out.extend(("trailer << /Size 6 /Root 1 0 R >>\nstartxref\n" + str(xref) + "\n%%EOF\n").encode())
    path.write_bytes(out)


def form_lines(title, rows):
    lines = [(48, 790, 16, title), (48, 768, 9, "SYNTHETIC BLANK — not an official form")]
    for label, y in rows:
        lines.append((48, y, 11, label))
        lines.append((210, y, 11, "______________________________"))
    return lines


def write_png_form(path, title, rows):
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (595, 842), "white")
    draw = ImageDraw.Draw(image)
    draw.text((48, 40), title, fill="black")
    draw.text((48, 62), "SYNTHETIC BLANK — not an official form", fill="black")
    for label, pdf_y in rows:
        top = 842 - pdf_y - 14
        draw.text((48, top), label, fill="black")
        draw.line((210, top + 12, 520, top + 12), fill="black", width=1)
    image.save(path)


def write_noisy(src, dest):
    from PIL import Image
    image = Image.open(src).convert("RGB")
    rng = random.Random(SEED)
    pixels = image.load()
    width, height = image.size
    for y in range(0, height, 3):
        for x in range(0, width, 3):
            r, g, b = pixels[x, y]
            delta = rng.randint(-18, 18)
            pixels[x, y] = (max(0, min(255, r + delta)), max(0, min(255, g + delta)), max(0, min(255, b + delta)))
    rotated = image.rotate(2.6, expand=True, fillcolor="white", resample=Image.Resampling.NEAREST)
    rotated.save(dest)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    rows = build_rows()
    data = ROOT / "data"
    forms = ROOT / "fixtures" / "forms"
    refs = ROOT / "fixtures" / "references"
    images = ROOT / "fixtures" / "images"
    notes = ROOT / "fixtures" / "annotations"
    for folder in (data, forms, refs, images, notes):
        folder.mkdir(parents=True, exist_ok=True)
    splits = {"train": [], "dev": [], "test": []}
    for row in rows:
        splits[row["split"]].append(row)
    for name, items in splits.items():
        path = data / (name + ".jsonl")
        path.write_text("".join(json.dumps(item, ensure_ascii=True, sort_keys=True) + "\n" for item in items), encoding="utf-8")
    membership_rows = [("Full name", 700), ("NRIC/FIN", 660), ("Date of birth", 620), ("Mobile", 580), ("Email", 540), ("Residential address", 500)]
    clinic_rows = [
        ("Patient name", 720),
        ("Identity card number", 680),
        ("Residential address", 640),
        ("Contact number", 600),
        ("Sex", 560),
        ("Occupation", 520),
        ("Name of dependant", 480),
        ("Citizenship", 440),
        ("Bank account", 400),
    ]
    write_pdf(forms / "harbour-membership-blank.pdf", form_lines("Harbour membership", membership_rows))
    write_pdf(forms / "cedar-clinic-blank.pdf", form_lines("Cedar clinic intake", clinic_rows))
    p01 = next(person for person in PEOPLE if person["id"] == "p01")
    p13 = next(person for person in PEOPLE if person["id"] == "p13")
    write_pdf(refs / "p01-reference.pdf", [(48, 780 - i * 18, 11, line) for i, line in enumerate(letter(p01).splitlines())])
    write_pdf(refs / "p13-reference.pdf", [(48, 780 - i * 18, 11, line) for i, line in enumerate(letter(p13).splitlines())])
    write_png_form(images / "cedar-clinic-clean.png", "Cedar clinic intake", clinic_rows)
    write_noisy(images / "cedar-clinic-clean.png", images / "cedar-clinic-noisy.png")
    annotations = {
        "template_id": "cedar-clinic",
        "split": "test",
        "page": {"width": 595, "height": 842, "origin": "bottom-left"},
        "fields": [
            {"id": name.lower().replace(" ", "_"), "label": name, "pdf_rule": {"x": 210, "y": y, "w": 310, "h": 1}}
            for name, y in clinic_rows
        ],
        "image_clean": {
            "file": "fixtures/images/cedar-clinic-clean.png",
            "width": 595,
            "height": 842,
            "y_from_top": "842 - pdf_y - 14 is the text top",
        },
        "image_noisy": {
            "file": "fixtures/images/cedar-clinic-noisy.png",
            "rotation_degrees": 2.6,
            "resample": "nearest",
            "noise_seed": SEED,
            "note": "Gold boxes are for the clean upright image. The noisy file is a derived view, not a second template.",
        },
        "license": "CC0-1.0",
    }
    (notes / "cedar-clinic.json").write_text(json.dumps(annotations, indent=2) + "\n", encoding="utf-8")
    tracked = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith("scripts/") or rel.startswith("results/") or rel.endswith(".md") or "LICENSE" in path.name:
            continue
        if rel in ("requirements-generate.txt", "requirements-train.txt"):
            continue
        tracked.append(rel)
    # Checksums cover generated data and fixtures only.
    generated = []
    for folder in (data, ROOT / "fixtures"):
        for path in sorted(folder.rglob("*")):
            if path.is_file() and path.name != "CHECKSUMS.sha256":
                generated.append(path.relative_to(ROOT).as_posix())
    lines = [sha256(ROOT / rel) + "  " + rel for rel in generated]
    (data / "CHECKSUMS.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", {name: len(items) for name, items in splits.items()})


if __name__ == "__main__":
    main()
