"""Krime Katalog (KK), a gear catalog -> the SR6 catalog: its weapons (grenades among them) and weapon accessories,
ammunition (gear) and vehicles, ids unscoped (run scopes them as kk.<slug>), descriptions in the private texts. Reads
only regrouped.md (importer/sr6/regroup.py) with the core rulebook's writing (catalog.read); layout notes in kk.md.

The book prints each item's Fifth Edition and Sixth Edition stats side by side under a caption (`krime vester: sr5
stats krime vester: sr6 stats`): only the SR6 half is read (the columns after the first COST, or the second of two
tables), or the tables after a caption naming SR6 alone. A line or value that doesn't read is reported, never
guessed."""

import re
import sys
from dataclasses import replace

from importer.sr6 import catalog
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "KK", "Krime Katalog", "Catalyst Game Labs", True
BOOK = "Krime Katalog"
SHA256 = ("d04fab850a4589fdbd5bac99673ff04ad385b6011a9041ae968b6e4ddd9dd967",)  # the owner's copy
PAGE_OFFSET = 0  # the page numbers print the PDF's
# heading sizes -> levels (a recipe hint): the items' 27 pt titles level 2, the lists' 15 pt level 5; the running head
# (43 pt) and page number (26 pt) are page furniture the converter drops (layout.fonts)
HEADING_LEVELS = {27.0: 2, 21.0: 4, 15.0: 5}
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("krime katalog",)  # the company profiles and what isn't read stay as rule sections
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
CHAPTER = "krime katalog"  # its running head: the book's one chapter (prepare_md)
_CAPTION = re.compile(r"([^:]*?)\s*:\s*sr\s*([56])\b(?:\s+stats)?", re.I)
# printed headers -> the core rulebook's (catalog.HEADERS)
RENAME = {
    "ATTACK": "ATTACK RATINGS",
    "SPEED INT": "SPEED INTERVAL",
    "SENS": "SENSOR",
    "BOD": "BODY",
    "ARM": "ARMOR",
    "SEAT": "SEATS",
    "NAME": "ITEM",
    "TYPES": "ITEM",
    "COST MULT": "COST MULTIPLIER",
}
PROSE = {"AR", "DV"}  # an ammunition's modifiers: gear has no attribute for them


def prepare_md(md):
    """book.md with the book's running head as each page's chapter heading again (the converter drops it as page
    furniture): each page is a chapter, its stat tables paired within it (_prep joins a page's lead block to the item
    before it)."""
    return re.sub(r"(?m)^(<!-- page \d+ -->)$", rf"\1\n# {BOOK}", md)


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"krime\s+katalog", hay, re.I) else 0.0


def _captions(line):
    """[(subject, edition)] of the stat captions in a line (one may end a line of comment: the subject starts at its
    last `krime`)."""
    out = []
    for m in _CAPTION.finditer(line):
        subj = m.group(1)
        if (k := subj.lower().rfind("krime")) > 0:
            subj = subj[k:]
        out.append((subj.strip(" >"), m.group(2)))
    return out


_SR5_HEADS = {"DAM", "AP", "ACC", "RC"}  # Fifth Edition columns (Sixth prints DV and attack ratings)
_SR6_SPEED = re.compile(r"\bINT\b|SPD", re.I)  # a Sixth Edition vehicle's speed interval (`SPEED INT`, `INT.TOP SPEED`)


def _sr5(header):
    """A stat table in the Fifth Edition's columns: damage and AP, or a vehicle's single SPEED (no interval)."""
    h = {x.upper() for x in header}
    first = {x.upper().split()[0] for x in header if x.split()}  # (`DAM MOD`, `AP MOD`: an ammunition list's)
    return bool(first & _SR5_HEADS) or "SPEED" in h and "ACCEL" in h and not any(_SR6_SPEED.search(x) for x in header)


