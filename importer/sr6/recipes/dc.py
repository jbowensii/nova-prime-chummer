"""Shadowrun: Double Clutch (DC), the core rigger rulebook -> the SR6 catalog: vehicles and drones (every class), the
vehicle modifications, weapon mounts, drone racks and trailers (gear, the modifications with their slots), the rigger
headware, the gear-head qualities, the sample contacts and the rule sections (chases, building a vehicle, repairs: no
catalog kind of their own), ids unscoped (run scopes them as dc.<slug>), descriptions in the private texts. Reads only
regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (catalog.read); layout notes in dc.md.

A vehicle's stat box prints its headers in pieces (a two-column speed table, a bold header line, headers run together:
`BODYARMPILOT`) but its values always in one order (handling, acceleration, speed interval, top speed, body, armor,
pilot, sensor, seats, availability, cost): they are read in that order, never guessed when their count is off."""
import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6 import catalog, search, shapes
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "DC", "Shadowrun: Double Clutch", "Catalyst Game Labs", True
BOOK = "Double Clutch"
SHA256 = ("26fdc8109fdd5b4594a9b9c02819581313d405421f73f3275fd0ee1a8a00d11e",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 183  # PDF page: the new gear and rules index starts here (left out)
ALIASES = {}
# first header cells that make a table a catalog (its rows are items even when no description pairs)
NAME_HEADERS = frozenset({"HEADWARE", "TRAILER", "WEAPON (SMG OR SMALLER FIREARM)", "DRONE RACK SIZE", "SIZE",
                          "ARM STRENGTH", "TYPE"})

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
VEHICLE_CHAPTERS = ("hot rods and cool rides", "angry waters", "rare air")
MODS = "making it yours"
RULE_CHAPTERS = ("zen and the art of vehicle maintenance", *VEHICLE_CHAPTERS, MODS, "build your dream",
                 "grease monkey way", "gearhead anatomy", "rigger advantage")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
# a vehicle's values in print order -> the core rulebook's vehicle headers (catalog.HEADERS)
VEHICLE = ("HANDLING", "ACCEL", "SPEED INTERVAL", "TOP SPEED", "BODY", "ARMOR", "PILOT", "SENSOR", "SEATS", "AVAIL", "COST")
MOD_COLUMNS = {"MOD SLOTS", "RATING", "AVAILABILITY", "AVAIL", "COST"}
RENAME = {"AVAL": "AVAIL", "AVAILABILITY": "AVAIL", "PRICE": "COST"}
PROSE = {"# DRONES", "# EXTRA", "SPACE", "SIZE CLASS", "BODY", "ARMOR", "ARM SIZE", "MELEE DV"}
HARDPOINT = {"HARDPOINT", "HARDPOINT SIZE"}  # the hardpoint a mount, rack or arm takes (pp. 142-145): `hardpoint`, lower case
HARDPOINT_SIZES = {"small", "standard", "large", "huge"}
# a catalog whose first column is a size, not a name: the row is named by the table title and that size
SIZED = {"DRONE RACK SIZE": ("Drone Rack", 0), "SIZE": ("Expanded Drone Storage", 0), "ARM STRENGTH": ("Mechanical Arm", 1)}
_VALUE = re.compile(r"(?:[\d/—–\-+*.,()¥]|\([A-Z]\))+|Special\*?")  # a value: `2/5`, `6(I)`, `11,500¥`, `—`, `Special*`
_CAPS = re.compile(r"[A-Z .#/]+")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"double\s+clutch", hay, re.I) else 0.0


def _tokens(cells):
    """Value cells -> tokens: a cell holds one value or several run together (`110 22`); `(30)` and a lone `¥` belong
    to the value before."""
    out = []
    for c in cells:
        for t in c.split():
            if out and (t == "¥" or t.startswith("(")):
                out[-1] += ("" if t == "¥" else " ") + t
            else:
                out.append(t)
    return out


def _value_line(ln):
    """A box's value line as tokens, else None: `2/5 35 3 3 2 1 1 2 11,500¥`, or values between bold headers
    (`**HAND** 3/5* **ACCEL** 15 … **SEAT — AVAIL** 2`, a dash in a header is the value before it)."""
    ln = ln.strip()
    if ln.startswith("**HAND**"):
        ln = re.sub(r"\*\*([^*]*)\*\*", lambda m: " ".join(t for t in m.group(1).split() if t in "—–-"), ln)
    ln = re.sub(r"\*(?=\d)", "* ", ln)  # `10/20*10/20*`: values printed without a space
    toks = _tokens([ln])
    return toks if len(toks) >= 7 and all(_VALUE.fullmatch(t.replace(" ", "")) for t in toks) else None


