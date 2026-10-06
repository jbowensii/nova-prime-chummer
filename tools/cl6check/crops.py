"""Crops of the printed page for a value, to read it as printed (step 3 of the parity work).

`locate(words, name, value)` finds where a page prints a value on the row naming an item: the value word nearest the
name's first word (same line first), from pdfplumber's words. `crop(pdf, page, name, value, out)` renders that band
of the page with pypdfium2 (a row and a row and a half above and below, for the neighbours) and saves it as a PNG.
`sheet(crops, out)` stacks labelled crops into one image to read at once. No OCR: a person (or Claude) reads the
image and records a verdict in the owner's verdicts file (trace.py)."""
import re

SCALE = 4  # 288 dpi


def _norm(t):
    return re.sub(r"[¥,\s*†]", "", t or "").casefold()


def _number(value):
    m = re.search(r"\d[\d,.]*", value or "")
    return _norm(m.group(0)) if m else _norm(value)


def locate(words, name, value):
    """(x0, top, x1, bottom) of the band printing `value` on the row naming `name`, or None. words: pdfplumber
    words ({text, x0, x1, top, bottom})."""
    key = next((w for w in re.findall(r"[A-Za-z0-9]+", name or "") if len(w) >= 3), None)
    want = _number(value)
    if not key or not want:
        return None
    anchors = [w for w in words if _norm(w["text"]).startswith(key.casefold())]
    vals = [w for w in words if _norm(w["text"]) == want or _norm(w["text"]).startswith(want + "(")]
    best = None
    for a in anchors:
        for v in vals:
            dy, dx = abs((v["top"] + v["bottom"]) / 2 - (a["top"] + a["bottom"]) / 2), v["x0"] - a["x0"]
            score = dy * 3 + (abs(dx) * 0.05 if dx >= 0 else 200 + abs(dx))
            if best is None or score < best[0]:
                best = (score, a, v)
    if best is None or best[0] > 400:
        return None
    _, a, v = best
    return min(a["x0"], v["x0"]), min(a["top"], v["top"]), max(a["x1"], v["x1"]), max(a["bottom"], v["bottom"])


def crop(pdf, page, name, value, out, pad_rows=1.5, pages=(0, 1, -1)):
    """Render the band of `pdf` page `page` (1-based) printing `value` beside `name` to `out`. Tries the page and its
    neighbours. Returns (page, bbox) or None."""
    import pdfplumber
    import pypdfium2 as pdfium
    with pdfplumber.open(pdf) as d:
        for off in pages:
            p = page + off
            if not 1 <= p <= len(d.pages):
                continue
            pg = d.pages[p - 1]
            box = locate(pg.extract_words(keep_blank_chars=False), name, value)
            if box:
                width = float(pg.width)
                break
        else:
            return None
    x0, top, x1, bottom = box
    row = max(8.0, bottom - top)
    band = (max(0, x0 - 20), max(0, top - row * pad_rows - 4), min(width, max(x1 + 60, x0 + 320)),
            bottom + row * pad_rows + 4)
    doc = pdfium.PdfDocument(pdf)
    img = doc[p - 1].render(scale=SCALE).to_pil()
    img.crop(tuple(int(c * SCALE) for c in band)).save(out)
    doc.close()
    return p, band


def sheet(items, out, width=1400):
    """Stack [(label, png path)] into one image, each crop under its label."""
    from PIL import Image, ImageDraw
    tiles = []
    for label, path in items:
        im = Image.open(path)
        if im.width > width:
            im = im.resize((width, int(im.height * width / im.width)))
        tiles.append((label, im))
    h = sum(im.height + 34 for _, im in tiles) + 10
    canvas = Image.new("RGB", (width, h), "white")
    draw, y = ImageDraw.Draw(canvas), 5
    for label, im in tiles:
        draw.text((6, y), label, fill="black")
        canvas.paste(im, (0, y + 22))
        y += im.height + 34
    canvas.save(out)
    return out
