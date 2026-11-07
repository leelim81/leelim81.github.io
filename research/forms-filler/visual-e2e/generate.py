#!/usr/bin/env python3
"""Raster forms and references. Image only. No text layer. Seed 20261112.

The JSON written next to each PNG is the answer key. The browser runner
must not read it.
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SCALE = 2.2
PAGE_W = 595
PAGE_H = 842
FONT = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 32)
FONT_SM = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 26)

DEV = ['Nia', 'Otto', 'Prim', 'Reed', 'Suki', 'Tess', 'Ulf', 'Wynn']
CAL = ['Xena', 'Yuri', 'Zeke', 'Abel', 'Bess', 'Cole', 'Dove', 'Edda', 'Falk', 'Grey', 'Ivo', 'June', 'Kian', 'Leda', 'Moss', 'Nell', 'Orla', 'Pax', 'Rhea', 'Shay']
TEST = ['Tove', 'Uma', 'Vail', 'Wes', 'Yael', 'Zia', 'Arlo', 'Bryn', 'Cai', 'Dory', 'Elin', 'Frost']

SPLITS = {
    'development': {
        'family': 'V', 'template': 'intake_sheet', 'street': 'QUAY LANE', 'other': 'Kim Voss',
        'given': DEV,
        'labels': ['Visitor name', 'Visitor FIN', 'Visitor birth date', 'Visitor handset', 'Visitor inbox', 'Visitor street', 'Visitor mailbox'],
        'modes': ['single', 'patient_other', 'conflict', 'single'],
    },
    'calibration': {
        'family': 'R', 'template': 'roster_sheet', 'street': 'RIDGE ROW', 'other': 'Kim Quinn',
        'given': CAL,
        'labels': ['Roster name', 'Roster identity number', 'Roster dob', 'Roster mobile', 'Roster email', 'Roster premises', 'Roster post mailbox'],
        'modes': ['single'] * 16 + ['patient_other', 'patient_other', 'conflict', 'conflict', 'missing_email', 'same_person'],
    },
    'test': {
        'family': 'H', 'template': 'holder_sheet', 'street': 'MILL PATH', 'other': 'Kim Howe',
        'given': TEST,
        'labels': ['Holder name', 'Holder identification number', 'Holder birth date', 'Holder callback', 'Holder reply email', 'Holder dwelling', 'Holder po mailbox'],
        'modes': ['single'] * 8 + ['patient_other', 'patient_other', 'conflict', 'conflict', 'missing_email', 'same_person'],
    },
}
KINDS = ['name', 'nric', 'dob', 'phone', 'email', 'address', 'mailbox']


def nric(prefix, digits):
    weights = [2, 7, 6, 5, 4, 3, 2]
    total = sum(int(digits[i]) * weights[i] for i in range(7))
    if prefix in 'TG':
        total += 4
    letters = 'JZIHGFEDCBA' if prefix in 'ST' else 'XWUTRQPNMLK'
    return prefix + digits + letters[total % 11]


def person(split, index):
    spec = SPLITS[split]
    given = spec['given'][index % len(spec['given'])]
    digits = f'{2000000 + index * 13 + ord(spec["family"]):07d}'[:7]
    prefix = 'S' if index % 2 == 0 else 'T'
    postal = f'{300000 + ord(spec["family"]) * 50 + index:06d}'[:6]
    return {
        'id': f'v2-{split}-{index}',
        'name': f'{given} Sample',
        'nric': nric(prefix, digits),
        'dob': f'{(index % 27) + 1:02d}/{(index % 12) + 1:02d}/199{index % 10}',
        'phone': f'+65 8{index:07d}',
        'email': f'{given.lower()}.sample{index}@example.com',
        'address': f'{12 + index} {spec["street"]} {postal}',
        'other_name': spec['other'],
        'other_dob': '03/03/1977',
    }


def reference_lines(mode, p):
    applicant = [
        'Applicant',
        f'Full name: {p["name"]}',
        f'NRIC: {p["nric"]}',
        f'Date of birth: {p["dob"]}',
        f'Phone: {p["phone"]}',
        f'Email: {p["email"]}',
        f'Address: {p["address"]}',
    ]
    if mode == 'missing_email':
        return [line for line in applicant if not line.startswith('Email:')]
    if mode == 'single':
        return applicant
    if mode == 'patient_other':
        return applicant + ['Patient', f'Full name: {p["other_name"]}', f'Date of birth: {p["other_dob"]}']
    if mode == 'conflict':
        return applicant + ['Applicant', f'Full name: {p["other_name"]}', f'Date of birth: {p["other_dob"]}']
    if mode == 'same_person':
        return ['The patient is the applicant', 'Patient', f'Full name: {p["name"]}', f'NRIC: {p["nric"]}', f'Date of birth: {p["dob"]}', f'Phone: {p["phone"]}', f'Email: {p["email"]}', f'Address: {p["address"]}']
    raise ValueError(mode)


def gold_fields(mode, p, labels):
    present = {
        'name': p['name'],
        'nric': p['nric'],
        'dob': p['dob'],
        'phone': p['phone'],
        'email': '' if mode == 'missing_email' else p['email'],
        'address': p['address'],
        'mailbox': '',
    }
    rows = []
    for kind, label in zip(KINDS, labels):
        blocked = mode == 'conflict' and kind in ('name', 'dob')
        ok = bool(present[kind]) and not blocked
        rows.append({
            'kind': kind,
            'label_drawn': label,
            'answerable': ok,
            'gold': present[kind] if ok else '',
        })
    return rows


def rotate_point(x, y, w, h, angle, nw, nh):
    ang = math.radians(angle)
    cos, sin = math.cos(ang), math.sin(ang)
    dx, dy = x - w / 2, y - h / 2
    return (cos * dx + sin * dy + nw / 2, -sin * dx + cos * dy + nh / 2)


def draw_page(lines, labels, angle, blur, sigma, seed):
    w, h = int(PAGE_W * SCALE), int(PAGE_H * SCALE)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    y = 70
    for line in lines:
        draw.text((48, y), line, fill='black', font=FONT)
        y += 46
    box_px = []
    top = max(y + 24, 180)
    for i, label in enumerate(labels):
        y0 = top + i * 78
        draw.text((48, y0 + 4), label, fill='black', font=FONT_SM)
        x0, bw, bh = 420, 520, 44
        draw.rectangle([x0, y0, x0 + bw, y0 + bh], outline='black', width=6)
        box_px.append((x0, y0, bw, bh))
    turned = im.rotate(angle, expand=True, fillcolor='white', resample=Image.Resampling.BICUBIC)
    turned = turned.filter(ImageFilter.GaussianBlur(radius=blur))
    nw, nh = turned.size
    import numpy as np
    arr = np.asarray(turned).astype(np.int16)
    noise = np.random.default_rng(seed).integers(-sigma, sigma + 1, size=(nh, nw), dtype=np.int16)
    arr += noise[:, :, None]
    np.clip(arr, 0, 255, out=arr)
    turned = Image.fromarray(arr.astype(np.uint8), 'RGB')
    mapped = []
    for x0, y0, bw, bh in box_px:
        corners = [rotate_point(x, y, w, h, angle, nw, nh) for x, y in ((x0, y0), (x0 + bw, y0), (x0, y0 + bh), (x0 + bw, y0 + bh))]
        xs = [p[0] for p in corners]
        ys = [p[1] for p in corners]
        mapped.append((min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)))
    return turned, mapped


def draw_underlines(lines, labels, angle, blur, sigma, seed):
    w, h = int(PAGE_W * SCALE), int(PAGE_H * SCALE)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    y = 70
    for line in lines:
        draw.text((48, y), line, fill='black', font=FONT)
        y += 46
    box_px = []
    top = max(y + 30, 200)
    for i, label in enumerate(labels):
        y0 = top + i * 84
        draw.text((48, y0), label, fill='black', font=FONT_SM)
        line_y = y0 + 40
        draw.line([(48, line_y), (760, line_y)], fill='black', width=6)
        box_px.append((48, line_y - 8, 712, 16))
    turned = im.rotate(angle, expand=True, fillcolor='white', resample=Image.Resampling.BICUBIC)
    turned = turned.filter(ImageFilter.GaussianBlur(radius=blur))
    import numpy as np
    arr = np.asarray(turned).astype(np.int16)
    nw, nh = turned.size
    noise = np.random.default_rng(seed).integers(-sigma, sigma + 1, size=(nh, nw), dtype=np.int16)
    arr += noise[:, :, None]
    np.clip(arr, 0, 255, out=arr)
    turned = Image.fromarray(arr.astype(np.uint8), 'RGB')
    mapped = []
    for x0, y0, bw, bh in box_px:
        corners = [rotate_point(x, yy, w, h, angle, nw, nh) for x, yy in ((x0, y0), (x0 + bw, y0), (x0, y0 + bh), (x0 + bw, y0 + bh))]
        xs = [p[0] for p in corners]
        ys = [p[1] for p in corners]
        mapped.append((min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)))
    return turned, mapped


def write_stack():
    """Second development layout. Does not rewrite the boxed intake sheets."""
    spec_labels = ['Member name', 'Member FIN', 'Member birth date', 'Member handset', 'Member inbox', 'Member street', 'Member mailbox']
    modes = ['single', 'patient_other', 'conflict', 'single']
    given = ['Suki', 'Tess', 'Ulf', 'Wynn']
    records = []
    dest = ROOT / 'fixtures' / 'development-stack'
    dest.mkdir(parents=True, exist_ok=True)
    for index, mode in enumerate(modes):
        p = person('development', 20 + index)
        p['name'] = f'{given[index]} Sample'
        p['email'] = f'{given[index].lower()}.sample{1 if index == 0 else 20 + index}@example.com'
        p['id'] = f'v2-development-stack-{index}'
        angle = round((index - 1.5) * 0.8, 2)
        form, boxes = draw_underlines(['member stack', 'Synthetic raster. Not a real form.'], spec_labels, angle, 0.35, 7, 20261120 + index)
        ref, _ = draw_underlines(reference_lines(mode, p), [], angle * 0.5, 0.35, 7, 20261130 + index)
        stem = f'development-stack-{index:02d}'
        form.save(dest / f'{stem}.form.png')
        ref.save(dest / f'{stem}.reference.png')
        fields = gold_fields(mode, p, spec_labels)
        for field, box in zip(fields, boxes):
            field['box_px'] = [round(v, 2) for v in box]
        records.append({
            'id': stem,
            'split': 'development-stack',
            'template_id': 'member_stack',
            'label_family': 'V2',
            'person_id': p['id'],
            'layout': 'underline',
            'ambiguity': mode,
            'rotation_deg': angle,
            'blur': 0.35,
            'noise_sigma': 7,
            'image_px': list(form.size),
            'fields': fields,
            'other_values': {'name': [p['other_name']], 'dob': [p['other_dob']]},
            'printed_reference_lines': reference_lines(mode, p),
        })
    (ROOT / 'stack-key.json').write_text(json.dumps(records, indent=2) + '\n')
    print('stack', len(records))


def main():
    out_root = ROOT / 'fixtures'
    if out_root.exists():
        for path in out_root.rglob('*'):
            if path.is_file():
                path.unlink()
    records = {name: [] for name in SPLITS}
    for split, spec in SPLITS.items():
        for index, mode in enumerate(spec['modes']):
            p = person(split, index)
            angle = round((((index * 37) % 11) - 5) * 0.5, 2)
            blur = 0.35
            sigma = 7
            seed = 20261112 + index * 17 + ord(spec['family'])
            form_lines = [spec['template'].replace('_', ' '), 'Synthetic raster. Not a real form.']
            ref_lines = reference_lines(mode, p)
            form, boxes = draw_page(form_lines, spec['labels'], angle, blur, sigma, seed)
            ref, _ = draw_page(ref_lines, [], angle * 0.5, blur, sigma, seed + 3)
            dest = out_root / split
            dest.mkdir(parents=True, exist_ok=True)
            stem = f'{split}-{spec["template"]}-{index:02d}'
            form.save(dest / f'{stem}.form.png')
            ref.save(dest / f'{stem}.reference.png')
            fields = gold_fields(mode, p, spec['labels'])
            for field, box in zip(fields, boxes):
                field['box_px'] = [round(v, 2) for v in box]
            records[split].append({
                'id': stem,
                'split': split,
                'template_id': spec['template'],
                'label_family': spec['family'],
                'person_id': p['id'],
                'layout': 'raster',
                'ambiguity': mode,
                'rotation_deg': angle,
                'blur': blur,
                'noise_sigma': sigma,
                'image_px': list(form.size),
                'fields': fields,
                'other_values': {'name': [p['other_name']], 'dob': [p['other_dob']]},
                'printed_reference_lines': ref_lines,
            })
    (ROOT / 'answer-key.json').write_text(json.dumps(records, indent=2) + '\n')
    print({name: len(rows) for name, rows in records.items()})


def write_feature():
    """One boxed raster pair for the profile end-to-end. Not a scorecard split."""
    labels = ['Full name', 'Phone', 'Email']
    p = person('development', 40)
    p['name'] = 'Cora Example'
    p['email'] = 'cora.sample9@example.com'
    p['phone'] = '+65 80000009'
    p['id'] = 'feature-cora'
    dest = ROOT / 'fixtures' / 'feature-e2e'
    dest.mkdir(parents=True, exist_ok=True)
    form, _ = draw_page(['feature form', 'Synthetic raster. Not a real form.'], labels, -0.8, 0.35, 7, 20261121)
    ref, _ = draw_page(reference_lines('single', p), [], -0.4, 0.35, 7, 20261122)
    ambiguous, _ = draw_page([
        'Applicant',
        'Full name: Cora Example',
        'Email: cora.other@example.com',
        'Applicant',
        'Full name: Bea Example',
        'Email: bea@example.com'
    ], [], 0.2, 0.35, 7, 20261123)
    form.save(dest / 'cora.form.png')
    ref.save(dest / 'cora.reference.png')
    ambiguous.save(dest / 'cora.ambiguous.png')
    print('feature pngs', dest)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'stack':
        write_stack()
    elif len(sys.argv) > 1 and sys.argv[1] == 'feature':
        write_feature()
    else:
        main()