def _sets_by_header(text):
    """The SR6 stat sets of a text whose two editions' boxes read as tables of their own, in whatever order the page's
    columns put them (a 2x2 grid of boxes: both captions over the first two, the tables after): each SR6 caption's
    subject paired, in order, with the next run of SR6 tables (Sixth Edition columns; one-row bands joined until a
    price). None when the counts differ (_stat_sets reads it), or a table holds both halves."""
    lines, subjects, sets, cur, i = text.splitlines(), [], [], None, 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("|") and i + 1 < len(lines) and catalog.TABLE_SEP.match(lines[i + 1]):
            j = i + 2
            while (
                j < len(lines)
                and lines[j].startswith("|")
                and not (j + 1 < len(lines) and catalog.TABLE_SEP.match(lines[j + 1]))
            ):
                j += 1
            h, rows = catalog.table_cells(ln), [catalog.table_cells(r) for r in lines[i + 2 : j]]
            if sum(x.upper() == "COST" for x in h) > 1:
                return None
            if not _sr5(h):
                if cur is not None and len(rows) == 1 and len(cur[1]) == 1:
                    cur = (cur[0] + h, [cur[1][0] + rows[0]])
                else:
                    if cur is not None:
                        sets.append(cur)
                    cur = (h, rows)
                if {"AVAIL", "COST"} & {x.upper() for x in h}:
                    sets.append(cur)
                    cur = None
            i = j
            continue
        subjects += [subj for subj, ed in _captions(ln) if ed == "6"]
        i += 1
    if cur is not None:
        sets.append(cur)
    if not subjects or len(subjects) != len(sets):
        return None
    return [(subj, h, rows) for subj, (h, rows) in zip(subjects, sets)]


def _stat_sets(text):
    """The text's SR6 stat sets: [(subject, header, rows)]. After a caption naming both editions the SR6 half of its
    table (the columns after the first COST) or, for two tables with one header, the second; after a caption naming
    SR6 alone, its tables (one header and row joined) until the next caption."""
    lines, out, i = text.splitlines(), [], 0
    mode, subj, tabs, last5, seen = None, "", [], False, False

    def flush():
        if mode == "both" and tabs:
            h, rows = tabs[0]
            costs = [j for j, x in enumerate(h) if x.upper() == "COST"]
            if len(costs) > 1:
                k = costs[0] + 1
                out.append((subj, h[k:], [r[k:] for r in rows]))
            elif costs and costs[0] + 1 < len(h) and len(rows) == 1:
                # the SR6 half's first band after the SR5 half's price, its second band the next table printing a
                # price of its own (a vehicle's PILOT … AVAIL COST under it; the SR5 half's second band prints none)
                k = costs[0] + 1
                nxt = next(
                    (t for t in tabs[1:] if {"AVAIL", "COST"} <= {x.upper() for x in t[0]} and len(t[1]) == 1), None
                )
                head, row = h[k:] + (nxt[0] if nxt else []), rows[0][k:] + (nxt[1][0] if nxt else [])
                out.append((subj, head, [row]))
            elif len(tabs) > 1 and tabs[1][0] == h:
                out.append((subj, *tabs[1]))
            elif (
                (k := next((j for j, (t, _) in enumerate(tabs) if "COST" in {x.upper() for x in t}), None)) is not None
                and k + 1 < len(tabs)
                and all(len(rows) == 1 for _, rows in tabs[k + 1 :])
            ):
                # the two editions' boxes read as tables of their own (SR5's bands, then SR6's): the SR6 half is the
                # tables after the SR5 half's price, its bands joined
                six = tabs[k + 1 :]
                out.append((subj, [x for t, _ in six for x in t], [[c for _, rows in six for c in rows[0]]]))
            else:
                out.append((subj, [], []))
        elif mode == "sr6" and tabs:
            if len(tabs) == 1 or all(len(rows) == 1 for _, rows in tabs):
                h = [x for t, _ in tabs for x in t]
                out.append((subj, h, [[c for t, rows in tabs for c in rows[0]]] if len(tabs) > 1 else tabs[0][1]))
            else:
                out.append((subj, [], []))
        elif mode:
            out.append((subj, [], []))  # a caption with no table under it

    while i < len(lines):
        ln = lines[i]
        if ln.startswith("|") and i + 1 < len(lines) and catalog.TABLE_SEP.match(lines[i + 1]):
            j = i + 2
            while (
                j < len(lines)
                and lines[j].startswith("|")
                and not (j + 1 < len(lines) and catalog.TABLE_SEP.match(lines[j + 1]))
            ):
                j += 1
            seen = True
            if mode:
                tabs.append((catalog.table_cells(ln), [catalog.table_cells(r) for r in lines[i + 2 : j]]))
            i = j
            continue
        if caps := _captions(ln):
            eds = {e for _, e in caps}
            if eds == {"6"} and last5 and not seen:  # (the two boxes' captions on two lines, both over their tables)
                eds = {"5", "6"}
            flush()
            last5, seen = eds == {"5"}, False
            mode, subj, tabs = ("both" if eds == {"5", "6"} else "sr6" if eds == {"6"} else None), caps[-1][0], []
        i += 1
    flush()
    return out


