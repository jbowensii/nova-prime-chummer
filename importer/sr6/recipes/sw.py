"""Shadowrun: Street Wyrd (SW), the core magic rulebook -> the SR6 catalog: spells, adept powers, metamagics (the
initiate's and the adept's), traditions, preparations and a focus (gear), spirits and the insect spirits, critter
(spirit) powers, qualities and the rule sections (spell design, free and ally spirits, triggers, magical groups,
mentor spirits, blood magic, mana ebbs: no catalog kind of their own), ids unscoped (run scopes them as sw.<slug>),
descriptions in the private texts. Reads only regrouped.md with the core rulebook's reading (crb.extract); its few
boxes through importer/sr6/recipes/shapes.py. Layout notes in sw.md."""
import re
import sys
from dataclasses import replace

from importer.sr6.recipes import crb, shapes
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "SW", "Shadowrun: Street Wyrd", "Catalyst Game Labs", True
BOOK = "Street Wyrd"
SHA256 = ("84b0f67bb9347cb8477f636e331d477bea00302ecd50ff98f6e03cef778282c8",)  # the owner's copy
# chapter titles at 56 and 60 pt (the guess takes only 60 for a level), the fiction's at 27
HEADING_LEVELS = {60.0: 1, 56.0: 1, 27.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 169  # PDF page: the back cover
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"adeptpowers", "metamagics", "traditions"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("state of the arts", "the tome of now", "elements of magic", "a congress of spirits", "force and grace",
                 "imbuing magic", "seeing and believing", "rungs of power", "conclaves and covens", "toil and trouble",
                 "appendix")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
METAMAGIC_GROUPS = ("astral metaplanar studies", "practical conjuration", "apotropaic magic", "school of enchanting",
                    "applied thaumaturgy")
_LEVELS = re.compile(r"(\d+)\s+levels?\s+maximum", re.I)
_NEW = re.compile(r"^New Metamagic:\s*(.+)$")
_TAGS = re.compile(r"(?:\([^()]*\)\s*)+")
_PER = re.compile(r"^\s*([\d,]+)\s*¥?\s*/\s*(\w+)\s*$")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"street\s+wyrd", hay, re.I) else 0.0


def _heads(b):
    return {h.upper() for s in b.stats for h in s}


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    p2, sec, labels = norm(parent2), norm(b.section), {k.lower() for k in b.labels}
    if b.row is not None:
        head = {h.upper() for h in b.header}
        return ("gear", "preparations") if "preparations" in sec else ("gear", shapes.category(b, parent2) or "gear") \
            if head & shapes.PRICE else (None, None)
    if b.type == "section":
        if b.level == 3 and "force and grace" in chapter and "cost" in labels and "activation" in labels:
            return "adeptpowers", None
        if b.level == 3 and (p2 == "adept metamagics" or _NEW.match(b.name)):
            return ("metamagics", None) if p2 != "adept metamagics" or "finding your way" != norm(b.name) else (None, None)
        if b.tags == "tradition":
            return "traditions", None
        return None, None
    if b.tags == "tradition":
        return "traditions", None
    if {"cost", "bonus"} & labels and "qualit" in sec and b.level == 4:
        return "qualities", "negative" if "bonus" in labels else "positive"
    if b.stats and {"RANGE", "DURATION"} <= _heads(b) and "DV" in _heads(b):
        return "spells", None
    if b.stats and {"TYPE", "ACTION"} <= _heads(b):
        return "critterpowers", None
    if "rungs of power" in chapter and b.level == 4 and sec in METAMAGIC_GROUPS and b.text.strip() and not b.stats:
        return "metamagics", None
    if ("a congress of spirits" in chapter or "toil and trouble" in chapter) and (b.stats or "B | A | R" in b.text) \
            and ("skills" in labels or "powers" in labels):
        return "spirits", "blood" if "blood" in norm(b.name) else "insect" if "toil and trouble" in chapter else "spirit"
    return None, None


