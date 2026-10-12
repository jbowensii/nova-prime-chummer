"""Shadowrun: Tarnished Star (TS), the law enforcement runner resource book -> the SR6 catalog: its weapons (the Foamtek
explosives and the shields' bash among them), ammunition, armor, shields and helmets, gear (the trauma response
system, badgecams, inhibitor bands, scanners, drugs), vehicles and drones, the ROLL CALL archetypes (NPCs, group
Archetype), contacts and NPCs and the rule sections (working a case, interviews and blackmail, the gear chapter's
rules: no catalog kind of their own), ids unscoped (run scopes them as ts.<slug>), descriptions in the private texts.
Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (crb.extract); layout notes in
ts.md. The book prints no qualities.

An item's stat box is a level-5 heading under its description (a level-3 heading, or a level-4 one under it); its
stats print as a table, as a bold header line over a value line (a weapon) or as two one-row tables (a vehicle: HAND …
ARM, then PILOT … COST). A box whose values don't read is reported, never guessed."""
import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6.recipes import crb
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "TS", "Shadowrun: Tarnished Star", "Catalyst Game Labs", True
BOOK = "Tarnished Star"
SHA256 = ("afc85e6cc243d4278d89c462bb0028282d90714b92002bc072095e247f4bf16b",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 175  # PDF page: the ads start here (left out)
ALIASES = {}
# first header cells that make a table a catalog (its rows are items even when no description pairs)
NAME_HEADERS = frozenset({"ITEM", "DEVICE", "NAME", "WEAPON"})

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("working the case", "its who you know", "right tools for the job")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
GEAR, ROLL_CALL, WHO = "right tools for the job", "roll call", "its who you know"
WHO_RULES = ("game information", "blackmail how to play dirty")  # IT'S WHO YOU KNOW's level-2 sections that are rules
WEAPON_LINE = ("TYPE", "DV", "MODE", "ATTACK RATING", "AMMO", "AVAIL", "COST")  # a weapon box's bold header line
# a vehicle box's two tables -> the core rulebook's headers (crb.HEADERS)
VEHICLE = {"HAND": "HANDLING", "ACCEL": "ACCEL", "SPD INT": "SPEED INTERVAL", "TOP SPD": "TOP SPEED", "BOD": "BODY",
           "ARM": "ARMOR", "PILOT": "PILOT", "SENSE": "SENSOR", "SEAT": "SEATS", "AVAIL": "AVAIL", "COST": "COST"}
PROSE = {"TYPE", "DV", "ATTACK RATING", "POWER", "SOCIAL"}  # gear columns with no attribute: to the text
_AR = re.compile(r"[^/\s]+(?:/[^/\s]+){4}")  # attack ratings: `9/12/10/—/—`
_DV = re.compile(r"(.*\S)\s+(\d+[PS]\S*)")  # a TYPE cell holding the DV too: `Special 2S`


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"tarnished\s+star", hay, re.I) else 0.0


def _squash(s):
    return norm(s).replace(" ", "")  # (this PDF's headings print stray spaces: `Mancatc her`)


def _describes(desc, name):
    """True when a heading describes a box: a word of the box's title is in the heading."""
    return _squash(name) in _squash(desc.name) or any(w in _squash(desc.name) for w in norm(name).split() if len(w) > 3)


def weapon_line(text):
    """A weapon box's bold header line and value line -> {header: value}, else None. The type may be several words:
    the values are read from the right."""
    lines = [ln.strip() for ln in text.splitlines()]
    head = "**" + " ".join(WEAPON_LINE) + "**"
    if head not in lines or lines.index(head) + 1 >= len(lines):
        return None
    toks = lines[lines.index(head) + 1].split()
    if len(toks) < 7 or not toks[-1].endswith("¥") or not _AR.fullmatch(toks[-4]):
        return None
    return dict(zip(WEAPON_LINE, [" ".join(toks[:-6]), *toks[-6:]]))


