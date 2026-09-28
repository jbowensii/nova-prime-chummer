"""PDF -> Markdown for recipes. pdfplumber (MIT). Output only has to be consistent, not pretty."""
import hashlib
import statistics

import pdfplumber

CONVERTER_VERSION = "1"

_LINE_TOLERANCE = 3  # pt; baseline jitter between regular/bold runs on one visual line
# ponytail: fixed heuristics for 1-2 columns; add real N-column clustering
# (k-means on x0) if a 3+ column layout shows up in practice.
_MIN_GUTTER = 20  # pt; also doubles as "this word gap is a column jump, not word spacing"
_MIN_LINES_PER_SIDE = 2
_MAX_CROSS_FRACTION = 0.10


def _bands(pdf):
    sizes = [round(c["size"], 1) for p in pdf.pages[:40] for c in p.chars]
    if not sizes:
        return 10, []
    body = statistics.mode(sizes)
    big = sorted({s for s in sizes if s >= body * 1.25}, reverse=True)[:3]
    return body, big  # big[0] -> '#', big[1] -> '##', big[2] -> '###'


def _heading_level(size, big):
    return next((i + 1 for i, s in enumerate(big) if abs(size - s) < 0.6), 0)


def _in_table(w, table_boxes):
    return any(b[0] <= w["x0"] <= b[2] and b[1] <= w["top"] <= b[3] for b in table_boxes)


def _cluster_lines(words):
    """Group words into visual lines.

    First cluster by y-proximity, anchored to the first word's top in the
    cluster (tolerant of small baseline jitter between regular and bold
    runs on what is visually one line). Then split a cluster at any
    horizontal gap bigger than a normal word gap — this is what keeps two
    side-by-side column lines that happen to sit at the same height from
    being read as one garbled line.
    """
    words = sorted(words, key=lambda w: w["top"])
    raw, cur, anchor = [], [], None
    for w in words:
        if anchor is not None and abs(w["top"] - anchor) > _LINE_TOLERANCE:
            raw.append(cur)
            cur = []
            anchor = None
        cur.append(w)
        if anchor is None:
            anchor = w["top"]
    if cur:
        raw.append(cur)

    lines = []
    for cluster in raw:
        cluster = sorted(cluster, key=lambda w: w["x0"])
        seg = [cluster[0]]
        for prev, w in zip(cluster, cluster[1:]):
            if w["x0"] - prev["x1"] > _MIN_GUTTER:
                lines.append(seg)
                seg = []
            seg.append(w)
        lines.append(seg)
    return lines


def _line_extent(line):
    return min(w["x0"] for w in line), max(w["x1"] for w in line)


def _find_gutter(words, lines, page_width):
    """Return a column-split x, or None if the page doesn't look 2-column.

    A candidate gutter (the biggest x0 gap among words) is only accepted
    when it actually separates *lines* into two real column clusters: what
    marks a real gutter is that body lines' x-extents stop before it on
    each side (few lines cross it — occasional full-width tables/headings
    are expected, but if most lines cross it, it's just an indent or a
    centered line, not a gutter). Each side also needs at least a couple of
    lines so a single stray line can't manufacture a "column" of its own —
    but no minimum *share* of the page's lines, so a short sidebar/callout
    column next to a much longer main column still counts.
    """
    if len(words) < 4 or not lines:
        return None
    xs = sorted(w["x0"] for w in words)
    gap, mid = max(((xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2) for i in range(len(xs) - 1)))
    if gap < _MIN_GUTTER or not (page_width * 0.25 < mid < page_width * 0.75):
        return None

    left = right = cross = 0
    for line in lines:
        x0, x1 = _line_extent(line)
        if x1 <= mid:
            left += 1
        elif x0 >= mid:
            right += 1
        else:
            cross += 1
    total = left + right + cross
    if left < _MIN_LINES_PER_SIDE or right < _MIN_LINES_PER_SIDE or cross / total >= _MAX_CROSS_FRACTION:
        return None
    return mid


def _kind(x0, x1, mid):
    """Classify an item spanning [x0, x1) as 'left', 'right', or a full-width 'band'."""
    if mid is None:
        return "single"
    if x1 <= mid:
        return "left"
    if x0 >= mid:
        return "right"
    return "band"


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


def convert(pdf_path: str, md_path: str) -> dict:
    with open(pdf_path, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        _, big = _bands(pdf)
        for n, page in enumerate(pdf.pages, 1):
            out.append(f"<!-- page {n} -->")
            tables = page.find_tables()
            boxes = [t.bbox for t in tables]
            all_words = page.extract_words(extra_attrs=["size"], keep_blank_chars=False)
            words = [w for w in all_words if not _in_table(w, boxes)]
            lines = _cluster_lines(words)
            mid = _find_gutter(words, lines, page.width)

            blocks = []
            for line in lines:
                text = " ".join(w["text"] for w in line)
                size = round(max(w["size"] for w in line), 1)
                level = _heading_level(size, big)
                text = ("#" * level + " " + text) if level else text
                x0, x1 = _line_extent(line)
                blocks.append((min(w["top"] for w in line), _kind(x0, x1, mid), text))
            for t in tables:
                md = _table_md(t.extract())
                if md:
                    blocks.append((t.bbox[1], _kind(t.bbox[0], t.bbox[2], mid), "\n".join(md)))

            out += _reading_order(blocks, mid)
        title = (pdf.metadata or {}).get("Title", "") or ""
        pages = len(pdf.pages)
    with open(md_path, "w", encoding="utf8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    return {"pages": pages, "converter": CONVERTER_VERSION, "sha256": sha, "title": title}
