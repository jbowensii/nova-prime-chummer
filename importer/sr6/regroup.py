"""SR6 regroup: book.md (the converter's sr6 layout) -> regrouped.md, one block per item with its stat-table row,
its stat box and its description together, paired by normalized name within a chapter. Pure text. Whatever doesn't
pair, or pairs twice, is reported, never guessed.

Output: a first line `<!-- regrouped v1 -->`, then blocks in reading order, each
`<!-- item {json} -->` or `<!-- section {json} -->`, its tables (the row first when the json says "row"), its
labelled lines, a blank line, its text, `<!-- end -->`."""
import difflib
import json
import re
import unicodedata
from dataclasses import dataclass, field

VERSION = "1"
HEAD = f"<!-- regrouped v{VERSION} -->"

_PAGE = re.compile(r"<!-- page (\d+) -->$")
_HEADING = re.compile(r"(#{1,6}) (.+)$")
_SEP = re.compile(r"\|(?:-+\|)+$")
_LABEL = re.compile(r"(•\s*)?\*\*([^*]+?):\*\*\s*(.*)$")
_SENTENCE_END = re.compile(r"[.!?][)\]”’\"']*$")
_UPPER = re.compile(r"[A-Z]")


@dataclass
class Block:
    type: str  # "item" | "section"
    name: str
    chapter: str
    section: str
    label: str  # the row's table title, or the box's lower-case title
    page: int  # PDF page
    header: list = field(default_factory=list)
    row: dict | None = None
    stats: list = field(default_factory=list)  # box tables, one header -> cell dict per row
    tags: str = ""
    labels: dict = field(default_factory=dict)
    text: str = ""
    level: int = 0
    aliases: list = field(default_factory=list)  # the other name the book prints the item under (row / heading)
    # a configuration row of one product (shapes.boxes): the product its box titles, and that title's maker
    product: str = ""
    maker: str = ""
    group: str = ""  # the name-only row its table row is grouped under (`DocWagon contracts` over `Basic`): _row_groups
    table: str = ""  # the title of the table its row's table is a sub-table of (`magical goods table`)
    config_of: str = ""  # a configuration row's item (shapes.configuration_rows): the Alpenstock's Spear
    unlisted: bool = False  # an item its table leaves out (its heading printed among the rows' headings): no values
    # the page breaks inside its text: [[text line, PDF page]] where a later line is printed on another page
    breaks: list = field(default_factory=list)


def norm(name, aliases=None):
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().replace("&", " and ")
    s = re.sub(r"['‘’\"“”]", "", s)
    s = " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())
    if s.startswith("the "):
        s = s[4:]
    return (aliases or {}).get(s, s)


# a name's looser forms, each cut from the one before: a trailing ( … ), `, …`, `w/…` or number
_CUTS = [re.compile(p) for p in (r"\s*\([^()]*\)\s*$", r"\s*,[^,]*$", r"\s+w/.*$", r"\s+\d+$")]


def keys(name, aliases=None):
    """The name's keys, most exact first: itself, then cut by _CUTS, then each without a plural s."""
    forms = [name]
    for cut in _CUTS:
        c = cut.sub("", forms[-1])
        if c and c != forms[-1]:
            forms.append(c)
    out = [norm(f, aliases) for f in forms]
    out += [k[:-1] for k in out if k.endswith("s") and not k.endswith("ss")]
    return [k for k in dict.fromkeys(out) if k] or [""]


def full_name(row, heading):
    """True when a heading prints a row's item under its full name, so the entry takes it: the row drops a maker or
    brand in front (`Bulldog` / `GMC Bulldog`) or cuts its last word short (`Laser mic` / `Laser microphone`). A heading
    adding words after the row's name (`Ballista II Missile System`, a nickname) is a description title, not the name."""
    rw, hw = norm(row).split(), norm(heading).split()
    if not shorter_name(row, heading):
        return False
    return hw[len(hw) - len(rw):] == rw or (len(rw) > 1 and hw[-1].startswith(rw[-1]) and hw[-1] != rw[-1])


def shorter_name(row, heading):
    """True when a row's name is a shorter printing of a heading's: its words all among the heading's, two or more of
    them or one with a digit (`MGL-48` in `Armtech MGL-48`, `GMC Bulldog` in `GMC Bulldog Step-Van`), or the heading's
    with its last word cut short (`Laser mic`, `Omni-directional mic` for `… microphone`)."""
    rw, hw = norm(row).split(), norm(heading).split()
    if not rw or not hw or rw == hw or re.search(r"\band\b|&|/|,", heading):
        return False  # (a heading over several items names none of them in full)
    if len(rw) < len(hw) and set(rw) <= set(hw) and (len(rw) > 1 or re.search(r"\d", rw[0])) and " ".join(rw) in " ".join(hw):
        return True
    return (len(rw) > 1 and "".join(rw[:-1]) == "".join(hw[:-1]) and len(rw[-1]) >= 3 and hw[-1].startswith(rw[-1])
            and rw[-1] != hw[-1])


def distinct(name):
    """A name distinctive enough to be an alias: two words or more, or one with a digit or an inner capital
    (`AutoVoice`; not `Fragmentation`)."""
    w = norm(name).split()
    return len(w) > 1 or any(c.isdigit() for c in name) or bool(re.search(r"[a-z][A-Z]", name))


def other_name(row, heading):
    """The heading a row kept its own name under is the item's other name (an alias): the row prints it shorter
    (`GMC Bulldog` under `GMC Bulldog Step-Van`), or the two spell it differently (`Zip pick set` / `Zip pick kit`,
    paired by the book's aliases). Not a heading over several items, nor one the row only adds to (`Widget w/ case`
    under `Widget`)."""
    if not distinct(heading) or re.search(r"\band\b|&|/|,", heading):
        return False
    hw, rw = set(norm(heading).split()), set(norm(row).split())
    return shorter_name(row, heading) or not hw <= rw and not rw <= hw


def _names(name):
    """A heading `A 70/75` stands for `A 70` and `A 75`, `Devil Rat/Demon Rat` for each."""
    m = re.match(r"(.*\s)([\w-]+(?:/[\w-]+)+)$", name)
    parts = [m.group(1) + p for p in m.group(2).split("/")] if m else []
    return parts + [p.strip() for p in name.split("/") if p.strip()] if "/" in name else [name]


# --- reading book.md -------------------------------------------------------------------------------------------

def _cells(line):
    return [c.strip() for c in line.strip()[1:-1].split("|")]


class _PLine(str):
    """A text line that keeps the PDF page it is printed on through a unit's body (a block's page breaks: _breaks)."""
    page = 0


def _pline(v, page):
    x = _PLine(v)
    x.page = page
    return x


def line_page(b, i):
    """The PDF page line i of block b's text is printed on (its page breaks; else the block's page)."""
    page = b.page
    for at, pg in b.breaks or ():
        if at <= i:
            page = pg
    return page


def text_page(b, needle):
    """The PDF page of the first line of block b's text holding `needle` (else the block's page)."""
    for i, ln in enumerate((b.text or "").splitlines()):
        if needle in ln:
            return line_page(b, i)
    return b.page


class _Row(list):
    """A table row (its cells) with the name-only row it is grouped under, if any, and the other names it goes by."""
    group = ""
    aliases = ()
    product = maker = ""  # a line's rows: the product their table titles and the maker its heading prints first
    unlisted = False  # an item its table leaves out (a heading among its rows' headings): its cells empty


_INDENT, _BOLD_MARK = "\u00a0", "\u2002"  # the converter's first-cell marks (layout._first_marks)


def _row_groups(lines, rows):
    """rows (the table's final rows) as _Row with their group: a name-only row heads the rows printed indented under
    it until the indent ends; a bold name-only row with no indent under it (a centred column gives none) heads the
    rows after it while their prices keep one shape (`N¥`), ending at a row of another shape, a bold or name-only row.
    lines: the table's body lines as book.md prints them (the marks), matched to the rows by name. `Rating N` rows are
    rating groups (_rating_groups), not these."""
    raw = []
    for ln in lines:
        first = ln.strip()[1:-1].split("|")[0].lstrip(" \t")
        cells = _cells(ln)
        raw.append((cells[0], first.startswith(_INDENT), _BOLD_MARK in first[:3], not any(cells[1:]),
                    re.sub(r"\d[\d,.]*", "N", " | ".join(cells[1:]))))
    group = [""] * len(raw)
    i = 0
    while i < len(raw):
        name, _, bold, bare, _ = raw[i]
        name = name if re.match(r"[^\W_]", name) else ""  # (a note in brackets, `(Any man-portable weapon)`: no group)
        j = i + 1
        if bare and name and j < len(raw) and raw[j][1] and not raw[i][1]:
            while j < len(raw) and raw[j][1]:
                group[j] = name
                j += 1
        elif bare and bold and name and j < len(raw) and not raw[j][1] and not raw[j][2] and not raw[j][3]:
            shape = raw[j][4]
            while j < len(raw) and not raw[j][2] and not raw[j][3] and raw[j][4] == shape:
                group[j] = name
                j += 1
        i = j
    out, k = [], 0
    for r in rows:
        x = _Row(r)
        for m in range(k, len(raw)):
            if raw[m][0] and r and raw[m][0] == r[0]:
                if group[m] and not _RATING_ROW.match(r[0]):
                    x.group = group[m]
                k = m + 1
                break
        out.append(x)
    return out


@dataclass
class _Table:
    header: list
    rows: list
    page: int
    title: str = ""
    section: str = ""
    catalog: bool = False
    pos: int = 0  # its place in the book's elements
    unpaired: list = field(default_factory=list)  # catalog rows no description took
    notes: dict = field(default_factory=dict)  # the labelled lines printed right under it in a box (`Note:`)
    variant: str = ""  # the lower-case line naming its box's variant, printed over it (`command car`)
    titled: bool = False  # printed right under its own title (not the second of tables stacked under one)
    parent: str = ""  # the title of the table it is a sub-table of (`magical goods table` over `foci`, `formulae`)
    products: bool = False  # products printed side by side, named by a band line (_products): a list, not a box
    own: bool = False  # the rows of its heading's own line or variants (_own_rows): they share the heading's text


