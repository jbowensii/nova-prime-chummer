"""PDF -> Markdown for recipes. pdfplumber (MIT). Output only has to be consistent, not pretty."""
import hashlib
import re
import statistics

import pdfplumber

CONVERTER_VERSION = "6"  # 2: bold runs wrapped in **…**; 3: table cells rebuilt on one column grid;
# 4: a word outside every grid cell goes to the nearest column (was: the last);
# 5: a cell set in two text columns (a boxed sidebar) is read column by column (was: line by line, interleaved);
#    a label/value list in one cell keeps its rows; 6: a slightly tilted line keeps its words (was: a letter a word)
SR6_CONVERTER_VERSION = "sr6-3"  # convert(..., sr6=True), importer/sr6/layout.py; 2: lines by baseline, columns
# split where the content stream jumps (a gutter narrower than a word space); 3: a second copy of a page's text layer
# dropped, words split after a ligature joined

_LINE_TOLERANCE = 3  # pt; baseline jitter between regular/bold runs on one visual line
# ponytail: fixed heuristics for 1-2 columns; add real N-column clustering
# (k-means on x0) if a 3+ column layout shows up in practice.
_GUTTER_HALF = 5  # pt; a gutter is a clear strip >= 10pt (~1 em at body size) wide
_MIN_LINES_PER_SIDE = 2
_MAX_CROSS_FRACTION = 0.10
_TEXT_WORDS = 4  # words a line, median, for a side of a table cell to count as a text column


def _bands(pdf):
    sizes = [round(c["size"], 1) for p in pdf.pages[:40] for c in p.chars]
    if not sizes:
        return 10, []
    body = statistics.mode(sizes)
    big = sorted({s for s in sizes if s >= body * 1.25}, reverse=True)[:3]
    return body, big  # big[0] -> '#', big[1] -> '##', big[2] -> '###'


_SIZE_NOISE = 0.2  # pt; the letters of a slightly tilted line measure a few hundredths of a point apart


def _even_sizes(chars):
    """A slightly tilted line's letters (upright, a small rotation in the text matrix) measure a little apart
    in size, which would split every letter into its own word. Such chars less than _SIZE_NOISE from the next
    smaller one take its size, so a word still splits at a real size change (a small-caps initial)."""
    tilted = lambda c: c["upright"] and c["matrix"][1] != 0
    sizes = sorted({c["size"] for c in chars if tilted(c)})
    even, base = {}, None
    for i, s in enumerate(sizes):
        base = base if i and s - sizes[i - 1] < _SIZE_NOISE else s
        even[s] = base
    return [{**c, "size": even[c["size"]]} if tilted(c) else c for c in chars]


def _heading_level(size, big):
    return next((i + 1 for i, s in enumerate(big) if abs(size - s) < 0.6), 0)


_BOLD = re.compile(r"bold|black|heavy", re.I)


def _is_bold(word):
    """Most of the word's letters/digits are set in a bold face (the bullet glyph and punctuation don't count)."""
    chars = [c for c in word["chars"] if c["text"].isalnum()]
    return bool(chars) and sum(bool(_BOLD.search(c["fontname"])) for c in chars) * 2 > len(chars)


def _line_text(line):
    """Words joined by spaces, adjacent bold words merged into one **run**. A punctuation-only word
    ("–") between two bold words stays inside the run."""
    bold = [_is_bold(w) for w in line]
    bold = [b or (0 < i < len(line) - 1 and bold[i - 1] and bold[i + 1] and not any(c.isalnum() for c in line[i]["text"]))
            for i, b in enumerate(bold)]
    out, run = [], []
    for w, b in zip(line + [None], bold + [False]):
        if b:
            run.append(w["text"])
            continue
        if run:
            out.append("**" + " ".join(run) + "**")
            run = []
        if w is not None:
            out.append(w["text"])
    return " ".join(out)


def _inside(a, b):
    return b[0] <= a[0] and b[1] <= a[1] and a[2] <= b[2] and a[3] <= b[3]


def _in_box(w, b):
    """The word's centre lies in box b: the one test for which table a word belongs to."""
    return b[0] <= (w["x0"] + w["x1"]) / 2 <= b[2] and b[1] <= (w["top"] + w["bottom"]) / 2 <= b[3]


def _in_table(w, table_boxes):
    return any(_in_box(w, b) for b in table_boxes)


