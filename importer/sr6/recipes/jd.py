"""Shadowrun: Johnson 'Dex (JD), a runner resource deck of Mr. Johnson cards -> the SR6 catalog: each Mr. Johnson as a
contact (archetype Mr. Johnson) with its stat block as an NPC (group Contact), and the deck's rules (gear level,
favors), ids unscoped (run scopes them as jd.<slug>), the bio, plot hooks and favors in the private texts. Reads only
regrouped.md with the core rulebook's reading (catalog.read). Layout notes in jd.md."""

import re
import sys
from dataclasses import replace

from importer.sr6 import catalog, shapes
from importer.sr6.regroup import Block, blocks, norm

ID, NAME, PUBLISHER, CANON = "JD", "Shadowrun: Johnson 'Dex", "Catalyst Game Labs", True
BOOK = "Johnson 'Dex"
SHA256 = ("d5859e35cfb4f98809911dec176934adc960eaa0627372ef746c76e243de2a95",)  # the owner's copy
PAGE_OFFSET = 0  # the cards print no page numbers: PDF pages
END_PAGE = 42  # PDF page: the back cover (credits, legal lines)
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("about this deck",)
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
_FOOT = re.compile(r"(?m)^SHADOWRUN: JOHNSON .DEX\s*$")
_LABELS = {"Active Skills": "Skills"}


def match(meta, md_head):
    """How well a book matches this recipe, 0 to 1."""
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"johnson\s*.\s*dex", hay, re.I) else 0.0


def kind(_chapter, b, _parent2):
    """(kind, category) of a block, else (None, None)."""
    return ("contacts", None) if b.stats and "Archetype" in b.labels else (None, None)


def _name(s):
    """A card's title as a name, a word at a time: `HERA ‘LEGS’ ANDERSON` -> `Hera ‘Legs’ Anderson`, `M c SWEENEY` ->
    `McSweeney`."""
    s = re.sub(r"\bM [cC] (?=\w)", "Mc", " ".join(s.split()))
    return " ".join(
        w.title() if w.isupper() or w.islower() else "Mc" + w[2:].title() if w[2:].isupper() else w for w in s.split()
    )


def prepare(bs):
    """One block a card: the front's title, metatype line and bio and the back's plot hooks, stat line, labelled stats
    (`Active Skills` as Skills) and favors, as a contact with the `Archetype` Mr. Johnson. The deck's own chapter (its
    rules) stays as printed; a card without a stat line too."""
    cards = {}
    for b in bs:
        cards.setdefault(b.chapter, []).append(replace(b, text=_FOOT.sub("", b.text).strip()))
    out = []
    for ch, g in cards.items():
        stats = next((x for x in g if shapes.text_bands(x.text)[0]), None)  # its `STATS` box, or the box it ran into
        row = shapes.text_bands(stats.text)[0] if stats else {}
        if not row:
            out += g
            continue
        front = g[0].text.splitlines()
        meta = front[0].strip() if front else ""
        parts = [g[0].text]
        for x in g[1:]:
            if not (x.text or x.labels) or x is stats and norm(x.name) == "stats" or norm(x.name) == "credits":
                continue
            # a box the stat lines ran into (`stats` in lower case, under the plot hooks): its own lines
            body = catalog.block_text(replace(x, text=shapes.text_bands(x.text)[1]))
            if meta:  # the back's metatype line, after the favors
                body = re.sub(r"\s+" + re.escape(meta) + r"\s*$", "", body, flags=re.I)
            parts.append(f"#### {x.name.title()}\n{body}")
        labels = {_LABELS.get(k, k): v for k, v in stats.labels.items()}
        out.append(
            Block(
                type="item",
                name=_name(ch),
                chapter=ch,
                section="",
                label="",
                page=g[0].page,
                stats=[row],
                labels={**labels, "Archetype": "Mr. Johnson"},
                text="\n\n".join(p for p in parts if p),
                level=4,
            )
        )
    return out


def extract(regrouped, ctx=None):
    """The catalog this recipe reads from a regrouped book."""
    return catalog.read(prepare(blocks(regrouped)), ctx, sys.modules[__name__])
