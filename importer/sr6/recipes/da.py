"""Shadowrun: Deadly Arts (DA), the core advanced combat rulebook -> the SR6 catalog: weapons (with the weapon mods),
vehicles and drones (and the vehicle mounted weapons), armor and armor modifications, augmentations, electronics, gear
(ammunition, tac-apps, foci), the martial art styles and techniques, qualities, spells, adept powers, metamagics,
rituals and the rule sections, ids unscoped (run scopes them as da.<slug>), descriptions in the private texts. Reads
only regrouped.md with the core rulebook's reading (catalog.read); the book's own box shapes (several items a box, a box
under its heading) through importer/sr6/shapes.py. Layout notes in da.md."""
import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6 import catalog, shapes
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "DA", "Shadowrun: Deadly Arts", "Catalyst Game Labs", True
BOOK = "Deadly Arts"
SHA256 = ("61d06a3398d5c77c9ba4e035a1035971edbb57751fb64094fc861d25764c1948",)  # the owner's copy
# chapter titles set at 48 to 60 pt, the fiction's at 27 (the guess takes only 56 for a level)
HEADING_LEVELS = {60.0: 1, 56.0: 1, 52.0: 1, 48.0: 1, 40.0: 1, 27.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 185  # PDF page: the back cover
ALIASES = {}
NAME_HEADERS = frozenset({"DRUG"})  # the medical chapter's `drugs` table: its rows are items (their headings are sections)

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"spells"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("registered as a lethal weapon", "bleeders and bone breakers", "sending it downrange", "frag orders",
                 "mil spec mayhem", "mystical force multipliers", "best of the rest")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
_PAREN = re.compile(r"\s*\(([^()]+)\)\s*$")
_NEW = re.compile(r"^New (.+?):?$")
_PREFIX = re.compile(r"^New ([^:]+):\s*(.+)$")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"deadly\s+arts", hay, re.I) else 0.0


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    p2, sec, labels = norm(parent2), norm(b.section), {k.lower() for k in b.labels}
    if b.row is not None:
        head = {h.upper() for h in b.header}
        if b.name.startswith(("*", "†")):
            return "skip", None
        k, lab = shapes.kind_of(head), norm(b.label)
        if "MOD" in head and "MOUNT" in head or "weapon mod" in lab:
            return "weapons", "weapon-mods"
        if "armor accessories" in p2 or "armor mod" in lab:
            return "armor", "armor-modifications"
        return k, shapes.category(b, parent2) or k
    if mk := shapes.martial_kind(b):
        return mk
    if b.type == "item" and b.level == 4 and {"cost", "bonus"} & labels and "qualities" in sec:
        return "qualities", "negative" if "bonus" in labels else "positive"
    if "adept powers" in p2 and b.type == "item" and "cost" in labels:
        return "adeptpowers", None
    if sec == "new metamagics" and b.type == "item":
        return "metamagics", None
    if "rituals" in sec and b.type == "item" and "threshold" in labels:
        return "rituals", None
    if b.stats and {"RANGE", "DURATION"} <= {h.upper() for s in b.stats for h in s}:
        return "spells", None
    return None, None


# an untitled price list set in a rule heading's text (`Expanded Rocket/Missile Rules`: the standard rocket and missile)
_TEXT_LIST = re.compile(r"^\| NAME \|.*\n\|(?:---\|)+\n(?:\|.*\|\n?)+", re.M)


def _text_list(b):
    """[row blocks, the block without the list] for a rule heading whose text sets a NAME table every row of which is
    priced (`2,000¥`), its heading their title; else None (a table of rules, or one of the book's boxes)."""
    m = _TEXT_LIST.search(b.text) if b.type == "item" and b.row is None and not b.stats else None
    if not m:
        return None
    ls = m.group(0).strip().splitlines()
    head = [c.strip() for c in ls[0].strip()[1:-1].split("|")]
    rows = [[c.strip() for c in ln.strip()[1:-1].split("|")] for ln in ls[2:]]
    if len(rows) < 2 or "COST" not in head or any(len(r) != len(head) or "¥" not in r[head.index("COST")] for r in rows):
        return None
    out = [replace(b, name=r[0], row=(row := {head[0]: r[0], **shapes.cells(dict(zip(head[1:], r[1:])))}),
                   header=list(row), label=b.name, text="", labels={}, aliases=[]) for r in rows]
    return out + [replace(b, text=(b.text[:m.start()] + b.text[m.end():]).strip())]


