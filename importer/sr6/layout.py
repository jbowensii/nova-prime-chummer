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

from importer.pdf.columns import find_gutter
from importer.pdf.lines import LINE_TOLERANCE
from importer.pdf.markdown import BOLD_FONT, is_bold

# pylint: disable=redefined-outer-name  # words and fonts are module functions whose names locals reuse

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
    """The fonts of one book: body, heading and running-head families and sizes."""

    body: str  # family of the body text
    size: float  # body size
    heading: str  # display family
    levels: dict  # heading size -> level 1..5
    foot: frozenset = frozenset()  # (family, size) of the running feet: set in the bottom band on many pages
    running: frozenset = frozenset()  # running heads and page numbers (_running_key): page furniture


def family(fontname: str) -> str:
    """`ABCDEF+SabonLTStd-Roman` -> `SabonLTStd`."""
    return fontname.split("+")[-1].split("-")[0]


def _word_family(w):
    return family(w["chars"][0]["fontname"])


def _is_furniture(x0, top, page):
    if page.width < _CARD:
        return False  # a card (Johnson 'Dex: 5 x 3 in): its text runs to the edges, no tab letters or running heads
    return x0 < _EDGE or x0 > page.width - _OUTER or top > page.height - _FOOT


_HEAD_BAND = 72  # pt from the top: a running head sits above this


def _running_key(family_, size, top, texts):
    """A top-band line's key: its font, size, place and words, digits aside (a page number is `#`), spaces aside."""
    return family_, round(size, 1), round(top), re.sub(r"\d+", "#", re.sub(r"\s+", "", "".join(texts)).lower())


def _top_lines(items, font, text):
    """The top band's lines of `items` (chars or words, left to right): {(family, size, top): [item]}."""
    out = defaultdict(list)
    for it in sorted(items, key=lambda c: c["x0"]):
        if it["top"] < _HEAD_BAND and text(it).strip():
            out[(family(font(it)), round(it["size"], 1), round(it["top"]))].append(it)
    return out


def furniture(page, words, fonts=None):
    """Drop margin tab letters, running heads and page numbers (outer edges and the bottom band, and the top band's
    lines the book repeats on most pages: fonts.running); on a card, its sideways line (the copyright up its edge).
    With the book's fonts, a word in the bottom band set in a face the running feet don't use stays: a table's last
    rows reaching into the band (the core rulebook's drug list)."""
    running = fonts.running if fonts else frozenset()
    head = {
        id(w)
        for k, ws in _top_lines(words, lambda w: w["chars"][0]["fontname"], lambda w: w["text"]).items()
        if _running_key(*k, (w["text"] for w in ws)) in running
        for w in ws
    }

    def keep(w):
        if not _is_furniture(w["x0"], w["top"], page):
            return True
        return (
            bool(fonts and fonts.foot)
            and not _is_furniture(w["x0"], 0, page)
            and (_word_family(w), round(w["size"], 1)) not in fonts.foot
        )

    return [w for w in words if keep(w) and (page.width >= _CARD or w["upright"]) and id(w) not in head]


