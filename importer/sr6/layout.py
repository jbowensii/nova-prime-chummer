"""The converter's opt-in SR6 layout: headings by font, header-band tables, margin furniture dropped.

A Shadowrun 6 book sets its body in one serif, its headings in one display family at a few fixed sizes and its stat
tables in a small sans family with a bold/black header row and no ruling lines. pdfplumber's lattice finder can't see
such a table, so `band_tables` reads it by x position: the header row's cells are the columns, and the regular words
below it fall into them. Layout facts only; nothing here comes from a book's text."""
import bisect
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass

import pdfplumber

from importer.convert import _BOLD, _LINE_TOLERANCE, _cluster_lines, _is_bold

_LEVEL_TOL = 0.3  # pt, or _LEVEL_REL of the size if larger (a chapter title set at 58 or 63 next to the usual 60)
_LEVEL_REL = 0.05
_CELL_GAP = 6  # pt; header words closer than this are one cell
_CELL_WORDS = 4  # a header cell has at most this many words
_FIRST_PAD, _LAST_PAD = 10, 60  # pt; the name column reaches left, the last column right (long values)
_SIZE_TOL = 0.5  # pt; a row's words are set at its header's size
_COLUMN_GAP = 40  # pt; a wider gap on a line is the gutter between two text columns (header cells sit closer)
_HEADER_STACK = 1.6  # header lines up to this many line heights apart are one (multi-line) header
_STACK_PAD = 80  # pt; and up to this far apart in x (a one-line label centred beside a two-line one)
_ROW_GAP = 3  # line pitches; a wider gap ends the rows
_TABLE_SIZE = 0.8  # x body size; table text is no bigger (a 9 pt sidebar beside a 10.5 pt body is text)
_EDGE, _OUTER, _FOOT = 30, 45, 35  # pt from the left edge, the right edge and the bottom: margin furniture
_CARD = 432  # pt; a page narrower than 6 in is a card, with no margin furniture
GUTTER_TOL = 8  # pt; a row's gutter may sit this far off the page's (a boxed sidebar's columns)
_STRIPE_MAX = 60  # pt; a filled rect at most this tall is a header cell or a row stripe (a box background is taller)


@dataclass
class Fonts:
    body: str  # family of the body text
    size: float  # body size
    heading: str  # display family
    levels: dict  # heading size -> level 1..5
    foot: frozenset = frozenset()  # (family, size) of the running feet: set in the bottom band on many pages


def family(fontname: str) -> str:
    """`ABCDEF+SabonLTStd-Roman` -> `SabonLTStd`."""
    return fontname.split("+")[-1].split("-")[0]


def _word_family(w):
    return family(w["chars"][0]["fontname"])


def _is_furniture(x0, top, page):
    if page.width < _CARD:
        return False  # a card (Johnson 'Dex: 5 x 3 in): its text runs to the edges, no tab letters or running heads
    return x0 < _EDGE or x0 > page.width - _OUTER or top > page.height - _FOOT


def furniture(page, words, fonts=None):
    """Drop margin tab letters, running heads and page numbers (outer edges and the bottom band); on a card, its
    sideways line (the copyright up its edge). With the book's fonts, a word in the bottom band set in a face the
    running feet don't use stays: a table's last rows reaching into the band (the core rulebook's drug list)."""
    def keep(w):
        if not _is_furniture(w["x0"], w["top"], page):
            return True
        return (bool(fonts and fonts.foot) and not _is_furniture(w["x0"], 0, page)
                and (_word_family(w), round(w["size"], 1)) not in fonts.foot)
    return [w for w in words if keep(w) and (page.width >= _CARD or w["upright"])]