def prepare(bs):
    """The book's shapes as crb.extract reads them: boxes (shapes.boxes); a `Game Information` block's text joins the
    item above it (a metamagic's rules); a spell's category from its tags (`Direct Combat, Blood`) when its section
    names none; a quality's `(Bonus: 3 Karma per level, 5 levels maximum)` tag line as its label and levels; a
    preparation's `Cost:` line as its row; a spirit box named by its title; `New Metamagic: Sacrifice` as
    `Sacrifice`; the traditions (SEEING AND BELIEVING's level-4 headings, or a level-3 `… Tradition(s)` with none under
    it; the insect tradition) tagged `tradition`."""
    bs = list(shapes.boxes(bs))
    out = []
    for i, b in enumerate(bs):
        ch, sec = norm(b.chapter), norm(b.section)
        if b.type == "item" and b.level == 5 and norm(b.name) == "game information" and out and not b.stats:
            out[-1] = replace(out[-1], text="\n\n".join(t for t in (out[-1].text.strip(), b.text.strip()) if t))
            continue
        prev = out[-1] if out else None
        if b.type == "item" and _TAGS.fullmatch(b.name) and prev is not None and prev.type == "item" \
                and not prev.text.strip() and not prev.stats:  # `Energy Drain` over `(Karma) (Free)`
            *more, tags = re.findall(r"\(([^()]*)\)", b.name)
            out[-1] = replace(b, name=" ".join([prev.name] + [f"({m})" for m in more]), tags=tags, level=prev.level)
            continue
        if "preparations" in sec and (m := _PER.match(b.labels.get("Cost", ""))):  # `450¥/charge`
            b = replace(b, labels={**b.labels, "Cost": f"{m.group(1)} per {m.group(2)}"})
        if b.stats and {"RANGE", "DURATION"} <= _heads(b):
            words = norm(b.tags).split()
            cat = next((c for c in SPELL_CATEGORIES if c in words), None)
            if cat and not any(c in norm(b.section).split() for c in SPELL_CATEGORIES):
                b = replace(b, section=f"{b.section} ({cat.title()})")
        if b.tags.lower().startswith(("bonus:", "cost:")) and not b.labels:
            k, _, v = b.tags.partition(":")
            m = _LEVELS.search(v)
            b = replace(b, labels={k.strip().title(): v.strip(" ,")}, tags="",
                        name=f"{b.name} (1 to {m.group(1)})" if m else b.name)
        if "preparations" in sec and b.type == "item" and b.level == 4 and (cost := b.labels.get("Cost")):
            row = {"ITEM": b.name, "COST": cost}
            b = replace(b, row=row, header=list(row), labels={k: v for k, v in b.labels.items() if k != "Cost"})
        if b.type == "item" and b.stats and b.name[:1].islower() or b.name.endswith(" spirits"):
            b = replace(b, name=b.name.title() if b.stats else b.name)
        if m := _NEW.match(b.name):
            b = replace(b, name=m.group(1))
        if b.stats and norm(b.name).endswith(" stats"):  # `Blood Spirit Stats`
            b = replace(b, name=b.name[:-len(" stats")].strip())
        if _tradition(bs, i, b):
            b = replace(b, tags="tradition")
        out.append(b)
    return out


def _tradition(bs, i, b):
    ch, sec = norm(b.chapter), norm(b.section)
    if b.type == "section" and b.level == 3 and norm(b.name) == "insect tradition":
        return True
    if "seeing and believing" not in ch or "qualit" in sec or "qualit" in norm(b.name) or b.stats or b.row:
        return False
    if b.type == "item" and b.level == 4:  # (a lower-case title is a box: the recommended qualities)
        return bool(b.text.strip()) and b.name[:1].isupper() and not ({"cost", "bonus"} & {k.lower() for k in b.labels})
    if b.type == "section" and b.level == 3 and "tradition" in norm(b.name):
        nxt = next((d for d in bs[i + 1:] if d.type == "section" or d.level == 4 and "qualit" not in norm(d.name)), None)
        return nxt is None or nxt.type == "section"
    return False


def extract(regrouped, ctx=None):
    return crb.extract(prepare(blocks(regrouped)), ctx, book=sys.modules[__name__])
