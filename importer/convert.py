"""PDF -> Markdown for recipes. pdfplumber (MIT). Output only has to be consistent, not pretty."""
import hashlib
import statistics

import pdfplumber

CONVERTER_VERSION = "1"

# ponytail: fixed gutter-gap heuristic for 1-2 columns; add real N-column
# clustering (k-means on x0) if a 3+ column layout shows up in practice.
_MIN_GUTTER = 20


def _bands(pdf):
    sizes = [round(c["size"], 1) for p in pdf.pages[:40] for c in p.chars]
    if not sizes:
        return 10, []
    body = statistics.mode(sizes)
    big = sorted({s for s in sizes if s >= body * 1.25}, reverse=True)[:3]
    return body, big  # big[0] -> '#', big[1] -> '##', big[2] -> '###'


def _column_ranges(words, page_width):
    """Split a page into left-to-right column x-ranges by the biggest x0 gap.

    Falls back to a single column spanning the whole page when there's no
    gap that looks like a real gutter (too small, or off to one side).
    """
    if len(words) < 4:
        return [(0, page_width)]
    xs = sorted(w["x0"] for w in words)
    gap, mid = max(((xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2) for i in range(len(xs) - 1)))
    if gap < _MIN_GUTTER or not (page_width * 0.25 < mid < page_width * 0.75):
        return [(0, page_width)]
    return [(0, mid), (mid, page_width)]


def _column_index(x0, ranges):
    for i, (lo, hi) in enumerate(ranges):
        if x0 < hi or i == len(ranges) - 1:
            return i
    return len(ranges) - 1


_LINE_TOLERANCE = 3  # pt; covers baseline jitter between regular/bold runs on one line


def _rows(words):
    """Group words already confined to one column into lines by y proximity,
    then order each line left-to-right by x0.

    Clusters by comparing each word's top to the *first* word's top in the
    current cluster (not the previous word's), so a run of words with tiny
    baseline jitter (e.g. a bold run-in label next to regular body text)
    doesn't drift the cluster boundary. Ordering within a line is a
    separate x0 sort, not tied to the (noisy) top value, so a label with a
    marginally different top than its line doesn't get sorted to the end.
    """
    words = sorted(words, key=lambda w: w["top"])
    rows, cur, anchor_top = [], [], None
    for w in words:
        if anchor_top is not None and abs(w["top"] - anchor_top) > _LINE_TOLERANCE:
            rows.append(cur)
            cur = []
            anchor_top = None
        cur.append(w)
        if anchor_top is None:
            anchor_top = w["top"]
    if cur:
        rows.append(cur)
    return [sorted(r, key=lambda w: w["x0"]) for r in rows]


def _heading_level(size, big):
    return next((i + 1 for i, s in enumerate(big) if abs(size - s) < 0.6), 0)


def _page_items(page, big, table_boxes):
    """Return, per column (left to right), a list of (top, text) items —
    including tables whose bbox falls in that column — in reading order.
    """
    words = page.extract_words(extra_attrs=["size"], keep_blank_chars=False)
    words = [
        w
        for w in words
        if not any(b[0] <= w["x0"] <= b[2] and b[1] <= w["top"] <= b[3] for b in table_boxes)
    ]
    ranges = _column_ranges(words, page.width)
    columns = [[] for _ in ranges]
    for w in words:
        columns[_column_index(w["x0"], ranges)].append(w)

    buckets = [[] for _ in ranges]
    for i, col_words in enumerate(columns):
        for r in _rows(col_words):
            text = " ".join(w["text"] for w in r)
            size = round(max(w["size"] for w in r), 1)
            level = _heading_level(size, big)
            row_top = min(w["top"] for w in r)
            buckets[i].append((row_top, ("#" * level + " " + text) if level else text))
    return buckets, ranges


def _table_md(rows):
    rows = [[(c or "").replace("\n", "<br>").strip() for c in r] for r in rows if any(r)]
    if not rows:
        return []
    head, *body = rows
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + [
        "| " + " | ".join(r) + " |" for r in body
    ]


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
            buckets, ranges = _page_items(page, big, boxes)
            for t in tables:
                md = _table_md(t.extract())
                if md:
                    x_center = (t.bbox[0] + t.bbox[2]) / 2
                    buckets[_column_index(x_center, ranges)].append((t.bbox[1], "\n".join(md)))
            for col in buckets:
                out += [text for _, text in sorted(col, key=lambda x: x[0]) if text]
        title = (pdf.metadata or {}).get("Title", "") or ""
        pages = len(pdf.pages)
    with open(md_path, "w", encoding="utf8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    return {"pages": pages, "converter": CONVERTER_VERSION, "sha256": sha, "title": title}
