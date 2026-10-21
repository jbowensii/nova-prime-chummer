"""Shadowrun: Lofwyr's Legions (LL), a Saeder-Krupp sourcebook -> the SR6 catalog: its NPCs (the corporation's agents,
one a page), the drake qualities, the drake powers (critter powers), its martial art and the rule sections (drakes,
the initiatory group), ids unscoped (run scopes them as ll.<slug>), descriptions in the private texts. The book prints
no priced gear. Reads only regrouped.md with the core rulebook's reading (catalog.read). Layout notes in ll.md."""

import re
import sys
from dataclasses import replace

from importer.sr6 import catalog
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "LL", "Shadowrun: Lofwyr's Legions", "Catalyst Game Labs", True
BOOK = "Lofwyr's Legions"
SHA256 = ("43d095232bcad19d26de5c8683782dc9816e06344236c7fe098fcdc63663b175",)  # the owner's replaced copy
# chapter titles at 27 pt (the cover's at 72); the guess takes the running head (32) and page number (26) for levels
HEADING_LEVELS = {72.0: 1, 27.0: 1, 21.0: 2, 15.0: 3, 13.0: 4}
PAGE_OFFSET = 0  # printed page = PDF page
END_PAGE = None
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}  # (the echoes, programs and critter powers listed as run-ins: sections.py reads them in every book)
RULE_CHAPTERS = ("those who serve the dragon", "drakes", "new initiatory group", "new martial art")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
_RUNNING = re.compile(r"(?m)^(?:#### shadow stock|\*\*PAGE\*\*|LOFWYR'S(?: \d+)?|LEGIONS|shadow stock)$\n?")
_SPLIT = re.compile(r"(\w)- (\w)")  # a name hyphenated over two heading lines (`Saeder- Krupp`)
_PR = re.compile(r"(?im)^professional rating\s*(\d+)\s*$")


def match(meta, md_head):
    """How well this recipe fits the book: 1.0 by hash, 0.9 by title or opening text, else 0."""
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"lofwyr.?s\s+legions", hay, re.I) else 0.0


def kind(chapter, b, _parent2):
    """(kind, category) of a block, else (None, None)."""
    labels = {k.lower() for k in b.labels}
    if b.type == "section" and b.level == 3 and "professional rating" in norm(b.section):
        return "npcs", None
    if b.type == "item" and "cost" in labels and "qualities" in norm(b.section):
        return "qualities", "negative" if "negative" in norm(b.section) else "positive"
    if "martial art" in chapter and "Signature of" in b.labels:
        return "martialtechniques", None
    if "martial art" in chapter and "Signature Technique" in b.labels:
        return "martialarts", None
    return None, None


def _split_label(b):
    """A bold label hyphenated over two lines (`**Enhanced Sense (Thermographic Vi-**` + `**sion):**`) as one."""
    for k in [k for k in b.labels if k[:1].islower()]:
        if m := re.search(r"\*\*([^*\n]+)-\*\*\n(?:•\s*)?\*\*" + re.escape(k) + r":\*\*", b.text):
            b = replace(b, labels={(m.group(1) + k if x == k else x): v for x, v in b.labels.items()})
    return b


def prepare(bs):
    """The book's shapes as catalog.read reads them: a heading's word hyphenated over two lines joined, a bold label's
    too; the running head (`shadow stock`, `PAGE`, the title and page number) out of the text; an NPC's `Professional
    Rating N` line as the core rulebook's section form (its chapter the group); the martial art's `Categories` and its
    signature technique's name (before the first full stop) as labels, and the technique its line defines (the rest
    of the line) an entry of its own."""
    out = []
    for b in bs:
        b = _split_label(replace(b, name=_SPLIT.sub(r"\1-\2", b.name), text=_RUNNING.sub("", b.text).strip()))
        if b.type == "section" and b.level == 3 and (m := _PR.search(b.text)) and "| B |" in b.text:
            b = replace(b, section=f"Professional Rating {m.group(1)}: {b.chapter}")
        tech = None
        if "Signature Technique" in b.labels:
            labels = {("Category" if k == "Categories" else k): v for k, v in b.labels.items()}
            name, _, rest = labels["Signature Technique"].partition(".")
            labels["Signature Technique"] = name.strip()
            b = replace(b, labels=labels)  # its full line stays in the text (the bulleted copy)
            if rest.strip():  # (the line defines the technique too, `Rake. Increase the Damage Value …`: an entry)
                tech = replace(
                    b,
                    name=name.strip(),
                    level=b.level + 1,
                    text=rest.strip(),
                    labels={"Category": labels.get("Category", ""), "Signature of": b.name},
                )
        out += [b] + ([tech] if tech else [])
    return out


def extract(regrouped, ctx=None):
    """Read the book's regrouped blocks into a catalog Result."""
    return catalog.read(prepare(blocks(regrouped)), ctx, sys.modules[__name__])