def fonts(pdf, min_pages=None) -> Fonts:
    """Body: the most common (family, size). Heading: the other family with the most chars above body x 1.1. Levels:
    the heading family's sizes above body x 0.8 that appear on at least `min_pages` pages (default one page in 40),
    largest first, as levels 1-5. A page count, not a char count: a chapter title is a few big words on a dozen
    pages, while a contents or index page sets many words once in a size of its own."""
    # ponytail: one page in 40 is a guess fitted to one book; make it a recipe constant if another book needs it
    min_pages = min_pages or max(1, round(len(pdf.pages) / 40))
    chars, pages, feet = Counter(), defaultdict(set), defaultdict(set)
    for n, page in enumerate(pdf.pages):
        for c in page.chars:
            if c["text"].strip() and not _is_furniture(c["x0"], c["top"], page):
                key = (family(c["fontname"]), round(c["size"], 1))
                chars[key] += 1
                pages[key].add(n)
            elif c["text"].strip() and page.width >= _CARD and not _is_furniture(c["x0"], 0, page):
                feet[(family(c["fontname"]), round(c["size"], 1))].add(n)  # the bottom band
        page.flush_cache()
    # the running feet's faces: in the bottom band on one page in ten at least (a table row reaching it is rare)
    foot = frozenset(k for k, p in feet.items() if len(p) >= max(2, len(pdf.pages) / 10))
    body, size = max(chars, key=chars.get) if chars else ("", 10.0)
    big = Counter()
    for (fam, s), k in chars.items():
        if fam != body and s > size * 1.1:
            big[fam] += k
    heading = max(big, key=big.get) if big else ""
    sizes = sorted((s for (fam, s), p in pages.items() if fam == heading and s > size * 0.8 and len(p) >= min_pages),
                   reverse=True)[:5]
    return Fonts(body, size, heading, {s: i + 1 for i, s in enumerate(sizes)}, foot)


_LAYER_TOL = 1  # pt; a duplicated text layer sits a hundredth of a point off the first
_LAYER_RUN = 50  # chars in a row, each on top of an earlier one, start a second copy of the page's text
_LAYER_LOOSE = 3  # pt; once a second layer has started, a char this close to a first-layer one is its copy (bold)


def _near(grid, c, tol):
    """Chars in `grid` (one_layer's) with c's glyph, font and size within `tol` pt of it."""
    k, x, y = (c["text"], c["fontname"], round(c["size"], 1)), round(c["x0"]), round(c["top"])
    r = int(tol) + 1
    return [(j, d) for dx in range(-r, r + 1) for dy in range(-r, r + 1) for j, d in grid.get((k, x + dx, y + dy), ())
            if abs(d["x0"] - c["x0"]) <= tol and abs(d["top"] - c["top"]) <= tol]


def one_layer(chars):
    """The page's chars without a second copy of its text layer. Some PDFs draw a page's text twice (same font,
    size and colour, a hundredth of a point apart, the copy as a block later in the content stream), which reads
    as every letter doubled. The copy starts where _LAYER_RUN chars in a row each sit on a char at least that far
    back in the stream (so neither a glyph drawn twice in a row for a faux bold nor a genuine double letter, which
    sits beside its twin, counts), moved back over chars that sit a little further off their twins (a heading's
    copy can); from there on every char on top of a first-layer one (within _LAYER_LOOSE) is dropped and the rest
    (a running head drawn once, after the copy) is kept. A page without such a run only loses chars drawn on top of
    an earlier one (within _LAYER_TOL)."""
    grid = {}
    for i, c in enumerate(chars):
        grid.setdefault(((c["text"], c["fontname"], round(c["size"], 1)), round(c["x0"]), round(c["top"])), []).append((i, c))
    run, start = 0, None
    for i, c in enumerate(chars):
        run = run + 1 if any(i - j >= _LAYER_RUN for j, _ in _near(grid, c, _LAYER_TOL)) else 0
        if run >= _LAYER_RUN:
            start = i - run + 1
            break
    if start is None:  # a few chars drawn twice (a faux-bold heading): pdfplumber's dedupe, only where needed (slow)
        twice = any(j < i for i, c in enumerate(chars) for j, _ in _near(grid, c, _LAYER_TOL))
        return pdfplumber.utils.dedupe_chars(chars, tolerance=_LAYER_TOL) if twice else chars
    while start and any(start - 1 - j >= _LAYER_RUN for j, _ in _near(grid, chars[start - 1], _LAYER_LOOSE)):
        start -= 1
    return chars[:start] + [c for c in chars[start:] if not any(j < start for j, _ in _near(grid, c, _LAYER_LOOSE))]


