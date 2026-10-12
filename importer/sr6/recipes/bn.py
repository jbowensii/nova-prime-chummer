"""Shadowrun: Bestial Nature (BN) -> the SR6 catalog: the Shifter quality's four forms (furry, scaly, feathery, fins:
the book's metatype-like option, a positive quality from its minimum base cost) and its positive and negative add-ons
(qualities named `<add-on> (Shifter add-on)`), the Animalism powers (metamagics: one a grade of animalism, as
metamagics are one a grade of initiation), the shifter gear (armor, gear, ammunition, drones) and the rule sections,
ids unscoped (run scopes them as bn.<slug>), descriptions in the private texts. Reads only regrouped.md
(importer/sr6/regroup.py), after prepare_md() cleans book.md, with the core rulebook's reading (catalog.read); layout notes
in bn.md. A line or value that doesn't read is reported, never guessed."""
import re
import sys
from dataclasses import replace

from importer.sr6 import catalog
from importer.sr6.recipes import fs
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "BN", "Shadowrun: Bestial Nature", "Catalyst Game Labs", True
BOOK = "Bestial Nature"
SHA256 = ("9f01f709181eebd42c745ca88ce73822ca99b896ac09ebaf954e54127be8ad6e",)  # the owner's copy (latest)
# heading sizes -> levels: the guess takes the 40 pt running head and the 26 pt page number for levels
HEADING_LEVELS = {27.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 0  # printed page = PDF page
ALIASES = {}
NAME_HEADERS = frozenset({"ITEM", "TYPE"})  # the gear tables: their rows are items

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"metamagics"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("sixth world shifters", "animalism", "shifter gear")  # (the fiction chapters are no rules)
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("shifter gear",)
SHIFTER = ("sixth world shifters", "new positive quality shifter")  # chapter, the forms' level-3 section
ADD_ONS = {"positive add ons": "positive", "negative add ons": "negative"}
POWERS = ("animalism", "animalism powers")  # chapter, level-2 section
GEAR = "shifter gear"


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    return 0.9 if re.search(r"bestial\s+nature", f"{meta.get('title') or ''}\n{md_head}", re.I) else 0.0


_RUNNING = re.compile(r"(#+ )?(BESTIAL NATURE|\d{1,2})|\*\*PAGE\*\*")  # each page's running head, number and tab
_SPLIT = re.compile(r"(?<![\w'’])([A-Z][A-Za-z]{0,3}) ([A-Za-z][a-z]*)\b")  # `Sh ifter`, `SI Ns`: a heading's word kerned apart


def prepare_md(md):
    """book.md without the running head, page number and `PAGE` tab on each page's top (the converter reads them as
    text and chapter headings), and its headings' words joined where the display face's kerning split them (`Si xth`,
    `Pe lican`, `A nimalism`): unless the second part is a word of the book and the joined one isn't (`A tale`)."""
    lines = [ln for ln in md.splitlines() if not _RUNNING.fullmatch(ln.strip())]
    body = re.sub(r"(?<=[a-z])-\n(?=[a-z])", "", "\n".join(ln for ln in lines if not ln.startswith("#")))
    words = {w.lower() for w in re.findall(r"[A-Za-z]+", body)}

    def join(m):
        a, b = m.groups()
        return a + b if (a + b).lower() in words or b.lower() not in words else m.group(0)
    return "\n".join(_SPLIT.sub(join, ln) if ln.startswith("#") else ln for ln in lines) + "\n"


def _drones(bs):
    """The drones (a heading tagged `(Small … Drone)`) take the vehicle stat tables (HAND, ACCEL …) of the gear chapter
    in reading order, wherever they print (in a later drone's text, a box of their own, under a heading printed twice):
    each drone's table follows its description."""
    gear = [b for b in bs if norm(b.chapter) == GEAR]
    drones = [b for b in gear if b.type == "item" and re.search(r"\bdrone\b", b.tags, re.I)]
    tables, holders = [], set()
    for b in gear:  # a box merged into its description prints after the description's text
        for h, rows in catalog.md_tables(b.text):
            if h and h[0].upper() == "HAND":
                tables += [dict(zip(h, r)) for r in rows]
        for s in b.stats:
            if "HAND" in {h.upper() for h in s}:
                tables.append(s)
                holders.add(id(b))
    if len(drones) != len(tables):
        return bs, [{"kind": "unmapped", "name": "; ".join(d.name for d in drones), "chapter": GEAR,
                     "label": f"{len(drones)} drones, {len(tables)} vehicle tables", "page": drones[0].page if drones else 0}]
    own = {id(d): t for d, t in zip(drones, tables)}
    out = []
    for b in bs:
        if id(b) in own:
            b = replace(b, row={"VEHICLE": b.name, **own[id(b)]}, header=["VEHICLE", *own[id(b)]], label="")
        elif id(b) in holders:
            b = replace(b, stats=[s for s in b.stats if "HAND" not in {h.upper() for h in s}])
            if b.type == "item" and not b.stats and any(norm(d.name) == norm(b.name) for d in drones):
                continue  # a drone's box or its heading printed again over its table: the drone has it
        if norm(b.chapter) == GEAR:
            b = replace(b, text="\n".join(ln for ln in b.text.splitlines() if not ln.startswith("|"))
                        if "| HAND |" in b.text else b.text)
        out.append(b)
    return out, []


_PLAIN_LABEL = re.compile(r"•?\s*(Cost|Bonus|Requirements?):\s*(.+)")  # `• Cost:6 Karma`, its bold lost


def fix(b, parent2):
    """A Shifter form's minimum base cost as its karma; an add-on's cost printed without bold as its label, its name
    saying what it adds to (`Armor (1 to 4)` -> `Armor (Shifter add-on) (1 to 4)`: the levels are read last); an
    item's stat box with a price (the silver bullets) as its row (fs.fix)."""
    b = fs.fix(b, parent2)
    if norm(b.chapter) != SHIFTER[0] or b.type != "item":
        return b
    if norm(b.section) == SHIFTER[1]:
        b = replace(b, labels={("Cost" if k.lower() == "minimum base cost" else k): v for k, v in b.labels.items()})
    elif norm(b.section) in ADD_ONS and b.level == 4:
        lines = b.text.splitlines()
        plain = [m for ln in lines if (m := _PLAIN_LABEL.fullmatch(ln.strip()))]
        b = replace(b, labels={**{m.group(1): m.group(2) for m in plain}, **b.labels},
                    text="\n".join(ln for ln in lines if not _PLAIN_LABEL.fullmatch(ln.strip())))
        if b.labels:
            b = replace(b, name=re.sub(r"^(.*?)(\s*\(1 to \d+\))?$", r"\1 (Shifter add-on)\2", b.name))
    return b


def kind(chapter, b, parent2):
    sec, p2 = norm(b.section), norm(parent2)
    if chapter == SHIFTER[0] and b.type == "item" and b.level == 4:
        if sec == SHIFTER[1] and norm(b.name).startswith("shifter "):
            return "qualities", "positive"
        if sec in ADD_ONS:
            return "qualities", ADD_ONS[sec]
    if chapter == POWERS[0] and p2 == POWERS[1] and b.level >= 3 and not b.name.islower():
        return "metamagics", None
    if chapter == GEAR and b.row is not None:
        if b.name.startswith(("*", "†")):
            return "skip", None  # a footnote printed as a row
        head = {h.upper() for h in b.header}
        if "HAND" in head:
            return "vehicles", "drones"
        if head & {"DEFENSE RATING", "DR"}:
            return "armor", "shifter-gear"
        return "gear", "ammo" if "ATTACK RATING" in head else "shifter-gear"
    return None, None


def extract(regrouped, ctx=None):
    bs, report = _drones(list(blocks(regrouped)))
    res = catalog.read(bs, ctx, sys.modules[__name__])
    res.report += report
    return res
