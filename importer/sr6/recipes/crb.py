"""Shadowrun, Sixth World Core Rulebook (CRB) -> the SR6 catalog: one <kind>.xml per kind (ids unscoped; run scopes them
as crb.<slug>) and the private texts. Reads only regrouped.md (importer/sr6/regroup.py) with the shared catalog reading
(importer/sr6/catalog.py, which every SR6 recipe reads through); layout notes in crb.md.

Each block maps to a kind by SECTIONS (chapter, then its table's first header, label, section or level-2 section) and
its values by catalog.HEADERS (printed column or label -> attribute). Values stay as printed: a lone dash becomes "—",
costs lose "¥" and thousands commas, a value off its column's pattern is kept and reported (book-value). A block that
maps nowhere is a rule section if it has no row or stat box (rule chapters only), else it is reported (unmapped). The
priority and metatype tables are rule tables in regroup's output: they are read from any block's text (or a catalog
row) by their first header. The archetypes chapter's sample characters become SR6 runner files (Result.samples,
importer/sr6/archetypes.py)."""

import json
import os
import re
import sys

from importer.sr6 import catalog
from importer.sr6.recipes import crb_city
from importer.sr6.catalog import NAME_HEADERS  # pylint: disable=unused-import  # (the recipe's own: regroup reads it)

ID, NAME, PUBLISHER, CANON = "CRB", "Shadowrun, Sixth World Core Rulebook", "Catalyst Game Labs", True
SHA256 = (
    "15067e02c99c750f30cd94de95bbcc3c08497a2cf637a53d206761ef0cea18e3",  # the owner's 2019 printing
    # the City Editions (the same pages 1-321, then a chapter on the city): Hong Kong (2025), Seattle (2021), Berlin
    # (2023)
    "7c3a1cfdcd80f9a5ef6a7f4b3fb115b4a699e1fd48810683b33af2a06ccb05a6",
    "d44bc23010d8f0c6a9b67a8f9646e293a35240d467c544dbcfe1cfe294c7fec5",
    "6ebaedbde953f3bebe3c51ceab0dd265f924d0c1dc1a7c815d26b7471a124c6f",
)
# the printings, each with the month it was published (sources.xml's CRB, CRB-SEA, CRB-BER, CRB-HK): of several
# imported, the CURRENT one (the owner: the Current Printing, whatever a City Edition is dated) is loaded, else the one
# published last (run.py), and a printing whose PDF carries no date is dated by it (resolve.py: an
# errata older than the printing never overrides it); each City Edition's city chapter is a source of its own and loads
# from its own printing regardless
PRINTINGS = {
    SHA256[0]: ("2019-08", "Current Printing (CAT28000, 2019)"),
    SHA256[2]: ("2021-09", "City Edition Seattle (CAT28000S, 2021)"),
    SHA256[3]: ("2023-06", "City Edition Berlin (CAT28000B, 2023)"),
    SHA256[1]: ("2025-03", "City Edition Hong Kong (CAT28000H, 2025)"),
}
CURRENT = (
    SHA256[0],
    # the printings that outrank every other (recipes.printing): values come from the Current Printing, the City
    # Editions only fill what it leaves out
)
# heading sizes -> levels (layout.fonts' guess takes the Hong Kong and Berlin chapters' 27 pt titles for a level)
HEADING_LEVELS = {60.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 305  # PDF page: the index and the reprinted tables start here (left out)
# the book's spelling differences between a table row and its description heading (norm form -> norm form; names only)
with open(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "crb_aliases.json"), encoding="utf8"
) as _f:
    ALIASES = json.load(_f)

