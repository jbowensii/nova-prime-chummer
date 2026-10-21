"""Shadowrun: No Future (NF), the culture sourcebook -> the SR6 catalog: its gear (instruments, media gear, presses:
gear; yo-yos, rolling blades and the other weapons; clothing: armor; the two vehicles; the cybersenses and bioware:
augmentations), the new qualities and the rule sections (performing and its status, instruments of death, the life
modules: no catalog kind of their own), ids unscoped (run scopes them as nf.<slug>), descriptions in the private texts.
Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (catalog.read); layout notes in
nf.md. The book has no NPC or contact with stats.

Its gear prints in small tables under lower-case titles, some with Fifth Edition columns (a range's attack ratings
CLOSE … EXTREME in columns of their own): they are joined to the core rulebook's ATTACK RATINGS. The errata PDF's
values are applied by the corpus pass (importer/sr6/resolve.py) when it is in the library (nf.md)."""

import re
import sys
from dataclasses import replace

from importer.sr6 import catalog
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "NF", "Shadowrun: No Future", "Catalyst Game Labs", True
BOOK = "No Future"
SHA256 = ("bc95f18d1aa29afc7a4bc37f456d18fbdac912a503b7a3b1210390451d6122df",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 166  # PDF page: the ads and the Johnson run (an adventure, no stats) start here (left out)
# a row's name -> its description heading's (norm forms)
ALIASES = {
    "molotov": "molotov cocktail",
    "s b condor": "skiorsky bell condor",
    "milk 1 liter": "liter of milk",
    "audiotune": "autovoice",
}
# first header cells that make a table a catalog (its rows are items even when no description pairs)
NAME_HEADERS = frozenset(
    {
        "INSTRUMENT",
        "EXOTIC WEAPON",
        "CLUB",
        "BLADES",
        "GRENADES",
        "DEVICE",
        "CLOTHING",
        "TYPE",
        "GROUNDCRAFT",
        "AIRCRAFT",
        "ID AND CREDIT",
        "OPTICAL DEVICES",
        "EQUIPMENT",
        "BASIC BIOWARE",
        "CYBEREYES",
        "CYBEREARS",
        "HEADWARE",
    }
)

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"qualities"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("blitzkrieg bops", "game information")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("game information",)
# BLITZKRIEG BOPS: its level-3 sections that are rules (performing, a performer's status); the rest is setting
PERFORMING = (
    "synthlinks",
    "wax",
    "go live or go die",
    "impact",
    "creating a piece of art",
    "playing a gig",
    "artist status",
    "booking",
    "artist s cut",
    "royalties",
    "recognition",
    "status",
    "dancing for the man or shouting for the people",
    "expression point exchange",
)
# first header -> (kind, category)
TABLES = {
    "INSTRUMENT": ("gear", "instruments"),
    "EXOTIC WEAPON": ("weapons", "exotic-weapons"),
    "CLUB": ("weapons", "clubs"),
    "BLADES": ("weapons", "blades"),
    "GRENADES": ("weapons", "grenades"),
    "DEVICE": ("gear", "biotech"),
    "CLOTHING": ("armor", "clothing"),
    "TYPE": ("gear", "tools"),
    "GROUNDCRAFT": ("vehicles", "groundcraft"),
    "AIRCRAFT": ("vehicles", "aircraft"),
    "ID AND CREDIT": ("gear", "id-and-credit"),
    "OPTICAL DEVICES": ("gear", "optical-devices"),
    "EQUIPMENT": ("gear", "printing-presses"),
    "BASIC BIOWARE": ("augmentations", "basic-bioware"),
    "CYBEREYES": ("augmentations", "cybereyes"),
    "CYBEREARS": ("augmentations", "cyberears"),
    "HEADWARE": ("augmentations", "headware"),
}
RANGES = ("CLOSE", "NEAR", "MEDIUM", "FAR", "EXTREME")  # attack ratings in columns of their own
BLASTS = ("IMPACT", "2M", "5M", "10M")  # a grenade's DV by distance, in columns of their own
# printed -> the core rulebook's header (a vehicle keeps its ARMOR)
RENAME = {"HANDL": "HANDLING", "SPD INT": "SPEED INTERVAL", "TOP SPD": "TOP SPEED", "ARMOR": "DR"}
PROSE = {"DICE POOL EFFECT", "NOTES"}
# a variant row (`Hardened`) -> its item: the table's title, else the item whose table prints untitled (the yo-yo's)
VARIANTS = {"hardened", "bladed", "monofilament"}
UNTITLED = "Yo-Yo"
# a row named by a rating (`Rating 5`) -> `<table> (Rating 5)`
RATED = re.compile(r"Rating \d+")
_RANGE = re.compile(r"\s*\(\d+-\d+\)$")  # a name's rating range: `ProCam (1-12)`


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"\bno\s+future\b", hay, re.I) and re.search(r"shadowrun", hay, re.I) else 0.0