def _elements(md):
    """(kind, page, value): ("h", (level, text)), ("t", _Table), ("x", line). A boxed sidebar the converter marks
    (`<!-- box -->` … `<!-- /box -->`) interrupts the flow: what follows it, up to the next heading at the level of
    its first heading or above, goes back before it (the item it interrupted: a price box after a sidebar)."""
    lines, out, page, i = md.splitlines(), [], 0, 0
    start, cont = None, None  # the open sidebar's first element; (its first, its end, its heading level) once closed

    def resume():
        nonlocal cont
        s, e, _ = cont
        out[s:] = out[e:] + out[s:e]
        for n, el in enumerate(out):
            if el[0] == "t":
                el[2].pos = n
        cont = None

    while i < len(lines):
        ln = lines[i]
        i += 1
        if not ln.strip():
            continue
        if ln.strip() == "<!-- box -->":  # (layout.BOX_START)
            if cont:
                resume()
            if start is None:
                start = len(out)
            continue
        if ln.strip() == "<!-- /box -->":  # (layout.BOX_END)
            if start is not None:
                level = next((e[2][0] for e in out[start:] if e[0] == "h"), 9)
                cont, start = (start, len(out), level), None
            continue
        if cont and (h := _HEADING.match(ln)) and len(h.group(1)) <= cont[2]:
            resume()
        if m := _PAGE.match(ln):
            page = int(m.group(1))
        elif ln.startswith("|") and i < len(lines) and _SEP.match(lines[i]):
            rows, body = [], []
            i += 1
            # rows run to the next header (a header line has its rule under it)
            while i < len(lines) and lines[i].startswith("|") and not (i + 1 < len(lines) and _SEP.match(lines[i + 1])):
                rows.append(_cells(lines[i]))
                body.append(lines[i])
                i += 1
            header, rows = _header_rest(_cells(ln), rows)
            header = [deinterleave(h) or h for h in header]
            rows = _wrapped_rows(header, [_repair_row(header, r) for r in rows])
            if (more := _text_rows(header, lines, i)) is not None:
                header, extra, i = more
                rows += extra
            rows = _row_groups(body, rows)
            # a footnote the converter set as the table's last rows (`*Narrow | Burst | increases DV | by 3`), its
            # wrapped lines too (a row of a few cells under it: `Ratings for | the long | barrel. | | …`)
            m = next((n for n in range(len(rows) - 1, 0, -1) if rows[n] and _FOOTNOTE_ROW.match(rows[n][0])), None)
            notes = []
            if m is not None and len(rows) - m <= 3 and all(not all(c.strip() for c in r) for r in rows[m + 1:]):
                notes = [" ".join(" ".join(c.strip() for c in r if c.strip()) for r in rows[m:])]
                rows = rows[:m]
            prev = out[-1] if out else None
            title = out[-2][2][1] if prev and len(out) > 1 and out[-2][0] == "h" else ""
            heads = {k for e in out if e[0] == "h" for k in keys(e[2][1])}
            if prev and prev[0] == "x" and (two := _products(header, rows, prev[2].strip(), title, heads)):
                header, rows = two  # (the band line names the products: not text)
                out.pop()
                prev = out[-1] if out else None
                band = True
            else:
                band = False
            if prev and prev[0] == "t" and _stacked(prev[2], header, rows):
                t = prev[2]  # a second header row under the first, its values under it: one table, side by side
                t.header, t.rows = t.header + header, [a + b for a, b in zip(t.rows, rows)]
                out += [("x", page, n) for n in notes]
                continue
            out.append(("t", page, _Table(header, rows, page, pos=len(out), products=band)))
            out += [("x", page, n) for n in notes]  # (its text: a footnote mark in a cell finds it)
        elif m := _HEADING.match(ln):
            level, text = len(m.group(1)), m.group(2).strip()
            prev = out[-1] if out else None
            # a box title wrapped onto a second line: `##### Delta Force` + `##### and Support Rigger`
            if (prev and prev[0] == "h" and prev[2][0] == level and text[0].islower() and _UPPER.search(text)
                    and _UPPER.search(prev[2][1])):
                out[-1] = ("h", prev[1], (level, prev[2][1] + " " + text))
            # a heading printed twice in a row (`Spirits of Air` over its box `SPIRITS OF AIR`) is one
            elif not (prev and prev[0] == "h" and norm(prev[2][1]) == norm(text)):
                out.append(("h", page, (level, text)))
        elif (bh := _bold_head(lines, i)) and (bt := _bold_table(bh[0], lines, bh[1])) is not None:
            header, rows, i, notes = bt
            out.append(("t", page, _Table(header, rows, page, pos=len(out))))
            out += [("x", page, n) for n in notes]
        else:
            out.append(("x", page, ln))
    if cont:
        resume()
    return out


# a table whose header the converter set as one bold line and its rows as plain lines (`**WEAPON TYPE DV ATTACK
# RATING AVAIL COST**`, `Zapper Exotic 2P 8/—/—/—/— 3(L) 200¥`): a name column first, the price columns last (a column
# printed between AVAIL and COST: `AVAIL SENSOR COST`)
_BOLD_HEAD = re.compile(r"^\*\*((?:NAME|ITEM|WEAPON|GEAR|DEVICE|ARMOR)\s[A-Z][A-Z0-9 ./()#-]*\s(?:AVAIL\.?|AVAILABILITY)"
                        r"(?:\s+[A-Z]+)?\s+COST)\*\*$")
# its name column's header printed on two lines around the others (`**CYBERWARE**` / `**ESSENCE CAP COST**` /
# `**FEATURE**`): the three lines
_BOLD_WORD = re.compile(r"^\*\*([A-Z]{3,})\*\*$")
_BOLD_REST = re.compile(r"^\*\*([A-Z][A-Z0-9 ./()#-]*\sCOST)\*\*$")
_MULTI = ("ATTACK RATINGS", "ATTACK RATING", "DEVICE RATING", "TOP SPEED", "SPEED INT", "SPD INT")
_PRICE_ONLY = re.compile(r"^[\d,.]+\s*¥$")
_BOLD_SHAPES = {"RANGE": r"[\d.]+\s*(?i:km|m)|" + "[—–-]",  # (a range printed with its unit: two words)
                "CAP": r"\[?\d+\]?|[—–-]", "CAPACITY": r"\[?\d+\]?|[—–-]", "COST": r"\+?[\d,.]+\s*¥.*|[—–-]",  # (`+2,500¥`)
                # a rocket's class, its size in parentheses (`0 (60mm x .5m)`): printed over two or three lines
                "CLASS": r"\d+(?:\s*\(\s*[\d.]+\s*mm\s*x\s*[\d.]+\s*m\))?|[—–-]"}
_WRAPS = {"CLASS"}  # the columns whose cell the books wrap over lines (besides the name)


def _bold_columns(head):
    """The columns of a one-line header: its words, the game's two-word columns (`ATTACK RATING`) kept whole."""
    words, cols = head.split(), []
    while words:
        two = " ".join(words[:2])
        if two in _MULTI:
            cols.append(two)
            words = words[2:]
        else:
            cols.append(words.pop(0))
    return cols


def _bold_head(lines, i):
    """(columns, next line) of a bold header at line i - 1 (one line, or a name header printed on two lines around the
    others), else None."""
    ln = lines[i - 1].strip()
    if m := _BOLD_HEAD.match(ln):
        return _bold_columns(m.group(1)), i
    if (m := _BOLD_WORD.match(ln)) and i + 1 < len(lines) and (r := _BOLD_REST.match(lines[i].strip())) \
            and (w := _BOLD_WORD.match(lines[i + 1].strip())):
        return [f"{m.group(1)} {w.group(1)}"] + _bold_columns(r.group(1)), i + 2
    return None


def _bold_row(cols, ln, cost=None):
    """(name, values) of a plain row line under _bold_columns, read from its right (each column one cell: a shaped
    column by its shape, another one word); the name is what is left, maybe empty (printed around the values). A
    row with no price of its own takes `cost` (the price the converter set on a line of its own above it). Shaped
    columns the line leaves out, next to the name, are printed around it (a wrapped cell, _WRAPS: None) or empty
    (""), but a row reads its price columns and two more at least."""
    # the cells are read with their footnote marks set aside; a value keeps its cell's mark at its end (`10/6*/—` ->
    # `10/6/—*`), for its footnote (crb.footnote)
    marks, keep = {}, []
    for ch in re.sub(r"\s+(?=[*†‡])", "", ln.strip()):
        if ch in "*†‡":
            marks[len(keep)] = marks.get(len(keep), "") + ch
        else:
            keep.append(ch)
    s = "".join(keep).strip()
    vals, rev = [], list(reversed(cols[1:]))
    for n, c in enumerate(rev):
        if c == "COST" and cost and not re.search(r"¥\s*$", s):
            vals.append(cost)
            continue
        sh = _BOLD_SHAPES.get(c) or _shape(c)
        m = re.search(rf"(?:^|\s)({sh})$", s) if sh else re.search(r"(?:^|\s)(\S+)$", s)
        if not m:
            left = rev[n:]  # (the rest, next to the name: printed around it, or empty)
            if n < 4 or any((_BOLD_SHAPES.get(x) or _shape(x)) is None for x in left):
                return None
            vals += [None if x in _WRAPS else "" for x in left]
            break
        v = m.group(1).strip()
        vals.append(v + "".join(x for p, x in marks.items() if m.start(1) < p <= m.start(1) + len(v)))
        s = s[:m.start(1)].strip()
    return s, vals[::-1]


def _wrapped(parts, shape):
    """The lines of one row's wrapped cells, the name's first (`al-Assad 0 (40mm x`, ``, `Rocket 1m)`) -> (name, the
    other cell): each line the name's words then the cell's, the cell's parts (on two lines or more: it wraps) together
    fitting its shape, the name keeping all it can; (the lines joined, "") when no split does (the cell is empty)."""
    lines = [p.split() for p in parts]

    def splits(k):
        if k == len(lines):
            yield [], []
            return
        for cut in range(len(lines[k]), -1, -1):  # (the name's words first)
            for n, c in splits(k + 1):
                yield [lines[k][:cut]] + n, [lines[k][cut:]] + c
    for n, c in splits(0):
        cell = " ".join(w for x in c for w in x)
        if sum(1 for x in c if x) > 1 and re.fullmatch(rf"(?:{shape})", cell) and any(n):
            return " ".join(w for x in n for w in x), cell
    return " ".join(w for x in lines for w in x), ""