def _vehicle(text):
    """A vehicle box's two tables -> {header: value} in the core rulebook's headers, else None (none, or more than one
    of either: the Honda Raptor's box prints none, its values run into the VAA Estrada's)."""
    tabs = crb._tables(text)
    hand = [t for t in tabs if t[0][:1] == ["HAND"]]
    pilot = [t for t in tabs if "PILOT" in t[0]]  # its own table, or the second band joined to the first (regroup)
    if len(hand) != 1 or len(pilot) != 1 or re.search(r"\d¥$", text, re.M) and len(re.findall(r"\d¥", text)) > 1:
        return None
    cells = {h: v for t in {id(t): t for t in (hand[0], pilot[0])}.values() if len(t[1]) == 1 for h, v in zip(t[0], t[1][0])}
    return {VEHICLE[h]: cells[h] for h in VEHICLE} if set(cells) == set(VEHICLE) else None


def band(text):
    """A stat band printed as a bold header line over a value line (`**B A R S W L I C ESS**`) -> [{header: value}]."""
    lines = text.splitlines()
    for i, ln in enumerate(lines[:-1]):
        if (m := re.fullmatch(r"\*\*((?:[A-Z]{1,3} )+[A-Z]{1,3})\*\*", ln.strip())) and \
                len(vals := lines[i + 1].split()) == len(hs := m.group(1).split()):
            return [dict(zip(hs, vals))]
    return []


def _strip(text):
    """The box's text without its stat lines."""
    return "\n".join(ln for ln in text.splitlines() if not ln.startswith("|") and not re.fullmatch(r"\(.*\)", ln.strip()))


def _prep(bs, report):
    """The book's blocks as the core rulebook's reading needs them: stat boxes as rows (named by the box, described by
    the heading above them), a table's `Notes:` row as the row above's text, ROLL CALL's boxes with their section's
    description and labels."""
    out, used, descs, part = [], set(), [], ""
    for b in bs:
        ch = norm(b.chapter)
        part = b.name if b.type == "section" and b.level <= 2 else part
        if b.type == "section" or b.row is None and not b.stats and b.level == 4 and b.text.strip():
            descs = [b] if b.type == "section" else [d for d in descs if d.level < b.level] + [b]
            out.append(b)
            continue
        if b.row is not None and re.match(r"notes?:", b.name, re.I) and out and out[-1].row is not None:
            out[-1] = replace(out[-1], text="\n".join(t for t in (out[-1].text, f"**Notes:** {b.name.split(':', 1)[1].strip()}") if t))
            continue  # a table's note printed as a row: the row above's
        if b.row is not None and " Notes: " in b.name:
            name, note = b.name.split(" Notes: ", 1)
            b = replace(b, name=name, row={**b.row, b.header[0]: name}, text=f"**Notes:** {note}")
        if b.type == "item" and b.name[:1].islower():
            b = replace(b, name=b.name[:1].upper() + b.name[1:])
        if GEAR in ch and b.level == 5 and b.row is None:
            desc = next((d for d in reversed(descs) if _describes(d, b.name)), None)
            rows = _gear_box(b, report, _squash(part) == "vehiclesanddrones")
            if rows and desc is not None:
                used.add(id(desc))
                rows = [replace(r, text="\n\n".join(t for t in (desc.text.strip(), r.text.strip()) if t)) for r in rows]
            out += rows if rows is not None else [b]
            continue
        if ROLL_CALL in ch and b.level == 5 and b.row is None and descs and descs[0].type == "section":
            d = descs[0]  # the archetype's (level 2), contact's or NPC group's (level 3) section
            used.add(id(d))
            labels = {("Skills" if k == "Active Skills" else k): v for k, v in {**d.labels, **b.labels}.items()}
            section = b.section if d.level == 3 or "professional rating" in norm(b.section) else "Group: Archetype"
            if not b.stats and (bd := band(b.text)):  # its attributes as a header and a value line
                b = crb._text_stats(b, crb.HEADERS["npcs"])
                b = replace(b, stats=bd + b.stats)
            b = replace(b, labels=labels, section=section,
                        text="\n\n".join(t for t in (d.text.strip(), b.text.strip()) if t))
        out.append(b)
    return [b for b in out if id(b) not in used]