def _summary(h):
    return h[0].upper().startswith("VEHICLE")  # the aircraft table reprinting the boxes (`VEHICLE JETPACK | HAND …`)


def _combine(rows, lv):
    """A speed table's rows and a value line's tokens -> the eleven values, else None."""
    tv = _tokens(c for row in rows for c in row if c and not _CAPS.fullmatch(c))
    if len(tv) == 2 and len(lv) == 9:
        return lv[:2] + tv + lv[2:]
    if len(tv) + len(lv) == len(VEHICLE) and not (tv and lv):
        return tv + lv
    return None


def _value_lines(text):
    return [i for i, ln in enumerate(text.splitlines()) if not ln.startswith("|") and _value_line(ln)]


def vehicle_values(b):
    """The box's eleven values in print order, else None. The speed pair may print in a table of its own, the rest on
    a value line; a table row of capitals continues its header (`INT | SPD`). Only the box's first table and value line
    are its own (a box printed right after it may run into it: extra_boxes)."""
    tables = [[list(s.values()) for s in b.stats]] if b.stats else [r for h, r in catalog.md_tables(b.text) if not _summary(h)][:1]
    vl = _value_lines(b.text)
    return _combine(tables[0] if tables else [], _value_line(b.text.splitlines()[vl[0]]) if vl else [])


def extra_boxes(b):
    """The boxes run into this one (a lower-case box title reads as a table title, so its box joins the box before
    it, its title lost): (values or None, its lines), one per value line after the first."""
    lines, vl, out = b.text.splitlines(), _value_lines(b.text), []
    for k, i in enumerate(vl[1:], 1):
        seg = lines[vl[k - 1] + 1:i]
        start = next((j for j, ln in enumerate(seg) if ln.startswith("|")), len(seg))
        tables = [r for h, r in catalog.md_tables("\n".join(seg)) if not _summary(h)]
        end = vl[k + 1] if k + 1 < len(vl) else len(lines)
        tail = lines[i + 1:end]
        tail = tail[:next((j for j, ln in enumerate(tail) if ln.startswith("|")), len(tail))]
        out.append((_combine(tables[-1] if tables else [], _value_line(lines[i])), vl[k - 1] + 1 + start, tail))
    return out


def _strip(text):
    """The box's text without its stat lines (the header line and the values) and the aircraft table."""
    out, summary = [], False
    for ln in text.splitlines():
        summary = ln.startswith("|") and (summary or _summary(catalog.table_cells(ln)))
        if not summary and not _value_line(ln) and not re.fullmatch(r"\*\*[A-Z .]+\*\*", ln.strip()):
            out.append(ln)
    return "\n".join(out)


def _title(name):
    name = re.sub(r"\s*\([^()]*\)\s*$", "", name).strip() or name  # the class: `(racing motorcycle)`
    return " ".join(w[:1].upper() + w[1:] for w in name.split()) if name[:1].islower() else name


def _words(s):
    return {w for w in norm(s).split() if len(w) > 3}


