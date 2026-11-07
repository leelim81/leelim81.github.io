#!/usr/bin/env python3
"""Raster pages for the audit family. Seed 20261150. Not an intake or stack copy."""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SCALE = 2.2
PAGE_W, PAGE_H = 595, 842
FONT = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 28)
FONT_SM = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 24)


def rotate_point(x, y, w, h, angle, nw, nh):
    ang = math.radians(angle)
    cos, sin = math.cos(ang), math.sin(ang)
    dx, dy = x - w / 2, y - h / 2
    return (cos * dx + sin * dy + nw / 2, -sin * dx + cos * dy + nh / 2)


def finish(im, boxes, angle, seed):
    turned = im.rotate(angle, expand=True, fillcolor='white', resample=Image.Resampling.BICUBIC)
    turned = turned.filter(ImageFilter.GaussianBlur(radius=0.4))
    nw, nh = turned.size
    arr = np.asarray(turned).astype(np.int16)
    noise = np.random.default_rng(seed).integers(-6, 7, size=(nh, nw), dtype=np.int16)
    arr += noise[:, :, None]
    np.clip(arr, 0, 255, out=arr)
    turned = Image.fromarray(arr.astype(np.uint8), 'RGB')
    mapped = []
    w, h = im.size
    for x0, y0, bw, bh in boxes:
        corners = [rotate_point(x, y, w, h, angle, nw, nh) for x, y in ((x0, y0), (x0 + bw, y0), (x0, y0 + bh), (x0 + bw, y0 + bh))]
        xs = [p[0] for p in corners]
        ys = [p[1] for p in corners]
        mapped.append([round(min(xs), 2), round(min(ys), 2), round(max(xs) - min(xs), 2), round(max(ys) - min(ys), 2)])
    return turned, mapped


def band(path, lines, labels, angle, seed):
    w, h = int(PAGE_W * SCALE), int(PAGE_H * SCALE)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    draw.rectangle([0, 0, w, 36], fill=(30, 30, 30))
    draw.text((24, 6), 'quill band', fill='white', font=FONT_SM)
    y = 70
    for line in lines:
        draw.text((36, y), line, fill='black', font=FONT)
        y += 40
    boxes = []
    top = 280
    for i, label in enumerate(labels):
        y0 = top + i * 96
        draw.text((w - 420, y0), label, fill='black', font=FONT_SM)
        line_y = y0 + 34
        draw.line([(70, line_y), (w - 460, line_y)], fill='black', width=5)
        boxes.append((70, line_y - 8, (w - 460) - 70, 16))
    turned, mapped = finish(im, boxes, angle, seed)
    turned.save(path)
    return mapped, list(turned.size)


def card(path, lines, labels, angle, seed):
    w, h = int(PAGE_W * SCALE), int(PAGE_H * SCALE)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    draw.text((48, 48), 'quill card', fill='black', font=FONT)
    y = 100
    for line in lines:
        draw.text((48, y), line, fill='black', font=FONT)
        y += 36
    boxes = []
    top = 360
    for i, label in enumerate(labels):
        col = i % 2
        row = i // 2
        x0 = 60 + col * 640
        y0 = top + row * 150
        draw.text((x0, y0), label, fill='black', font=FONT_SM)
        line_y = y0 + 48
        draw.line([(x0, line_y), (x0 + 260, line_y)], fill='black', width=4)
        boxes.append((x0, line_y - 6, 260, 14))
    turned, mapped = finish(im, boxes, angle, seed)
    turned.save(path)
    return mapped, list(turned.size)


def text_page(path, lines, angle, seed):
    w, h = int(PAGE_W * SCALE), int(PAGE_H * SCALE)
    im = Image.new('RGB', (w, h), 'white')
    draw = ImageDraw.Draw(im)
    y = 80
    for line in lines:
        draw.text((48, y), line, fill='black', font=FONT)
        y += 46
    turned, _ = finish(im, [], angle, seed)
    turned.save(path)
    return list(turned.size)


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    out = {}
    for item in spec:
        if item['layout'] == 'text':
            size = text_page(item['png'], item['lines'], item['angle'], item['seed'])
            out[item['id']] = {'boxes': [], 'image_px': size}
            continue
        fn = band if item['layout'] == 'band' else card
        boxes, size = fn(item['png'], item['lines'], item['labels'], item['angle'], item['seed'])
        out[item['id']] = {'boxes': boxes, 'image_px': size}
    Path(sys.argv[2]).write_text(json.dumps(out))


if __name__ == '__main__':
    main()
