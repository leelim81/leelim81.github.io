#!/usr/bin/env python3
"""Structural families for the scan stage. Seed is per page. Not an intake copy."""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PAGE_W, PAGE_H = 595, 842
SANS = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
SERIF = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'


def font(name, size):
    return ImageFont.truetype(SERIF if name == 'serif' else SANS, size)


def rotate_point(x, y, w, h, angle, nw, nh):
    ang = math.radians(angle)
    cos, sin = math.cos(ang), math.sin(ang)
    dx, dy = x - w / 2, y - h / 2
    return (cos * dx + sin * dy + nw / 2, -sin * dx + cos * dy + nh / 2)


def finish(im, boxes, angle, seed, blur, sigma):
    turned = im.rotate(angle, expand=True, fillcolor='white', resample=Image.Resampling.BICUBIC)
    if blur:
        turned = turned.filter(ImageFilter.GaussianBlur(radius=blur))
    nw, nh = turned.size
    arr = np.asarray(turned).astype(np.int16)
    rng = np.random.default_rng(seed)
    noise = rng.integers(-sigma, sigma + 1, size=(nh, nw), dtype=np.int16)
    arr += noise[:, :, None]
    np.clip(arr, 0, 255, out=arr)
    turned = Image.fromarray(arr.astype(np.uint8), 'RGB')
    w, h = im.size
    mapped = []
    for x0, y0, bw, bh in boxes:
        corners = [rotate_point(x, y, w, h, angle, nw, nh) for x, y in (
            (x0, y0), (x0 + bw, y0), (x0, y0 + bh), (x0 + bw, y0 + bh))]
        xs = [p[0] for p in corners]
        ys = [p[1] for p in corners]
        mapped.append([round(min(xs), 2), round(min(ys), 2), round(max(xs) - min(xs), 2), round(max(ys) - min(ys), 2)])
    return turned, mapped


def text_page(item):
    scale = item.get('scale', 2.2)
    w, h = int(PAGE_W * scale), int(PAGE_H * scale)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    face = font(item.get('font', 'sans'), 30)
    y = 80
    for line in item['lines']:
        draw.text((48, y), line, fill='black', font=face)
        y += 48
    turned, _ = finish(im, [], item.get('angle', 0.4), item['seed'], item.get('blur', 0.35), item.get('sigma', 6))
    turned.save(item['png'])
    return {'boxes': [], 'image_px': list(turned.size)}


def form_page(item):
    scale = item.get('scale', 2.2)
    w, h = int(PAGE_W * scale), int(PAGE_H * scale)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    face = font(item.get('font', 'sans'), 26)
    small = font(item.get('font', 'sans'), 22)
    draw.text((36, 28), item.get('title', 'scan'), fill='black', font=face)
    boxes = []
    labels = item['labels']
    layout = item['layout']
    if layout == 'under':
        y0 = 160
        width = item.get('line_w', 220)
        for i, label in enumerate(labels):
            y = y0 + i * item.get('pitch', 100)
            draw.text((48, y), label, fill='black', font=small)
            ly = y + 40
            draw.line([(48, ly), (48 + width, ly)], fill='black', width=4)
            boxes.append((48, ly - 8, width, 16))
    elif layout == 'columns':
        for i, label in enumerate(labels):
            col = i % 2
            row = i // 2
            x = 40 + col * (w // 2)
            y = 160 + row * 120
            draw.text((x, y), label, fill='black', font=small)
            ly = y + 42
            draw.line([(x, ly), (x + 240, ly)], fill='black', width=4)
            boxes.append((x, ly - 8, 240, 16))
    elif layout == 'table':
        y = 180
        col_w = 280
        for i, label in enumerate(labels):
            x = 40 + (i % 3) * (col_w + 20)
            row = i // 3
            yy = y + row * 110
            draw.text((x, yy), label, fill='black', font=small)
            ly = yy + 40
            draw.line([(x, ly), (x + 200, ly)], fill='black', width=4)
            boxes.append((x, ly - 8, 200, 16))
    elif layout == 'beside':
        for i, label in enumerate(labels):
            y = 150 + i * 90
            draw.text((36, y), label, fill='black', font=small)
            ly = y + 14
            x0 = 280
            draw.line([(x0, ly), (x0 + 260, ly)], fill='black', width=4)
            boxes.append((x0, ly - 8, 260, 16))
    elif layout == 'boxes':
        for i, label in enumerate(labels):
            y = 140 + i * 92
            draw.text((40, y), label, fill='black', font=small)
            draw.rectangle([40, y + 36, 40 + 260, y + 78], outline='black', width=4)
            boxes.append((40, y + 36, 260, 42))
    elif layout == 'above':
        for i, label in enumerate(labels):
            y = 160 + i * 100
            draw.line([(48, y), (48 + 300, y)], fill='black', width=4)
            boxes.append((48, y - 8, 300, 16))
            draw.text((48, y + 12), label, fill='black', font=small)
    elif layout == 'ladder':
        for i, label in enumerate(labels):
            y = 140 + i * 100
            draw.rectangle([24, y, 36, y + 70], fill='black')
            draw.text((52, y), label, fill='black', font=small)
            draw.line([(52, y + 64), (420, y + 64)], fill='black', width=3)
            boxes.append((52, y + 56, 368, 14))
    elif layout == 'margin':
        for i, label in enumerate(labels):
            y = 130 + i * 96
            draw.text((40, y), label, fill='black', font=small)
            draw.line([(w - 420, y + 18), (w - 80, y + 18)], fill='black', width=4)
            boxes.append((w - 420, y + 10, 340, 16))
    elif layout == 'row':
        for i, label in enumerate(labels):
            x = 30 + i * 210
            draw.text((x, 200), label, fill='black', font=small)
            draw.rectangle([x, 250, x + 180, 300], outline='black', width=4)
            boxes.append((x, 250, 180, 50))
    else:
        raise SystemExit('unknown layout ' + layout)
    turned, mapped = finish(im, boxes, item.get('angle', 0.5), item['seed'], item.get('blur', 0.35), item.get('sigma', 6))
    turned.save(item['png'])
    return {'boxes': mapped, 'image_px': list(turned.size)}


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    out = {}
    for item in spec:
        out[item['id']] = text_page(item) if item['layout'] == 'text' else form_page(item)
    Path(sys.argv[2]).write_text(json.dumps(out))


if __name__ == '__main__':
    main()