def _centered(items):
    """The fragment lines between a table's rows split as the books print a wrapped row, its values level with the
    middle of its lines: as many over the values as under them, or one more over them (an even count of lines); the
    lines after the last row's are the text after the table. -> [(over, under)] a row, or None when they don't split
    so."""
    rows = [k for k, it in enumerate(items) if it[0] == "row"]
    if not rows:
        return None
    gaps = [[it for it in items[a + 1:b] if it[0] == "frag"] for a, b in zip([-1] + rows, rows + [len(items)])]

    def solve(k, over):
        nxt = gaps[k + 1]
        for u in [len(over)] + ([len(over) - 1] if over else []):
            if u > len(nxt):
                continue
            if not (over or nxt[:u] or items[rows[k]][1]):
                continue  # (a row with no name)
            rest = [] if k == len(rows) - 1 else solve(k + 1, nxt[u:])
            if rest is not None:
                return [(over, nxt[:u])] + rest
        return None
    return solve(0, gaps[0])


def _bold_table(cols, lines, i):
    """(header, rows, next line, notes) of a bold-header table (_bold_head's columns) from line i, else None. A name
    the converter wrapped around its row (`Zap` over the values, `Glove` under them; `(Heavy)` under them) is joined:
    the lines between two rows split as the books centre a row's values on its lines (_centered: as many over as
    under); where they don't, a line that is no row goes with the row under it when that row prints no name, or comes
    after a row that printed none (one capitalised line, or a parenthesised one, completes it). A wrapped cell of
    another column (a rocket's class, `0 (40mm x` over `1m)`) takes its part of each line (_wrapped). A line holding
    only a price is the next row's price; a `**Note:**` line between rows is kept for the text after the table."""
    items, cost, j, notes = [], None, i, []
    while j < len(lines):
        ln = lines[j].strip()
        if not ln or _PAGE.match(ln):
            j += 1
            continue
        if ln.startswith("**Note:") and any(_bold_row(cols, x.strip()) is not None for x in lines[j + 1:j + 8]
                                            if not x.startswith(("#", "|", "**"))):
            notes.append(lines[j])  # (a note on the rows over it, the table going on under it)
            j += 1
            continue
        if ln.startswith(("#", "|", "*", ">", "<!--")) or len(ln) > 60:
            break
        if _PRICE_ONLY.match(ln):
            cost = ln
        elif (r := _bold_row(cols, ln, cost)) is not None:
            items.append(["row", r[0], r[1], r[0] == "", [], j])
            cost = None
        else:
            items.append(["frag", re.sub(r"[*†‡]", "", ln).strip(), j])
        j += 1
    wraps = [k for k, c in enumerate(cols[1:]) if c in _WRAPS]
    rows = []
    if (cen := _centered(items)) is not None and any(o or u for o, u in cen):
        j = max([x[-1] for x in items if x[0] == "row"] + [f[-1] for _, u in cen for f in u]) + 1  # (then text)
        for it, (over, under) in zip([x for x in items if x[0] == "row"], cen):
            parts, vals = [f[1] for f in over] + [it[1]] + [f[1] for f in under], list(it[2])
            for k in wraps:  # (a wrapped cell besides the name: its part of each line)
                if vals[k] is None:
                    name, vals[k] = _wrapped(parts, _BOLD_SHAPES[cols[k + 1]])
                    parts = [name]
            rows.append(["row", " ".join(x for x in parts if x).strip(), vals])
    else:
        pending = []
        for k, it in enumerate(items):
            if it[0] == "row":
                it[1] = " ".join(pending + [it[1]]).strip()
                pending = []
                rows.append(it)
                continue
            nxt = items[k + 1] if k + 1 < len(items) else None
            prev = rows[-1] if rows and items[k - 1] is rows[-1] else None
            back = prev is not None and (it[1].startswith("(") or prev[3] and not prev[4] and not (nxt and nxt[0] == "row" and nxt[3]))
            if back:
                prev[4].append(it[1])
                prev[1] = f"{prev[1]} {it[1]}"
            else:
                pending.append(it[1])
    rows = [r for r in rows if r[1]]
    if not rows:
        return None
    return cols, [[r[1]] + [v or "" for v in r[2]] for r in rows], j, notes


_TEXT_ROW = re.compile(r"^(?P<name>[A-Z(][^|¥]*?\S)\s+(?P<avail>\d{1,2}\s*(?:\(\s*[LIF]\s*\)|[LIF])?|[—–-])\s+"
                       r"(?P<cost>(?:Rating\s*[x×]\s*)?\d[\d,.]*\s*¥.*)$")
_GROUP_LINE = re.compile(r"^[A-Z][\w'’&./-]*(?:\s+[\w'’&./-]+){0,5}$")


def _text_rows(header, lines, i):
    """A NAME | AVAIL | COST table whose later rows the converter set as plain lines (`Glow Pen 2 20¥`): those rows,
    up to the first line of another shape; a name-only line (`Zap Kit`) names the rows under it (`Zap Kit Basic
    (Rating 1–6)`). (header, rows, next line) or None. A last header cell ending in the price word (the next table's
    header run into it: `RANGE TYPE DURATION DV COST`) is that word."""
    hu = [h.upper() for h in header]
    if len(header) < 3 or not any("AVAIL" in h for h in hu[1:-1]) or not hu[-1].endswith("COST"):
        return None
    rows, group, j, last = [], "", i, i
    while j < len(lines):
        ln = lines[j].strip()
        if not ln or _PAGE.match(ln):
            j += 1
            continue
        m = _TEXT_ROW.match(ln)
        if m:
            own = re.sub(r"\s*\([^()]*\)\s*$", "", m.group("name"))
            group = group if group and len(own.split()) == 1 else ""  # (a sub-row is one word: `Advanced`, `MD-9`)
            name = f"{group} {m.group('name')}" if group else m.group("name")
            rows.append([name] + [""] * (len(header) - 3) + [m.group("avail"), m.group("cost")])
            j += 1
            last = j
            continue
        if _GROUP_LINE.match(ln) and j + 1 < len(lines) and _TEXT_ROW.match(lines[j + 1].strip()) and rows:
            group = ln
            j += 1
            continue
        break
    if not rows:
        return None
    header = header[:-1] + ["COST"] if hu[-1] != "COST" else header
    return header, rows, last


# column headers the books set on two lines (a general vocabulary of the stat columns): the converter, reading a
# header cell's two lines letter by letter across, can interleave them (`S INP TD` for SPD over INT)
TWO_LINE_HEADERS = ("SPD INT", "TOP SPD", "SPEED INT", "SPEED TOP", "TOP SPEED", "SPEED INTERVAL", "ATTACK RATINGS",
                    "DEVICE RATING", "DATA PROCESSING", "DEFENSE RATING", "MOD SLOTS", "SIZE CLASS")


def _interleaves(s, a, b):
    """True when s is a and b with their letters interleaved, each in its order."""
    if len(s) != len(a) + len(b):
        return False
    ok = {(0, 0)}
    for k, ch in enumerate(s, 1):
        ok = {(i + 1, j) for i, j in ok if i < len(a) and a[i] == ch} | {(i, j + 1) for i, j in ok if j < len(b) and b[j] == ch}
        if not ok:
            return False
    return (len(a), len(b)) in ok


def deinterleave(cell):
    """The two-line header (TWO_LINE_HEADERS) whose lines the cell holds interleaved (`S INP TD` -> `SPD INT`,
    `T SO PDP` -> `TOP SPD`), else None. A cell that already reads is left to the caller."""
    s = re.sub(r"[\s.]", "", cell.upper())
    if not s.isalpha() or cell.upper().strip() in TWO_LINE_HEADERS:
        return None
    return next((h for h in TWO_LINE_HEADERS if (w := h.split()) and len(w) == 2
                 and (_interleaves(s, w[0], w[1]) or _interleaves(s, w[1], w[0]))), None)


_PRICE_HEAD = {"AVAIL", "AVAILABILITY", "AVAIL.", "COST"}
_HEAD_WORD = re.compile(r"[A-Z][A-Z/.()]*(?: [A-Z][A-Z/.()]*)*")


def _header_rest(header, rows):
    """A header cell set on two lines (`ATTACK` over `RATINGS`): the first row holds only the rest of some header cells
    (capitals, no digits, its name cell empty) -> joined into the header."""
    r = rows[0] if rows else None
    if (r and len(r) == len(header) and not r[0] and any(r)
            and all(not c or _HEAD_WORD.fullmatch(c) for c in r)):
        return [f"{h} {c}".strip() for h, c in zip(header, r)], rows[1:]
    return header, rows


# the shape of a cell under a column the books print in every stat table (a general vocabulary of the game's columns)
_DASH = r"[—–-]"
_COLUMN_SHAPES = {
    "MODES": r"(?:SS|SA|BF|FA)(?:\s*\([^)]*\))?(?:\s*/\s*(?:SS|SA|BF|FA)(?:\s*\([^)]*\))?)*|" + _DASH,
    "ATTACK RATINGS": rf"(?:{_DASH}|\d+\*?)(?:\s*/\s*(?:{_DASH}|\d+\*?)){{4}}(?:\s*\([^)]*\))?",
    "AMMO": r"(?:\d+\s*(?:x\s*\d+\s*)?\([^)]*\)|Energy)(?:\s*(?:\+|\bor\b|\bper\b).*)?|" + _DASH,
    "AVAIL": rf"\d+\s*(?:\(?[LIF]\)?)?|{_DASH}",
    "COST": rf"[\d,.]+\s*¥.*|{_DASH}",
}
_COLUMN_NAMES = {"MODE": "MODES", "ATTACK RATING": "ATTACK RATINGS", "AR": "ATTACK RATINGS",
                 "AVAILABILITY": "AVAIL", "AVAIL.": "AVAIL"}


