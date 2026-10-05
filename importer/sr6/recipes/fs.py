"""Shadowrun: Firing Squad (FS), the core combat rulebook -> the SR6 catalog: weapons (and weapon modifications and
accessories, as the core rulebook files them), ammunition (gear), armor (and armor modifications), tac-apps, the trauma
qualities, the security and gang NPCs, the martial art styles and techniques and the rule sections (edge actions,
maneuvers: no catalog kind of their own), ids unscoped (run scopes them as fs.<slug>), descriptions in the private
texts. Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (crb.extract); layout notes in
fs.md.

The book prints an item as a heading, its description and a stat box titled with its name (TYPE, DV, ... AVAIL, COST):
the box becomes the item's row here. A few headers set too close together print as one (`AMMOAVAIL`): they are split,
their value at its last space. A line or value that doesn't read is reported, never guessed."""
import re
import sys
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.recipes import crb, shapes
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "FS", "Shadowrun: Firing Squad", "Catalyst Game Labs", True
BOOK = "Firing Squad"
SHA256 = ("f686d75dd97844c7280186c17aefc130fc6e2dcd89948274e92bf574c0698a80",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 152  # PDF page: the weapon and armor stats (the book's tables reprinted) start here (left out)
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"qualities"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("weapons rack", "suit up", "honing your edge", "violent ends", "fighting forces")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("weapons rack", "suit up")
WEAPON_PARTS = ("weapon modifications", "melee weapon modifications", "weapon accessories")  # SUIT UP level-2 sections
ARMOR_MODS = "accessories and modifications"
# headers printed as one: header -> the headers it holds (the value splits at its last space), or its real name
MERGED = {"AMMOAVAIL": ("AMMO", "AVAIL"), "RATINGSAMMOAVAIL": ("AMMO", "AVAIL"), "ATTACK": "ATTACK RATINGS",
          "DV CLOSEDV": "DV CLOSE", "NEAR": "DV NEAR"}
_OWN_ROWS = 6
_TAG, _UPTO = re.compile(r"\(([^()]+)\)"), re.compile(r",?\s*1\s+to\s+(\d+)\s*$")
_RATING = re.compile(r"professional rating\s*(\d+)", re.I)


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"firing\s+squad", hay, re.I) else 0.0


_NAME_COLUMNS = {"ITEM", "WEAPON", "GRENADES", "GEAR", "APP"}  # a box's first column naming the item: the heading names it


def _unmerge(cells):
    out = {}
    for h, v in cells.items():
        h = h.rstrip("*")  # a footnote mark (`I/ID*`)
        m = MERGED.get(h.upper())
        if isinstance(m, tuple):
            a, _, b = v.rpartition(" ")
            out[m[0]], out[m[1]] = (a, b) if a else (v, "")
        else:
            out[m or h] = v
    return out


def fix(b, parent2):
    """Merged headers split; an item's stat box (with a price) as its row, named by its heading; an NPC's
    `(Professional Rating N)` tag as the core rulebook's section form."""
    stats = [_unmerge(s) for s in b.stats]
    row = _unmerge(b.row) if b.row is not None else None
    header = list(row) if row is not None else b.header
    if b.type == "item" and row is None and stats and any(h.upper() in ("AVAIL", "COST") for h in stats[0]):
        cells = {h: v for i, (h, v) in enumerate(stats[0].items()) if i or h.upper() not in _NAME_COLUMNS}
        row, stats = {"ITEM": b.name, **cells}, stats[1:]
        header = list(row)
        b = replace(b, label="")
    section = b.section
    if (m := _RATING.search(b.tags)) and norm(b.chapter) == "fighting forces":
        section = f"Professional Rating {m.group(1)}: {b.section}"
    return replace(b, header=header, row=row, stats=stats, section=section)


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    p2, labels = norm(parent2), {k.lower() for k in b.labels}
    if mk := shapes.martial_kind(b):
        return mk
    if b.type == "section":
        if "violent ends" in chapter and b.level == 3 and ({"bonus", "cost"} & labels):
            return "qualities", "negative" if "bonus" in labels else "positive"
        return None, None
    if b.row is None:
        return ("npcs", None) if "fighting forces" in chapter and b.stats else (None, None)
    if b.name.startswith(("*", "†")):
        return "skip", None  # a table's footnote printed as a row
    head = {h.upper() for h in b.header}
    if "weapons rack" in chapter:
        if "ammo" not in (p2, norm(b.section)):
            return "weapons", slug(b.section) or None
        # the rEVOlution Arms pages (their heading reads as a caption, so they sit in the Ammo section): its weapons
        return ("weapons", "revolution-arms") if head & {"TYPE", "MODE"} else ("gear", "ammo")
    if "suit up" in chapter:
        if p2 in WEAPON_PARTS:
            return "weapons", slug(p2)
        if p2 == ARMOR_MODS or not head & {"DR", "DEFENSE RATING"} and "CAPACITY" in head:
            return "armor", "armor-modifications"
        return "armor", slug(p2) if p2 else "armor"
    if "honing your edge" in chapter and "APP" in head:
        return "gear", "tac-apps"
    return None, None