def _prep(bs, report):
    """Vehicle boxes as catalog rows (named without their class, the description: the level-3 section before them that
    shares a word with the name, which then is no rule); modification headings priced by small MOD SLOTS / RATING /
    AVAILABILITY / COST tables as rows (one per printed row: a rated row named by its rating); sized catalogs named."""
    out, desc, used, mod, read = [], None, set(), "", set()
    summary = _summary_rows(bs)
    for b in bs:
        ch = norm(b.chapter)
        if b.type == "section" and b.level == 3 and any(c in ch for c in VEHICLE_CHAPTERS) \
                and (v := vehicle_values(b)) is not None:  # a box printed with no title (`GTI Revolution`)
            row = {"VEHICLE": b.name, **dict(zip(VEHICLE, v))}
            out.append(replace(b, type="item", level=5, header=list(row), row=row, stats=[], text=_strip(b.text),
                               label=b.tags))
            read.add(_key(v))
            continue
        if b.type == "section":
            desc = b if b.level == 3 else desc
            mod = b.name if MODS in ch and b.level == 4 else mod  # (a rule heading over its level boxes: `Gecko Tips`)
            out.append(b)
            continue
        if any(c in ch for c in VEHICLE_CHAPTERS) and b.row is None and b.level == 5 \
                and (v := vehicle_values(b)) is not None:
            name, extra = _title(b.name), extra_boxes(b)
            row = {"VEHICLE": name, **dict(zip(VEHICLE, v))}
            text = _strip("\n".join(b.text.splitlines()[:extra[0][1]]) if extra else b.text)
            if desc is not None and _words(desc.name) & _words(name):
                text, used = "\n\n".join(t for t in (desc.text.strip(), text.strip()) if t), used | {id(desc)}
            out.append(replace(b, name=name, header=list(row), row=row, stats=[], text=text,
                               label=re.search(r"\(([^()]*)\)\s*$", b.name).group(1) if b.name.endswith(")") else ""))
            read.add(_key(v))
            for ev, _, tail in extra:  # named by the aircraft table's row with its values, else reported
                if ev is None or (hit := summary.get(_key(ev))) is None:
                    report.append({"kind": "missing-value", "file": "vehicles.xml", "name": f"a box after {name}",
                                   "field": "name" if ev else "stats", "page": max(1, b.page - PAGE_OFFSET)})
                    continue
                row = {"VEHICLE": hit[0], **dict(zip(VEHICLE, ev))}
                out.append(replace(b, name=hit[0], header=list(row), row=row, stats=[], labels={}, label=hit[1],
                                   text="\n".join(tail)))
                read.add(_key(ev))
            continue
        if any(c in ch for c in VEHICLE_CHAPTERS) and b.row is None and b.level == 5 and (b.stats or "¥" in b.text):
            report.append({"kind": "missing-value", "file": "vehicles.xml", "name": b.name, "field": "stats",
                           "page": max(1, b.page - PAGE_OFFSET)})
        if MODS in ch and b.type == "item" and b.level == 4:
            mod = b.name
        elif MODS in ch and b.type == "item" and b.level == 5 and b.row is None and not _band_name(b.name) \
                and not [h for h, _ in catalog.md_tables(b.text) if h and {x.upper() for x in h} <= MOD_COLUMNS]:
            mod = b.name  # an unpriced level-5 heading over its own level boxes
        if b.type == "item" and b.name[:1].islower():  # a box titled in lower case (`chop shop owner`)
            b = replace(b, name=_title(b.name))
        if MODS in ch and b.row is None:
            if b.level == 5 and _band_name(b.name):
                b = replace(b, name=f"{mod} ({b.name})")  # a level of the modification above
            first, *more = _box_runs(b.text)
            for subject, seg in more:  # (owner, 2026-10-08) a second box after a sentence: an entry of its own
                tabs2 = [(h, rows) for h, rows in catalog.md_tables(seg) if h and {x.upper() for x in h} <= MOD_COLUMNS]
                if subject and tabs2:
                    row = {"GEAR": f"{re.sub(r'\s*\([^()]*\)\s*$', '', b.name)} ({subject})"}
                    for h, rows in tabs2:
                        row.update({k: v for k, v in zip(h, rows[0]) if k not in row})
                    out.append(replace(b, name=row["GEAR"], header=list(row), row=row, stats=[], level=b.level + 1))
            tabs = [(list(s), [list(s.values())]) for s in b.stats] + catalog.md_tables(first[1])
            # (a level's box headed by its name, `STREET RATING | AVAILABILITY | COST` … `LUXURY RATING`: an entry each)
            levels = [(m.group(1), h, rows) for h, rows in tabs if h and rows
                      and (m := re.fullmatch(r"([A-Z][A-Z]+) RATING", h[0].strip()))
                      and {x.upper() for x in h[1:]} <= MOD_COLUMNS]
            if len(levels) > 1:
                for word, h, rows in levels:
                    row = {"GEAR": f"{b.name} ({word.title()})", "RATING": rows[0][0],
                           **{k: v for k, v in zip(h[1:], rows[0][1:])}}
                    out.append(replace(b, name=row["GEAR"], header=list(row), row=row, stats=[]))
                continue
            tabs = [(h, rows) for h, rows in tabs if h and {x.upper() for x in h} <= MOD_COLUMNS]
            if tabs:
                n = max(len(rows) for _, rows in tabs)
                for i in range(n):
                    row = {"GEAR": b.name}
                    for h, rows in tabs:
                        for k, v in zip(h, rows[i] if i < len(rows) else []):
                            row.setdefault(k, v)
                    if n > 1:
                        row["GEAR"] = f"{b.name} (Rating {row['RATING']})" if row.get("RATING") else f"{b.name} ({i + 1})"
                    out.append(replace(b, name=row["GEAR"], header=list(row), row=row, stats=[]))
                continue
        if b.row is not None and (sz := SIZED.get(b.header[0].upper())):
            base, col = sz
            size = list(b.row.values())[col]
            first, cell = next(iter(b.row.items()))
            row = {"GEAR": f"{base} ({size})", **{k: v for k, v in b.row.items() if k != first}}
            b = replace(b, name=row["GEAR"], row=row, header=list(row), labels={**b.labels, first.capitalize(): cell})
        out.append(b)
    names = {norm(b.name) for b in out if b.row is not None and b.header[:1] == ["VEHICLE"]}
    for k, (name, _, page) in summary.items():  # a vehicle the aircraft table lists that no box gave
        if k not in read and norm(name) not in names:  # (a box printing other values than the table is no loss)
            report.append({"kind": "missing-value", "file": "vehicles.xml", "name": name, "field": "stats", "page": page})
    return [b for b in out if id(b) not in used]