def _shape(h):
    h = " ".join(h.upper().rstrip("*†").split())
    return _COLUMN_SHAPES.get(_COLUMN_NAMES.get(h, h))


def _fits(h, v):
    sh = _shape(h)
    return sh is None or not v.strip() or re.fullmatch(sh, v.strip()) is not None


def _repair_row(header, row):
    """A row the converter set with two cells run into one (`SS(1)—/14/20/22/18(4km)`: the mode and the attack
    ratings), every later cell one column to the left and a stray cell at its end: the run-together cell is split
    where both halves fit their columns' shapes (_COLUMN_SHAPES), the later cells move back into place and the stray
    one goes. Only when every shaped cell then fits; otherwise the row stays as printed."""
    if len(row) not in (len(header), len(header) - 1) or all(_fits(h, v) for h, v in zip(header, row)):
        return row
    for i in range(1, min(len(row), len(header) - 1)):
        a, b, v = header[i], header[i + 1], row[i].strip()
        if not (_shape(a) and _shape(b)):
            continue
        for k in range(1, len(v)):
            if v[k - 1].isdigit() and v[k] in ",.0123456789":
                continue  # (never inside a number: `7,500¥` under AVAIL is the book's, not `7` and `,500¥`)
            x, y = v[:k].strip(), v[k:].strip()
            if x and y and _fits(a, x) and _fits(b, y):
                fixed = (row[:i] + [x, y] + row[i + 1:])[:len(header)]
                if all(_fits(h, c) for h, c in zip(header, fixed)):
                    return fixed
    return row


def _wrapped_rows(header, rows):
    """A row the converter split over two (`Machine | | SA/BF/ | | | |` over `Pistol | 2P | FA | 9/10/5/—/— | …`): the
    first prints no price (its AVAIL and COST empty, and its DV) where the next prints them, and its other cells only
    a value broken after a `/` (`SA/BF/`, `15/22/`): joined cell by cell (no space after a `/`)."""
    hs = [h.upper() for h in header]
    need = [i for i, h in enumerate(hs) if h in ("AVAIL", "AVAILABILITY", "COST", "DV")]
    if len(need) < 2:
        return rows
    out, i = [], 0
    while i < len(rows):
        a = rows[i]
        b = rows[i + 1] if i + 1 < len(rows) else None
        if b and len(a) == len(b) == len(hs) and a[0].strip() and not a[0].strip().startswith("(") \
                and all(not a[k].strip() and b[k].strip() for k in need) and any(c.strip() for c in a[1:]) \
                and all(c.strip().endswith("/") for c in a[1:] if c.strip()):
            out.append(_Row([(x.strip() + ("" if x.strip().endswith("/") else " ") + y.strip()).strip() for x, y in zip(a, b)]))
            i += 2
            continue
        out.append(a)
        i += 1
    return out


def _band_names(line, n):
    """The n band names of a band line set over a table (`regular HEX Assault Cannon`: `regular`, `HEX Assault
    Cannon`): a band starts at a capital after a word in lower case. None unless that gives n."""
    out, prev = [], ""
    for w in line.split():
        if not out or w[:1].isupper() and prev.isalpha() and prev.islower():
            out.append(w)
        else:
            out[-1] += " " + w
        prev = w
    return out if len(out) == n else None


_AMMO_WORD = re.compile(r"\s+(?:ammunition|ammo|rounds|shells)$", re.I)


def _products(header, rows, line, title="", heads=frozenset()):
    """A table printing products side by side (Deadly Arts' ammunition: `SIZE | AVAIL | COST PER 10 | BLAST PROFILE |
    AVAIL | COST PER 10` under the band line `regular HEX Assault Cannon`): its price columns again after the first set,
    a band line naming each set. -> (header, rows) a row a product: the first band's under the row's name, each later
    band's `<row> (<band>)` with its own columns (one printing only dashes is no product), in reading order. None when
    the table isn't one (one set of prices, or a band line that doesn't name each set)."""
    up = [h.upper() for h in header]
    ends = [i for i, h in enumerate(up) if h.startswith("COST")]
    if len(ends) < 2 or not line or line.startswith(("|", "#", "*", "<")) or len(line) > 60 or ":" in line \
            or up[0] not in NAME_COLUMNS | {"SIZE"}:
        return None  # (its first column names the rows; a title line `krime party: SR6` names no band)
    sets = [list(range(a + 1, b + 1)) for a, b in zip([0] + ends, ends)]
    if ends[-1] != len(header) - 1 or any(sum(up[i].startswith("AVAIL") for i in s) != 1 for s in sets):
        return None
    names = _band_names(line, len(sets))
    if names is None:
        return None
    first = [header[0]] + [header[i] for i in sets[0]]
    extra = list(dict.fromkeys(header[i] for s in sets[1:] for i in s if header[i] not in first))
    # the weapon class the products are for, as a search name (`Assault Cannon B25`, `Autocannon B60 HEX`): the
    # title's when the book heads that class (`Autocannon Ammunition`: its `Autocannons`), else a later band's words
    # after its first (`HEX Assault Cannon`), its first word the band's tag
    own = _AMMO_WORD.sub("", title).strip()
    cls = own if own and own != title and set(keys(own)) & heads else         next((b.split(None, 1)[1] for b in names[1:] if len(b.split()) > 1), "")
    tag = lambda b: b.split()[0] if len(b.split()) > 1 else b  # noqa: E731
    out_h = first + extra
    out = []
    for r in rows:
        r = list(r) + [""] * (len(header) - len(r))
        out.append(_Row([r[0]] + [r[i] for i in sets[0]] + [""] * len(extra)))
        out[-1].aliases = (f"{cls} {r[0]}",) if cls else ()
        for s, band in zip(sets[1:], names[1:]):
            if not any(re.search(r"[^\s—–-]", r[i]) for i in s):
                continue  # (no such product in this size: dashes only)
            cells = {header[i]: r[i] for i in s}
            out.append(_Row([f"{r[0]} ({band})"] + [cells.get(h, "") for h in out_h[1:]]))
            out[-1].aliases = (f"{cls} {r[0]} {tag(band)}",) if cls else ()
    return out_h, out


def _stacked(t, header, rows):
    """True when a table printed right under t continues t's rows (the book sets a wide row as two stacked bands:
    `NAME | TYPE | DV | MODE | ATTACK RATINGS` over `AMMO | AVAIL | COST`): as many rows, headers sharing no cell, and
    the second band carrying the price columns."""
    up = {h.upper() for h in t.header}
    return (bool(rows) and len(rows) == len(t.rows) and not up & {h.upper() for h in header}
            and bool(_PRICE_HEAD & {h.upper() for h in header}) and not _PRICE_HEAD & up
            and not any(a[:1] == b[:1] and a[:1] != [""] for a, b in zip(t.rows, rows)))  # (a second table of the names)


# --- units: what one heading (or a chapter's lead) holds --------------------------------------------------------

@dataclass
class _Unit:
    kind: str  # "section" | "item" (a heading with a capital) | "box" (a lower-case title over a stat box)
    name: str
    level: int
    page: int
    chapter: str
    section: str
    tags: str = ""
    stats: list = field(default_factory=list)  # _Table
    labels: dict = field(default_factory=dict)
    body: list = field(default_factory=list)  # text lines and _Table
    rows: list = field(default_factory=list)  # (table, row) paired with this description
    merged: bool = False
    pos: int = 0
    box_labels: bool = False  # labelled lines taken as a stat box (not lines met in the description)
    full: set = field(default_factory=set)  # id() of the rows printing a shorter name: named by this heading
    shared: bool = False  # a box holding a description it shares with other boxes

    def has_box(self):
        return bool(self.stats) or self.box_labels

    def has_text(self):
        return any(isinstance(b, str) and not _FOOTNOTE_LINE.match(b) for b in self.body)  # (a box's footnote isn't)


# a first header that is a name column's own word, not a class of things (`FORMULAE`, `GRENADES`)
NAME_COLUMNS = {"TYPE", "TYPES", "ITEM", "ITEMS", "NAME", "WEAPON", "WEAPONS", "GEAR", "DEVICE", "CLASS", "ARMOR"}


def _names_class(header, first):
    """A table stacked under another's title whose first header names its own class of things (`FORMULAE`,
    `MAGICAL SUPPLIES` under `foci`): that header is its title."""
    h = (header[0] if header else "").strip().upper()
    return (bool(re.fullmatch(r"[A-Z][A-Z ]{3,}", h)) and h not in NAME_COLUMNS
            and h != (first[0] if first else "").strip().upper())


# a line naming a box's variant over its bands: lower case, one to three words (`command car`, `battle wagon`)
_VARIANT_LINE = re.compile(r"[a-z][a-z-]*(?: [a-z][a-z-]*){0,2}")
# a table's title set as a plain line right over it: lower case, one to three words (`sprayers`)
_SET_TITLE = re.compile(r"[a-z][a-z-]+(?: [a-z][a-z-]+){0,2}")
# a line pricing the item over it (`Availability 6, Cost 5,000¥`; crb._PRICE_LINE reads it)
_PRICE_LINE = re.compile(r"^\s*Avail(?:ability)?:?\s*\d+\s*(?:\([A-Z]\))?\s*,\s*Cost:?\s*[\d,]+\s*¥\s*$")


_FOOTNOTE_ROW = re.compile(r"\s*[*†‡]")
_FOOTNOTE_LINE = re.compile(r"\s*(?:\*(?!\*)|[†‡])")  # a footnote printed under a table (not a bold label: `**Note:**`)
_FIELD_HEAD = re.compile(r"(?:Karma\s+)?(?:Bonus|Cost)|Game\s+Effects?")
_NEW_ENTRY = re.compile(r"new\s+[a-z ]+?:\s*[A-Za-z]")


def _is_label(level, text):
    """A table title, box title or art caption: its first letter is lower case (`ares predator VI`)."""
    first = re.search(r"[^\W\d_]", text)
    if _NEW_ENTRY.match(text):
        return False  # (`new quality: Pacifist (1-4)`: a heading naming its kind before the new entry's name)
    if re.fullmatch(r"[a-z]+[A-Z]{2}\w*", text.strip()):
        return False  # (a one-word name set with a lower-case lead: `rEVOlutionary`; not `rEVOlution Arms Raven`)
    return level > 1 and (not first or first.group().islower())