def _words(name):
    return {w[:-1] if w.endswith("s") else w for w in norm(name).split()}


def _boxes(bs):
    """A stat box regroup couldn't pair (its title shorter than the heading: `hk p50` under `HK P50 Tactical`, or the
    heading a section: SUIT UP's modifications) takes the description right before it when every word of its title
    is in that heading; it is named by the heading. A title still in lower case gets a capital. A SUIT UP heading
    whose stat table regroup left in its text (the table below the text: `CycleWear`) takes it as its box: a table of
    its own has no name column and a few rows (a list of the chapter's armor or modifications isn't one)."""
    out = []
    for b in bs:
        prev = out[-1] if out else None
        if b.level in (3, 4) and not b.stats and b.row is None and norm(b.chapter) == "suit up" and \
                (t := next(((h, r) for h, r in crb._tables(b.text) if 0 < len(r) <= _OWN_ROWS and h[0].upper() not in _NAME_COLUMNS
                           and {"AVAIL", "COST"} & {x.upper() for x in h}), None)):
            b = replace(b, type="item", stats=[dict(zip(t[0], r)) for r in t[1]])  # its stat table printed in its text
        if b.type == "item" and (m := _TAG.fullmatch(b.name)) and prev is not None and not prev.text.strip():
            n = _UPTO.search(m.group(1))  # `(Behavior, 1 to 6)`: a tag line read as a heading
            out[-1] = replace(prev, name=prev.name + (f" (1 to {n.group(1)})" if n else ""),
                              tags=m.group(1)[:n.start()] if n else m.group(1), labels={**prev.labels, **b.labels},
                              text=b.text, stats=b.stats, row=b.row, header=b.header)
            continue
        if b.type == "item" and b.label == b.name and b.row is None and b.stats and prev is not None \
                and prev.chapter == b.chapter and not prev.stats and prev.row is None and prev.text.strip() \
                and _words(b.name) <= _words(prev.name):
            out[-1] = replace(b, name=prev.name, level=prev.level, tags=prev.tags or b.tags, labels={**prev.labels, **b.labels},
                              text="\n\n".join(t for t in (prev.text.strip(), b.text.strip()) if t))
            continue
        if b.type == "item" and b.name == b.name.lower():
            b = replace(b, name=b.name[:1].upper() + b.name[1:])
        out.append(b)
    return out


def _lists(bs):
    """A box listing several items, one a row: by a name column (`GEAR`: the armor modifications, whose descriptions
    print earlier under headings of their own) or by distinct TYPEs (`Mil-spec Armor` Light, Medium, Heavy) -> one
    block per row, named by its cell (a TYPE after the box's name). An item's own heading block gives it its text
    and leaves the rules."""
    first = lambda b: next(iter(b.stats[0]), "") if b.stats else ""
    priced = lambda s: any(re.search(r"\d", v) for h, v in s.items() if h.upper() in ("COST", "AVAIL", "AVAILABILITY"))
    listed = [b for b in bs if b.type == "item" and b.row is None and len(b.stats) > 1 and all(map(priced, b.stats))
              and first(b).upper() in _NAME_COLUMNS | {"TYPE"} and len({s.get(first(b)) for s in b.stats}) == len(b.stats)]
    named = {norm(s[first(b)]): s[first(b)] for b in listed if first(b).upper() != "TYPE" for s in b.stats}
    descs = {}
    for b in bs:  # a heading whose words are all in a listed name (`Reactive Armor`: `Reactive Armor Plates`)
        k = next((k for k, n in named.items() if b.type == "section" and b.level == 3 and not b.stats
                  and (norm(b.name) == k or _words(b.name) <= _words(n))), None)
        if k and k not in descs:
            descs[k] = b
    out = []
    for b in bs:
        if any(b is d for d in descs.values()):
            continue
        if not any(b is x for x in listed):
            out.append(b)
            continue
        col = first(b)
        for s in b.stats:
            n = s[col] if col.upper() != "TYPE" else f"{b.name} ({s[col]})"
            d = descs.get(norm(n))
            out.append(replace(b, name=n, stats=[{h: v for h, v in s.items() if h != col}], label="",
                               text=d.text if d else b.text, tags=d.tags if d else b.tags))
    return out


def extract(regrouped, ctx=None):
    return crb.extract([shapes.martial(b) for b in _lists(_boxes(list(blocks(regrouped))))], ctx, book=sys.modules[__name__])
