"""Shadowrun: Smooth Operations (SO), the core face rulebook -> the SR6 catalog: spells, the ritual, adept powers,
metamagics, alchemical preparations (gear), the social gear (clothing, armor modifications, accessories, apps,
espionage gear …), the positive and negative qualities (and the quality paths' priced steps), the six faces as sample
runners (as the core rulebook's archetypes) and the rule sections, ids unscoped (run scopes them as so.<slug>),
descriptions in the private texts. Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading
(catalog.read); layout notes in so.md. A line or value that doesn't read is reported, never guessed."""
import re
import sys
from dataclasses import replace

from importer.sr6 import catalog
from importer.sr6.ids import slug
from importer.sr6.regroup import blocks, keys, norm

ID, NAME, PUBLISHER, CANON = "SO", "Shadowrun: Smooth Operations", "Catalyst Game Labs", True
BOOK = "Smooth Operations"
SHA256 = ("ac28226a5c08491663398b124b270d0e511d3845ff35c312d9f6ce9b1b250286",)  # the owner's copy (latest)
# heading sizes -> levels: the guess takes the contents' 11 pt for a level and leaves out the 9 pt tag lines
HEADING_LEVELS = {60.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 171  # PDF page: a novel's preview starts here (left out)
ALIASES = {}
# a recipe hint: a catalog's name-only row names the rows under it until a row with a description of its own
# (`Explosive Cosmetics` over `Lipstick`, `Eyeliner` … in the espionage gear table; regroup._variants)
VARIANT_ROWS = True
# the gear tables' first headers (their rows are items)
NAME_HEADERS = frozenset({"OUTFIT", "ARMOR MOD", "NAME", "FASHION ACCESSORIES", "PROFESSIONAL GROOMING SERVICES",
                          "ESPIONAGE GEAR", "SUBSCRIPTION", "GEAR", "ITEM"})

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"qualities"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("let me have a word", "maps of desire", "getting a read", "tricks of the trade", "are you getting played",
                 "faces in the crowd", "mana infused manners", "social shopping", "social edge", "ultimate team player",
                 "more than a pretty face")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("social shopping",)
ARCHETYPES = "faces in the crowd"  # the sample faces: a level-2 section, `Metatype:` and the stat bands in its text
MAGIC, GEAR, QUALITIES = "mana infused manners", "social shopping", "more than a pretty face"
_TAG = re.compile(r"\(([A-Z][^()]*)\)")  # `(Health)`, `(Anchored)`: a tag line printed as text under the heading


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    return 0.9 if re.search(r"smooth\s+operations", f"{meta.get('title') or ''}\n{md_head}", re.I) else 0.0


def _gear_texts(bs):
    """A gear table's row takes the description of the level-3 section of its name (`Uniform` under `Uniform (Rating
    1-6)`) and the `Game Information` under it; the section then holds no rule of its own. A row wrapped onto the next
    (`Fashion … Rating x` + `Statement … 500¥`) is joined; a row with no name under a named one is another rating of
    it (`Transforming Garment` 1–2, then 3–4, 5–6): each is named with its rating."""
    base = None
    for i, b in enumerate(bs):
        if b.row is None or norm(b.chapter) != GEAR:
            continue
        rating = lambda x: next((v for h, v in x.row.items() if h.upper() == "RATING" and v), "")
        if b.name:
            base = (i, b.name)
        elif base and rating(b):
            j, n = base
            for k in {j, i}:
                if bs[k].name in (n, ""):
                    nm = f"{n} (Rating {rating(bs[k])})"
                    bs[k] = replace(bs[k], name=nm, row={**bs[k].row, bs[k].header[0]: nm})
    secs = {}
    for b in bs:
        if b.type == "section" and b.level == 3 and norm(b.chapter) == GEAR:
            for k in keys(b.name):
                secs.setdefault(k, b)
    out, taken, skip = [], {}, set()
    for i, b in enumerate(bs):
        if b.row is not None and norm(b.chapter) == GEAR:
            nxt = bs[i + 1] if i + 1 < len(bs) else None
            last = list(b.row)[-1]
            if nxt is not None and nxt.row is not None and nxt.header == b.header and re.search(r"(x|\+)\s*$", b.row[last]) \
                    and [v for v in list(nxt.row.values())[1:] if v] == [nxt.row[last]]:
                b = replace(b, name=f"{b.name} {nxt.name}", row={**b.row, list(b.row)[0]: f"{b.name} {nxt.name}",
                                                                last: f"{b.row[last]} {nxt.row[last]}"})
                skip.add(id(nxt))
            sec = next((secs[k] for k in keys(b.name) if k in secs), None)
            if sec is not None and not b.text.strip():
                taken[id(sec)] = sec
                more = [x.text.strip() for x in bs if x.type == "item" and x.section == sec.name and norm(x.name) == "game information"]
                b = replace(b, text="\n\n".join(t for t in [sec.text.strip(), *more] if t))
        if id(b) not in skip:
            out.append(b)
    names = {s.name for s in taken.values()}
    return [b for b in out if id(b) not in taken
            and not (b.type == "item" and norm(b.name) == "game information" and b.section in names)]


def fix(b, parent2):
    """A tag line printed as text under a spell's or ritual's heading as its tags (a spell's category its label, as the
    core rulebook's section names it); a face's section with its stat bands in its text as an archetype box; an
    alchemical preparation's `Cost: N¥/charge` as its row."""
    ch = norm(b.chapter)
    first = next((ln for ln in b.text.splitlines() if ln.strip()), "")
    if ch == MAGIC and b.type == "item" and (m := _TAG.fullmatch(first.strip())):
        b = replace(b, tags=m.group(1), text=b.text.replace(first, "", 1).strip())
    if ch == MAGIC and b.type == "item" and norm(b.tags) in catalog.SPELL_CATEGORIES:  # (or read as a level-5 tag line)
        b = replace(b, label=norm(b.tags), tags="")
    if ch == ARCHETYPES and "Metatype" in b.labels and (b.stats or "| B | A |" in b.text):  # (bands in a section's text)
        b = replace(catalog.text_stats(b, catalog.BEING), type="item", label=f"metatype: {b.labels['Metatype']}")
    if ch == MAGIC and norm(parent2) == "alchemical preps" and b.type == "item" and (c := b.labels.get("Cost")):
        m = re.fullmatch(r"(.+?)\s*/\s*(\w+)", c)
        b = replace(b, row={"ITEM": b.name, **({f"COST (PER {m.group(2).upper()})": m.group(1)} if m else {"COST": c})},
                    header=["ITEM", "COST"])
    return b


def kind(chapter, b, parent2):
    p2, labels = norm(parent2), {k.lower() for k in b.labels}
    if chapter == QUALITIES:
        if b.type == "section" and b.level == 3 and labels & {"cost", "bonus"}:
            return "qualities", "negative" if "bonus" in labels else "positive"
        return None, None
    if chapter == MAGIC and b.type == "item":
        if "threshold" in labels:
            return "rituals", None
        if p2 == "spells" and b.label in catalog.SPELL_CATEGORIES:
            return "spells", None
        if p2 == "adept powers" and "cost" in labels:
            return "adeptpowers", None
        if p2 == "metamagics":
            return "metamagics", None
        if p2 == "alchemical preps" and b.row is not None:
            return "gear", "alchemical-preps"
        return None, None
    if chapter == GEAR and b.row is not None:
        head = [h.upper() for h in b.header]
        if head[0] == "ARMOR MOD":
            return "armor", "armor-modifications"
        return "gear", "clothing" if head[0] == "OUTFIT" else slug(p2) or "gear"
    return None, None


def extract(regrouped, ctx=None):
    bs = _gear_texts(list(blocks(regrouped)))
    return catalog.read(bs, ctx, sys.modules[__name__])
