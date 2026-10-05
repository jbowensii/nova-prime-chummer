"""Shadowrun: Double Clutch (DC), the core rigger rulebook -> the SR6 catalog: vehicles and drones (every class), the
vehicle modifications, weapon mounts, drone racks and trailers (gear, the modifications with their slots), the rigger
headware, the gear-head qualities, the sample contacts and the rule sections (chases, building a vehicle, repairs: no
catalog kind of their own), ids unscoped (run scopes them as dc.<slug>), descriptions in the private texts. Reads only
regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (crb.extract); layout notes in dc.md.

A vehicle's stat box prints its headers in pieces (a two-column speed table, a bold header line, headers run together:
`BODYARMPILOT`) but its values always in one order (handling, acceleration, speed interval, top speed, body, armor,
pilot, sensor, seats, availability, cost): they are read in that order, never guessed when their count is off."""
import re
import sys
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.recipes import crb
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
# a vehicle's values in print order -> the core rulebook's vehicle headers (crb.HEADERS)
VEHICLE = ("HANDLING", "ACCEL", "SPEED INTERVAL", "TOP SPEED", "BODY", "ARMOR", "PILOT", "SENSOR", "SEATS", "AVAIL", "COST")
MOD_COLUMNS = {"MOD SLOTS", "RATING", "AVAILABILITY", "AVAIL", "COST"}
RENAME = {"AVAL": "AVAIL", "AVAILABILITY": "AVAIL", "PRICE": "COST"}
PROSE = {"HARDPOINT", "# DRONES", "# EXTRA", "SPACE", "SIZE CLASS", "BODY", "ARMOR", "ARM SIZE", "HARDPOINT SIZE",
         "MELEE DV"}
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


def vehicle_values(b):
    """The box's eleven values in print order, else None. The speed pair may print in a table of its own, the rest on
    a value line; a table row of capitals continues its header (`INT | SPD`). Only the box's first table and value line
    are its own (a box printed right after it may run into it)."""
    tables = [[list(s.values()) for s in b.stats]] if b.stats else [rows for _, rows in crb._tables(b.text)][:1]
    tv = _tokens(c for row in (tables[0] if tables else []) for c in row if c and not _CAPS.fullmatch(c))
    lv = next((v for ln in b.text.splitlines() if not ln.startswith("|") and (v := _value_line(ln))), [])
    if len(tv) == 2 and len(lv) == 9:
        return lv[:2] + tv + lv[2:]
    if len(tv) + len(lv) == len(VEHICLE) and not (tv and lv):
        return tv + lv
    return None


def _strip(text):
    """The box's text without its stat lines (the header line and the values)."""
    return "\n".join(ln for ln in text.splitlines() if not _value_line(ln)
                     and not re.fullmatch(r"\*\*[A-Z .]+\*\*", ln.strip()))


def _title(name):
    name = re.sub(r"\s*\([^()]*\)\s*$", "", name).strip() or name  # the class: `(racing motorcycle)`
    return " ".join(w[:1].upper() + w[1:] for w in name.split()) if name[:1].islower() else name


def _words(s):
    return {w for w in norm(s).split() if len(w) > 3}


def _prep(bs, report):
    """Vehicle boxes as catalog rows (named without their class, the description: the level-3 section before them that
    shares a word with the name, which then is no rule); modification headings priced by small MOD SLOTS / RATING /
    AVAILABILITY / COST tables as rows (one per printed row: a rated row named by its rating); sized catalogs named."""
    out, desc, used, mod = [], None, set(), ""
    for b in bs:
        ch = norm(b.chapter)
        if b.type == "section":
            desc = b if b.level == 3 else desc
            out.append(b)
            continue
        if any(c in ch for c in VEHICLE_CHAPTERS) and b.row is None and b.level == 5 \
                and (v := vehicle_values(b)) is not None:
            name = _title(b.name)
            row = {"VEHICLE": name, **dict(zip(VEHICLE, v))}
            text = _strip(b.text)
            if desc is not None and _words(desc.name) & _words(name):
                text, used = "\n\n".join(t for t in (desc.text.strip(), text.strip()) if t), used | {id(desc)}
            out.append(replace(b, name=name, header=list(row), row=row, stats=[], text=text,
                               label=re.search(r"\(([^()]*)\)\s*$", b.name).group(1) if b.name.endswith(")") else ""))
            continue
        if any(c in ch for c in VEHICLE_CHAPTERS) and b.row is None and b.level == 5 and (b.stats or "¥" in b.text):
            report.append({"kind": "missing-value", "file": "vehicles.xml", "name": b.name, "field": "stats",
                           "page": max(1, b.page - PAGE_OFFSET)})
        if MODS in ch and b.type == "item" and b.level == 4:
            mod = b.name
        if b.type == "item" and b.name[:1].islower():  # a box titled in lower case (`chop shop owner`)
            b = replace(b, name=_title(b.name))
        if MODS in ch and b.row is None:
            if b.level == 5 and re.fullmatch(r"(?:Rating|Level|Version) \d+.*", b.name):
                b = replace(b, name=f"{mod} ({b.name})")  # a level of the modification above
            tabs = [(list(s), [list(s.values())]) for s in b.stats] + crb._tables(b.text)
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
    return [b for b in out if id(b) not in used]


def fix(b, parent2):
    """Headers renamed to the core rulebook's (a column it has no attribute for goes to the text)."""
    if b.row is None:
        return b
    b = replace(b, name=b.name.rstrip("†‡ "))  # a footnote mark
    labels, row = dict(b.labels), {}
    for i, (h, v) in enumerate(b.row.items()):
        h = RENAME.get(h.upper(), h)
        if i and h.upper() in PROSE and norm(b.chapter) not in VEHICLE_CHAPTERS:
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


def extract(regrouped, ctx=None):
    report = []
    res = crb.extract(_prep(list(blocks(regrouped)), report), ctx, book=sys.modules[__name__])
    res.report += report  # a vehicle box whose values don't read
    return res