def fix(b, parent2):
    """A catalog row in the core rulebook's headers: the range columns joined to ATTACK RATINGS, a grenade's blast
    columns to its DV, the rest renamed (or, when it has no attribute, to the text)."""
    if b.row is None or not b.header or b.header[0].upper() not in TABLES:
        return b
    cells, labels = list(b.row.items()), dict(b.labels)
    up = {h.upper(): v for h, v in cells}
    row = {b.header[0]: b.name}
    if all(r in up for r in RANGES):
        row["DV"] = up.get("DV", "")
        row["ATTACK RATINGS"] = "/".join(up[r] or "—" for r in RANGES)
    if all(x in up for x in BLASTS):
        row["DV"] = "/".join(up[x] or "—" for x in BLASTS)
    vehicle = TABLES[b.header[0].upper()][0] == "vehicles"
    for h, v in cells[1:]:
        hu = h.upper()
        if hu in RANGES or hu in BLASTS or hu == "DV" and "DV" in row:
            continue
        if hu in PROSE:
            if v and v != "—":
                labels.setdefault(h.capitalize(), v)
            continue
        row[h if vehicle and hu == "ARMOR" else RENAME.get(hu, h)] = v
    return replace(b, name=row[b.header[0]], header=list(row), row=row, labels=labels)


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    labels = {k.lower(): v for k, v in b.labels.items()}
    if "blitzkrieg bops" in chapter:
        sec = norm(b.section)
        return (None, None) if any(sec.startswith(p) for p in PERFORMING) else ("skip", None)
    if "game information" not in chapter:
        return None, None
    if norm(parent2) == "new qualities" and b.type == "section" and b.level == 3:
        tag = norm(b.tags)
        return "qualities", "negative" if "negative" in tag or "bonus" in labels else "positive"
    if b.row is not None and b.header:
        return TABLES.get(b.header[0].upper(), (None, None))
    return None, None


def _prep(bs):
    """A quality's `Bonus: 1 To N Karma` as 1 Karma a level up to N. A catalog row named for a variant (`Hardened`) is
    named with its item (the table's title, else UNTITLED) and takes that item's description; one named by a rating
    with its table (`Cybereyes (Rating 5)`); `<x> (as above)` with the row above in its table (`AudioTune (Hacked)`).
    (A quality's `(positive quality)` line reads as a caption: dropped, its kind is its Cost or Bonus label.)"""
    items = {
        norm(b.name): b
        for b in bs
        if b.type == "item" and b.row is None and not b.stats and norm(b.chapter) == "game information"
    }
    out, used, above = [], set(), {}
    for b in bs:
        if b.type == "section" and (n := re.fullmatch(r"1 to (\d+) karma", b.labels.get("Bonus", ""), re.I)):
            b = replace(b, name=f"{b.name} (1 to {n.group(1)})", labels={**b.labels, "Bonus": "1 Karma per level"})
        if b.row is not None and b.header and b.header[0].upper() in TABLES:
            name, head = b.name, b.header[0]
            if norm(name) in VARIANTS:
                item = b.label if b.label and norm(b.label) != norm(head) else UNTITLED
                name = f"{item[:1].upper()}{item[1:]} ({name})"
                if (d := items.get(norm(item))) is not None:
                    b, used = replace(b, text=d.text), used | {id(d)}
            elif RATED.fullmatch(name):
                name = f"{head.title()} ({name})"
            elif m := re.fullmatch(r"(\w+) \(as above\)", name, re.I):
                a = above.get(head, "")  # its rating range too: `AudioTune (1-6)`
                name = f"{_RANGE.sub('', a)} ({m.group(1)}){r.group() if (r := _RANGE.search(a)) else ''}"
            above[head] = name
            # the augmentation tables share one title (`bioware`): each is named by its first header
            label = head.title() if TABLES[head.upper()][0] == "augmentations" else b.label
            b = replace(b, name=name, row={head: name, **dict(list(b.row.items())[1:])}, label=label)
        out.append(b)
    return [b for b in out if id(b) not in used]


def extract(regrouped, ctx=None):
    return catalog.read(_prep(list(blocks(regrouped))), ctx, sys.modules[__name__])