def _units(els, start, end, chapter, item_keys, aliases):
    """The chapter's units in reading order. item_keys: the norm keys of its item headings (a lower-case title
    with one of them is a stat box)."""
    units, section, over = [], "", None
    cur = _Unit("section", chapter, 1, els[start][1] if start < end else 0, chapter, "")
    units.append(cur)
    mode = "text"  # "box": right after a heading, taking tags, tables and labelled lines
    caption = ""  # the last level-4 heading read as a caption (a box titled with part of it is a box: below)
    head_name = lambda: next((u.name for u in reversed(units) if u.kind == "item"), "")  # noqa: E731
    variant = ""  # the variant line over the next table of a box
    fresh = False  # nothing taken since the item heading (a "(tags)" heading may follow)
    label = None  # (unit, key) of the labelled line still open for a wrapped value
    last = ""  # the open label's last line
    listy = False  # the open label's value starts on the next line
    i = start
    while i < end:
        kind, page, v = els[i]
        i += 1
        if kind == "x":
            v = _pline(v, page)
        if kind == "h":
            level, text = v
            label = None
            if level == 1:  # the chapter heading itself
                continue
            if cur.kind == "item" and level > cur.level and _FIELD_HEAD.fullmatch(text):
                # a field set as a heading under the item (`##### Bonus` over `5 Karma per level`): its labelled line
                cur.body.append(f"**{text}:**")
                mode, fresh = "text", False
                continue
            if fresh and level == 5:  # a tag line right under a heading: `(tags)`, `Cost: …`, or under a section any
                if m := re.fullmatch(r"\(([^()]*)\)", text):
                    cur.tags = "; ".join(filter(None, [cur.tags, m.group(1)]))
                    continue
                if m := re.fullmatch(r"([A-Z][^:]{0,30}):\s*(.+)", text):
                    cur.labels.setdefault(m.group(1), m.group(2))
                    cur.box_labels = True
                    continue
                if cur.kind == "section" and not re.search(r"\(\s*\d+\s*(?:Edge|Karma)\s*\)\s*$", text, re.I):
                    # (not an entry priced in its heading, `Batch Execution (1 Edge)`, first under `Edge Actions`)
                    cur.tags = "; ".join(filter(None, [cur.tags, text]))
                    continue
            if _is_label(level, text):
                nxt = els[i] if i < end else None
                if nxt and nxt[0] == "x" and (tag := re.fullmatch(r"\(([^()]{2,60})\)", nxt[2].strip())):
                    # a lower-case title over a tag line (`evo landtreader` + `(Personal Motor Vehicle)`): an item
                    # whose description and stats follow
                    cur = _Unit("item", text, level, page, chapter, section, tags=tag.group(1))
                    cur.pos = i - 1
                    units.append(cur)
                    i += 1
                    mode, fresh = "box", False
                    continue
                if nxt and nxt[0] == "h" and _is_label(nxt[2][0], nxt[2][1]):
                    # a table's title over its sub-tables' titles (`magical goods table` / `foci`, `vehicles` /
                    # `microdrones`): a title naming a table or a plural class, not an art caption (`panther xxl`)
                    over = text if re.search(r"(?i)\btables?$|[a-z][^s\W]s$", text.strip()) else None
                    continue
                if not nxt or not (nxt[0] == "t" or (nxt[0] == "x" and _LABEL.match(nxt[2]))):
                    k = i
                    while k < end and els[k][0] == "x":
                        k += 1
                    if any(_PRICE_LINE.match(els[n][2]) for n in range(i, k)):
                        # a lower-case title whose text prices it in a line (`virtual garages` … `Availability 6,
                        # Cost 5,000¥`): a sidebar's item, not an art caption
                        cur = _Unit("item", text, level, page, chapter, section)
                        cur.pos = i - 1
                        units.append(cur)
                        mode, fresh = "text", False
                        continue
                    if level == 4:
                        caption = text  # (an item heading set in lower case, `rEVOlution Arms Rhino, Behemoth, …`)
                    continue  # an art caption: dropped, the text flows on
                # a stat box: a title an item heading has, or one-row bands followed by labelled lines
                j = i
                while j < end and els[j][0] == "t" \
                        and len([r for r in els[j][2].rows if not _FOOTNOTE_ROW.match(r[0] if r else "")]) == 1:
                    j += 1  # (a one-row band, its footnote set as a second row: `*Attack | Ratings are | …`)
                k = j
                while k < end and els[k][0] == "x" and _FOOTNOTE_LINE.match(els[k][2]):
                    k += 1  # (a band's footnotes, then its labelled lines)
                # (a title over a list of several rows is a table title even when an item heading has its name; a
                # one-row band titled with part of the item heading's name is a box: `ingram white knight mod 2` under
                # `Ingram White Knight Mod 1 and Mod 2`, `rhino` under the caption-cased `rEVOlution Arms Rhino, …`)
                boxed = (k < end and els[k][0] == "x" and _LABEL.match(els[k][2])) or \
                    (j > i or els[i][0] != "t") and any(k in item_keys for k in keys(text, aliases)) or \
                    j > i and any(set(norm(text).split()) <= set(norm(n).split()) for n in (head_name(), caption) if n) or \
                    j > i and not any(re.match(r"[^\W\d_]{2}", (r[0] if r else "")) for x in range(i, j)
                                      for r in els[x][2].rows) \
                    and any({"AVAIL", "AVAIL.", "COST"} & {h.upper() for h in els[x][2].header} for x in range(i, j)) \
                    and difflib.SequenceMatcher(None, norm(text), norm(cur.name)).ratio() < 0.8  # (not `accesory rails`)
                # (priced bands naming no row: `flash scope` over `(5–10)S | SA | … | 5,000¥`)
                if not boxed:  # a table title: its tables join the flow, the text goes on in the same unit
                    first = i
                    while i < end and els[i][0] == "t":
                        t = els[i][2]
                        t.title, t.section, t.titled, t.parent = text, section, i == first, over or ""
                        if i > first and _names_class(t.header, els[first][2].header):
                            # a sub-table: its first header names its class (`FORMULAE` stacked under `foci`), the
                            # table's title stays its table's
                            t.title, t.titled, t.parent = t.header[0].lower(), True, over or text
                        cur.body.append(t)
                        i += 1
                    over = None
                    continue
                cur = _Unit("box", text, level, page, chapter, section)
            elif level <= 3:
                section = text
                cur = _Unit("section", text, level, page, chapter, section)
            else:
                cur = _Unit("item", text, level, page, chapter, section)
            over = None  # (a heading ends a table title's run)
            cur.pos = i - 1
            units.append(cur)
            mode, fresh = "box", cur.kind != "box"
        elif kind == "t":
            fresh, label = False, None
            v.section = section
            if not v.title and i >= 2 and els[i - 2][0] == "x" and _SET_TITLE.fullmatch(els[i - 2][2].strip()) \
                    and not _same(els[i - 2][2].strip(), cur.name):
                v.title, v.titled = els[i - 2][2].strip(), True  # a title the converter set as a line (`sprayers`)
            # a section's tables are its text; an item's or box's tables right under its heading are its stat box, and
            # so is a later one with a header of that box (a box's next item printed after a note on the one above)
            boxed = (mode == "box" or any(s.header == v.header for s in cur.stats)) and not v.products
            (cur.stats if boxed and cur.kind != "section" else cur.body).append(v)
            if boxed and cur.kind != "section" and variant:
                v.variant = variant
            variant = ""
        elif (mode == "box" and cur.kind != "section" and _VARIANT_LINE.fullmatch(v.strip()) and i < end
              and els[i][0] == "t"):
            variant = v.strip()[:1].upper() + v.strip()[1:]  # a box's variant over its bands (`command car`): their TYPE
        elif mode == "box" and cur.stats and _FOOTNOTE_LINE.match(v):
            cur.body.append(v)  # a footnote under a box's band: the box goes on (its labelled lines next)
        else:
            fresh = False
            m = _LABEL.match(v)
            if m:
                key, value = m.group(2).strip(), m.group(3).strip()
                if mode == "box" and key in cur.labels and not (cur.stats and key not in cur.stats[-1].notes):
                    # a label printed again under the heading: a list of entries, each with its own labelled lines
                    # (`**Name:** …` + `• **Cost:** …` twice): the rest is text
                    mode, label = "text", None
                    cur.body.append(v)
                    continue
                targets = [cur.labels] if key not in cur.labels else []
                cur.labels.setdefault(key, value)
                if mode == "box" and cur.stats and key not in cur.stats[-1].notes:
                    cur.stats[-1].notes[key] = value  # a note under one of a box's tables: that table's item's
                    targets.append(cur.stats[-1].notes)
                label, last, listy = ((targets, key) if targets else None), v, not value
                if mode == "box":
                    cur.box_labels = True
                    continue
            elif label and not v.startswith("•") and (listy or not _SENTENCE_END.search(last) and (
                    (mode == "box" and cur.stats) or not v[:1].isupper() or last.endswith((",", "-"))
                    or (i >= end or els[i][0] != "x") and not _SENTENCE_END.search(v))):
                # a wrapped value, or the next entry of a label printed alone on its line (`**Weapons:**` over one
                # weapon a line). Unless under stat tables, a capital after an unbroken line starts the text (but a
                # last unbroken line before a heading or table is the value's end: `**Powers:** Fizz` + `Storm`);
                # a stat box has no text after its labels.
                targets, key = label
                for d in targets:
                    prev = d[key]
                    joined = prev[:-1] if re.search(r"[a-z]-$", prev) and v[:1].islower() else prev + " " if prev else ""
                    d[key] = joined + v.strip()
                last = v
                if mode == "box":
                    continue
            else:
                label = None
            mode = "text"
            cur.body.append(v)
    return units


# --- pairing ----------------------------------------------------------------------------------------------------

