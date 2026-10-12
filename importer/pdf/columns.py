"""Two text columns: the gutter between them (a whitespace river, or where the content stream jumps), each line's side
or a full-width band, and the reading order (each column, band by band). The SR6 layout's boxes:
importer/sr6/layout.py."""
from importer.pdf.lines import line_extent

# ponytail: fixed heuristics for 1-2 columns; add real N-column clustering
# (k-means on x0) if a 3+ column layout shows up in practice.
GUTTER_HALF = 5  # pt; a gutter is a clear strip >= 10pt (~1 em at body size) wide
_MIN_LINES_PER_SIDE = 2
_MAX_CROSS_FRACTION = 0.10


def _jump(a, b):
    """Word b doesn't follow word a in the page's content stream: two text columns meet on this row (a book whose
    columns sit closer than a word space has no whitespace gutter to find). Only the SR6 layout asks, as it asks for a
    tol (each caller below checks tol first), and only its chars carry the stream number `i` (importer/convert.py)."""
    ia, ib = a["chars"][-1].get("i"), b["chars"][0].get("i")
    return ia is not None and ib is not None and not 0 < ib - ia <= 3


def split_at(row, x, tol=0):
    """Split a row at gutter x, unless a word runs through the gutter strip. tol (the SR6 layout): the row splits in
    its widest gap that holds a strip up to tol from x (a boxed sidebar's gutter sits a few points off the body
    text's) and is wider than a word space at its words' size (a chapter title's word spaces are a strip wide), or
    where the content stream jumps (`_jump`)."""
    if tol:
        gaps = [(b["x0"] - a["x1"], min(max(x, a["x1"] + GUTTER_HALF), b["x0"] - GUTTER_HALF), k)
                for k, (a, b) in enumerate(zip(row, row[1:]), 1)
                if b["x0"] - a["x1"] >= max(2 * GUTTER_HALF, (a["size"] + b["size"]) / 4)
                or b["x0"] > a["x1"] and _jump(a, b)]
        gaps = [g for g in gaps if abs(g[1] - x) <= tol]
        if not gaps:
            return [row]
        k = max(gaps)[2]  # by position: a jump's strip can fall inside a word set closer than the strip
        return [row[:k], row[k:]]
    elif any(w["x0"] < x + GUTTER_HALF and w["x1"] > x - GUTTER_HALF for w in row):
        return [row]
    return [part for part in ([w for w in row if w["x1"] <= x], [w for w in row if w["x0"] >= x]) if part]


def gutter_crossings(rows, x, tol=0):
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
        parts = split_at(row, x, tol)
        if len(parts) == 2:
            splits += 1
            jumps += bool(tol) and _jump(parts[0][-1], parts[1][0])
        for line in parts:
            span = (min(w["top"] for w in line), max(w["bottom"] for w in line))
            side = column_kind(*line_extent(line), x, tol)
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


def find_gutter(rows, right, left=0, tol=0):
    """Return a column-split x, or None if the page doesn't look 2-column.

    Candidates are the centres of whitespace gaps (a strip >= 2*GUTTER_HALF
    wide) between words on one row, in the middle band of [left, right] (the page, or a table cell) only —
    margin furniture like vertical tab letters makes big gaps near the
    edges. A real gutter is a whitespace river: the same strip stays clear
    down many rows. Justified text's wide gaps move from row to row, so
    most rows have a word through any one of them and the crossing gate in
    `gutter_crossings` rejects it. The accepted candidate with the fewest
    crossing lines wins.
    """
    lo, hi = left + (right - left) * 0.25, left + (right - left) * 0.75
    cands = {
        round((a["x1"] + b["x0"]) / 2)
        for row in rows
        for a, b in zip(row, row[1:])
        if (b["x0"] - a["x1"] >= 2 * GUTTER_HALF or tol and b["x0"] > a["x1"] and _jump(a, b)) and lo < (a["x1"] + b["x0"]) / 2 < hi
    }
    scored = [(c, x) for x in sorted(cands) if (c := gutter_crossings(rows, x, tol)) is not None]
    return min(scored)[1] if scored else None


def column_kind(x0, x1, mid, tol=0):
    """Classify an item spanning [x0, x1) as 'left', 'right', or a full-width 'band'. tol (the SR6 layout): a line
    split up to tol off mid (a boxed sidebar's gutter) still sits in its column."""
    if mid is None:
        return "single"
    if x1 <= mid + tol:
        return "left"
    if x0 >= mid - tol:
        return "right"
    return "band"


def reading_order(blocks, mid):
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
