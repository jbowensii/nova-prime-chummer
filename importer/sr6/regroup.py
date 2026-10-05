"""SR6 regroup: book.md (the converter's sr6 layout) -> regrouped.md, one block per item with its stat-table row,
its stat box and its description together, paired by normalized name within a chapter. Pure text. Whatever doesn't
pair, or pairs twice, is reported, never guessed.

Output: a first line `<!-- regrouped v1 -->`, then blocks in reading order, each
`<!-- item {json} -->` or `<!-- section {json} -->`, its tables (the row first when the json says "row"), its
labelled lines, a blank line, its text, `<!-- end -->`."""
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


def _names(name):
    """A heading `A 70/75` stands for `A 70` and `A 75`, `Devil Rat/Demon Rat` for each."""
    m = re.match(r"(.*\s)([\w-]+(?:/[\w-]+)+)$", name)
    parts = [m.group(1) + p for p in m.group(2).split("/")] if m else []
    return parts + [p.strip() for p in name.split("/") if p.strip()] if "/" in name else [name]


# --- reading book.md -------------------------------------------------------------------------------------------

def _cells(line):
    return [c.strip() for c in line.strip()[1:-1].split("|")]


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


def _elements(md):
    """(kind, page, value): ("h", (level, text)), ("t", _Table), ("x", line)."""
    lines, out, page, i = md.splitlines(), [], 0, 0
    while i < len(lines):
        ln = lines[i]
        i += 1
        if not ln.strip():
            continue
        if m := _PAGE.match(ln):
            page = int(m.group(1))
        elif ln.startswith("|") and i < len(lines) and _SEP.match(lines[i]):
            rows = []
            i += 1
            # rows run to the next header (a header line has its rule under it)
            while i < len(lines) and lines[i].startswith("|") and not (i + 1 < len(lines) and _SEP.match(lines[i + 1])):
                rows.append(_cells(lines[i]))
                i += 1
            out.append(("t", page, _Table(_cells(ln), rows, page, pos=len(out))))
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
        else:
            out.append(("x", page, ln))
    return out


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
    shared: bool = False  # a box holding a description it shares with other boxes

    def has_box(self):
        return bool(self.stats) or self.box_labels

    def has_text(self):
        return any(isinstance(b, str) for b in self.body)


def _is_label(level, text):
    """A table title, box title or art caption: its first letter is lower case (`ares predator VI`)."""
    first = re.search(r"[^\W\d_]", text)
    return level > 1 and (not first or first.group().islower())


def _units(els, start, end, chapter, item_keys, aliases):
    """The chapter's units in reading order. item_keys: the norm keys of its item headings (a lower-case title
    with one of them is a stat box)."""
    units, section = [], ""
    cur = _Unit("section", chapter, 1, els[start][1] if start < end else 0, chapter, "")
    units.append(cur)
    mode = "text"  # "box": right after a heading, taking tags, tables and labelled lines
    fresh = False  # nothing taken since the item heading (a "(tags)" heading may follow)
    label = None  # (unit, key) of the labelled line still open for a wrapped value
    last = ""  # the open label's last line
    listy = False  # the open label's value starts on the next line
    i = start
    while i < end:
        kind, page, v = els[i]
        i += 1
        if kind == "h":
            level, text = v
            label = None
            if level == 1:  # the chapter heading itself
                continue
            if fresh and level == 5:  # a tag line right under a heading: `(tags)`, `Cost: …`, or under a section any
                if m := re.fullmatch(r"\(([^()]*)\)", text):
                    cur.tags = "; ".join(filter(None, [cur.tags, m.group(1)]))
                    continue
                if m := re.fullmatch(r"([A-Z][^:]{0,30}):\s*(.+)", text):
                    cur.labels.setdefault(m.group(1), m.group(2))
                    cur.box_labels = True
                    continue
                if cur.kind == "section":
                    cur.tags = "; ".join(filter(None, [cur.tags, text]))
                    continue
            if _is_label(level, text):
                nxt = els[i] if i < end else None
                if not nxt or not (nxt[0] == "t" or (nxt[0] == "x" and _LABEL.match(nxt[2]))):
                    continue  # an art caption: dropped, the text flows on
                # a stat box: a title an item heading has, or one-row bands followed by labelled lines
                j = i
                while j < end and els[j][0] == "t" and len(els[j][2].rows) == 1:
                    j += 1
                # (a title over a list of several rows is a table title even when an item heading has its name)
                boxed = (j < end and els[j][0] == "x" and _LABEL.match(els[j][2])) or \
                    (j > i or els[i][0] != "t") and any(k in item_keys for k in keys(text, aliases))
                if not boxed:  # a table title: its tables join the flow, the text goes on in the same unit
                    while i < end and els[i][0] == "t":
                        t = els[i][2]
                        t.title, t.section = text, section
                        cur.body.append(t)
                        i += 1
                    continue
                cur = _Unit("box", text, level, page, chapter, section)
            elif level <= 3:
                section = text
                cur = _Unit("section", text, level, page, chapter, section)
            else:
                cur = _Unit("item", text, level, page, chapter, section)
            cur.pos = i - 1
            units.append(cur)
            mode, fresh = "box", cur.kind != "box"
        elif kind == "t":
            fresh, label = False, None
            v.section = section
            # a section's tables are its text; an item's or box's tables right under its heading are its stat box
            (cur.stats if mode == "box" and cur.kind != "section" else cur.body).append(v)
        else:
            fresh = False
            m = _LABEL.match(v)
            if m:
                key, value = m.group(2).strip(), m.group(3).strip()
                label, last, listy = ((cur, key) if key not in cur.labels else None), v, not value
                cur.labels.setdefault(key, value)
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
                u, key = label
                prev = u.labels[key]
                joined = prev[:-1] if re.search(r"[a-z]-$", prev) and v[:1].islower() else prev + " " if prev else ""
                u.labels[key], last = joined + v.strip(), v
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