# (chapter key, context key, kind, category), first match wins. The chapter key is a substring of the block's chapter,
# the context key of its context (all in norm form; "" is any): for a table row, the table's first header and its
# title (a key starting with "|": the whole header row); for any other block, its label, its section, its level-2
# section and the item heading it is under (one ending in "Spells"). A level-3 section block maps only to
# SECTION_KINDS (with its level-2 section as context). category: a string, or None for the slug of the table title
# (else the first header, else the section). Kind "skip": a reprint or a table that is no kind, left out unreported.
SECTIONS = [
    ("gear", "|vehicle similar models", "skip", None),  # a list of look-alike vehicles, not a stat table
    ("gear", "bone lacing", "skip", None),  # the lacing's game effects (its price row is in bodyware)
    ("gear", "cyber implant weapon", "augmentations", None),  # the implants' prices; their attacks are weapons
    ("gear", "ammo", "gear", None),  # ammunition (its table title names weapons)
    ("gear", "weapon", "weapons", None),
    ("gear", "grenades", "weapons", None),
    ("gear", "clothes", "armor", None),
    ("gear", "helmets", "armor", None),
    ("gear", "armor", "armor", None),
    ("gear", "device", "electronics", None),
    ("gear", "commlink", "electronics", None),
    ("gear", "cyberdeck", "electronics", None),
    ("gear", "bioware", "augmentations", None),
    ("gear", "cyberjack", "augmentations", None),
    ("gear", "headware", "augmentations", None),
    ("gear", "eyeware", "augmentations", None),
    ("gear", "earware", "augmentations", None),
    ("gear", "bodyware", "augmentations", None),
    ("gear", "cyberlimb", "augmentations", None),
    ("gear", "cyberware", "augmentations", None),
    ("gear", "accessories", "gear", None),  # electronics accessories (weapon accessories are "weapon accessories")
    ("gear", "vehicle modification", "gear", None),
    ("gear", "vehicle", "vehicles", None),
    ("gear", "bikes", "vehicles", None),
    ("gear", "cars", "vehicles", None),
    ("gear", "trucks", "vehicles", None),
    ("gear", "boats", "vehicles", None),
    ("gear", "submarines", "vehicles", None),
    ("gear", "aircraft", "vehicles", None),
    ("gear", "rotorcraft", "vehicles", None),
    ("gear", "vtol", "vehicles", None),
    ("gear", "drone", "vehicles", None),
    ("gear", "", "gear", None),
    ("game concepts", "lifestyle", "lifestyles", None),
    ("magic", "formula", "gear", None),  # the formulae table (the magic chapter's copy adds the ritual formula)
    ("magic", "ritual", "rituals", None),
    ("magic", "adept power", "adeptpowers", None),
    ("magic", "metamagic", "metamagics", None),
    ("magic", "spirit", "spirits", "spirit"),
    ("magic", "spell", "spells", None),
    ("matrix", "commlink", "skip", None),  # the gear chapter's tables reprinted
    ("matrix", "cyberdeck", "skip", None),
    ("matrix", "|cyberjack", "skip", None),  # (the City Editions: the table, not the section's rules)
    ("matrix", "complex form", "complexforms", None),
    ("matrix", "sprite", "sprites", None),
    ("wild life", "professional rating", "npcs", None),
    ("wild life", "sample contact", "contacts", None),
    ("wild life", "power", "critterpowers", None),
    ("wild life", "", "critters", "critter"),
    ("character creation", "positive", "qualities", "positive"),
    ("character creation", "negative", "qualities", "negative"),
    ("skills", "", "skills", None),
    ("archetypes", "", "skip", None),  # the sample runners are read apart (archetypes.py); the rest is no kind
]
SECTION_KINDS = {"skills", "rituals", "lifestyles", "critterpowers"}  # level-3 section blocks in this book
# a section (or item heading) whose labelled lines are each an entry (name: the label; text: its value, or its paragraph
# in the block's text when that is longer): kind, or (kind, attributes)
LABEL_SECTIONS = {}  # (the echoes, programs and critter powers listed as run-ins: sections.py reads them in every book)
# chapters whose unmapped sections (and level-4 headings with no row or box) are rule sections
RULE_CHAPTERS = (
    "game concepts",
    "character creation",
    "skills",
    "combat",
    "magic",
    "matrix",
    "rigging",
    "wild life",
    "running the game",
    "gear",
)
ATTRIBUTE_CHAPTERS = ("game concepts", "character creation")
CATALOG_CHAPTERS = ("gear",)  # a table row there with a name header is a catalog item: reported when it maps nowhere
BOOK = "the Shadowrun 6 core rulebook"


def match(meta, md_head):
    """How well a book fits this recipe: 1.0 by its hash, 0.9 for the Sixth World Core Rulebook, else 0.0."""
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"sixth\s+world", hay, re.I) and re.search(r"core\s+rulebook", hay, re.I) else 0.0


def extract(regrouped, ctx=None):
    """The core rulebook through the shared catalog reading (catalog.read) with this module's tables."""
    return catalog.read(regrouped, ctx, sys.modules[__name__])


def extra(md, sha):
    """A City Edition's city chapter as a source of its own (crb_city.py; run.py writes Result.extra)."""
    return crb_city.extra(md, sha)