_SIZE_HEAD = re.compile(r"^#####\s+(Mini|Small|Standard|Medium|Large|Huge)\s*$")


def prepare_md(md):
    """A level-5 heading naming only a size (`##### Small` under `##### Pop-Out Concealment`) named with the heading over
    it before regroup pairs headings with catalog rows (else it takes the drone rack table's `Small` row)."""
    lines, base = md.splitlines(), None
    for i, ln in enumerate(lines):
        if m := _SIZE_HEAD.match(ln):
            if base:
                lines[i] = f"##### {base} ({m.group(1)})"
        elif m := re.match(r"^#{4,5}\s+(.+?)\s*$", ln):
            base = m.group(1)
    return "\n".join(lines) + "\n"


def _box_runs(text):
    """[(subject, text)]: the text with its first box (subject None), then each later box printed after a sentence of
    its own, named by that sentence's subject (`General shielding on a smuggling compartment (may be taken multiple
    times).` -> `General shielding`); a box with no such sentence stays with the run before it."""
    segs, prose, table = [], [], []
    for ln in (text or "").splitlines():
        if ln.startswith("|"):
            table.append(ln)
            continue
        if table:
            segs.append((prose, table))
            prose, table = [], []
        prose.append(ln)
    if table:
        segs.append((prose, table))
        prose = []
    out = [[None, []]]
    for i, (p, t) in enumerate(segs):
        sent = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(x.strip() for x in p if x.strip()))
        m = re.match(r"([A-Z][a-z]+(?:\s+[a-z]+){0,2}?)\s+(?:on|for|of|in|to)\b", sent) if i and len(sent) < 160 else None
        if m:
            out.append([m.group(1), p + t])
        else:
            out[-1][1] += p + t
    out[-1][1] += prose
    return [(subj, "\n".join(ls)) for subj, ls in out]


def _band_name(name):
    """A level-5 heading naming a level of the modification above (`Rating 2`, `Version 1 (…)`, `Size Class 1`)."""
    return re.fullmatch(r"(?:Rating|Level|Version|Size Class) \d+.*", name) is not None


def _key(values):
    return tuple(v.replace(" ", "").replace("¥", "").replace(",", "") for v in values)


def _summary_rows(bs):
    """The aircraft table's rows: their values (_key) -> (name, class, page). The table prints a class as a name-only
    row (`ROTORCRAFT`), its first in the header (`VEHICLE JETPACK`)."""
    out, group = {}, ""
    for b in bs:
        tables = [(h, r) for h, r in catalog.md_tables(b.text) if _summary(h)]
        if b.row is not None and b.header and _summary(b.header):
            tables.append((b.header, [list(b.row.values())]))
        for h, rows in tables:
            group = h[0][len("VEHICLE"):].strip() or group
            for r in rows:
                if len(r) == len(VEHICLE) + 1 and r[0] and not any(r[1:]):
                    if not r[0].lower().startswith("standard upgrades"):
                        group = r[0]
                elif len(r) == len(VEHICLE) + 1 and r[0]:
                    out[_key(r[1:])] = (r[0], group.lower(), max(1, b.page - PAGE_OFFSET))
    return out


