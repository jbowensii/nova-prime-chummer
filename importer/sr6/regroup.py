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


def keys(name, aliases=None):
    """The name's keys, most exact first: itself, then without a trailing ( … )."""
    out = [norm(name, aliases)]
    bare = re.sub(r"\s*\([^()]*\)\s*$", "", name)
    if bare and bare != name and norm(bare, aliases) not in out:
        out.append(norm(bare, aliases))
    return out


def _names(name):
    """A heading `A 70/75` stands for `A 70` and `A 75`."""
    m = re.match(r"(.*\s)(\w+(?:/\w+)+)$", name)
    return [m.group(1) + p for p in m.group(2).split("/")] if m else [name]


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
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(_cells(lines[i]))
                i += 1
            out.append(("t", page, _Table(_cells(ln), rows, page)))
        elif m := _HEADING.match(ln):
            level, text = len(m.group(1)), m.group(2).strip()
            prev = out[-1] if out else None
            # a box title wrapped onto a second line: `##### Delta Force` + `##### and Support Rigger`
            if (prev and prev[0] == "h" and prev[2][0] == level and text[0].islower() and _UPPER.search(text)
                    and _UPPER.search(prev[2][1])):
                out[-1] = ("h", prev[1], (level, prev[2][1] + " " + text))
            else:
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

    def has_box(self):
        return bool(self.stats or self.labels)

    def has_text(self):
        return any(isinstance(b, str) for b in self.body)


def _is_label(level, text):
    return level > 1 and not _UPPER.search(text)


def _units(els, start, end, chapter, item_keys):
    """The chapter's units in reading order. item_keys: the norm keys of its item headings (a lower-case title
    with one of them is a stat box)."""
    units, section = [], ""
    cur = _Unit("section", chapter, 1, els[start][1] if start < end else 0, chapter, "")
    units.append(cur)
    mode = "text"  # "box": right after a heading, taking tags, tables and labelled lines
    fresh = False  # nothing taken since the item heading (a "(tags)" heading may follow)
    label = None  # (unit, key) of the labelled line still open for a wrapped value
    last = ""  # the open label's last line
    i = start
    while i < end:
        kind, page, v = els[i]
        i += 1
        if kind == "h":
            level, text = v
            label = None
            if level == 1:  # the chapter heading itself
                continue
            if fresh and text.startswith("(") and text.endswith(")"):
                cur.tags, fresh = text[1:-1], False
                continue
            if _is_label(level, text):
                nxt = els[i] if i < end else None
                if not nxt or not (nxt[0] == "t" or (nxt[0] == "x" and _LABEL.match(nxt[2]))):
                    continue  # an art caption: dropped, the text flows on
                j = i
                while j < end and els[j][0] == "t":
                    j += 1
                boxed = (j < end and els[j][0] == "x" and _LABEL.match(els[j][2])) or \
                    any(k in item_keys for k in keys(text))
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
                mode, fresh = "text", False
                units.append(cur)
                continue
            else:
                cur = _Unit("item", text, level, page, chapter, section)
            units.append(cur)
            mode, fresh = "box", cur.kind == "item"
        elif kind == "t":
            fresh, label = False, None
            v.section = section
            (cur.stats if mode == "box" else cur.body).append(v)
        else:
            fresh = False
            m = _LABEL.match(v)
            if m:
                key, value = m.group(2).strip(), m.group(3).strip()
                label, last = ((cur, key) if key not in cur.labels else None), v
                cur.labels.setdefault(key, value)
                if mode == "box":
                    continue
            elif label and not v.startswith("•") and not _SENTENCE_END.search(last):
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

def _merge_boxes(units, aliases):
    """A titled stat box joins the description with its key that has no box of its own (the nearest one)."""
    descs = [u for u in units if u.kind == "item"]
    for n, u in enumerate(units):
        if u.kind == "section" or not u.has_box() or u.merged:
            continue
        ks = keys(u.name, aliases)
        cands = [d for d in descs if d is not u and not d.merged and not d.has_box() and d.has_text()
                 and any(k in ks for k in keys(d.name, aliases))]
        if not cands:
            continue
        d = min(cands, key=lambda d: abs(units.index(d) - n))
        d.stats, d.labels, d.tags = u.stats, u.labels, d.tags or u.tags
        d.body += u.body
        u.merged = True