def _gear_box(b, report, vehicles):
    """A gear chapter box -> its rows (None: not a stat box). A weapon box's table (its unpriced rows are footnotes, to
    the text; several priced rows are one entry each, named by the box and the row's TYPE) or its header and value
    lines; a vehicle's (in VEHICLES AND DRONES) two tables, its class line (`(Bike)`) the label. A box that doesn't
    read is reported."""
    page = max(1, b.page - PAGE_OFFSET)
    if vehicles:
        cls = re.match(r"\s*\(([^()]+)\)", b.text)
        v = _vehicle(b.text)
        if v is None:
            report.append({"kind": "missing-value", "file": "vehicles.xml", "name": b.name, "field": "stats", "page": page})
            return []
        row = {"VEHICLE": b.name, **v}
        return [replace(b, header=list(row), row=row, stats=[], label=cls.group(1) if cls else "", text=_strip(b.text))]
    priced = [s for s in b.stats if any(re.search(r"\d¥", v) for h, v in s.items() if h.upper() == "COST")]
    if priced and "TYPE" in {h.upper() for h in priced[0]}:
        notes = [" ".join(v for v in s.values() if v) for s in b.stats if s not in priced]
        text = "\n".join([b.text] + notes).strip()
        if len(priced) == 1:
            return [_row(b, b.name, priced[0], text)]
        prefix = b.name.rsplit(" ", 1)[0]
        return [replace(_row(b, f"{prefix} {s['TYPE']}", {k: v for k, v in s.items() if k != "TYPE"}, text), label=b.name)
                for s in priced]
    if (cells := weapon_line(b.text)) is not None:
        return [_row(b, b.name, cells, "\n".join(ln for ln in b.text.splitlines()
                                                 if not ln.startswith("**TYPE") and ln.split()[-1:] != [cells["COST"]]))]
    if any({"AVAIL", "COST"} & {h.upper() for h in st} for st in b.stats) or "**TYPE" in b.text:
        report.append({"kind": "missing-value", "file": "weapons.xml", "name": b.name, "field": "stats", "page": page})
        return []
    return None


def _row(b, name, cells, text):
    if (m := _DV.fullmatch(cells.get("TYPE", ""))) and "DV" not in cells:
        cells = {"TYPE": m.group(1), "DV": m.group(2), **{k: v for k, v in cells.items() if k != "TYPE"}}
    row = {"WEAPON": name, **cells}
    return replace(b, name=name, header=list(row), row=row, stats=[], text=text)


def fix(b, parent2):
    """Gear columns with no attribute (an ammunition's DV and attack ratings, a drug's power) go to the text; armor's
    SOCIAL is its social attribute (crb.HEADERS)."""
    if b.row is None or norm(b.chapter) != GEAR or (k := _kind(b)[0]) in ("weapons", "vehicles"):
        return b
    labels, row = dict(b.labels), {}
    for i, (h, v) in enumerate(b.row.items()):
        if i and h.upper() in PROSE and not (k == "armor" and h.upper() == "SOCIAL"):
            if v and v != "—":
                labels.setdefault(h.capitalize(), v)
        else:
            row[h] = v
    return replace(b, row=row, header=list(row), labels=labels)


def _kind(b):
    head, name = (b.header[0] if b.header else "").upper(), norm(b.name)
    if head == "VEHICLE":
        return "vehicles", slug(b.label) or "vehicles"
    if head == "WEAPON":
        if "ammunition" in name:
            return "gear", "ammo"
        if "shield" in name.split():
            return "weapons", "shields"
        return "weapons", slug(b.row.get("TYPE", "") or b.label) or "special"
    if head == "ITEM":
        if "shield" in name.split():
            return "armor", "shields"
        if "helmet" in name:
            return "armor", "helmets"
        return ("armor", "armor") if any(h.upper() == "DEFENSE RATING" for h in b.header) else ("gear", "armor-modifications")
    if head == "DEVICE":
        return "gear", slug(b.label) or "security-scanners"
    if head == "NAME":
        return "gear", "drugs"
    return None, None


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    if WHO in chapter and not any(norm(parent2).startswith(s) for s in WHO_RULES):
        return "skip", None
    if GEAR in chapter and b.row is not None:
        return _kind(b)
    if ROLL_CALL in chapter and b.level == 5 and b.row is None:
        if "uses" in {k.lower() for k in b.labels}:
            return "contacts", None
        return "npcs", None
    return None, None


def extract(regrouped, ctx=None):
    report = []
    res = crb.extract(_prep(list(blocks(regrouped)), report), ctx, book=sys.modules[__name__])
    res.report += report  # a box whose values don't read
    return res
