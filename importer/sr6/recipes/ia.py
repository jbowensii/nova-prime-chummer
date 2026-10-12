"""Shadowrun: Ingentis Athletes (IA), a Shadow Stock supplement on troll athletes -> the SR6 catalog: the athletes'
stat blocks as NPCs (group Ingentis Athletes; the book prints no Professional Rating), the one priced weapon an
athlete carries, and the game information's rule sections (the troll variants, their creation rules and qualities),
ids unscoped (run scopes them as ia.<slug>), descriptions in the private texts. The stat blocks print as bold text
lines, not tables: they are read line by line from the blocks' text. Reads only regrouped.md with the core rulebook's
reading (crb.extract). Layout notes in ia.md."""
import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6.recipes import crb, shapes
from importer.sr6.regroup import Block, blocks, norm

ID, NAME, PUBLISHER, CANON = "IA", "Shadowrun: Ingentis Athletes", "Catalyst Game Labs", True
BOOK = "Ingentis Athletes"
SHA256 = ("f45b7a6c422a8c4622d80cfa6ac6ce68042407fccbe26c35cd0e94fefe08eaf8",)  # the owner's copy
# headings in Njord (the guess takes the body's Sabon); 27 (Game Information) is too close to the page numbers (26)
HEADING_LEVELS = {74.0: 1, 15.0: 3, 13.0: 4}
HEADING_FONT = "Njord"
PAGE_OFFSET = 0  # printed page = PDF page
END_PAGE = None
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("game information",)
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
GROUP = "Ingentis Athletes"
_RUNNING = re.compile(r"(?m)^(?:\*\*PAGE\*\*|ingentis athletes|shadow stock|\d{1,2})$\n?")
_META = re.compile(r"\s*metatype:", re.I)  # a stat block's second line, under the athlete's name
_LABEL = re.compile(r"^\*\*([^*\n]+):\*\*\s*(.*)$")
# an NPC's weapon with its price (`10 x throwing ball [Throwing Weapon, DV 3S, 8/10/3/—/—, Avail 2, Cost 135¥]`)
_PRICED = re.compile(r"(?:(\d+) x )?([^\[\],]+?)\s*\[([^,\]]+), DV ([^,\]]+), ([^,\]]+), Avail ([^,\]]+), Cost ([^\]]+)\]")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"ingentis\s+athletes", hay, re.I) else 0.0


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    if b.stats and GROUP in b.section:
        return "npcs", None
    if b.row is not None:
        return "weapons", slug(b.label)
    return None, None


def _lines(body):
    """A stat block's labelled lines, each with the lines wrapped under it (a word hyphenated at a line's end joined)."""
    labels, last = {}, None
    for ln in body.splitlines():
        if m := _LABEL.match(ln.strip()):
            last = m.group(1).strip()
            labels[last] = m.group(2).strip()
        elif last and ln.strip():
            v = labels[last]
            hyphen = v.endswith("-") and ln[:1].islower()
            labels[last] = (v[:-1] + ln.strip()) if hyphen else f"{v} {ln.strip()}".strip()
    return labels


def _end(lines, i):
    """The line after the stat block whose `metatype:` line is lines[i]: its bands, labelled lines and their wrapped
    lines, the weapons' lines (`Name [stats]`, wrapped inside the brackets); it ends at a blank line, the next
    athlete's name, or a line after the weapons that opens no bracket (the commentary going on)."""
    j, weapons, depth = i + 1, False, 0
    while j < len(lines):
        ln = lines[j].strip()
        if not ln or j + 1 < len(lines) and _META.match(lines[j + 1]):
            break
        if weapons and not depth and "[" not in ln and not _LABEL.match(ln):
            break
        weapons = weapons or ln.startswith("**Weapons:**")
        depth = max(0, depth + ln.count("[") - ln.count("]"))
        j += 1
    return j


def athletes(b):
    """The stat blocks in a block's text (the athlete's name over a `metatype:` line, read as text lines) -> (NPC
    blocks, the priced weapons in them as weapons rows, the text without them)."""
    lines, npcs, rows, keep, i = b.text.split("\n"), [], [], [], 0
    while i < len(lines):
        if not (i + 1 < len(lines) and _META.match(lines[i + 1]) and lines[i].strip()):
            keep.append(lines[i])
            i += 1
            continue
        j = _end(lines, i + 1)
        row, body = shapes.text_bands("\n".join(lines[i + 2:j]))
        labels = _lines(body)
        npcs.append(Block(type="item", name=lines[i].strip(), chapter=b.chapter, section=f"Professional Rating: {GROUP}",
                          label="", page=b.page, stats=[row], labels=labels, text=lines[i + 1].strip(), level=4))
        for w in _PRICED.finditer(labels.get("Weapons", "")):
            n, name, cat, dv, ar, avail, cost = w.groups()
            name = name.strip().capitalize() + (f" ({n})" if n else "")  # `10 x throwing ball`: the price of ten
            cells = {"WEAPON": name, "DV": dv, "ATTACK RATINGS": ar, "AVAIL": avail, "COST": cost}
            rows.append(Block(type="item", name=name, chapter=b.chapter, section="", label=cat, page=b.page,
                              header=list(cells), row=cells, level=4))
        i = j
    return npcs, rows, "\n".join(keep).strip()


def prepare(bs):
    """The book's shapes as crb.extract reads them: the running head (`shadow stock`, `PAGE`, the title and the page
    number) out of the text; the athletes' stat blocks out of the commentary as NPCs (the bands and labelled lines read
    as text lines), a priced weapon in one as a weapons row; the blocks from `Troll Variants` on in the chapter Game
    Information (its title isn't a heading), the rest (the Shadow Stock commentary) in a chapter of its own."""
    out, chapter = [], "Shadow Stock"
    for b in bs:
        if norm(b.name) == "troll variants":
            chapter = "Game Information"
        b = replace(b, chapter=chapter, text=_RUNNING.sub("", b.text).strip())
        npcs, rows, text = athletes(b)
        out += [replace(b, text=text, labels={} if npcs else b.labels), *npcs, *rows]
    return out


def extract(regrouped, ctx=None):
    return crb.extract(prepare(blocks(regrouped)), ctx, book=sys.modules[__name__])
