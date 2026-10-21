"""A page's words into visual lines: rows by top (the SR6 layout groups by baseline: importer/sr6/layout.baseline_rows),
a tilted line's letter sizes evened, the body size and the heading sizes."""

import statistics

LINE_TOLERANCE = 3  # pt; baseline jitter between regular/bold runs on one visual line


def size_bands(pdf):
    """(body size, up to three heading sizes biggest first) of the book's first 40 pages."""
    sizes = [round(c["size"], 1) for p in pdf.pages[:40] for c in p.chars]
    if not sizes:
        return 10, []
    body = statistics.mode(sizes)
    big = sorted({s for s in sizes if s >= body * 1.25}, reverse=True)[:3]
    return body, big  # big[0] -> '#', big[1] -> '##', big[2] -> '###'


_SIZE_NOISE = 0.2  # pt; the letters of a slightly tilted line measure a few hundredths of a point apart


def even_sizes(chars):
    """A slightly tilted line's letters (upright, a small rotation in the text matrix) measure a little apart
    in size, which would split every letter into its own word. Such chars less than _SIZE_NOISE from the next
    smaller one take its size, so a word still splits at a real size change (a small-caps initial)."""

    def tilted(c):
        return c["upright"] and c["matrix"][1] != 0

    sizes = sorted({c["size"] for c in chars if tilted(c)})
    even, base = {}, None
    for i, s in enumerate(sizes):
        base = base if i and s - sizes[i - 1] < _SIZE_NOISE else s
        even[s] = base
    return [{**c, "size": even[c["size"]]} if tilted(c) else c for c in chars]


def heading_level(size, big):
    """The heading level (1 is the biggest) whose size `size` matches, else 0."""
    return next((i + 1 for i, s in enumerate(big) if abs(size - s) < 0.6), 0)


def cluster_lines(words):
    """Group words into visual rows by y-proximity only.

    Anchored to the first word's top in the row (tolerant of small baseline
    jitter between regular and bold runs on one visual line). Rows are NOT
    split at wide word gaps here — justified text has those everywhere.
    Two columns sharing a row are split later, only at an accepted gutter.
    """
    words = sorted(words, key=lambda w: w["top"])
    rows, cur, anchor = [], [], None
    for w in words:
        if anchor is not None and abs(w["top"] - anchor) > LINE_TOLERANCE:
            rows.append(cur)
            cur = []
            anchor = None
        cur.append(w)
        if anchor is None:
            anchor = w["top"]
    if cur:
        rows.append(cur)
    return [sorted(r, key=lambda w: w["x0"]) for r in rows]


def line_extent(line):
    """(left, right) x extent of a line of words."""
    return min(w["x0"] for w in line), max(w["x1"] for w in line)