# a word whose fi/fl/ff ligature glyph is followed by a gap in the PDF ("fi rst", "offi ce", "eff ects", "fi -" at a
# line end); not after an apostrophe
_LIGATURE = re.compile(r"(?<![\w'’])([A-Za-z]*(?:fi|fl|ff)|F[il]) (-$|[a-z]+\b)", re.M)


def rejoin_ligatures(text):
    """Words split after a ligature joined again, when the result is a plausible word. The words of the text with
    every such split taken out are its vocabulary: the left part must not be a word of it ("off the", "stuff is"
    stay), and after "ff" or a hyphen (more real words end so: "payoff until", "sci-fi movie") the right part must
    not be one either, unless the joined word is ("eff ects" and "twenty-fi ve" join: "ects" and "ve" are no
    words). A split before a line-end hyphen ("fi -") loses its space, so the hyphenated word joins as any other.
    Two passes: a word with two ligatures ("fi refi ght")."""
    words = {w.lower() for w in re.findall(r"[A-Za-z]+(?:[-'’][A-Za-z]+)*\b(?! \|)", _LIGATURE.sub(" ", text))}

    def join(m):
        left, right = m.groups()
        risky = left.endswith("ff") or m.string[m.start() - 1:m.start()] == "-"
        ok = left.lower() not in words and (not risky or right == "-" or right not in words
                                            or (left + right).lower() in words)
        return left + right if ok else m.group(0)
    return _LIGATURE.sub(join, _LIGATURE.sub(join, text))


def _level(size, fonts):
    return next((lv for s, lv in fonts.levels.items() if abs(size - s) <= max(_LEVEL_TOL, s * _LEVEL_REL)), 0)


def heading_level(line, fonts) -> int:
    """The level of a line set wholly in the heading family at a level size, else 0."""
    if not fonts.heading or any(_word_family(w) != fonts.heading for w in line):
        return 0
    levels = [_level(w["size"], fonts) for w in line]
    return 0 if 0 in levels else min(levels)


def _is_table_word(w, fonts):
    return _word_family(w) not in (fonts.body, fonts.heading) and w["size"] <= fonts.size * _TABLE_SIZE


def _split_x(words, gap):
    """Words (sorted by x0) split where the gap between one's end and the next's start exceeds `gap`."""
    groups = []
    for w in sorted(words, key=lambda w: w["x0"]):
        if groups and w["x0"] - max(v["x1"] for v in groups[-1]) <= gap:
            groups[-1].append(w)
        else:
            groups.append([w])
    return groups


def _text(words):
    """A cell's words in reading order; a line wrapped after `-` or `/` (`Shin-` `hyung`) joins without a space."""
    out = ""
    for line in _cluster_lines(words):
        text = " ".join(w["text"] for w in line)
        out += ("" if not out or out.endswith(("-", "/")) else " ") + text
    return out


def _opens_with_label(line):
    """The line's leading bold run ends in ':' (a stat-box label such as `Skills:`)."""
    run = []
    for w in line:
        if not _is_bold(w):
            break
        run.append(w)
    return bool(run) and run[-1]["text"].endswith(":")


def _is_head_bold(w):
    """Bold, or a sign with no letters or digits set in a bold face (a header's `#`)."""
    return _is_bold(w) or (not any(c["text"].isalnum() for c in w["chars"])
                           and all(_BOLD.search(c["fontname"]) for c in w["chars"]))