def _cluster_lines(words):
    """Group words into visual rows by y-proximity only.

    Anchored to the first word's top in the row (tolerant of small baseline
    jitter between regular and bold runs on one visual line). Rows are NOT
    split at wide word gaps here — justified text has those everywhere.
    Two columns sharing a row are split later, only at an accepted gutter.
    The SR6 layout's words carry their baseline (`base`): see _baseline_rows.
    """
    if words and all("base" in w for w in words):
        return _baseline_rows(words)
    words = sorted(words, key=lambda w: w["top"])
    rows, cur, anchor = [], [], None
    for w in words:
        if anchor is not None and abs(w["top"] - anchor) > _LINE_TOLERANCE:
            rows.append(cur)
            cur = []
            anchor = None
        cur.append(w)
        if anchor is None:
            anchor = w["top"]
    if cur:
        rows.append(cur)
    return [sorted(r, key=lambda w: w["x0"]) for r in rows]


_TINY = 0.5  # x the page's median word size: a glyph smaller than this (a small raised bullet) joins a row beside it
_TINY_REACH = 30  # pt; how far beside it


def _baseline_rows(words):
    """Rows by baseline, a word joining the row when its baseline is within _LINE_TOLERANCE of the previous one (a label
    set smaller than its value sits a little off its baseline, and the other column's lines may sit in between). A tiny
    glyph joins the row of the nearest word up to _TINY_REACH beside it whose baseline is within half that word's size,
    else it is a row of its own."""
    med = statistics.median(w["size"] for w in words)
    tiny = [w for w in words if w["size"] < _TINY * med]
    rows, cur, last = [], [], None
    for w in sorted((w for w in words if w["size"] >= _TINY * med), key=lambda w: w["base"]):
        if last is not None and w["base"] - last > _LINE_TOLERANCE:
            rows.append(cur)
            cur = []
        cur.append(w)
        last = w["base"]
    if cur:
        rows.append(cur)
    for t in tiny:
        near = [(abs(w["base"] - t["base"]), i) for i, r in enumerate(rows) for w in r
                if max(w["x0"] - t["x1"], t["x0"] - w["x1"]) <= _TINY_REACH and abs(w["base"] - t["base"]) <= w["size"] / 2]
        if near:
            rows[min(near)[1]].append(t)
        else:
            rows.append([t])
    rows.sort(key=lambda r: min(w["base"] for w in r))
    return [sorted(r, key=lambda w: w["x0"]) for r in rows]


def _line_extent(line):
    return min(w["x0"] for w in line), max(w["x1"] for w in line)


def _jump(a, b):
    """Word b doesn't follow word a in the page's content stream: two text columns meet on this row (the SR6 layout
    numbers each char, `i`; a book whose columns sit closer than a word space has no whitespace gutter to find)."""
    ia, ib = a["chars"][-1].get("i"), b["chars"][0].get("i")
    return ia is not None and ib is not None and not 0 < ib - ia <= 3


def _split_at(row, x, tol=0):
    """Split a row at gutter x, unless a word runs through the gutter strip. tol (the SR6 layout): the row splits in
    its widest gap that holds a strip up to tol from x (a boxed sidebar's gutter sits a few points off the body
    text's) and is wider than a word space at its words' size (a chapter title's word spaces are a strip wide), or
    where the content stream jumps (`_jump`)."""
    if tol:
        gaps = [(b["x0"] - a["x1"], min(max(x, a["x1"] + _GUTTER_HALF), b["x0"] - _GUTTER_HALF), k)
                for k, (a, b) in enumerate(zip(row, row[1:]), 1)
                if b["x0"] - a["x1"] >= max(2 * _GUTTER_HALF, (a["size"] + b["size"]) / 4)
                or b["x0"] > a["x1"] and _jump(a, b)]
        gaps = [g for g in gaps if abs(g[1] - x) <= tol]
        if not gaps:
            return [row]
        k = max(gaps)[2]  # by position: a jump's strip can fall inside a word set closer than the strip
        return [row[:k], row[k:]]
    elif any(w["x0"] < x + _GUTTER_HALF and w["x1"] > x - _GUTTER_HALF for w in row):
        return [row]
    return [part for part in ([w for w in row if w["x1"] <= x], [w for w in row if w["x0"] >= x]) if part]


