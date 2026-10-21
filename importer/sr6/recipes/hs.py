"""Shadowrun: Hack & Slash (HS), the core matrix rulebook -> the SR6 catalog: matrix gear (cyberhacks, dataterms,
cyberdeck cases, components and modifications, data taps, tag bombs, commlink hacks, coding tools, commlink apps,
agents, cyberkits, codemods: electronics and gear), cyberprograms, complex forms, echoes, sprites, qualities, the
matrix security NPCs, a vehicle and a weapon, and the rule sections (hosts, IC, foundations, resonance realms,
virtual life: no catalog kind of their own), ids unscoped (run scopes them as hs.<slug>), descriptions in the private texts. Reads
only regrouped.md with the core rulebook's reading (catalog.read); the book's own shapes through
importer/sr6/shapes.py. Layout notes in hs.md."""

import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6 import catalog, shapes
from importer.sr6.regroup import blocks, md_tables, norm

ID, NAME, PUBLISHER, CANON = "HS", "Shadowrun: Hack & Slash", "Catalyst Game Labs", True
BOOK = "Hack & Slash"
SHA256 = ("2dcb8751222134483a050da2b6aa7733b137839f011de44143db2bf5a4af856c",)  # the owner's copy
HEADING_LEVELS = {60.0: 1, 27.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}  # the fiction's titles at 27 pt
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 185  # PDF page: the back cover
ALIASES = {}
# first header cells that make a table a catalog in regroup (its rows are items)
NAME_HEADERS = frozenset(
    {
        "ITEM",
        "RATING",
        "APP",
        "CODING LIBRARY",
        "AGENT RATING",
        "COMMLINK HACKS",
        "MATRIX RELAY",
        "DATA TAP",
        "TAG ABUSE",
        "CASE TYPE",
        "CASE MODIFICATION",
        "INTERNAL COMPONENT",
        "COMPONENT",
        "ATTRIBUTE CODEMODS",
        "CORE CODEMODS",
        "PROCESSOR CODEMODS",
        "INPUT / OUTPUT CODEMODS",
        "DIGITAL WEAPON CODEMODS",
    }
)

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"qualities", "sprites"}
LABEL_SECTIONS = {}  # (the echoes, programs and critter powers listed as run-ins: sections.py reads them in every book)
RULE_CHAPTERS = (
    "wild and free",
    "field guide to hacking",
    "gadgets and gizmos",
    "elegant architecture",
    "digital toolbox",
    "techno tools",
    "points of sprite",
    "quality hacking",
    "union forever",
    "virtual life",
    "at the base",
    "infinite memory",
    "know your enemy",
    "matrix business",
)
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
_GENERIC = {"ITEM", "NAME", "APP", "GEAR", "COMPONENT"}  # a first header naming no category
_FADE = re.compile(r"^\*\*Fade Value Duration\*\*\s*\n(.+?)\s+(\S+)\s*$", re.M)
_INLINE = re.compile(r"\s*\*\*([^*]+?):\*\*\s*")
_RATING = re.compile(r"professional rating\s*(\d+)", re.I)
_TRAILING_RATING = re.compile(r"(?i)\s*rating$")
_RECHARGE = re.compile(r"^(.+?)\s*\((.+)\)$")
_PR_NAME = re.compile(r"^(.+?)\s*\(Professional Rating\s*(\d+)\)\s*$", re.I)


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"hack\s*(?:&|and)\s*slash", hay, re.I) else 0.0


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    sec, labels = norm(b.section), {k.lower() for k in b.labels}
    if b.row is not None:
        head = [h.upper() for h in b.header]
        if b.name.startswith(("*", "†")):
            return "skip", None
        if head[0] in ("REALM", "NEW IC", "IC"):
            return None, None  # resonance realms and IC: rule sections
        if head[0] == "RATING":
            cat = slug(b.label)
        elif head[0] not in _GENERIC:
            cat = slug(re.sub(r"(?i)\s*rating$", "", b.header[0]))  # `DATA TAP`, `CORE CODEMODS`
        else:
            cat = shapes.category(b, parent2)
        k = shapes.kind_of(set(head))
        return k, cat or k
    if b.type == "section" and b.level == 3 and {"cost", "bonus"} & labels and "quality hacking" in chapter:
        return "qualities", "negative" if "bonus" in labels else "positive"
    if (
        b.type == "item"
        and {"cost", "bonus"} & labels
        and ("qualit" in sec or "qualit" in norm(b.name) or "quality hacking" in chapter)
    ):
        return "qualities", "negative" if "bonus" in labels else "positive"
    if b.type == "item" and any(k.startswith("fade") for k in labels):
        return "complexforms", None
    if b.stats and "points of sprite" in chapter and {"A", "S", "D", "F"} <= {h.upper() for s in b.stats for h in s}:
        return "sprites", None
    if b.stats and "B" in {h.upper() for s in b.stats for h in s} and _RATING.search(b.tags + " " + b.section):
        return "npcs", None
    return None, None