def _unglue(header):
    """A header whose cells the converter split one word off (`SPEED` | `INT.TOP SPEED`): an abbreviation glued to the
    next cell's first word (`INT.TOP`) ends the cell before it (`SPEED INT.` | `TOP SPEED`)."""
    out = list(header)
    for i in range(1, len(out)):
        if m := re.match(r"([A-Z]+\.)(?=[A-Z])", out[i]):
            out[i - 1], out[i] = f"{out[i - 1]} {m.group(1)}", out[i][m.end() :]
    return out


_OPEN, _CLOSE = re.compile(r"\([^)]*$"), re.compile(r"^[^(]*\)")


def _join_rows(header, rows):
    """A list table set in narrow columns (a name over two rows, a value's end on the row after it, two items run into
    one row) -> one row an item. A row with a name and no price continues the name above; a cell with an open
    parenthesis starts the next item's value, one closing it ends the one before; a row whose cells split into as
    many parts as its name has `Krime`s is that many items."""
    price = [j for j, h in enumerate(header) if h.upper() in ("AVAIL", "COST")]
    out, pending = [], {}
    for r in rows:
        r = r + [""] * (len(header) - len(r))
        if not r[0] and not any(r[j] for j in price):
            for j, c in enumerate(r):
                if c and _OPEN.search(c):
                    pending[j] = (pending.get(j, "") + " " + c).strip()
                elif c and _CLOSE.match(c) and out:
                    out[-1][j] = f"{out[-1][j]} {c}".strip()
            continue
        if r[0] and not any(r[j] for j in price) and not any(r[1:]) and out:
            out[-1][0] = f"{out[-1][0]}{'' if out[-1][0].endswith('-') else ' '}{r[0]}"
            continue
        if not r[0]:
            continue
        r = [f"{pending.pop(j)} {c}".strip() if j in pending else c for j, c in enumerate(r)]
        names = [n for n in re.split(r"\s+(?=Krime\b)", r[0]) if n]
        parts = [c.split() for c in r[1:]]
        if len(names) > 1 and all(len(p) == len(names) for p in parts if p):
            out += [[n] + [p[k] if p else "" for p in parts] for k, n in enumerate(names)]
        else:
            out.append(r)
    return out


def _name(item, subj, many):
    """An item's name: its heading, with what its caption adds when the heading prints several (`krime soldier GL`:
    `Krime Soldier (GL)`, `krime PARTY (FRAG)`: `Krime Party (FRAG)`)."""
    if not many:
        return item
    have = set(norm(item).split()) | {"krime"}
    extra = [w for w in re.sub(r"[()]", " ", subj).split() if norm(w) and not set(norm(w).split()) <= have]
    return f"{item} ({' '.join(w.title() if w.islower() or len(w) > 3 else w for w in extra)})" if extra else item


def _kind(header):
    h = {x.upper() for x in header}
    if "HANDLING" in h or "HAND" in h:
        return "VEHICLE", "vehicles"
    if "DV GZ" in h:
        return "WEAPON", "grenades"
    if "DV" in h and ({"MODES", "MODE", "ATTACK RATINGS"} & h):
        return "WEAPON", "firearms"
    return None, None