def _gutter_crossings(rows, x, tol=0):
    """Crossing-line count if x is a real gutter, else None.

    With rows split at x: what marks a real gutter is that lines stop
    before it on each side (few cross it: occasional full-width headings
    or tables are expected, but if many do, it's a coincidental gap in
    justified text, an indent, or a centered line). Each side needs at
    least a couple of lines so a stray line can't make a "column", but no
    minimum *share*, so a short sidebar next to a long column still counts.
    And the sides must sit side by side: at least a couple of right-side
    lines must vertically overlap a left-side line, so an indented block
    that merely follows the body (below it) isn't mistaken for a column.
    """
    left, right, crossing, jumps, splits = [], [], [], 0, 0
    for row in rows:
        parts = _split_at(row, x, tol)
        if len(parts) == 2:
            splits += 1
            jumps += _jump(parts[0][-1], parts[1][0])
        for line in parts:
            span = (min(w["top"] for w in line), max(w["bottom"] for w in line))
            side = _kind(*_line_extent(line), x, tol)
            if side == "left":
                left.append(span)
            elif side == "right":
                right.append(span)
            else:
                crossing.append(span)
    cross, total = len(crossing), len(left) + len(right) + len(crossing)
    if len(left) < _MIN_LINES_PER_SIDE or len(right) < _MIN_LINES_PER_SIDE:
        return None
    if cross / total >= _MAX_CROSS_FRACTION:
        # (the SR6 layout) a full-width box over or under the two columns (a sidebar across the page): its lines
        # don't count when every row the gutter splits is two columns meeting in the content stream (_jump); only the
        # crossing lines between the columns' tops and bottoms do
        top = max(min(t for t, _ in left), min(t for t, _ in right))
        bottom = min(max(b for _, b in left), max(b for _, b in right))
        inside = sum(top <= t < bottom for t, _ in crossing)
        zone = inside + sum(top <= t < bottom for t, _ in left + right)
        if not tol or splits < _MIN_LINES_PER_SIDE or jumps < splits or not zone or inside / zone >= _MAX_CROSS_FRACTION:
            return None
        # (scored by all its crossing lines: a gutter the plain rule accepts wins)
    beside = sum(any(t < lb and lt < b for lt, lb in left) for t, b in right)
    return cross if beside >= _MIN_LINES_PER_SIDE else None


def _find_gutter(rows, right, left=0, tol=0):
    """Return a column-split x, or None if the page doesn't look 2-column.

    Candidates are the centres of whitespace gaps (a strip >= 2*_GUTTER_HALF
    wide) between words on one row, in the middle band of [left, right] (the page, or a table cell) only —
    margin furniture like vertical tab letters makes big gaps near the
    edges. A real gutter is a whitespace river: the same strip stays clear
    down many rows. Justified text's wide gaps move from row to row, so
    most rows have a word through any one of them and the crossing gate in
    `_gutter_crossings` rejects it. The accepted candidate with the fewest
    crossing lines wins.
    """
    lo, hi = left + (right - left) * 0.25, left + (right - left) * 0.75
    cands = {
        round((a["x1"] + b["x0"]) / 2)
        for row in rows
        for a, b in zip(row, row[1:])
        if (b["x0"] - a["x1"] >= 2 * _GUTTER_HALF or b["x0"] > a["x1"] and _jump(a, b)) and lo < (a["x1"] + b["x0"]) / 2 < hi
    }
    scored = [(c, x) for x in sorted(cands) if (c := _gutter_crossings(rows, x, tol)) is not None]
    return min(scored)[1] if scored else None


_BOX_MARGIN = 4  # pt; a line starting this far left of the left column's lines


