"""Shadowrun: Wild Life (WL), the core critter book -> the SR6 catalog: the critters (one a stat box, its habitat the
category, the description of the section it sits in), the new critter powers (those the book's stat blocks list as a
weakness marked so), the critter gear and the rule sections, ids unscoped (run scopes them as wl.<slug>), descriptions
in the private texts. Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (crb.extract);
layout notes in wl.md. A line or value that doesn't read is reported, never guessed."""
import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6.recipes import crb
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "WL", "Shadowrun: Wild Life", "Catalyst Game Labs", True
BOOK = "Wild Life"
SHA256 = ("0c585f15c80c978d496e73b4ab91e25fcd7968704b631fd3aaba80de80be4905",)  # the owner's copy (latest)
PAGE_OFFSET = 1  # printed page = PDF page - 1
ALIASES = {}
NAME_HEADERS = frozenset({"GEAR"})  # the critter gear table: its rows are items (their text is a labelled line each)

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"critterpowers"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("living instincts", "grasslands and plains", "mountains", "forests", "swamps", "jungles and rainforests",
                 "savannas", "deserts", "polar regions", "oceans seas and lakes", "urban environments",
                 "on the care and feeding of critters")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("on the care and feeding of critters",)
POWERS = "on the care and feeding of critters"  # the chapter whose level-3 sections with a TYPE/ACTION band are powers
_BAND = {"B", "BOD", "A", "AGI"}


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"wild\s+life", hay, re.I) and re.search(r"critter", hay, re.I) else 0.0


def prepare_md(md):
    """book.md with a box title as an item heading when the box's bands run straight into another column's prose (a
    line in lower case that runs on to a heading, not to the box's labels: the trojan rat, whose labels print after the
    next box's garbled band): read as a table title, its bands and labels would go to the box before it."""
    lines = md.splitlines()
    for i, ln in enumerate(lines[:-1]):
        if (m := re.fullmatch(r"(##### )([a-z])(.*)", ln)) and lines[i + 1].startswith("| B | A |"):
            j = i + 1
            while j < len(lines) and lines[j].startswith("|"):
                j += 1
            k = next((k for k in range(j, len(lines)) if lines[k].startswith(("#", "**"))), len(lines))
            if j < len(lines) and lines[j][:1].islower() and k < len(lines) and lines[k].startswith("#"):
                lines[i] = m.group(1) + _cap(m.group(2) + m.group(3))
    return "\n".join(lines) + "\n"


def _being(b):
    return bool(b.stats) and any(h.upper() in _BAND for h in b.stats[0])


def _power_band(b):
    return next(((h, r) for h, r in crb._tables(b.text) if r and [x.upper() for x in h[:2]] == ["TYPE", "ACTION"]), None)


def _cap(name):
    """`young mongolian death worm` -> `Young Mongolian Death Worm` (a box title in lower case)."""
    return " ".join(w[:1].upper() + w[1:] for w in name.split()) if name == name.lower() else name


def _weaknesses(bs):
    """The names the stat blocks list as weaknesses (`Fragile 2`, `Vulnerability (Fire)` -> fragile, vulnerability)."""
    out = set()
    for b in bs:
        for k, v in b.labels.items():
            if k.lower() in ("weakness", "weaknesses"):
                out |= {norm(re.sub(r"\s*(\(.*|\d.*)$", "", w)) for w in re.split(r",\s*(?![^()]*\))", v) if w.strip()}
    return out - {""}


def _critters(bs):
    """A critter's box (lower-case title, a stat band) takes the text of its level-3 section: the one of its name (a
    box printed before its section, or in the one before), else the one it sits in (several boxes share it: young
    and behemoth); the section then holds no rule of its own. A section no box takes with a stat band in its text
    (the box's title read as a table title: `furfur` under `Furfur`) is the critter itself."""
    bs = list(bs)
    secs = {}
    for b in bs:
        if b.type == "section" and b.level == 3:
            secs.setdefault((b.chapter, norm(b.name)), b)
    owner = lambda b: next((k for k in ((b.chapter, norm(b.name)), (b.chapter, norm(b.section))) if k in secs), None)
    boxed = {owner(b) for b in bs if b.type == "item" and _being(b)}
    out, taken = [], set()
    for b in bs:
        if b.type == "section" and b.level == 3 and (b.chapter, norm(b.name)) not in boxed and "| B | A |" in b.text:
            b = replace(crb._text_stats(b, crb._BEING), type="item")  # its box's title lost: its bands in its text
            b = b if _being(b) else replace(b, type="section", stats=[])
        elif b.type == "item" and _being(b):
            sec = secs.get(owner(b))
            if sec is not None and sec.text.strip():
                taken.add(id(sec))
                b = replace(b, text="\n\n".join(t for t in (sec.text.strip(), b.text.strip()) if t))
            b = replace(b, name=_cap(b.name))
        out.append(b)
    return [b for b in out if id(b) not in taken]


_weak = set()  # the book's weaknesses, set by extract()


def fix(b, parent2):
    """A power's band read from its text, its WEAKNESS cell set when the stat blocks list it as a weakness."""
    if b.type == "section" and b.level == 3 and norm(b.chapter) == POWERS and _power_band(b):
        b = crb._text_stats(b, crb.HEADERS["critterpowers"])
        if norm(b.name) in _weak and b.stats:
            b = replace(b, stats=[{**b.stats[0], "WEAKNESS": "true"}] + b.stats[1:])
    return b


def kind(chapter, b, parent2):
    if b.type == "section":
        return ("critterpowers", None) if b.level == 3 and chapter == POWERS and b.stats else (None, None)
    if _being(b):
        return "critters", slug(b.chapter) or "critter"
    if b.row is not None and b.header and b.header[0].upper() == "GEAR" and chapter == POWERS:
        return "gear", "critter-gear"
    return None, None


def extract(regrouped, ctx=None):
    bs = _critters(blocks(regrouped))
    _weak.clear()
    _weak.update(_weaknesses(bs))  # ponytail: module state, fine for the one-book-at-a-time importer
    return crb.extract(bs, ctx, book=sys.modules[__name__])