def _chapter(units, aliases, name_headers, report, variants=False):
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

    tables = []
    for u in [u for u in units if not u.merged]:
        for t in [b for b in u.body if isinstance(b, _Table)]:
            t.catalog = is_catalog(t)
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
            t.rows = _variants(t.rows, found)

    # each row takes the nearest description with its key that no row with the same name took yet; the widest
    # tables (the stat tables, not a list of names) choose first
    seen, unpaired, taken = set(), [], set()
    for t in sorted(tables, key=lambda t: -len(t.header)):
        for r in t.rows:
            k = norm(r[0]) if r else ""  # duplicates are by the printed name, not its alias
            cands = [d for d in found(r[0]) if (id(d), k) not in taken] if k else []
            d = min(cands, key=lambda d: abs(d.pos - t.pos)) if cands else None
            if d:
                taken.add((id(d), k))
                d.rows.append((t, r))
            if k and k in seen:
                report.append({"kind": "duplicate", "of": "row", "name": r[0], "table": t.title or t.header[0],
                               "page": t.page, "chapter": chapter, "paired": d.name if d else ""})
            elif not d:
                unpaired.append((t, r))
            seen.add(k)
            if not d:
                t.unpaired.append(r)
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


def _rating_groups(rows, first=None):
    """A row with only its name (`Cyberears basic system`) over `Rating N` rows: those rows are `<name> (Rating N)`,
    and the name-only row goes; `Rating N` rows with no such row are `<first> (Rating N)` (first: the table's first
    header, `Fuse`). A row named in lower case (`w/helmet`) is a variant of the row above."""
    out, group = [], first
    for r in rows:
        if r and r[0][:1].islower() and out and out[-1][0]:
            out.append([f"{out[-1][0]} {r[0]}"] + list(r[1:]))
        elif r and r[0] and not any(r[1:]):
            group = r[0]
            out.append(r)
        elif group and r and _RATING_ROW.match(r[0]):
            if out and out[-1][0] == group and not any(out[-1][1:]):
                out.pop()
            out.append([f"{group} ({r[0]})"] + list(r[1:]))
        else:
            group = None
            out.append(r)
    return out


def _variants(rows, found):
    """A name-only row (`Cybertails`) over rows no description has (`Balance`, `Prehensile`): those rows are
    `<name> (<row>)` (a row with no name: `<name> (Rating <its second cell>)`) until a row a description has."""
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
    # ponytail: a header printed twice keeps its last cell; key cells by position if a book does that
    return dict(zip(header, r))


def _emit(units):
    out = []
    for u in units:
        if u.merged:
            continue
        text = _text(u.body)
        if u.kind == "section":
            out.append(Block("section", u.name, u.chapter, u.section, "", u.page, tags=u.tags, labels=dict(u.labels),
                             text=text, level=u.level))
        else:
            stats = [_row(t.header, r) for t in u.stats for r in t.rows]
            label = u.name if u.kind == "box" else ""
            for t, r in u.rows or [(None, None)]:
                out.append(Block("item", r[0] if r else u.name, u.chapter, u.section,
                                 t.title if t else label, u.page, list(t.header) if t else [],
                                 _row(t.header, r) if t else None, stats, u.tags, dict(u.labels), text, u.level))
        for t in [b for b in u.body if isinstance(b, _Table) and b.catalog]:
            out += [Block("item", r[0], u.chapter, t.section, t.title, t.page, list(t.header), _row(t.header, r))
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
    for start, end in bounds:
        if start == end:
            continue
        chapter = els[start][2][1] if els[start][0] == "h" and els[start][2][0] == 1 else ""
        item_keys = {k for _, _, (lv, tx) in (e for e in els[start:end] if e[0] == "h")
                     if lv >= 4 and not _is_label(lv, tx) for nm in _names(tx) for k in keys(nm, aliases)}
        units = _units(els, start, end, chapter, item_keys, aliases)
        if not chapter and not units[0].body and len(units) == 1:
            continue
        _chapter(units, aliases, name_headers, report, variants)
        blks += _emit(units)
    return HEAD + "\n" + "".join(render(b) for b in blks), report


# --- the regrouped file ------------------------------------------------------------------------------------------

def _md(header, rows):
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)] + ["| " + " | ".join(r) + " |" for r in rows]


def render(b):
    meta = {"name": b.name, "chapter": b.chapter, "section": b.section, "label": b.label, "page": b.page,
            "tags": b.tags, "level": b.level, "row": b.row is not None}
    lines = [f"<!-- {b.type} {json.dumps(meta, ensure_ascii=False)} -->"]
    if b.row is not None:
        lines += _md(b.header, [[b.row.get(h, "") for h in b.header]])
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
                         header, row, stats, meta["tags"], labels, "\n".join(body), meta["level"]))
    return out