def _box_margin(blocks, xs):
    """(the SR6 layout) A line set at a full-width box's left margin, left of the left column's (the box's title, or its
    last short line), above or below the right column, is the box's: a band, not the column's (a heading beside the
    right column stays in its column). blocks: (top, kind, text), xs: each line's x0."""
    col = sorted(x for (_, k, _), x in zip(blocks, xs) if k == "left")
    box = [x for (_, k, _), x in zip(blocks, xs) if k == "band"]
    right = [t for t, k, _ in blocks if k == "right"]
    if not col or not box or not right:
        return blocks
    edge = col[len(col) // 2] - _BOX_MARGIN
    return [(t, "band" if k == "left" and x < edge and any(abs(x - b) <= 2 for b in box)
             and not min(right) <= t <= max(right) else k, s) for (t, k, s), x in zip(blocks, xs)]


def _kind(x0, x1, mid, tol=0):
    """Classify an item spanning [x0, x1) as 'left', 'right', or a full-width 'band'. tol (the SR6 layout): a line
    split up to tol off mid (a boxed sidebar's gutter) still sits in its column."""
    if mid is None:
        return "single"
    if x1 <= mid + tol:
        return "left"
    if x0 >= mid - tol:
        return "right"
    return "band"


def _table_cells(table, words):
    """Cell texts rebuilt from words on one column grid. pdfplumber's lattice finder merges whole rows
    into one cell where a table stripes its rows without column rules (the other rows' cells nest and
    repeat); the grid is the row with the most cells, each word goes to the last row starting above its
    middle and to the grid column holding its centre. Lines join with "\\n"; bold runs are marked.
    Columns empty in every row (gaps between rules) are dropped."""
    grid = [c for c in max(table.rows, key=lambda r: sum(c is not None for c in r.cells)).cells if c]
    tops = sorted({r.bbox[1] for r in table.rows})
    cells = [[[] for _ in grid] for _ in tops]
    for w in words:
        if not _in_box(w, table.bbox):
            continue
        cx, cy = (w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2
        r = max(i for i, t in enumerate(tops) if t <= cy) if cy >= tops[0] else 0
        # the column holding the centre, else the nearest one (a word in a gap between cells)
        c = min(range(len(grid)), key=lambda i: max(grid[i][0] - cx, 0, cx - grid[i][2]))
        cells[r][c].append(w)
    rows = [["\n".join(_line_text(line) for line in _cell_lines(ws, g)) for ws, g in zip(row, grid)] for row in cells]
    keep = [i for i in range(len(grid)) if any(r[i] for r in rows)]
    return [[r[i] for i in keep] for r in rows]


def _cell_lines(words, cell):
    """A cell's visual lines. A boxed sidebar set in two text columns is read left column, then right, but
    only when no line runs across the gutter and both sides read as running text (a median of at least
    _TEXT_WORDS words a line; a lone letter, like a margin tab, doesn't count). A table under or inside
    the text (rows crossing it) keeps its rows, and so does a label/value list (one-word values)."""
    rows = _cluster_lines(words)
    mid = _find_gutter(rows, cell[2], cell[0])
    if mid is None or _gutter_crossings(rows, mid):
        return rows
    parts = [p for r in rows for p in _split_at(r, mid)]
    left = [p for p in parts if _line_extent(p)[1] <= mid]
    right = [p for p in parts if _line_extent(p)[0] >= mid]
    for side in (left, right):
        counts = [len(p) for p in side if not (len(p) == 1 and len(p[0]["text"]) == 1 and p[0]["text"].isalpha())]
        if not counts or statistics.median(counts) < _TEXT_WORDS:
            return rows
    return left + right


def _table_md(rows):
    rows = [[(c or "").replace("\n", "<br>").strip() for c in r] for r in rows if any(r)]
    if not rows:
        return []
    head, *body = rows
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + [
        "| " + " | ".join(r) + " |" for r in body
    ]


def _reading_order(blocks, mid):
    """blocks: list of (top, kind, text), any order.

    Single column: plain top-to-bottom order. Two columns: left-then-right
    for everything above the first full-width band, then the band itself,
    then left-then-right again for the next segment, and so on — so a table
    or heading spanning both columns doesn't get filed under one column out
    of its real position.
    """
    blocks = sorted(blocks, key=lambda b: b[0])
    if mid is None:
        return [text for _, _, text in blocks if text]

    out, left_buf, right_buf = [], [], []
    for top, kind, text in blocks:
        if not text:
            continue
        if kind == "left":
            left_buf.append((top, text))
        elif kind == "right":
            right_buf.append((top, text))
        else:  # band
            out += [t for _, t in sorted(left_buf)]
            out += [t for _, t in sorted(right_buf)]
            left_buf, right_buf = [], []
            out.append(text)
    out += [t for _, t in sorted(left_buf)]
    out += [t for _, t in sorted(right_buf)]
    return out


def reusable(book_dir: str, version: str) -> bool:
    """book.md can stand in for original.pdf: the book's last import (import.xml, which a remove keeps) converted this same
    file with this converter version. A re-import then skips the conversion (Books → Re-import all: run --reuse)."""
    import os
    import xml.etree.ElementTree as ET
    pdf, md, imp = (os.path.join(book_dir, f) for f in ("original.pdf", "book.md", "import.xml"))
    if not (os.path.exists(pdf) and os.path.exists(md) and os.path.exists(imp)):
        return False
    try:
        rec = ET.parse(imp).getroot()
    except ET.ParseError:
        return False
    if rec.get("converter") != version or not rec.get("sha256"):
        return False
    with open(pdf, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest() == rec.get("sha256")


def convert(pdf_path: str, md_path: str, pages: tuple[int, int] | None = None, sr6: bool = False,
            levels: dict | None = None, heading: str | None = None) -> dict:
    """pages: optional 1-based inclusive (first, last) range to convert. sr6: the Shadowrun 6 layout
    (importer/sr6/layout.py: headings by font, header-band tables, margin furniture dropped). levels: the SR6 heading
    sizes -> levels, when a recipe knows them for this file (else layout.fonts guesses them); heading: the headings' font
    family, likewise."""
    if sr6:
        from importer.sr6 import layout
    with open(pdf_path, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        fonts = layout.fonts(pdf) if sr6 else None
        if fonts and levels:
            fonts.levels = levels
        if fonts and heading:
            fonts.heading = heading
        big = None if sr6 else _bands(pdf)[1]
        first, last = pages or (1, len(pdf.pages))
        for n, page in enumerate(pdf.pages[first - 1 : last], first):
            out.append(f"<!-- page {n} -->")
            # the SR6 layout's tables have no rules: the lattice finder only sees their striped row backgrounds
            found = [] if sr6 else page.find_tables()
            # a table nested in another is a fragment of it (its words are in the outer one's cells);
            # of two with the same box, the first is kept
            tables = [t for i, t in enumerate(found)
                      if not any(_inside(t.bbox, o.bbox) and (o.bbox != t.bbox or j < i) for j, o in enumerate(found) if j != i)]
            # stream order (_jump); a second copy of the page's text layer dropped (layout.one_layer)
            chars = [{**c, "i": i} for i, c in enumerate(layout.one_layer(page.chars))] if sr6 else page.chars
            all_words = pdfplumber.utils.extract_words(_even_sizes(chars), extra_attrs=["size"],
                                                       keep_blank_chars=False, return_chars=True)
            bands = []
            if sr6:
                all_words = layout.furniture(page, all_words, fonts.running)
                for w in all_words:
                    w["base"] = -w["chars"][0]["matrix"][5]
                bands = layout.band_tables(all_words, fonts, page.rects)
            boxes = [t.bbox for t in tables]
            # a band table's own words leave the text (not its box: a long last cell can reach past the text column)
            banded = {id(w) for _, _, used in bands for w in used}
            words = [w for w in all_words if not _in_table(w, boxes) and id(w) not in banded]
            rows = _cluster_lines(words)
            tol = layout.GUTTER_TOL if sr6 else 0
            mid = _find_gutter(rows, page.width, tol=tol)
            lines = [part for row in rows for part in _split_at(row, mid, tol)] if mid else rows

            blocks, geo, xs = [], [], []
            for line in lines:
                size = round(max(w["size"] for w in line), 1)
                level = layout.heading_level(line, fonts) if sr6 else _heading_level(size, big)
                # headings stay unmarked (their size already says it); bold only matters in body lines
                text = ("#" * level + " " + " ".join(w["text"] for w in line)) if level else _line_text(line)
                x0, x1 = _line_extent(line)
                blocks.append((min(w["top"] for w in line), _kind(x0, x1, mid, tol), text))
                geo.append((level, max(w["bottom"] for w in line), size))
                xs.append(x0)
            if sr6:
                blocks = layout.join_headings(_box_margin(blocks, xs), geo)
            for t in tables:
                md = _table_md(_table_cells(t, all_words))
                if md:
                    blocks.append((t.bbox[1], _kind(t.bbox[0], t.bbox[2], mid), "\n".join(md)))
            for bbox, rows, _ in bands:
                blocks.append((bbox[1], _kind(bbox[0], bbox[2], mid, tol), "\n".join(_table_md(rows))))

            out += _reading_order(blocks, mid)
        title = (pdf.metadata or {}).get("Title", "") or ""
        pages = len(pdf.pages)
    text = "\n".join(out) + "\n"
    with open(md_path, "w", encoding="utf8", newline="\n") as f:
        f.write(layout.rejoin_ligatures(text) if sr6 else text)
    return {"pages": pages, "converter": SR6_CONVERTER_VERSION if sr6 else CONVERTER_VERSION, "sha256": sha,
            "title": title}