def prepare(bs):
    """The book's shapes as catalog.read reads them: stat boxes and catalog rows (shapes.boxes); a complex form's
    `Fade Value Duration` line over its values as its labels; labels printed two to a line split; a sprite's section
    (its band in its text) as an item; an NPC's `(Professional Rating N)` (a tag line, or its heading's, printed over
    the section) as the core rulebook's section form; `Agent rating (Rating 1–6)` as `Agent (Rating 1–6)`, a titled
    table's rating rows as `<title> (Rating N)`; a
    `Complex Form:` or quality's `(Positive Quality)` prefix or suffix dropped."""
    out, pr, seen = [], None, set()
    bs = list(bs)
    # HS p.52-53: the dataterms table is printed as two separate tables with prose between them
    # (ITEM | DEVICE RATING | ATTRIBUTES D/F, then ACTIVE PROGRAM SLOTS | AVAIL. | COST).
    # regroup._stacked never fires because text separates them; merge the price table in here.
    # ponytail: positional merge — breaks if extraction reorders rows; fine for a fixed print layout.
    _dt = next((b for b in bs if b.type == "item" and b.row is None and norm(b.name) == "dataterms"), None)
    if _dt:
        for h, rs in md_tables(_dt.text):
            if h and h[0].upper() == "ACTIVE PROGRAM SLOTS":
                for item, r in zip([b for b in bs if b.label == "dataterms"], rs):
                    idx = bs.index(item)
                    extra = dict(zip(h, r))
                    bs[idx] = replace(
                        item, row={**item.row, **extra}, header=list(item.row) + [c for c in h if c not in item.row]
                    )
                break
    bs = shapes.boxes(bs)
    rated = {}  # (chapter, name) -> rows of that name
    for b in bs:
        if b.row is not None:
            rated[(b.chapter, norm(b.name))] = rated.get((b.chapter, norm(b.name)), 0) + 1
    for b in bs:
        labels = {}
        for k, v in b.labels.items():  # `**Fade Value:** 4 **Duration:** I`
            parts = _INLINE.split(v)
            labels[k] = parts[0].strip()
            labels.update({parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)})
        b = replace(b, labels=labels)
        if m := _FADE.search(b.text):
            b = replace(
                b,
                labels={**b.labels, "Fade Value": m.group(1), "Duration": m.group(2)},
                text=(b.text[: m.start()] + b.text[m.end() :]).strip(),
            )
        if b.type == "section" and (m := _PR_NAME.match(b.tags)):
            pr = (norm(m.group(1)), m.group(1), m.group(2))  # the next box of this name is this NPC
        if b.stats and not b.row and pr and norm(b.name) == pr[0]:
            b = replace(b, name=pr[1], tags=f"Professional Rating {pr[2]}")
            pr = None
        if b.stats and (m := _RATING.search(b.tags)) and "professional rating" not in norm(b.section):
            b = replace(b, section=f"Professional Rating {m.group(1)}: {b.section}")
        if b.type == "section" and b.level == 3 and norm(b.name).endswith("sprite") and "A | S | D | F" in b.text:
            b = catalog.text_stats(replace(b, type="item", level=4), catalog.HEADERS["sprites"])
        if b.row is not None:
            b = _row_name(b, rated)
            if m := _RECHARGE.match(b.row.get("COST (RECHARGE)", "")):  # a cyberkit's price and its recharge's
                row = {
                    ("COST" if h == "COST (RECHARGE)" else h): (m.group(1) if h == "COST (RECHARGE)" else v)
                    for h, v in b.row.items()
                }
                b = replace(b, row={**row, "RECHARGE": m.group(2)}, header=[*row, "RECHARGE"])
            key = (norm(b.name), tuple(b.row.values()))
            if key in seen:
                continue  # a row printed twice (two tables run together)
            seen.add(key)
        if b.name.startswith("Complex Form: "):
            b = replace(b, name=b.name[len("Complex Form: ") :])
        if m := re.match(r"^(.+?)\s*\(((?:Positive|Negative) Quality)\)$", b.name):
            b = replace(b, name=m.group(1), tags=m.group(2))  # (its kind a tag: sections.KIND_SUFFIX)
        out.append(b)
    return out


def _row_name(b, rated):
    """A catalog row's name as the book means it: `Rating 1–6` under `AGENT RATING` -> `Agent (Rating 1–6)`; a titled
    table's rating rows (`cyberhacks`: `1`, `2`, …) -> `Cyberhacks (Rating 1)`; a name priced at several ratings, a
    row each (`Core` at 1–4, 5 and 6) -> `Core (Rating 5)` (a range stays the rating: catalog.NAME_RATING)."""
    first, name = b.header[0], b.name
    if re.match(r"(?i)rating\s", name):
        name = f"{_TRAILING_RATING.sub('', first).title()} ({name})"
    elif first.upper() == "RATING" and b.label:
        name = f"{b.label[:1].upper()}{b.label[1:]} (Rating {name})"
    elif rated.get((b.chapter, norm(name)), 0) > 1 and (r := b.row.get("RATING", "")) and not re.search(r"[–-]", r):
        name = f"{name} (Rating {r})"
    return replace(b, name=name, row={**b.row, first: name}) if name != b.name else b


def extract(regrouped, ctx=None):
    return catalog.read(prepare(blocks(regrouped)), ctx, sys.modules[__name__])