def fonts(pdf, min_pages=None) -> Fonts:
    """Body: the most common (family, size). Heading: the other family with the most chars above body x 1.1. Levels:
    the heading family's sizes above body x 0.8 that appear on at least `min_pages` pages (default one page in 40),
    largest first, as levels 1-5. A page count, not a char count: a chapter title is a few big words on a dozen
    pages, while a contents or index page sets many words once in a size of its own. Running heads: a line in the top
    band that the book prints in the same place, font and words (digits aside: page numbers) on at least half its
    pages (3 or more): page furniture, its size no level (a magazine-style book's title and page number on every
    page would take three)."""
    # ponytail: one page in 40 is a guess fitted to one book; make it a recipe constant if another book needs it
    min_pages = min_pages or max(1, round(len(pdf.pages) / 40))
    chars, pages, tops, seen, feet = Counter(), defaultdict(set), [], Counter(), defaultdict(set)
    for n, page in enumerate(pdf.pages):
        body = [c for c in page.chars if c["text"].strip() and not _is_furniture(c["x0"], c["top"], page)]
        lines = _top_lines(body, lambda c: c["fontname"], lambda c: c["text"])
        keyed = {_running_key(*k, (c["text"] for c in cs)): cs for k, cs in lines.items()}
        seen.update(keyed.keys())
        tops.append(keyed)
        top = {id(c) for cs in lines.values() for c in cs}
        for c in body:
            if id(c) not in top:
                key = (family(c["fontname"]), round(c["size"], 1))
                chars[key] += 1
                pages[key].add(n)
        for c in page.chars:  # the bottom band's faces
            if (
                c["text"].strip()
                and page.width >= _CARD
                and _is_furniture(c["x0"], c["top"], page)
                and not _is_furniture(c["x0"], 0, page)
            ):
                feet[(family(c["fontname"]), round(c["size"], 1))].add(n)
        page.flush_cache()
    # the running feet's faces: in the bottom band on one page in ten at least (a table row reaching it is rare)
    foot = frozenset(k for k, p in feet.items() if len(p) >= max(2, len(pdf.pages) / 10))
    running = frozenset(k for k, m in seen.items() if m >= max(3, len(pdf.pages) / 2))
    for n, keyed in enumerate(tops):
        for k, cs in keyed.items():
            if k not in running:
                chars[k[:2]] += len(cs)
                pages[k[:2]].add(n)
    body, size = max(chars, key=chars.get) if chars else ("", 10.0)
    big = Counter()
    for (fam, s), k in chars.items():
        if fam != body and s > size * 1.1:
            big[fam] += k
    heading = max(big, key=big.get) if big else ""
    # (a book of more than 10 pages: a size printed on its cover alone is no level)
    cover = len(pdf.pages) > 10
    sizes = sorted(
        (
            s
            for (fam, s), p in pages.items()
            if fam == heading and s > size * 0.8 and len(p) >= min_pages and not (cover and p == {0})
        ),
        reverse=True,
    )[:5]
    return Fonts(body, size, heading, {s: i + 1 for i, s in enumerate(sizes)}, foot, running)


_LAYER_TOL = 1  # pt; a duplicated text layer sits a hundredth of a point off the first
_LAYER_RUN = 50  # chars in a row, each on top of an earlier one, start a second copy of the page's text
_LAYER_LOOSE = 3  # pt; once a second layer has started, a char this close to a first-layer one is its copy (bold)


def _near(grid, c, tol):
    """Chars in `grid` (one_layer's) with c's glyph, font and size within `tol` pt of it."""
    k, x, y = (c["text"], c["fontname"], round(c["size"], 1)), round(c["x0"]), round(c["top"])
    r = int(tol) + 1
    return [
        (j, d)
        for dx in range(-r, r + 1)
        for dy in range(-r, r + 1)
        for j, d in grid.get((k, x + dx, y + dy), ())
        if abs(d["x0"] - c["x0"]) <= tol and abs(d["top"] - c["top"]) <= tol
    ]


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
        grid.setdefault(((c["text"], c["fontname"], round(c["size"], 1)), round(c["x0"]), round(c["top"])), []).append(
            (i, c)
        )
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


_TOP_CHAIN = 1.5  # pt; letters whose tops (sorted) chain this close are one line for the word finder
_TOP_APART = 10  # pt; added between two such lines, more than the word finder's line tolerance (3 pt)


def words(chars, **kw):
    """pdfplumber's words (return_chars=True), its lines kept apart where the letters' tops (sorted) jump more than
    _TOP_CHAIN. Its own line tolerance (3 pt) chains a two-line header cell (`ATTRIBUTES` over `(A/S)`) through the
    one-line cells centred between its lines, and reads both lines' letters as one word (`ATT(R AI/B SU)TES`). The
    letters keep their stream order (two columns meeting with no gap still part where the stream jumps)."""
    order = sorted(range(len(chars)), key=lambda k: chars[k]["top"])
    shift, g, last = [0.0] * len(chars), 0, None
    for k in order:
        if last is not None and chars[k]["top"] - last > _TOP_CHAIN:
            g += 1
        shift[k], last = g * _TOP_APART, chars[k]["top"]
    moved = [
        {**c, "top": c["top"] + d, "bottom": c["bottom"] + d, "doctop": c.get("doctop", c["top"]) + d, "_k": k}
        for k, (c, d) in enumerate(zip(chars, shift))
    ]
    out = []
    for w in pdfplumber.utils.extract_words(moved, **kw):
        cs = [chars[c["_k"]] for c in w["chars"]]
        out.append(
            {
                **w,
                "chars": cs,
                "top": min(c["top"] for c in cs),
                "bottom": max(c["bottom"] for c in cs),
                "doctop": min(c.get("doctop", c["top"]) for c in cs),
            }
        )
    return out