def _merge_boxes(units, aliases, report):
    """A titled stat box joins the nearest description with its key that has no box of its own. Several boxes
    taking one description (`Devil Rat/Demon Rat`) each keep their own block and share its text."""
    descs = [u for u in units if u.kind == "item" and not u.stats and u.has_text()]
    took = {}
    for u in units:
        if u.kind == "section" or not u.has_box() or any(u is d for d in descs) or u.kind == "item" and u.has_text():
            continue  # (an item with its band and its own text is whole: a spell named like an adept power)
        ks = keys(u.name, aliases)
        cands = [d for d in descs if any(k in ks for nm in _names(d.name) for k in keys(nm, aliases))]
        if cands:
            d = min(cands, key=lambda d: abs(d.pos - u.pos))
            took.setdefault(id(d), (d, []))[1].append(u)
    for d, boxes in took.values():
        if len(boxes) == 1:
            u = boxes[0]
            d.stats, d.labels, d.box_labels, d.tags = u.stats, {**d.labels, **u.labels}, u.box_labels, d.tags or u.tags
            d.body += u.body
            u.merged = True
            continue
        for u in boxes:
            u.body, u.labels, u.tags = d.body + u.body, {**d.labels, **u.labels}, u.tags or d.tags
            u.shared = True
        d.merged = True
        report.append({"kind": "shared-description", "name": d.name, "rows": "; ".join(u.name for u in boxes),
                       "page": d.page, "chapter": d.chapter})


def _share_runs(units, report):
    """Items printed side by side (two spells, each a heading, tags and a band) share the text under the last one:
    a run of same-level items with tables and no labels or text ends at such an item with text."""
    run = []
    for u in [u for u in units if not u.merged]:
        boxed = u.kind == "item" and u.stats and not u.labels and (not run or u.level == run[-1].level)
        if boxed and u.has_text() and run:
            for r in run:
                r.body = [b for b in u.body if isinstance(b, str)]
            report.append({"kind": "shared-description", "name": u.name, "rows": "; ".join(r.name for r in run + [u]),
                           "page": u.page, "chapter": u.chapter})
        run = run + [u] if boxed and not u.has_text() else []


def _same(title, name):
    """A table title naming the item it is printed under (`heritage line` under `Zoé Heritage Line`, `secondary
    propulsion systems table` under `Secondary Propulsion Systems`): one holds the other's words."""
    a, b = (set(norm(x).split()) - {"table", "tables"} for x in (title, name))
    return bool(a and b) and (a <= b or b <= a)


_LINE_WORDS = {"line", "series", "collection", "range"}  # a brand's last word naming it a product line
# the first headers of a list naming its rows one by one (not TYPE or CLASS: a box's variants, the recipe's to read)
_ITEM_COLUMNS = {"ITEM", "ITEMS", "NAME", "WEAPON", "WEAPONS", "GEAR", "DEVICE", "ARMOR"}


def _own_rows(t, u, lower):
    """The rows of a table printed in a heading's text under the heading's own name (`heritage line` under `Zoé
    Heritage Line`, `bayonet` under `Bayonet`), a name column first (WEAPON, ITEM …) and a price on two rows at least
    (a footnote set as a row is dropped). Rows named by generic words (two at most, no digit, each printed in lower
    case in the book's prose: `Standard`, `Retractable`) are the heading's variants, `<heading> (<row>)`; rows named
    otherwise, or sharing a word with the heading (`Bearded Axe`, `Tonfa`; `Inhibitor Collar` under `Inhibitor Bands`)
    are the items of the heading's line, so a row never pairs with another description of its name: a brand's (a
    maker printed before the title's words) named with it (`Zoé Heritage Tonfa`, below), else grouped under the
    heading. None for any other table (a section's list: a heading above level 3, a title saying `table`)."""
    hs = [h.upper() for h in t.header]
    cost = next((i for i, h in enumerate(hs) if h.startswith("COST")), None)
    if re.search(r"(?i)\btables?\b", t.title or "") or u.level < 3:
        return None  # (`hire table` under `Hire`, `gizmos` under a chapter's `## Gizmos`: the section's list)
    title, name = (set(norm(x).split()) for x in (t.title, u.name))
    # (titled with the heading's own words: not `security and restraints` over `Restraints`, a list it is one row of)
    if not t.titled or not title or not title <= name or not hs or hs[0] not in _ITEM_COLUMNS or cost is None \
            or not {"AVAIL", "AVAILABILITY", "AVAIL."} & set(hs):
        return None
    # (a footnote or note set as a row: a mark or a label in its first cell, or a sentence there)
    rows = [r for r in t.rows if r and re.match(r"[^\W\d_]", r[0]) and not re.search(r"[*†‡:]", r[0])
            and len(r[0].split()) <= 6]
    if sum(1 for r in rows if len(r) > cost and re.search(r"\d", r[cost])) < 2:
        return None
    head = set(norm(u.name).split())
    generic = all(len(r[0].split()) <= 2 and not re.search(r"\d", r[0]) and not head & set(norm(r[0]).split())
                  and all(w.lower() in lower for w in re.findall(r"[A-Za-z]+", r[0])) for r in rows)
    # a brand: the heading prints a maker before its title's words (`Zoé` + `heritage line`: the brand `Zoé Heritage
    # Line`). Its rows are named with it, as the editions name them (owner, 2026-10-07): `Zoé Heritage Bearded Axe`,
    # searched also as `Heritage Bearded Axe`, `Zoé Bearded Axe` (not the bare row: the generic `Tonfa` is another
    # item); the brand is their maker
    hw = u.name.split()
    k = next((i for i in range(len(hw)) if set(norm(" ".join(hw[i:])).split()) == title), 0)
    line = hw[k:-1] if k and len(hw) - k > 1 and hw[-1].lower() in _LINE_WORDS else hw[k:]
    out = []
    for r in rows:
        if generic:
            x = _Row([f"{u.name} ({r[0]})"] + list(r[1:]))
        elif k:
            lead, own = " ".join(hw[:k]), " ".join(line)
            x = _Row([f"{lead} {own} {r[0]}"] + list(r[1:]))
            x.aliases, x.maker = (f"{own} {r[0]}", f"{lead} {r[0]}"), u.name
        else:
            x = _Row(list(r))
            x.group = getattr(r, "group", "") or u.name  # (a name-only row over it stays its group)
        out.append(x)
    return out


