"""The ruled tables pdfplumber finds: a table nested in another, which words a table holds, and its cells rebuilt on one
column grid (a cell set in two text columns read column by column)."""

import statistics

from importer.pdf.columns import find_gutter, gutter_crossings, split_at
from importer.pdf.lines import cluster_lines, line_extent
from importer.pdf.markdown import line_text

_TEXT_WORDS = 4  # words a line, median, for a side of a table cell to count as a text column


def inside(a, b):
    return b[0] <= a[0] and b[1] <= a[1] and a[2] <= b[2] and a[3] <= b[3]


def _in_box(w, b):
    """The word's centre lies in box b: the one test for which table a word belongs to."""
    return b[0] <= (w["x0"] + w["x1"]) / 2 <= b[2] and b[1] <= (w["top"] + w["bottom"]) / 2 <= b[3]


def in_table(w, table_boxes):
    return any(_in_box(w, b) for b in table_boxes)


def table_cells(table, words):
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
    rows = [["\n".join(line_text(line) for line in _cell_lines(ws, g)) for ws, g in zip(row, grid)] for row in cells]
    keep = [i for i in range(len(grid)) if any(r[i] for r in rows)]
    return [[r[i] for i in keep] for r in rows]


def _cell_lines(words, cell):
    """A cell's visual lines. A boxed sidebar set in two text columns is read left column, then right, but
    only when no line runs across the gutter and both sides read as running text (a median of at least
    _TEXT_WORDS words a line; a lone letter, like a margin tab, doesn't count). A table under or inside
    the text (rows crossing it) keeps its rows, and so does a label/value list (one-word values)."""
    rows = cluster_lines(words)
    mid = find_gutter(rows, cell[2], cell[0])
    if mid is None or gutter_crossings(rows, mid):
        return rows
    parts = [p for r in rows for p in split_at(r, mid)]
    left = [p for p in parts if line_extent(p)[1] <= mid]
    right = [p for p in parts if line_extent(p)[0] >= mid]
    for side in (left, right):
        counts = [len(p) for p in side if not (len(p) == 1 and len(p[0]["text"]) == 1 and p[0]["text"].isalpha())]
        if not counts or statistics.median(counts) < _TEXT_WORDS:
            return rows
    return left + right