_TINY = 0.5  # x the page's median word size: a glyph smaller than this (a small raised bullet) joins a row beside it
_TINY_REACH = 30  # pt; how far beside it


def baseline_rows(words):
    """Rows by baseline, a word joining the row when its baseline is within LINE_TOLERANCE of the previous one (a label
    set smaller than its value sits a little off its baseline, and the other column's lines may sit in between). A tiny
    glyph joins the row of the nearest word up to _TINY_REACH beside it whose baseline is within half that word's size,
    else it is a row of its own. (The SR6 layout's words carry their baseline, `base`; the shared converter groups rows
    by top: importer/pdf/lines.cluster_lines.)"""
    if not words:
        return []
    med = statistics.median(w["size"] for w in words)
    tiny = [w for w in words if w["size"] < _TINY * med]
    rows, cur, last = [], [], None
    for w in sorted((w for w in words if w["size"] >= _TINY * med), key=lambda w: w["base"]):
        if last is not None and w["base"] - last > LINE_TOLERANCE:
            rows.append(cur)
            cur = []
        cur.append(w)
        last = w["base"]
    if cur:
        rows.append(cur)
    for t in tiny:
        near = [
            (abs(w["base"] - t["base"]), i)
            for i, r in enumerate(rows)
            for w in r
            if max(w["x0"] - t["x1"], t["x0"] - w["x1"]) <= _TINY_REACH and abs(w["base"] - t["base"]) <= w["size"] / 2
        ]
        if near:
            rows[min(near)[1]].append(t)
        else:
            rows.append([t])
    rows.sort(key=lambda r: min(w["base"] for w in r))
    return [sorted(r, key=lambda w: w["x0"]) for r in rows]


BOX_START, BOX_END = "<!-- box -->", "<!-- /box -->"
_BOX_WIDE = 0.62  # x the page width: a sidebar box sits in one text column


def sidebar_marks(lines, rects, tables, width, kind):
    """Blocks (top, kind, text) bracketing each boxed sidebar of the page: a filled rect taller than a stripe, in one
    text column, holding at least three lines with a heading among its first two and no stat table (a stat box keeps
    its place). lines: (top, x0, x1, heading level) of the page's text lines; tables: the band tables' bboxes; kind:
    a column's kind from its x extent."""
    out = []
    for r in rects:
        if not r.get("fill") or r["bottom"] - r["top"] <= _STRIPE_MAX or r["x1"] - r["x0"] > _BOX_WIDE * width:
            continue
        inside = sorted(
            ln
            for ln in lines
            if r["x0"] - 1 <= (ln[1] + ln[2]) / 2 <= r["x1"] + 1 and r["top"] - 1 <= ln[0] <= r["bottom"]
        )
        if len(inside) < 3 or not any(ln[3] for ln in inside[:2]):
            continue
        if any(r["x0"] - 1 <= t[0] and t[2] <= r["x1"] + 1 and r["top"] - 1 <= t[1] <= r["bottom"] for t in tables):
            continue
        k = kind(r["x0"], r["x1"])
        if k != "band":
            out += [(r["top"] - 0.01, k, BOX_START), (r["bottom"], k, BOX_END)]
    return out


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
        risky = left.endswith("ff") or m.string[m.start() - 1 : m.start()] == "-"
        ok = left.lower() not in words and (
            not risky or right == "-" or right not in words or (left + right).lower() in words
        )
        return left + right if ok else m.group(0)

    return _LIGATURE.sub(join, _LIGATURE.sub(join, text))


def _level(size, fonts):
    return next((lv for s, lv in fonts.levels.items() if abs(size - s) <= max(_LEVEL_TOL, s * _LEVEL_REL)), 0)


def heading_level(line, fonts) -> int:
    """The level of a line set wholly in the heading family at a level size, else 0."""
    if not fonts.heading or any(_word_family(w) != fonts.heading for w in line):
        return 0
    levels = [_level(w["size"], fonts) for w in line]
    # a one- or two-letter word set smaller than the rest (the small `x` of `xGUIDE OVERRIDE`) doesn't unmake it
    levels = [
        lv
        for w, lv in zip(line, levels)
        if lv
        or len(w["text"]) > 2
        or not any(levels)
        or w["size"] > max(v["size"] for v in line if _level(v["size"], fonts))
    ]
    return 0 if not levels or 0 in levels else min(levels)


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
    for line in baseline_rows(words):
        text = " ".join(w["text"] for w in line)
        out += ("" if not out or out.endswith(("-", "/")) else " ") + text
    return out