def _chapter(units, aliases, name_headers, report, variants=False, later=frozenset(), lower=frozenset()):
    _merge_boxes(units, aliases, report)
    _share_runs(units, report)
    descs = [u for u in units if u.kind == "item" and not u.merged]
    chapter = units[0].chapter
    exact, loose, first = {}, {}, {}  # key -> descriptions in reading order; primary key -> first description
    for d in descs:
        for nm in dict.fromkeys([d.name] + _names(d.name)):
            ks = keys(nm, aliases)
            for tier, group in ((exact, ks[:1]), (loose, ks[1:])):
                for k in group:
                    if d not in tier.setdefault(k, []):
                        tier[k].append(d)
        if keys(d.name, aliases)[0] in first:
            report.append({"kind": "duplicate", "of": "heading", "name": d.name, "page": d.page, "chapter": chapter})
        first.setdefault(keys(d.name, aliases)[0], d)

    def found(name):
        ks = keys(name, aliases)
        return next((tier[k] for tier in (exact, loose) for k in ks if k in tier), [])

    def is_catalog(t):
        if len(t.header) < 2 or not t.rows:
            return False
        if t.header[0].upper() in name_headers:
            return True
        return 2 * sum(1 for r in t.rows if r and found(r[0])) >= len(t.rows)  # half its rows pair

    def price_list(t):
        """A price list set in running text (the credsticks' `TYPE | MAX VALUE | AVAIL | COST` inside a description):
        an availability and a cost column, every row led by a name (none by a number: a rating band), two rows at
        least, half of them priced (`500¥`, not a grade's `x1.2` multiplier). Its rows are items, but a row a later
        chapter prints again in a table is that chapter's (the rigging chapter's `vehicle modding` reprints the gear
        chapter's list; the magic chapter's `formulae` adds only `Ritual Spellcasting` to the gear chapter's). Only a
        table in an item's text under its own title or a first header naming its class (`FORMULAE`) is asked (not a
        stat box, nor a second table stacked under one title), and not one titled with the item's own name (`rapid
        transit` under `Rapid Transit`: its variants, the recipe's to read)."""
        hs = [h.upper() for h in t.header]
        cost = next((i for i, h in enumerate(hs) if h.startswith("COST")), None)
        if cost is None or len(hs) < 3 or len(t.rows) < 2 or not {"AVAIL", "AVAILABILITY", "AVAIL."} & set(hs) \
                or hs[0] in _PRICE_HEAD or not all(r and re.match(r"[^\W\d_]", r[0].lstrip(_INDENT + _BOLD_MARK + " ")) for r in t.rows):
            return False
        priced = sum(1 for r in t.rows if len(r) > cost and re.search(r"\d", r[cost])
                     and not re.match(r"\s*[x×]", r[cost]))
        if 2 * priced < len(t.rows):
            return False
        own = [r for r in t.rows if norm(r[0]) not in later]  # (the rows a later chapter prints again are its)
        if own and len(own) < len(t.rows):
            t.rows = own
        return bool(own)

    at = {id(x): i for i, x in enumerate(units)}

    def under(u):
        """The units under u's heading (deeper headings, up to the next at its level or above)."""
        i, out = at[id(u)] + 1, set()
        while i < len(units) and units[i].level > u.level:
            out.add(id(units[i]))
            i += 1
        return out

    tables, own = [], set()
    for u in [u for u in units if not u.merged]:
        for t in [b for b in u.body if isinstance(b, _Table)]:
            # (not a list of the items its own subheadings describe: `security devices` over `Key Lock`, `Maglock`)
            # nor of items described anywhere, half of them (`stun cages` over `Trode Patch`, `Smart Manacles`)
            if not u.stats and 2 * sum(1 for r in t.rows if r and found(r[0])) < len(t.rows) \
                    and not any(id(d) in under(u) for r in t.rows if r for d in found(r[0])) \
                    and (rows := _own_rows(t, u, lower)):
                t.rows, t.catalog, t.own = rows, True, True  # (its rows are its own: no description takes them)
                tables.append(t)
                own.add(id(t))
                continue
            cls = not t.titled and _names_class(t.header, [])  # (no title: its first header names its class)
            # a list of ammunition types titled as one (`warhead types`) in a section's text: its rows are entries,
            # priced as modifiers of the round's (`x 2 Base Cost`, `+100¥`), a nameless row a band of the one above
            # the options a section's own box prices after its band (`weapon security system`: CAPACITY, then OPTIONS)
            options = u.kind == "section" and (bool(t.parent) and _same(t.parent, u.name)
                                               or bool(t.title) and _same(t.title, u.name) and not t.titled) and price_list(t)
            typed = u.kind == "section" and bool(TYPES_TITLE.search(t.title or "")) \
                and (t.header[0] if t.header else "").upper() in NAME_COLUMNS
            if typed:
                t.rows = _band_rows(t.header, t.rows)
            t.catalog = is_catalog(t) or typed or options or u.kind == "item" and (t.titled or cls) \
                and not _same(t.title, u.name) and price_list(t)
            if t.catalog and cls and not t.title:  # (products under an item heading: that heading is their title)
                t.title = u.name if t.products and u.kind == "item" else t.header[0].lower()
            tables += [t] if t.catalog else []
        if u.kind == "item":  # a catalog table right under an item heading isn't that item's box
            for t in [t for t in u.stats if is_catalog(t)]:
                t.catalog, t.title = True, t.title or u.name
                u.stats.remove(t)
                u.body.append(t)
                tables.append(t)
    for t in tables:
        t.rows = _rating_groups(t.rows, t.header[0].capitalize())
        if variants:
            described = variants if isinstance(variants, set) else set()
            # (a row of two words or more the book describes anywhere: `Injector Pen`; one word is a variant's:
            # `Synthetic`, `Obvious` name sections of their own too)
            t.rows = _variants(t.rows, lambda n: found(n) or len(n.split()) > 1
                               and any(k in described for k in keys(n, aliases)))

    # each row takes the nearest description with its key that no row with the same name took yet; the widest
    # tables (the stat tables, not a list of names) choose first
    seen, unpaired, taken = set(), [], set()
    for t in sorted(tables, key=lambda t: -len(t.header)):
        if id(t) in own:
            t.unpaired = list(t.rows)
            continue
        for r in t.rows:
            k = norm(r[0]) if r else ""  # duplicates are by the printed name, not its alias
            cands = [d for d in found(r[0]) if (id(d), k) not in taken] if k else []
            d = min(cands, key=lambda d: abs(d.pos - t.pos)) if cands else None
            if d:
                taken.add((id(d), k))
                d.rows.append((t, r))
                if full_name(r[0], d.name):  # (paired by an alias: the heading prints the full name)
                    d.full.add(id(r))
            if k and k in seen:
                report.append({"kind": "duplicate", "of": "row", "name": r[0], "table": t.title or t.header[0],
                               "page": t.page, "chapter": chapter, "paired": d.name if d else ""})
            elif not d:
                unpaired.append((t, r))
            seen.add(k)
            if not d:
                t.unpaired.append(r)
    # a row printing a shorter name than its description's heading (`Laser mic` / `Laser microphone`, `MGL-48` /
    # `Armtech MGL-48`, `GMC Bulldog` / `GMC Bulldog Step-Van`) takes the one description no row took whose name holds
    # it; it is named by that heading when the heading is its full name (full_name)
    free = [d for d in descs if not d.rows and not d.has_box()]
    for t, r in list(unpaired):
        near = [d for d in free if r and shorter_name(r[0], d.name)]
        if len(near) == 1:
            d = near[0]
            d.rows.append((t, r))
            if full_name(r[0], d.name):
                d.full.add(id(r))
            free.remove(d)
            unpaired.remove((t, r))
            t.unpaired.remove(r)
    # (owner, 2026-10-08) a description whose first sentence names a row of another name (`Eye-Light System`:
    # "Eye-lights are miniaturized light emitters …", the EYEWARE row `Light emitters`) is that row: the row's
    # values and name, the heading its other name (_emit); the row two words or more, the one it names, pages near
    for d in [d for d in descs if not d.rows and not d.has_box()]:
        text = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(x for x in d.body if isinstance(x, str)))
        first = norm(re.split(r"(?<=[a-z])\.\s", text, maxsplit=1)[0])
        hits = []
        for t, r in unpaired:
            ws = norm(r[0]).split() if r else []
            # (what the heading is: `… are miniaturized light emitters`, the row right after is/are and at most two
            # modifiers; not one it mentions, `is compatible with all space suits`)
            row = r"\s+".join(re.escape(w[:-1] if w.endswith("s") else w) + r"s?" for w in ws)
            if len(ws) >= 2 and abs(t.page - d.page) <= 3 and re.search(
                    rf"\b(?:is|are)\s+(?:an?\s+|the\s+)?(?:(?!(?:with|of|for|to|in|on|all|and|or|by|from|as|that)\b)\w+\s+){{0,2}}{row}\b",
                    first):
                hits.append((t, r))
        if len(hits) == 1:
            t, r = hits[0]
            d.rows.append((t, r))
            unpaired.remove((t, r))
            t.unpaired.remove(r)
    # (owner, 2026-10-08) an item heading no row pairs, printed between two of its level that the same table's rows
    # pair (`Frog Tongue` between `Cerebellum Booster` and `Knowledge Infusion`): an item that table leaves out, its
    # values missing (issues), not a rule
    order = sorted(descs, key=lambda d: d.pos)
    row_keys = {k for t in tables for r in t.rows if r for nm in _names(r[0]) for k in keys(nm, aliases)}
    for i, d in enumerate(order):
        if d.rows or d.has_box() or d.level < 4 or not d.name[:1].isupper() or d.name.isupper() \
                or re.search(r"(?i)\btables?\b|\bstats\b", d.name):
            continue
        prev = next((x for x in reversed(order[:i]) if x.level <= d.level), None)
        nxt = next((x for x in order[i + 1:] if x.level <= d.level), None)
        if not (prev and nxt and prev.level == nxt.level == d.level and prev.section == nxt.section == d.section):
            continue
        tabs = {id(t) for t, _ in prev.rows} & {id(t) for t, _ in nxt.rows}
        t = next((t for t, _ in prev.rows if id(t) in tabs and id(t) not in own), None)
        one = lambda w: w[:-1] if w.endswith("s") and not w.endswith("ss") else w  # noqa: E731
        dw = {one(w) for w in norm(d.name).split() if len(w) > 3}
        if t is None or any(k in row_keys for nm in _names(d.name) for k in keys(nm, aliases)) \
                or any(dw & {one(w) for w in norm(r[0]).split()} for r in t.rows if r) \
                or re.search(r",|\band\b|\(", d.name):
            continue  # (a heading naming or sharing a word with a row describes it: `Move-By-Wire`, `Limb Replacement`)
        text = norm(" ".join(x for x in d.body if isinstance(x, str)))
        if any(isinstance(x, _Table) for x in d.body) or len(text) < 150 or re.match(r"(?:if|when|to)\b", text) or any(
                re.search(rf"\b{re.escape(one(norm(r[0])))}s?\b", text) for r in t.rows if r and len(norm(r[0])) > 4):
            continue  # (a table title, a one-line note, or a rule about the rows its text names: `Skillsoft Subscriptions`)
        r = _Row([d.name] + [""] * (len(t.header) - 1))
        r.unlisted = True
        d.rows.append((t, r))
        d.full.add(id(r))
    # a heading ending in "series" takes every unpaired row starting with the rest of its key
    for d in descs:
        k = keys(d.name, aliases)[0]
        if k.endswith(" series"):
            stem = k[:-len(" series")]
            took = [(t, r) for t, r in unpaired if (keys(r[0], aliases)[0] + " ").startswith(stem + " ")]
            d.rows += took
            unpaired = [p for p in unpaired if p not in took]
            for t, r in took:
                t.unpaired.remove(r)
    for t, r in unpaired:
        report.append({"kind": "unpaired-row", "name": r[0] if r else "", "table": t.title or t.header[0],
                       "page": t.page, "chapter": chapter})
    for d in descs:
        if len(d.rows) > 1:
            report.append({"kind": "shared-description", "name": d.name, "rows": "; ".join(r[0] for _, r in d.rows),
                           "page": d.page, "chapter": d.chapter})
        if not d.rows and not d.has_box() and d.section in {t.section for t in tables}:  # its section has a catalog
            report.append({"kind": "unpaired-description", "name": d.name, "page": d.page, "chapter": d.chapter})
    for u in units:
        if u.kind == "box" and not u.merged and not u.shared:
            report.append({"kind": "unpaired-box", "name": u.name, "page": u.page, "chapter": u.chapter})


_RATING_ROW = re.compile(r"Rating \d+$")
TYPES_TITLE = re.compile(r"\b(?:ammo|ammunition|warheads?|rounds?|shells?)\s+types?\b", re.I)


def _band_rows(header, rows):
    """A list's nameless rows under a named one (a warhead type's Capacity bands: `Hex | 16 | …` over `| 20 | …`):
    `<name> (<second column> <its cell>)`, `Hex (Capacity 20)`."""
    out, name = [], ""
    for r in rows:
        if r and not r[0].strip() and name and len(header) > 1 and len(r) > 1 and r[1].strip():
            r = _Row([f"{name} ({header[1].capitalize()} {r[1].strip()})"] + list(r[1:]))
        elif r and r[0].strip():
            name = r[0].strip()
        out.append(r)
    return out