def _chapter(units, aliases, name_headers, report):
    _merge_boxes(units, aliases)
    descs = [u for u in units if u.kind == "item" and not u.merged]
    index, dup_heads = {}, set()
    for d in descs:
        ks = [k for nm in _names(d.name) for k in keys(nm, aliases)]
        if ks[0] in index:
            dup_heads.add(id(d))
            report.append({"kind": "duplicate", "of": "heading", "name": d.name, "page": d.page, "chapter": d.chapter})
            continue
        for k in ks:
            index.setdefault(k, d)

    def find(name):
        return next((index[k] for k in keys(name, aliases) if k in index), None)

    def is_catalog(t):
        if len(t.header) < 2 or not t.rows:
            return False
        if t.header[0].upper() in name_headers:
            return True
        return 3 * sum(1 for r in t.rows if r and find(r[0])) >= len(t.rows)

    tables = []
    for u in units:
        for t in [b for b in u.body if isinstance(b, _Table)]:
            t.catalog = is_catalog(t)
            tables += [t] if t.catalog else []
        if u.kind == "item":  # a catalog table right under an item heading isn't that item's box
            for t in [t for t in u.stats if is_catalog(t)]:
                t.catalog = True
                u.stats.remove(t)
                u.body.append(t)
                tables.append(t)

    seen, unpaired, dups = set(), [], []
    for t in tables:
        for r in t.rows:
            k = keys(r[0], aliases)[0] if r and r[0] else ""
            d = find(r[0]) if k else None
            if k in seen:
                report.append({"kind": "duplicate", "of": "row", "name": r[0], "table": t.title or t.header[0],
                               "page": t.page, "chapter": units[0].chapter})
                dups.append((t, r))
                continue
            seen.add(k)
            if d:
                d.rows.append((t, r))
            else:
                unpaired.append((t, r))
    # a heading ending in "series" takes every unpaired row starting with the rest of its key
    for d in descs:
        k = keys(d.name, aliases)[0]
        if k.endswith(" series") and id(d) not in dup_heads:
            stem = k[:-len(" series")]
            took = [(t, r) for t, r in unpaired if (keys(r[0], aliases)[0] + " ").startswith(stem + " ")]
            d.rows += took
            unpaired = [p for p in unpaired if p not in took]
    for t, r in unpaired:
        report.append({"kind": "unpaired-row", "name": r[0] if r else "", "table": t.title or t.header[0],
                       "page": t.page, "chapter": units[0].chapter})
    for d in descs:
        if len(d.rows) > 1:
            report.append({"kind": "shared-description", "name": d.name, "rows": "; ".join(r[0] for _, r in d.rows),
                           "page": d.page, "chapter": d.chapter})
        if tables and not d.rows and not d.has_box():
            report.append({"kind": "unpaired-description", "name": d.name, "page": d.page, "chapter": d.chapter})
    for u in units:
        if u.kind == "box" and not u.merged:
            report.append({"kind": "unpaired-box", "name": u.name, "page": u.page, "chapter": u.chapter})
    return {id(p[1]) for p in unpaired + dups}


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


def _emit(units, unpaired):
    out = []
    for u in units:
        if u.merged:
            continue
        text = _text(u.body)
        if u.kind == "section":
            out.append(Block("section", u.name, u.chapter, u.section, "", u.page, text=text, level=u.level))
        else:
            stats = [_row(t.header, r) for t in u.stats for r in t.rows]
            label = u.name if u.kind == "box" else ""
            for t, r in u.rows or [(None, None)]:
                out.append(Block("item", r[0] if r else u.name, u.chapter, u.section,
                                 t.title if t else label, u.page, list(t.header) if t else [],
                                 _row(t.header, r) if t else None, stats, u.tags, dict(u.labels), text, u.level))
        for t in [b for b in u.body if isinstance(b, _Table) and b.catalog]:
            out += [Block("item", r[0], u.chapter, t.section, t.title, t.page, list(t.header), _row(t.header, r))
                    for r in t.rows if id(r) in unpaired]
    return out


def regroup(md, aliases=None, name_headers=frozenset()):
    """md: book.md. Returns (regrouped text, report rows)."""
    name_headers = {h.upper() for h in name_headers}
    els = _elements(md)
    starts = [i for i, e in enumerate(els) if e[0] == "h" and e[2][0] == 1]
    bounds = list(zip([0] + starts, starts + [len(els)]))
    report, blks = [], []
    for start, end in bounds:
        if start == end:
            continue
        chapter = els[start][2][1] if els[start][0] == "h" and els[start][2][0] == 1 else ""
        item_keys = {k for _, _, (lv, tx) in (e for e in els[start:end] if e[0] == "h")
                     if lv >= 4 and _UPPER.search(tx) for nm in _names(tx) for k in keys(nm, aliases)}
        units = _units(els, start, end, chapter, item_keys)
        if not chapter and not units[0].body and len(units) == 1:
            continue
        blks += _emit(units, _chapter(units, aliases, name_headers, report))
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