def _side_by_side(words):
    """A header line's words split into k >= 2 runs of the same >= 2 cells (tables set side by side, such as two
    spells' stat bands), else one run. Not by gap width: a wide table's own column gaps are wider than the gap
    between two narrow side-by-side tables."""
    cells = _split_x(words, _CELL_GAP)
    texts = [_text(c) for c in cells]
    n = len(cells)
    for p in range(2, n // 2 + 1):
        if n % p == 0 and all(texts[i] == texts[i % p] for i in range(n)):
            return [[w for c in cells[i:i + p] for w in c] for i in range(0, n, p)]
    return [words]


def _headers(lines, height):
    """Header blocks: the bold words of lines holding >= 2 of them, or a line that is one bold word, never a line
    opening with a label (`Skills:`), each split where it repeats itself (`_side_by_side`). Lines stacked within
    _HEADER_STACK line heights and up to _STACK_PAD apart in x, but never two on one line, are one block: a
    multi-line header, where a one-line label sits centred between the lines of its neighbours. A one-word block is
    no header."""
    groups = []
    for line in lines:
        # a header line sharing its baseline with the other text column's labelled line (`DR … MOVE` | `Powers: …`):
        # only its part before that label
        cut = next((i for i in range(1, len(line)) if line[i]["x0"] - line[i - 1]["x1"] > _COLUMN_GAP
                    and _opens_with_label(line[i:])), None)
        line = line[:cut]
        bold = [w for w in line if _is_head_bold(w)]
        if not (len(bold) >= 2 or len(line) == len(bold) == 1) or _opens_with_label(line):
            continue
        # a bold run-in of prose (a numbered list's lead-in) is no header: header cells are a few words each
        if max(len(c) for c in _split_x(bold, _CELL_GAP)) > _CELL_WORDS:
            continue
        for g in _side_by_side(bold):
            # a stat-box label alone in its column (`Adept Powers:`); a header cell may still end in ':'
            if len(_split_x(g, _CELL_GAP)) == 1 and g[-1]["text"].endswith(":"):
                continue
            x0, x1 = min(w["x0"] for w in g), max(w["x1"] for w in g)
            # never a group on this same line: that is a side-by-side table
            prev = next((h for h in groups if g[0]["top"] - max(w["top"] for w in h) <= _HEADER_STACK * height
                         and min(w["x0"] for w in h) - _STACK_PAD < x1 and x0 < max(w["x1"] for w in h) + _STACK_PAD
                         and all(abs(g[0]["top"] - w["top"]) > _LINE_TOLERANCE for w in h)), None)
            if prev is not None:
                prev += g
            else:
                groups.append(list(g))
    # two tables' headers stacked a little apart (in two text columns) are split again where the block repeats
    return [part for g in groups if len(g) >= 2 for part in _side_by_side(g)]


def _innermost(rects):
    """One rect per x extent, none holding another (a rect behind a whole row holds its cell rects)."""
    key = lambda r: (r["x0"], r["x1"])
    inner = {key(r): r for r in rects
             if not any(r["x0"] <= o["x0"] and o["x1"] <= r["x1"] and key(o) != key(r) for o in rects)}
    return sorted(inner.values(), key=lambda r: r["x0"])


def _cell_rects(head, rects, below):
    """(the table's column rects left to right, the header's bottom edge), or ([], None) when the book draws none.
    The book shades each header cell, and the rect is the column's true extent where the text is centred in it: the
    rects behind the header words when there are >= 2 and every header word sits in one. A header in one rect across
    the table or in none (a title over a grid) takes the cells of the first stripe row within `below` pt under it."""
    t, b = min(w["top"] for w in head), max(w["bottom"] for w in head)
    hr = _innermost([r for r in rects if r["top"] - 1 <= t and b <= r["bottom"] + 1
                     and any(r["x0"] <= _cx(w) <= r["x1"] for w in head)])
    if len(hr) >= 2 and all(any(r["x0"] <= _cx(w) <= r["x1"] for r in hr) for w in head):
        return hr, hr[0]["bottom"]
    if len(hr) < 2:
        x0, x1, edge = (hr[0]["x0"], hr[0]["x1"], hr[0]["bottom"]) if hr else (
            min(w["x0"] for w in head), max(w["x1"] for w in head), b)
        grid = [r for r in rects if edge - 1 <= r["top"] <= edge + below]
        under = [r for r in grid if r["x0"] < x1 and x0 < r["x1"]]
        if under:  # the first stripe row under the header: the cells touching the one(s) under it
            top = min(r["top"] for r in under)
            row = _innermost([r for r in grid if abs(r["top"] - top) < 1])
            first = [r for r in row if r["x0"] < x1 and x0 < r["x1"]]
            for r in row:
                if r not in first and any(abs(r["x0"] - f["x1"]) < 1 or abs(r["x1"] - f["x0"]) < 1 for f in first):
                    first.append(r)
            for r in reversed(row):
                if r not in first and any(abs(r["x0"] - f["x1"]) < 1 or abs(r["x1"] - f["x0"]) < 1 for f in first):
                    first.append(r)
            first = [r for r in first if not hr or (x0 - 1 <= r["x0"] and r["x1"] <= x1 + 1)]
            if len(first) >= 2:
                return sorted(first, key=lambda r: r["x0"]), edge
    return [], None


def _separator(words, a, b, mid):
    """The x between a and b that the fewest row words run across, nearest `mid` among equals: a column edge where
    a header is centred over values set flush left (or the reverse)."""
    xs = [a + i * 0.5 for i in range(int((b - a) * 2) + 1)]
    return min(xs, key=lambda x: (sum(w["x0"] < x < w["x1"] for w in words), abs(x - mid))) if xs else mid


def _tabular(line):
    """A line with a wide gap between two words: table row values, not wrapped prose."""
    return any(b["x0"] - a["x1"] > 2 * _CELL_GAP for a, b in zip(line, line[1:]))


def band_tables(words, fonts, rects=()):
    """Tables read from header bands: [(bbox, rows, words)], rows[0] the header cells, words the table's words. See
    the module docstring. rects: the page's rects; filled row-sized ones (header cells, row stripes) set the columns
    and the rows where the book draws them."""
    table = [w for w in words if _is_table_word(w, fonts)]
    other = [w for w in words if not _is_table_word(w, fonts)]
    lines = _cluster_lines(table)
    if not lines:
        return []
    rects = [r for r in rects if r.get("fill") and 2 < r["bottom"] - r["top"] <= _STRIPE_MAX]
    height = statistics.median(w["bottom"] - w["top"] for w in table)
    tops = [ln[0]["top"] for ln in lines]
    # wrapped cells set vertically centred put lines half a pitch apart: the gap rule never goes under a line height
    pitch = max(statistics.median([b - a for a, b in zip(tops, tops[1:])] or [0]), height * 1.2)
    heads = _headers(lines, height)
    head_ids = {id(w) for h in heads for w in h}
    single = {id(h) for h in heads if len(_split_x(h, _CELL_GAP)) == 1}
    out, consumed = [], set()
    for head in heads:
        if id(head) in consumed:
            continue
        hr, edge = _cell_rects(head, rects, _ROW_GAP * pitch)
        if hr:
            cells = [[] for _ in hr]
            for w in head:
                cells[min(range(len(hr)), key=lambda i: max(hr[i]["x0"] - _cx(w), 0, _cx(w) - hr[i]["x1"]))].append(w)
            bounds = [hr[0]["x0"]] + [r["x0"] for r in hr[1:]] + [hr[-1]["x1"] + 2]
        else:
            cells = _split_x(head, _CELL_GAP)
            ends = [max(w["x1"] for w in c) for c in cells]
            # the last column reaches right for long values, but never into another header's columns
            reach = min([w["x0"] - 2 for h in heads if h is not head for w in h if w["x0"] > ends[-1]]
                        + [ends[-1] + _LAST_PAD])
            bounds = [cells[0][0]["x0"] - _FIRST_PAD] + [(e + c[0]["x0"]) / 2 for e, c in zip(ends, cells[1:])] + [reach]
        if len(cells) < 2:  # a one-cell header is a title or a sub-heading row, never a table of its own
            continue
        lo, hi = bounds[0], bounds[-1]
        under = max(w["x1"] for w in head) + _FIRST_PAD  # text stops the rows only under the header, not the reach
        last = max(w["top"] for w in head)
        last_bottom = max([w["bottom"] for w in head] + ([edge] if hr else []))
        size = None  # the rows' size, from the first row (a header may be set a point smaller)
        # a one-cell header inside a table of >= 2 columns is a sub-heading row of it (a category in its first column)
        subs = [h for h in heads if len(cells) >= 2 and id(h) in single and h is not head
                and all(lo <= _cx(w) <= hi for w in h)]
        sub_ids = {id(w) for h in subs for w in h}
        later_heads = [min(w["top"] for w in h) for h in heads if h is not head and all(h is not u for u in subs)
                       and min(w["top"] for w in h) > last and any(lo <= _cx(w) <= hi for w in h)]
        rows_lines, labels, pending = [], set(), None
        for full in lines:
            line = [w for w in full if lo <= _cx(w) <= hi and (id(w) not in head_ids or id(w) in sub_ids)]
            if not line or line[0]["top"] <= last + 1:
                continue
            t = line[0]["top"]
            size = statistics.median(w["size"] for w in line) if size is None else size
            left = [w["x1"] for w in full if w["x1"] <= line[0]["x0"]]
            if (t - last > _ROW_GAP * pitch
                    or (left and line[0]["x0"] - max(left) <= 2 * _CELL_GAP)  # a line running on left of the table
                    or any(abs(w["size"] - size) > _SIZE_TOL for w in line)  # a footnote under the table
                    or any(h <= t + 1 for h in later_heads)
                    or any(lo <= _cx(w) <= under and last_bottom - 1 < w["top"] <= t + 1 for w in other)):
                break
            # a labelled line (`Racial Qualities: ...`) and the lines that wrap it are a sub-row when a row follows;
            # with none after (a stat box's `Skills:`), they stay text
            if _opens_with_label(line):
                pending = len(rows_lines) if pending is None else pending
            elif pending is not None and _tabular(line):
                labels |= {id(w) for ln in rows_lines[pending:] for w in ln}
                pending = None
            if any(id(w) in sub_ids for w in line):
                labels |= {id(w) for w in line}
            rows_lines.append(line)
            last, last_bottom = t, max(w["bottom"] for w in line)
        rows_lines = rows_lines[:pending]
        if not rows_lines:
            continue
        kept = {id(w) for ln in rows_lines for w in ln}
        consumed |= {id(h) for h in subs if any(id(w) in kept for w in h)}
        if not hr:  # a column edge where no row value runs across it, between the header cells' centres
            flat = [w for ln in rows_lines for w in ln if id(w) not in labels]
            centre = [(c[0]["x0"] + max(w["x1"] for w in c)) / 2 for c in cells]
            bounds[1:-1] = [_separator(flat, centre[i - 1], centre[i], bounds[i]) for i in range(1, len(cells))]
        # row stripes (filled rects under the header cells): the lines between two stripe edges are one row
        edges = []
        if hr:
            bottom = max(w["bottom"] for w in rows_lines[-1])
            edges = sorted({edge} | {e for r in rects if edge - 1 < r["top"] < bottom
                                                and lo - _FIRST_PAD <= _cx(r) <= hi + _FIRST_PAD
                                                for e in (r["top"], r["bottom"])})
        bands = [bisect.bisect(edges, (ln[0]["top"] + ln[0]["bottom"]) / 2) for ln in rows_lines]
        # with stripes, the rows alternate shaded and plain: the lines after the last stripe are one plain row
        bands = [b if b < len(edges) or len(edges) > 1 else None for b in bands]
        out.append(_table(head, [_text(c) for c in cells], bounds, rows_lines, bands, labels))
    return out


def _cx(w):
    return (w["x0"] + w["x1"]) / 2


def _table(head, header, bounds, rows_lines, bands, labels):
    """(bbox, rows, words) from a header's cell texts, its column bounds and its row lines. Lines in the same closed
    stripe band (`bands`, None for none) are one row. For the rest, lines with a first-column word are anchors, and
    every other line joins the nearest anchor by top (a tie goes to the one above). A name wrapped onto two lines
    around values set vertically centred gives two anchors, one of them name-only: it joins the neighbour row whose
    values sit between them. Words of a labelled sub-row (`labels`) all go to the first column."""
    col = lambda w: 0 if id(w) in labels else max([i for i, b in enumerate(bounds[1:-1], 1) if _cx(w) >= b] or [0])
    tops = [ln[0]["top"] for ln in rows_lines]
    banded, loose = defaultdict(list), []
    for i, b in enumerate(bands):
        (banded[b] if b is not None else loose).append(i)
    rows = [[tops[g[0]], [tops[i] for i in g], [w for i in g for w in rows_lines[i]]] for g in banded.values()]
    anchors = [i for i in loose if any(col(w) == 0 for w in rows_lines[i])] or loose
    members = defaultdict(list)
    for i in loose:
        members[min(anchors, key=lambda a: abs(tops[a] - tops[i]))].append(i)
    loose_rows = [[tops[a], [tops[i] for i in members[a]], [w for i in members[a] for w in rows_lines[i]]]
                  for a in anchors]
    k = 0
    while k < len(loose_rows):
        top_k, _, words = loose_rows[k]
        if all(col(w) == 0 for w in words) and len(loose_rows) > 1:
            nxt = loose_rows[k + 1] if k + 1 < len(loose_rows) else None
            prv = loose_rows[k - 1] if k else None
            if nxt and any(top_k < t < nxt[0] for t in nxt[1]):
                nxt[2] = words + nxt[2]
                del loose_rows[k]
                continue
            if prv and any(prv[0] < t < top_k for t in prv[1]):
                prv[2] += words
                del loose_rows[k]
                continue
        k += 1
    rows = sorted(rows + loose_rows, key=lambda r: r[0])
    used = head + [w for ln in rows_lines for w in ln]
    bbox = (min(w["x0"] for w in used), min(w["top"] for w in head), max(w["x1"] for w in used),
            max(w["bottom"] for w in used))
    return bbox, [header] + [[_text([w for w in r[2] if col(w) == c]) for c in range(len(header))] for r in rows], used


def join_headings(blocks, geo):
    """blocks: the page's text lines as (top, kind, text) in top order, geo: (level, bottom, size) for each. A heading
    set on two lines (a chapter title, a long item name) comes out as one: a heading line less than 0.6 x its size
    under the previous line of its column, a heading of the same level, continues it."""
    out, info = [], []
    for (top, kind, text), (level, bottom, size) in zip(blocks, geo):
        prev = next((i for i in range(len(out) - 1, -1, -1) if out[i][1] == kind or "band" in (out[i][1], kind)), None)
        if level and prev is not None and info[prev][0] == level and top - info[prev][1] < size * 0.6:
            head, more = out[prev][2], text.split(" ", 1)[1]
            # a word hyphenated at the line end joins up again (`Fire-` + `wall`)
            head = head[:-1] + more if head.endswith("-") and more[:1].islower() else head + " " + more
            out[prev] = (out[prev][0], out[prev][1], head)
            info[prev] = (level, bottom)
            continue
        out.append((top, kind, text))
        info.append((level, bottom))
    return out
