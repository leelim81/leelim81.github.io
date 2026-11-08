"""Draw four new blank layouts. Boxes are destinations, not model input."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def page():
    im = Image.new("RGB", (900, 1200), "white")
    return im, ImageDraw.Draw(im), font(22)


def save(im, boxes, item, out):
    path = Path(item["png"])
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    out[item["id"]] = {"boxes": boxes, "image": [im.width, im.height]}


def draw(item, out):
    im, pen, face = page()
    boxes = []
    layout = item["layout"]
    labels = item["labels"]
    pen.text((36, 24), item["title"], fill="black", font=face)
    if layout == "ticket":
        for i, label in enumerate(labels):
            y = 620 + i * 110
            pen.text((70, y), label, fill="black", font=face)
            ly = y + 48
            pen.line([(70, ly), (70 + 420, ly)], fill="black", width=3)
            boxes.append({"cls": "text", "px": [70, ly - 6, 420, 14]})
    elif layout == "rail":
        for i, label in enumerate(labels):
            y = 180 + i * 140
            pen.line([(48, y + 20), (48 + 220, y + 20)], fill="black", width=3)
            boxes.append({"cls": "text", "px": [48, y + 12, 220, 14]})
            pen.text((290, y), label, fill="black", font=face)
    elif layout == "pair":
        for i, label in enumerate(labels):
            col = i % 2
            row = i // 2
            x = 40 + col * 440
            y = 200 + row * 180
            pen.text((x, y), label, fill="black", font=face)
            ly = y + 50
            pen.line([(x, ly), (x + 200, ly)], fill="black", width=3)
            boxes.append({"cls": "text", "px": [x, ly - 6, 200, 14]})
    elif layout == "marks":
        pen.text((40, 160), labels[0], fill="black", font=face)
        pen.rectangle([40, 210, 360, 248], outline="black", width=3)
        boxes.append({"cls": "text", "px": [40, 210, 320, 38]})
        for i, label in enumerate(labels[1:4]):
            y = 320 + i * 70
            pen.rectangle([48, y, 78, y + 30], outline="black", width=3)
            boxes.append({"cls": "choice", "px": [48, y, 30, 30]})
            pen.text((96, y), label, fill="black", font=face)
        pen.text((40, 560), labels[4], fill="black", font=face)
        pen.line([(40, 640), (520, 640)], fill="black", width=2)
        boxes.append({"cls": "signature", "px": [40, 628, 480, 16]})
    else:
        raise SystemExit("unknown " + layout)
    save(im, boxes, item, out)


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    out = {}
    for item in spec:
        draw(item, out)
    Path(sys.argv[2]).write_text(json.dumps(out))


if __name__ == "__main__":
    main()