def _prep(bs, report):
    """Each item (a heading's block and the pages after it, which open with the running head) -> its SR6 stat sets as
    catalog rows; the accessory and ammunition list tables' rows take the text of the headings of their names."""
    items = []
    for b in bs:
        if b.type == "section" and b.level == 1 and norm(b.name) == CHAPTER and items and items[-1].name:
            p = items[-1]  # the item running on to the next page
            items[-1] = replace(p, text="\n".join(t for t in (p.text, b.text) if t), labels={**b.labels, **p.labels})
        else:
            items.append(b)
    named = {norm(b.name): b for b in items if b.type == "item"}
    out, used = [], set()
    for b in items:
        sets = _sets_by_header(b.text) or _stat_sets(b.text)
        sr6 = re.search(r"SR6 availability is (\d+)\s*\(?([LIF]?)\)?", " ".join((b.text or "").split()))
        if (
            not sets
            and sr6
            and (
                t := next(
                    (
                        t
                        for t in catalog.md_tables(b.text)
                        if "COST" in {h.upper() for h in t[0]} and _sr5(t[0]) and t[1]
                    ),
                    None,
                )
            )
        ):
            # (a Fifth Edition box whose note gives the Sixth's availability, `SR6 availability is 5I`: the item, its
            # SR5 damage left out)
            h, r = [x.upper() for x in t[0]], t[1][0]
            row = {
                "WEAPON": b.name,
                **{k: v for k, v in zip(h, r) if k not in _SR5_HEADS},
                "AVAIL": f"{sr6.group(1)}({sr6.group(2)})" if sr6.group(2) else sr6.group(1),
            }
            out.append(
                replace(b, type="item", header=list(row), row=row, stats=[], label="grenades" if "BLAST" in h else "")
            )
            continue
        if not sets:
            out.append(b)
            continue
        page = max(1, b.page - PAGE_OFFSET)
        for subj, header, rows in sets:
            header = [RENAME.get(h.upper().rstrip("."), h.upper()) for h in _unglue(header)]
            marker, cat = _kind(header)
            if header and header[0] == "ITEM" and marker:  # one row a vehicle (`Bazoo Basic`, `Bazoo Redline` …)
                for r in rows:
                    row = {marker: r[0], **dict(zip(header[1:], r[1:]))}
                    out.append(replace(b, type="item", name=r[0], header=list(row), row=row, stats=[], label=cat))
                continue
            if header and header[0] == "ITEM":  # a list: one row an item
                cat = "ammo" if "ammo" in norm(subj) else "weapon-accessories"
                for r in _join_rows(header, rows):
                    row = dict(zip(header, r))
                    d = named.get(norm(row["ITEM"]))
                    labels = {h.capitalize(): v for h, v in row.items() if h in PROSE and v and v != "—"}
                    row = {
                        "AMMO" if cat == "ammo" else "ACCESSORY": row["ITEM"],
                        **{h: v for h, v in row.items() if h != "ITEM" and h not in PROSE},
                    }
                    if d is not None:
                        used.add(id(d))
                    out.append(
                        replace(
                            d or b,
                            type="item",
                            name=r[0],
                            header=list(row),
                            row=row,
                            stats=[],
                            label=cat,
                            labels={**(d.labels if d else {}), **labels},
                            text=d.text if d else "",
                            page=b.page,
                        )
                    )
                continue
            ok = (
                marker
                and rows
                and rows[0]
                and all(rows[0][header.index(h)] for h in ("AVAIL", "COST") if h in header)
                and {"AVAIL", "COST"} <= set(header)
            )
            if not ok:
                report.append(
                    {
                        "kind": "missing-value",
                        "file": "weapons.xml" if marker != "VEHICLE" else "vehicles.xml",
                        "name": subj or b.name,
                        "field": "sr6 stats",
                        "page": page,
                    }
                )
                continue
            name = _name(b.name, subj, len(sets) > 1)
            row = {marker: name, **{h: re.sub(r"^RATINGS\s+", "", v) for h, v in zip(header, rows[0])}}
            out.append(replace(b, type="item", name=name, header=list(row), row=row, stats=[], label=cat))
    return [b for b in out if id(b) not in used]


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    head = b.header[0] if b.header else ""
    if b.row is None:
        return None, None
    return {
        "WEAPON": ("weapons", b.label),
        "ACCESSORY": ("weapons", b.label),
        "AMMO": ("gear", b.label),
        "VEHICLE": ("vehicles", b.label),
    }.get(head, (None, None))


def extract(regrouped, ctx=None):
    report = []
    res = catalog.read(_prep(list(blocks(regrouped)), report), ctx, sys.modules[__name__])
    res.report += report  # a stat set that doesn't read
    return res