def fix(b, parent2):
    """Headers renamed to the core rulebook's (a column it has no attribute for goes to the text)."""
    if b.row is None:
        return b
    b = replace(b, name=b.name.rstrip("†‡ "))  # a footnote mark
    labels, row = dict(b.labels), {}
    for i, (h, v) in enumerate(b.row.items()):
        h = RENAME.get(h.upper(), h)
        if i and h.upper() in HARDPOINT:
            if v.strip().lower() in HARDPOINT_SIZES:  # (a wrapped name's tail in the column is no size)
                row["HARDPOINT"] = v.strip().lower()
        elif i and h.upper() in PROSE and norm(b.chapter) not in VEHICLE_CHAPTERS:
            if v and v != "—":
                labels.setdefault(h.capitalize(), v)
        else:
            row[h] = v
    return replace(b, row=row, header=list(row), labels=labels)


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    labels = {k.lower(): v for k, v in b.labels.items()}
    if "gearhead anatomy" in chapter and b.row is None and re.search(r"karma", labels.get("cost") or labels.get("bonus") or "", re.I):
        return "qualities", "negative" if "bonus" in labels else "positive"
    if b.type == "section":
        return None, None
    if b.row is None:
        if "grease monkey way" in chapter and b.stats and any(h.upper() in ("B", "BOD") for h in b.stats[0]):
            return "contacts", None
        return None, None
    head = (b.header[0] if b.header else "").upper()
    if head == "VEHICLE" and any(c in chapter for c in VEHICLE_CHAPTERS):
        return "vehicles", slug(parent2) or slug(b.label) or "vehicles"
    if head.startswith("VEHICLE"):
        return "skip", None  # the aircraft summary table (the boxes reprinted)
    if head == "HEADWARE":
        return "augmentations", "headware"
    if head == "GEAR" or head in ("TRAILER", "WEAPON (SMG OR SMALLER FIREARM)") or head in SIZED:
        cat = slug(re.sub(r"\s*table$", "", b.label, flags=re.I)) if b.label else ""
        return "gear", cat or slug(parent2) or "vehicle-modifications"
    if head == "TYPE" and "grease monkey way" in chapter:
        return "gear", "facilities"
    return None, None


_WORD_NUM = {w: i for i, w in enumerate(("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"))}
_SOFT = re.compile(r"^•\s*\*\*([^*]+)\*\*\s*(?:\(([^()]*)\))?\s*$")


def _autosofts(bs, cat):
    """The skills sold as autosofts (Skills Available in Autosoft Format: bulleted `**Skill** (specialization)` lines,
    their ratings in the prose, `rating from one to nine`): programs of type autosoft, unpriced (the core rulebook prices
    autosofts by rating). A skill whose own line sets its ratings (Language 1, 3, 5; Knowledge 3) has those."""
    for b in bs:
        if norm(b.name) != "skills available in autosoft format":
            continue
        text = " ".join(b.text.split())
        m = re.search(r"rating from (\w+) to (\w+)", text, re.I)
        lo, hi = (_WORD_NUM.get(m.group(i).lower()) for i in (1, 2)) if m else (None, None)
        lines, i = b.text.splitlines(), 0
        while i < len(lines):  # a bullet's parenthesis may wrap onto the next line
            ln = lines[i].strip()
            while ln.startswith("•") and ln.count("(") > ln.count(")") and i + 1 < len(lines):
                i += 1
                ln += " " + lines[i].strip()
            i += 1
            s = _SOFT.match(ln)
            if not s:
                continue
            # a line setting its own ratings (`Language (Beginner: rating one, …, Expert: rating five)`, `Knowledge
            # (always purchased as a rating 3 autosoft)`): those ratings, the parenthesis no specialization
            own = [_WORD_NUM.get(r.lower(), r) for r in re.findall(r"\brating\s+(\w+)", s.group(2) or "", re.I)]
            name = s.group(1).strip() if own or not s.group(2) else f"{s.group(1).strip()} ({s.group(2).strip()})"
            rating = ", ".join(str(r) for r in own) if own else f"{lo}–{hi}" if lo and hi else None
            cat.add("programs", name, max(1, b.page - PAGE_OFFSET), {"type": "autosoft", "rating": rating})


def extract(regrouped, ctx=None):
    report, bs = [], list(blocks(regrouped))
    res = catalog.read(_prep(bs, report), ctx, sys.modules[__name__])
    res.report += report  # a vehicle box whose values don't read
    cat = catalog.Catalog(ID, ID.lower(), BOOK)
    cat.index = search.Index(bs, PAGE_OFFSET, catalog.md_tables, shapes.RENAME)
    _autosofts(bs, cat)
    if cat.entries["programs"]:  # (beside the programs the shared reading found: the e-softs' run-ins)
        new = cat.xml("programs")
        res.files["programs.xml"] = catalog.merge_xml(res.files["programs.xml"], new) if "programs.xml" in res.files else new
    return res