def _rating_groups(rows, first=None):
    """A row with only its name (`Cyberears basic system`) over `Rating N` rows: those rows are `<name> (Rating N)`,
    and the name-only row goes; `Rating N` rows with no such row are `<first> (Rating N)` (first: the table's first
    header, `Fuse`). A row named in lower case (`w/helmet`) is a variant of the row above; not a model code (`m60`)."""
    out, group, outer = [], first, None
    bare = lambda r: bool(r and r[0] and not any(r[1:]) and not _RATING_ROW.match(r[0]))
    for i, r in enumerate(rows):
        if r and r[0][:1].islower() and not re.match(r"[a-z]+-?\d", r[0]) and out and out[-1][0]:
            out.append([f"{out[-1][0]} {r[0]}"] + list(r[1:]))
        elif r and r[0] and not any(r[1:]):
            # a name-only row right over another (`Cyberjack Boosters` over `Data Processing` over its `Rating N`
            # rows): a group of groups, its name before theirs until a priced row of another shape
            if i + 1 < len(rows) and bare(rows[i + 1]) and outer is None:
                outer = r[0]
                group = r[0]
            else:
                group = f"{outer} ({r[0]})" if outer else r[0]
            out.append(r)
        elif group and r and _RATING_ROW.match(r[0]):
            if out and out[-1][0] and group in (out[-1][0], f"{outer} ({out[-1][0]})") and not any(out[-1][1:]):
                out.pop()
            out.append([f"{group} ({r[0]})"] + list(r[1:]))
        else:
            group, outer = None, None
            out.append(r)
    return out


def _variants(rows, found):
    """A name-only row (`Cybertails`) over rows no description has (`Balance`, `Prehensile`): those rows are
    `<name> (<row>)` (a row with no name: `<name> (Rating <its second cell>)`) until a row a description has (a
    heading anywhere in the book names it: `found`)."""
    out, group = [], None
    for r in rows:
        if r and r[0] and not any(r[1:]):
            group = r[0]
        elif group and r and (not r[0] or not found(r[0]) and not re.search(r"\(rating", r[0], re.I)
                                and not r[0].startswith(group)):
            r = [f"{group} ({r[0] or 'Rating ' + (r[1] if len(r) > 1 else '')})"] + list(r[1:])
        else:
            group = None
        out.append(r)
    return out


def _breaks(body, page):
    """[[text line, PDF page]]: where _text(body)'s lines go on to another page than the one before (from `page`)."""
    out, n, cur = [], 0, page
    for b in body:
        if isinstance(b, str):
            pg = getattr(b, "page", 0)
            if pg and pg != cur:
                out.append([n, pg])
                cur = pg
            n += 1
        elif not b.catalog:
            n += 2 + len(b.rows)
    return out


def _text(body):
    out = []
    for b in body:
        if isinstance(b, str):
            out.append(b)
        elif not b.catalog:
            out += _md(b.header, b.rows)
    return "\n".join(out)


def _row(header, r):
    r = list(r) + [""] * (len(header) - len(r))
    # a band's second R is Resonance (`B A R S W L I C R ESS`); any other header printed again is `<header> (2)`, the
    # first cell keeping the header (`… | AVAIL | COST | COST`: the price is the first)
    names = []
    for i, h in enumerate(header):
        names.append("RES" if h == "R" and "R" in header[:i] else f"{h} ({header[:i].count(h) + 1})" if h in header[:i] else h)
    return dict(zip(names, r))


def _emit(units):
    out = []
    for u in units:
        if u.merged:
            continue
        text, breaks = _text(u.body), _breaks(u.body, u.page)
        if u.kind == "section":
            out.append(Block("section", u.name, u.chapter, u.section, "", u.page, tags=u.tags, labels=dict(u.labels),
                             text=text, level=u.level, breaks=breaks))
        else:
            # a box of several one-row tables, a note under each: each row keeps its own notes (as columns: NOTE …)
            # (an item's row: named, not a being's or a vehicle's band)
            several = sum(1 for t in u.stats if len(t.rows) == 1) > 1
            # (a box row grouped under a name-only row, `Medkit` over its indented `Advanced (Rating 1–6)`: named
            # with its group, as a catalog row is: `Medkit Advanced (Rating 1–6)`)
            stats = [{**({"TYPE": t.variant} if t.variant else {}),
                      **_row(t.header, [f"{r.group} {r[0]}"] + list(r[1:]) if getattr(r, "group", "") else r),
                      **({k.upper(): x for k, x in t.notes.items()}
                                              if several and len(t.rows) == 1 and len(t.header[0]) > 2
                                              and re.search(r"[A-Za-z]{2}", r[0] if r else "") else {})}
                     for t in u.stats for r in t.rows]
            label = u.name if u.kind == "box" else ""
            for t, r in u.rows or [(None, None)]:
                name = u.name if r and id(r) in u.full else r[0] if r else u.name
                al = [u.name] if r and name != u.name and other_name(name, u.name) else []
                out.append(Block("item", name, u.chapter, u.section, t.title if t else label, u.page,
                                 list(t.header) if t else [], _row(t.header, r) if t else None, stats, u.tags,
                                 dict(u.labels), text, u.level, al, group=getattr(r, "group", ""),
                                 table=t.parent if t else "", unlisted=getattr(r, "unlisted", False),
                                 breaks=breaks))
        for t in [b for b in u.body if isinstance(b, _Table) and b.catalog]:
            out += [Block("item", r[0], u.chapter, t.section, t.title, t.page, list(t.header), _row(t.header, r),
                          aliases=list(getattr(r, "aliases", ())), group=getattr(r, "group", ""), table=t.parent,
                          product=getattr(r, "product", ""), maker=getattr(r, "maker", ""),
                          text=_text(u.body) if t.own else "", labels=dict(u.labels) if t.own else {})
                    for r in t.unpaired]
    return out


def regroup(md, aliases=None, name_headers=frozenset(), end_page=None, variants=False):
    """md: book.md. Returns (regrouped text, report rows). end_page: the PDF page where the back matter (index,
    reprinted tables) starts; it and the pages after it are left out. variants: a catalog's name-only rows name the
    rows under them (_variants)."""
    name_headers = {h.upper() for h in name_headers}
    els = [e for e in _elements(md) if not end_page or e[1] < end_page]
    starts = [i for i, e in enumerate(els) if e[0] == "h" and e[2][0] == 1]
    bounds = list(zip([0] + starts, starts + [len(els)]))
    report, blks = [], []
    # each chapter's table row names, for price_list's reprint test (a later chapter printing the rows again)
    rows_in = [{norm(r[0]) for e in els[a:b] if e[0] == "t" for r in e[2].rows if r and r[0]} for a, b in bounds]
    # every heading's keys, book-wide: a variant group ends at a row the book describes anywhere (_variants)
    heads = {k for e in els if e[0] == "h" and not _is_label(*e[2]) for nm in _names(e[2][1]) for k in keys(nm, aliases)}
    # the words the book's prose prints in lower case (a generic word, not a name: _own_rows)
    lower = {w for e in els if e[0] == "x" for w in re.findall(r"(?<![A-Za-z])[a-z]+(?![A-Za-z])", e[2])}
    for n, (start, end) in enumerate(bounds):
        if start == end:
            continue
        chapter = els[start][2][1] if els[start][0] == "h" and els[start][2][0] == 1 else ""
        item_keys = {k for _, _, (lv, tx) in (e for e in els[start:end] if e[0] == "h")
                     if lv >= 4 and not _is_label(lv, tx) for nm in _names(tx) for k in keys(nm, aliases)}
        units = _units(els, start, end, chapter, item_keys, aliases)
        if not chapter and not units[0].body and len(units) == 1:
            continue
        _chapter(units, aliases, name_headers, report, variants and heads, set().union(*rows_in[n + 1:]), lower)
        blks += _emit(units)
    return HEAD + "\n" + "".join(render(b) for b in blks), report


# --- the regrouped file ------------------------------------------------------------------------------------------

def _md(header, rows):
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)] + ["| " + " | ".join(r) + " |" for r in rows]


def render(b):
    meta = {"name": b.name, "chapter": b.chapter, "section": b.section, "label": b.label, "page": b.page,
            "tags": b.tags, "level": b.level, "row": b.row is not None, **({"aliases": b.aliases} if b.aliases else {}),
            **({"group": b.group} if b.group else {}), **({"table": b.table} if b.table else {}),
            **({"product": b.product} if b.product else {}), **({"maker": b.maker} if b.maker else {}),
            **({"unlisted": True} if b.unlisted else {}), **({"breaks": b.breaks} if b.breaks else {})}
    lines = [f"<!-- {b.type} {json.dumps(meta, ensure_ascii=False)} -->"]
    if b.row is not None:
        lines += _md(b.header, [[b.row.get(n, "") for n in _row(b.header, [])]])  # (a header printed twice: its 2nd cell)
    for s in b.stats:
        lines += _md(list(s), [list(s.values())])
    lines += [f"**{k}:** {v}".rstrip() for k, v in b.labels.items()]
    lines += ["", b.text] if b.text else [""]
    return "\n".join(lines + ["<!-- end -->"]) + "\n"


_START = re.compile(r"<!-- (item|section) (\{.*\}) -->$")


def blocks(text):
    out, lines, i = [], text.splitlines(), 0
    while i < len(lines):
        m = _START.match(lines[i])
        i += 1
        if not m:
            continue
        meta = json.loads(m.group(2))
        tables = []
        while lines[i].startswith("|"):  # each rendered table is a header, its rule and one row
            tables.append((_cells(lines[i]), [_cells(lines[i + 2])]))
            i += 3
        labels = {}
        while i < len(lines) and lines[i]:
            lm = _LABEL.match(lines[i])
            labels[lm.group(2)] = lm.group(3)
            i += 1
        i += 1  # the blank line
        body = []
        while lines[i] != "<!-- end -->":
            body.append(lines[i])
            i += 1
        header, row, stats = [], None, []
        for n, (h, rows) in enumerate(tables):
            if n == 0 and meta["row"]:
                header, row = h, _row(h, rows[0])
            else:
                stats += [_row(h, r) for r in rows]
        out.append(Block(m.group(1), meta["name"], meta["chapter"], meta["section"], meta["label"], meta["page"],
                         header, row, stats, meta["tags"], labels, "\n".join(body), meta["level"],
                         meta.get("aliases", []), group=meta.get("group", ""), table=meta.get("table", ""),
                         product=meta.get("product", ""), maker=meta.get("maker", ""),
                         unlisted=meta.get("unlisted", False), breaks=meta.get("breaks", [])))
    return out