def _opens_with_label(line):
    """The line's leading bold run ends in ':' (a stat-box label such as `Skills:`)."""
    run = []
    for w in line:
        if not is_bold(w):
            break
        run.append(w)
    return bool(run) and run[-1]["text"].endswith(":")


def _is_head_bold(w):
    """Bold, or a sign with no letters or digits set in a bold face (a header's `#`)."""
    return is_bold(w) or (
        not any(c["text"].isalnum() for c in w["chars"]) and all(BOLD_FONT.search(c["fontname"]) for c in w["chars"])
    )


def _side_by_side(words):
    """A header line's words split into k >= 2 runs of the same >= 2 cells (tables set side by side, such as two
    spells' stat bands), else one run. Not by gap width: a wide table's own column gaps are wider than the gap
    between two narrow side-by-side tables."""
    cells = _split_x(words, _CELL_GAP)
    texts = [_text(c) for c in cells]
    n = len(cells)
    for p in range(2, n // 2 + 1):
        if n % p == 0 and all(texts[i] == texts[i % p] for i in range(n)):
            return [[w for c in cells[i : i + p] for w in c] for i in range(0, n, p)]
    return [words]


def _headers(lines, height, boxes=()):
    """Header blocks: the bold words of lines holding >= 2 of them, or a line that is one bold word, never a line
    opening with a label (`Skills:`), each split where it repeats itself (`_side_by_side`). Lines stacked within
    _HEADER_STACK line heights and up to _STACK_PAD apart in x, but never two on one line, are one block: a
    multi-line header, where a one-line label sits centred between the lines of its neighbours. A one-word block is
    no header."""
    groups = []
    for line in lines:
        # a header line sharing its baseline with the other text column's labelled line (`DR … MOVE` | `Powers: …`):
        # only its part before that label
        cut = next(
            (
                i
                for i in range(1, len(line))
                if line[i]["x0"] - line[i - 1]["x1"] > _COLUMN_GAP and _opens_with_label(line[i:])
            ),
            None,
        )
        line = line[:cut]
        bold = [w for w in line if _is_head_bold(w)]
        if not (len(bold) >= 2 or len(line) == len(bold) == 1) or _opens_with_label(line):
            continue
        # a bold row name with its values on the line (`**Krime Sprayer** 6P SS …`): a row, no header
        if (
            _is_head_bold(line[0])
            and sum(not _is_head_bold(w) for w in line) >= 2
            and len(_split_x(bold, _CELL_GAP)) == 1
        ):
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
            # (two whole header rows side by side, no x in common, are two tables in two text columns, a little
            # apart: only a label of a cell or two stacks beside another line)
            # nor a header whose column already has a value on this line (a box beside it starts its rows here)
            values = [w for w in line if not _is_head_bold(w)]
            prev = next(
                (
                    h
                    for h in groups
                    if g[0]["top"] - max(w["top"] for w in h) <= _HEADER_STACK * height
                    and not any(
                        min(v["x0"] for v in h) - _CELL_GAP <= _cx(w) <= max(v["x1"] for v in h) + _CELL_GAP
                        for w in values
                    )
                    and len({_box_of(w, boxes) for w in g + h} - {None}) <= 1
                    and min(w["x0"] for w in h) - _STACK_PAD < x1
                    and x0 < max(w["x1"] for w in h) + _STACK_PAD
                    and all(abs(g[0]["top"] - w["top"]) > LINE_TOLERANCE for w in h)
                    and (
                        x0 < max(w["x1"] for w in h)
                        and min(w["x0"] for w in h) < x1
                        or (n := min(len(_split_x(g, _CELL_GAP)), len(_split_x(h, _CELL_GAP)))) == 1
                        or n == 2
                        and max(x0 - max(w["x1"] for w in h), min(w["x0"] for w in h) - x1) < _COLUMN_GAP
                    )
                ),
                None,
            )  # (a lone label stacks; two cells only near: not another column's header)
            if prev is not None:
                prev += g
            else:
                groups.append(list(g))
    # two tables' headers stacked a little apart (in two text columns) are split again where the block repeats
    return [part for g in groups if len(g) >= 2 for part in _side_by_side(g)]


def _innermost(rects):
    """One rect per x extent, none holding another (a rect behind a whole row holds its cell rects)."""

    def key(r):
        return (r["x0"], r["x1"])

    inner = {
        key(r): r
        for r in rects
        if not any(r["x0"] <= o["x0"] and o["x1"] <= r["x1"] and key(o) != key(r) for o in rects)
    }
    return sorted(inner.values(), key=lambda r: r["x0"])


def _cell_rects(head, rects, below):
    """(the table's column rects left to right, the header's bottom edge), or ([], None) when the book draws none.
    The book shades each header cell, and the rect is the column's true extent where the text is centred in it: the
    rects behind the header words when there are >= 2 and every header word sits in one. A header in one rect across
    the table or in none (a title over a grid) takes the cells of the first stripe row within `below` pt under it."""
    t, b = min(w["top"] for w in head), max(w["bottom"] for w in head)
    hr = _innermost(
        [
            r
            for r in rects
            if r["top"] - 1 <= t and b <= r["bottom"] + 1 and any(r["x0"] <= _cx(w) <= r["x1"] for w in head)
        ]
    )
    if len(hr) >= 2 and all(any(r["x0"] <= _cx(w) <= r["x1"] for r in hr) for w in head):
        return hr, hr[0]["bottom"]
    if len(hr) < 2:
        x0, x1, edge = (
            (hr[0]["x0"], hr[0]["x1"], hr[0]["bottom"])
            if hr
            else (min(w["x0"] for w in head), max(w["x1"] for w in head), b)
        )
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


_BASE_APART = 1  # pt; one table row's cells share a baseline; two text columns' rows may sit this far apart or more


def _box_of(w, boxes):
    """The index of the box background (a filled rect taller than a stripe) holding the word's centre, else None."""
    return next(
        (i for i, b in enumerate(boxes) if b["x0"] <= _cx(w) <= b["x1"] and b["top"] <= w["top"] <= b["bottom"]), None
    )


def _column_parts(line, boxes=(), mid=None):
    """A table line clustered from two text columns' rows (two boxes side by side whose bands line up, or sit a little
    apart in height so the rows chain into one line): split at a gap wider than two cell gaps where the words on
    either side sit in two different box backgrounds, or across the page's gutter (mid) on baselines more than
    _BASE_APART apart. One table's row shares its box and its baseline, so it is never split (a two-line header's
    second line beside its one-line cells sits in one column)."""
    if not line or "base" not in line[0]:
        return [line]
    parts = [[line[0]]]
    for i, w in enumerate(line[1:], 1):
        v = parts[-1][-1]
        gap = w["x0"] - max(u["x1"] for u in parts[-1])
        a, b = _box_of(v, boxes), _box_of(w, boxes)
        # (by baseline only between two runs of cells: a two-line header's lone words, a wrapped name over a row's
        # values centred beside it, sit a few points apart too)
        across = mid is not None and v["x1"] <= mid + GUTTER_TOL and w["x0"] >= mid - GUTTER_TOL
        if gap > 2 * _CELL_GAP and (
            a is not None
            and b is not None
            and a != b
            or across
            and abs(v["base"] - w["base"]) > _BASE_APART
            and len(_split_x(parts[-1], _CELL_GAP)) > 1
            and len(_split_x(line[i:], _CELL_GAP)) > 1
        ):
            parts.append([w])
        else:
            parts[-1].append(w)
    return parts


def band_tables(words, fonts, rects=(), width=None):
    """Tables read from header bands: [(bbox, rows, words)], rows[0] the header cells, words the table's words. See
    the module docstring. rects: the page's rects; filled row-sized ones (header cells, row stripes) set the columns
    and the rows where the book draws them."""
    table = [w for w in words if _is_table_word(w, fonts)]
    other = [w for w in words if not _is_table_word(w, fonts)]
    boxes = [r for r in rects if r.get("fill") and r["bottom"] - r["top"] > _STRIPE_MAX]
    # the page's gutter, from its text (two boxes' rows side by side are split across it)
    mid = find_gutter(baseline_rows(other), width, tol=GUTTER_TOL) if width and other else None
    lines = [part for ln in baseline_rows(table) for part in _column_parts(ln, boxes, mid)]
    if not lines:
        return []
    rects = [r for r in rects if r.get("fill") and 2 < r["bottom"] - r["top"] <= _STRIPE_MAX]
    height = statistics.median(w["bottom"] - w["top"] for w in table)
    tops = [ln[0]["top"] for ln in lines]
    # wrapped cells set vertically centred put lines half a pitch apart: the gap rule never goes under a line height
    pitch = max(statistics.median([b - a for a, b in zip(tops, tops[1:])] or [0]), height * 1.2)
    heads = _headers(lines, height, boxes)
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
                cells[
                    min(range(len(hr)), key=lambda i, hr=hr, w=w: max(hr[i]["x0"] - _cx(w), 0, _cx(w) - hr[i]["x1"]))
                ].append(w)
            bounds = [hr[0]["x0"]] + [r["x0"] for r in hr[1:]] + [hr[-1]["x1"] + 2]
        else:
            cells = _split_x(head, _CELL_GAP)
            ends = [max(w["x1"] for w in c) for c in cells]
            # the last column reaches right for long values, but never into another header's columns
            reach = min(
                [w["x0"] - 2 for h in heads if h is not head for w in h if w["x0"] > ends[-1]] + [ends[-1] + _LAST_PAD]
            )
            bounds = (
                [cells[0][0]["x0"] - _FIRST_PAD] + [(e + c[0]["x0"]) / 2 for e, c in zip(ends, cells[1:])] + [reach]
            )
        if len(cells) < 2:  # a one-cell header is a title or a sub-heading row, never a table of its own
            continue
        lo, hi = bounds[0], bounds[-1]
        under = max(w["x1"] for w in head) + _FIRST_PAD  # text stops the rows only under the header, not the reach
        last = max(w["top"] for w in head)
        last_bottom = max([w["bottom"] for w in head] + ([edge] if hr else []))
        size = None  # the rows' size, from the first row (a header may be set a point smaller)
        # a one-cell header inside a table of >= 2 columns is a sub-heading row of it (a category in its first column)
        subs = [
            h
            for h in heads
            if len(cells) >= 2 and id(h) in single and h is not head and all(lo <= _cx(w) <= hi for w in h)
        ]
        sub_ids = {id(w) for h in subs for w in h}
        later_heads = [
            min(w["top"] for w in h)
            for h in heads
            if h is not head
            and all(h is not u for u in subs)
            and min(w["top"] for w in h) > last
            and any(lo <= _cx(w) <= hi for w in h)
        ]
        rows_lines, labels, pending = [], set(), None
        for full in lines:
            line = [w for w in full if lo <= _cx(w) <= hi and (id(w) not in head_ids or id(w) in sub_ids)]
            if not line or line[0]["top"] <= last + 1:
                continue
            t = line[0]["top"]
            size = statistics.median(w["size"] for w in line) if size is None else size
            left = [w["x1"] for w in full if w["x1"] <= line[0]["x0"]]
            if (
                t - last > _ROW_GAP * pitch
                or (left and line[0]["x0"] - max(left) <= 2 * _CELL_GAP)  # a line running on left of the table
                or any(abs(w["size"] - size) > _SIZE_TOL for w in line)  # a footnote under the table
                or any(h <= t + 1 for h in later_heads)
                or any(lo <= _cx(w) <= under and last_bottom - 1 < w["top"] <= t + 1 for w in other)
            ):
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
            edges = sorted(
                {edge}
                | {
                    e
                    for r in rects
                    if edge - 1 < r["top"] < bottom and lo - _FIRST_PAD <= _cx(r) <= hi + _FIRST_PAD
                    for e in (r["top"], r["bottom"])
                }
            )
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

    def col(w):
        return 0 if id(w) in labels else max([i for i, b in enumerate(bounds[1:-1], 1) if _cx(w) >= b] or [0])

    tops = [ln[0]["top"] for ln in rows_lines]
    banded, loose = defaultdict(list), []
    for i, b in enumerate(bands):
        (banded[b] if b is not None else loose).append(i)
    rows = [[tops[g[0]], [tops[i] for i in g], [w for i in g for w in rows_lines[i]]] for g in banded.values()]
    anchors = [i for i in loose if any(col(w) == 0 for w in rows_lines[i])] or loose
    members = defaultdict(list)
    for i in loose:
        members[min(anchors, key=lambda a, i=i: abs(tops[a] - tops[i]))].append(i)
    loose_rows = [
        [tops[a], [tops[i] for i in members[a]], [w for i in members[a] for w in rows_lines[i]]] for a in anchors
    ]
    k = 0
    while k < len(loose_rows):
        top_k, _, words = loose_rows[k]
        if all(col(w) == 0 for w in words) and len(loose_rows) > 1:
            nxt = loose_rows[k + 1] if k + 1 < len(loose_rows) else None
            # pylint: disable=unsubscriptable-object,unsupported-assignment-operation  # prv is None only at k == 0, and is tested
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
    bbox = (
        min(w["x0"] for w in used),
        min(w["top"] for w in head),
        max(w["x1"] for w in used),
        max(w["bottom"] for w in used),
    )
    cells = [[_text([w for w in r[2] if col(w) == c]) for c in range(len(header))] for r in rows]
    for cs, mark in zip(cells, _first_marks([[w for w in r[2] if col(w) == 0] for r in rows])):
        cs[0] = mark + cs[0] if cs[0] else cs[0]
    return bbox, [header] + cells, used


INDENT, BOLD = "  ", " "  # first-cell marks in book.md (whitespace: a reader that strips never sees them)
_INDENT_MIN, _INDENT_MAX = 4, 30  # pt; a first cell set this much right of the column's flush edge is indented


def _first_marks(firsts):
    """Each row's mark for its first cell: INDENT when set right of the column's flush left edge (only in a column set
    flush left: its names start at three x at most), BOLD when bold among regular names, else ''. A row group (the
    core rulebook's `DocWagon contracts` over its indented levels, a bold `Spell formula` over the spell categories)
    is read from them in regroup."""
    xs = [min(w["x0"] for w in f) if f else None for f in firsts]
    known = [x for x in xs if x is not None]
    if not known:
        return [""] * len(firsts)
    base = min(known)
    edges = []  # the column's left edges (1 pt apart at least): a flush-left column has one, two or three
    for x in sorted(known):
        if not edges or x - edges[-1] > 1:
            edges.append(x)
    flush = len(edges) <= 3 and len(known) > len(edges)  # (a centred column: an edge for almost every name)
    bold = [bool(f) and all(is_bold(w) for w in f) for f in firsts]
    some_bold = any(bold) and not all(b for b, f in zip(bold, firsts) if f)
    return [
        (INDENT if flush and x is not None and _INDENT_MIN <= x - base <= _INDENT_MAX else "")
        + (BOLD if some_bold and b else "")
        for x, b in zip(xs, bold)
    ]


_BOX_MARGIN = 4  # pt; a line starting this far left of the left column's lines


def box_margin(blocks, xs):
    """A line set at a full-width box's left margin, left of the left column's (the box's title, or its
    last short line), above or below the right column, is the box's: a band, not the column's (a heading beside the
    right column stays in its column). blocks: (top, kind, text), xs: each line's x0."""
    col = sorted(x for (_, k, _), x in zip(blocks, xs) if k == "left")
    box = [x for (_, k, _), x in zip(blocks, xs) if k == "band"]
    right = [t for t, k, _ in blocks if k == "right"]
    if not col or not box or not right:
        return blocks
    edge = col[len(col) // 2] - _BOX_MARGIN
    return [
        (
            t,
            (
                "band"
                if k == "left" and x < edge and any(abs(x - b) <= 2 for b in box) and not min(right) <= t <= max(right)
                else k
            ),
            s,
        )
        for (t, k, s), x in zip(blocks, xs)
    ]


def box_titles(blocks, geo, boxes):
    """A heading in one text column, below every line of the other, right over a full-width table
    (`boxes`: their tops) is that table's title: a band, read with its table after both columns (not at the end of
    its column, the other column's text between them). blocks: (top, kind, text), geo: (level, bottom, size)."""
    out = []
    for (t, k, s), (lv, bottom, size) in zip(blocks, geo):
        if lv and k in ("left", "right"):
            other = [tt for tt, kk, _ in blocks if kk == ("right" if k == "left" else "left")]
            under = [b for b in boxes if b >= bottom - 1]
            if (
                other
                and t > max(other)
                and under
                and min(under) - bottom < 2 * size
                and not any(t < tt < min(under) for tt, kk, _ in blocks if kk == k)
            ):
                k = "band"
        out.append((t, k, s))
    return out


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