# a structural hint about one misplaced header (Rockets and Missiles, p. 58): the header prints `PILOT AVAIL SENSOR
# COST` over rows `0 0 5(I) 2,000¥`, AVAIL set over the sensor column (the p. 57 table prints `SENSOR AVAIL`): read
# by the values' shapes, as the owner decided (2026-10-07)
_LEGAL = re.compile(r"\d\s*\(?[LIF]\)?$")


def _swap_avail(bs):
    """A table's row blocks whose AVAIL cells print no legality letter while most of a neighbouring column's do (the
    misplaced header above): the two columns' values swapped."""
    tables = {}
    for b in bs:
        if b.row is not None and "AVAIL" in b.row:
            tables.setdefault((b.label, tuple(b.row)), []).append(b)
    swap = {}
    for (_, head), rows in tables.items():
        filled = lambda h: [r.row[h].strip() for r in rows if r.row[h].strip() not in ("", "-", "—", "–")]  # noqa: E731
        a = head.index("AVAIL")
        if not filled("AVAIL") or any(_LEGAL.search(v) for v in filled("AVAIL")):
            continue
        for k in (a - 1, a + 1):
            if 0 < k < len(head) and head[k] not in ("COST", "AVAIL") and filled(head[k]) \
                    and 2 * sum(bool(_LEGAL.search(v)) for v in filled(head[k])) > len(filled(head[k])):
                swap.update({id(r): head[k] for r in rows})
                break
    return [replace(b, row={**b.row, "AVAIL": b.row[swap[id(b)]], swap[id(b)]: b.row["AVAIL"]}) if id(b) in swap else b
            for b in bs]


def prepare(bs):
    """The book's shapes as catalog.read reads them: stat boxes as rows (shapes.boxes), a spell section (`Aerial Flare
    (Manipulation)` over its band) as a spell item of that category, a quality's `(Positive)` suffix dropped, a ritual's
    `(Anchored, Spell)` its keywords, the martial arts' lines as labels, a `New Cyberware:` line naming the next box's
    category."""
    out, group = [], ""
    for b in _swap_avail([x for b in shapes.boxes(bs) for x in (_text_list(b) or [b])]):
        if b.type == "item" and not b.text.strip() and not b.stats and b.row is None and (m := _NEW.match(b.name)):
            group = m.group(1)
            continue
        if b.row is not None and group:
            b, group = replace(b, label=group), ""
        if b.row is not None and (m := _PREFIX.match(b.name)):  # `New Vehicle Mod: Mobile Magic Lodge (CF)`
            b = replace(b, name=m.group(2), label=m.group(1), row={**b.row, next(iter(b.row)): m.group(2)})
        m = _PAREN.search(b.name)
        cat = m and m.group(1).lower()
        if b.type == "section" and b.level == 3 and cat in SPELL_CATEGORIES and "RANGE" in b.text:
            b = catalog.text_stats(replace(b, type="item", level=4, name=b.name[:m.start()], tags=m.group(1).title(),
                                        section=m.group(1).title()), catalog.HEADERS["spells"])
        elif b.type == "item" and b.stats and cat in SPELL_CATEGORIES:
            b = replace(b, name=b.name[:m.start()], tags=b.tags or m.group(1).title(), section=m.group(1).title())
        elif m and cat in ("positive", "negative") and {"cost", "bonus"} & {k.lower() for k in b.labels}:
            b = replace(b, name=b.name[:m.start()])
        elif m and "Threshold" in b.labels:
            b = replace(b, name=b.name[:m.start()], tags=m.group(1))
        out += shapes.martial_pair(shapes.martial(b))
    return out


def extract(regrouped, ctx=None):
    return catalog.read(prepare(blocks(regrouped)), ctx, sys.modules[__name__])
