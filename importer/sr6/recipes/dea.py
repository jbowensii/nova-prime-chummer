"""Shadowrun: Deus Ex Arcana (DEA), the core advanced magical rulebook -> the SR6 catalog: spells, rituals, qualities
(the metagenic ones, the minor-talent sparks, gifts and curses, the quality-path steps), adept powers, metamagics,
mentor spirits, traditions, critter powers, critters and spirits, the magical materials (gear) and the rule sections,
ids unscoped (run scopes them as dea.<slug>), descriptions in the private texts. Reads only regrouped.md with the
core rulebook's reading (catalog.read), after prepare_md() sets the spells' band as a table; the rest of the
preparing is Street Wyrd's (sw.prepare: the book is its sequel and prints the same shapes). Layout notes in dea.md."""

import re
import sys

from dataclasses import replace

from importer.sr6 import catalog
from importer.sr6.recipes import sw
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "DEA", "Shadowrun: Deus Ex Arcana", "Catalyst Game Labs", True
BOOK = "Deus Ex Arcana"
SHA256 = ("806fe3bac049fcd10a03e4a4a4332bbbad9589a6ca1901ca25f4ec16ba092557",)  # the owner's copy
# the guess (layout.fonts) is right here: chapter titles 60 pt, then 21, 15, 13 and 11 (sidebar titles)
HEADING_LEVELS = {60.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 11.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 185  # PDF page: the back cover
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"adeptpowers", "metamagics", "traditions"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = (
    "do you believe in magic",
    "inheritors of power",
    "national powers",
    "locations of power",
    "arcana unleashed",
    "walking the magical path",
    "magical edge",
    "things of a mystical nature",
    "things that go bump in the night",
    "mystical shopping list",
)
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
SPELL_CATEGORIES = sw.SPELL_CATEGORIES

_BAND = re.compile(r"\*\*Range Type Duration DV( Damage)?\*\*$")
_HEAD, _TAG = re.compile(r"#{3,5} "), re.compile(r"\([^()]{2,60}\)$|(?:Cost|Bonus): .+")
_TITLE = re.compile(r"[a-z][a-z’' -]+$")
_POWER = re.compile(r"\*\*Type Action Range Duration\*\*$")
_POWER_ROW = re.compile(r"([PM]) (\w+) (\w+) (\w+)$")
_NEW_QUALITY = re.compile(r"New Quality: (.+)$")
# headings the book sets in capitals or lower case (a box's title, not an entry) and
# a path named for a Mentor Spirit (its steps would read as mentor spirits: the hyphen keeps them path steps)
_RETITLE = {
    "#### THE RED BEAR": "#### The Red Bear",
    "#### ukkru cost": "#### Ukkru cost",
    "#### toxic red bear": "#### Toxic Red Bear",
    "#### lemur as a mentor spirit": "#### Lemur",
    "### HARDENED WILL": "### Hardened Will",
    "### Path of Attaining a Mentor Spirit": "### Quality Path: Path of Attaining a Mentor-Spirit",
    "### Path of the Familiar": "### Quality Path: Path of the Familiar",
    "#### Sensory Ranges of Detection Spells": "#### Sensory Ranges of Detection",
}
# a cost table's title -> what its rows' sizes are the sizes of (`ukkru cost`: `Ukkru Small (knife, …)`)
_SIZED = {"#### Ukkru cost": "Ukkru", "#### Fool’s mithril cost": "Fool's mithril"}
_ROW = re.compile(r"(LOS ?\(A\)|LOS|Touch|Self|T) ([MP]) (\w) (\d+)(?: (.+))?$")


def match(meta, md_head):
    """How well this recipe fits the book: 1.0 by hash, 0.9 by title or opening text, else 0."""
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"deus\s+ex\s+arcana", hay, re.I) else 0.0


def _stat_block_below(lines, i):
    """Whether a being's attribute band (`| B | A | R | …`) is printed before the next heading."""
    for ln in lines[i + 1 :]:
        if ln.startswith("#"):
            return False
        if ln.startswith("| B | A | R"):
            return True
    return False


def prepare_md(md):
    """book.md with a tag line (`(Manipulation)`, `Cost: 4 Karma`) under a heading set as a level-5 heading, a spell's
    band (a bold `Range Type Duration DV` line over `LOS (A) P S 3` lines) and a critter power's (`Type Action Range
    Duration`) set as the table the regroup reads, and the layout slips named below put right. A spell duration printed
    as the digit 5 is the sustained S (the only digit the column can't hold)."""
    out, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        if _TAG.match(lines[i]) and out and _HEAD.match(out[-1]):  # a tag or `Cost:` line right under a heading
            out.append(f"##### {lines[i]}")  # (SW's are set in a small face: the converter reads them as headings)
            i += 1
            continue
        if (
            lines[i] == "Advantages"
        ):  # a mentor spirit's part, set as a heading in its box (Lemur's: reads as the others)
            out.append("##### Advantages")
            i += 1
            continue
        ln = _RETITLE.get(lines[i], lines[i])
        if ln != lines[i] or (nq := _NEW_QUALITY.match(lines[i])):  # (`New Quality: Brumeur` is a line, not a heading)
            out.append(ln if ln != lines[i] else f"#### {nq.group(1)}")
            i += 1
            continue
        if lines[i].startswith("| ") and "COST ¥" in lines[i]:  # a cost column's currency mark
            lines[i] = lines[i].replace("COST ¥", "COST")
            if out and (who := _SIZED.get(out[-1])):  # its rows are the sizes: name them (`Ukkru Small (…)`)
                lines[i] = lines[i].replace("SIZE", "NAME")
                for j in range(i + 2, len(lines)):
                    if not lines[j].startswith("| "):
                        break
                    lines[j] = f"| {who} {lines[j][2:]}"
        if lines[i].startswith("### ") and _stat_block_below(
            lines, i
        ):  # a creature: its box pairs with an item heading
            out.append(f"#{lines[i]}")
            i += 1
            continue
        if (
            lines[i].startswith("### ")
            and i + 2 < len(lines)
            and re.match(r"\((Combat|Detection|Health|Illusion|Manipulation)\)$", lines[i + 1])
            and _BAND.match(lines[i + 2])
        ):  # a spell set a level too high (the Communication Spells): an entry like the others
            out.append(f"#{lines[i]}")
            i += 1
            continue
        if _POWER.match(lines[i]) and i + 1 < len(lines) and (r := _POWER_ROW.match(lines[i + 1])):
            out += [
                "",
                "| TYPE | ACTION | RANGE | DURATION |",
                "|---|---|---|---|",
                "| " + " | ".join(r.groups()) + " |",
                "",
            ]
            i += 2
            continue
        if _TITLE.match(lines[i]) and lines[i + 1 : i + 2] and lines[i + 1].startswith("| B | A | R"):
            out.append(f"##### {lines[i]}")  # a being's box title, set as a line: a heading, as the box titles are
            i += 1
            continue
        m = _BAND.match(lines[i])
        rows = []
        while m and i + 1 + len(rows) < len(lines) and (r := _ROW.match(lines[i + 1 + len(rows)])):
            rows.append(r)
        if not rows:
            out.append(lines[i])
            i += 1
            continue
        head = ["RANGE", "TYPE", "DURATION", "DV"] + (["DAMAGE"] if m.group(1) else [])
        # one spell printed with a band row per range (`Mind Jammer`: Touch, LOS (A)) is a spell each, as Commlink6 has
        # it: the heading and tag again for each (regroup gives the text to the last of such items)
        many = len(rows) > 1 and len(out) > 1 and out[-1].startswith("##### (") and out[-2].startswith("####")
        tag, name = (out.pop(), out.pop().lstrip("# ")) if many else ("", "")
        for r in rows:
            rng, typ, dur, dv, dmg = r.groups()
            cells = [re.sub(r"\s*\(A\)", " (A)", rng), typ, "S" if dur == "5" else dur, dv] + (
                [dmg or ""] if m.group(1) else []
            )
            if many:
                out += [f"#### {name}, {rng.split(' ')[0].split('(')[0]}", tag]
            out += ["", "| " + " | ".join(head) + " |", "|" + "---|" * len(head), "| " + " | ".join(cells) + " |"]
        out.append("")
        i += 1 + len(rows)
    return "\n".join(out)


def prepare(bs):
    """Street Wyrd's preparing, then a quality path's step (`(5 Karma)` as its tag) given its Cost."""
    out = []
    for b in sw.prepare(bs):
        if b.type == "item" and b.level == 4 and re.fullmatch(r"\d+ Karma(?:, .*)?", b.tags or "") and not b.labels:
            b = replace(b, labels={"Cost": b.tags.split(",")[0]}, tags="")
        out.append(b)
    return out


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None): Street Wyrd's, with this book's other places for the same
    things (its spells in any chapter, rituals, adept powers and metamagics under their own headings)."""
    sec, p2, labels = norm(b.section), norm(parent2), {k.lower() for k in b.labels}
    heads = {h.upper() for s in b.stats for h in s}
    if b.row is not None and b.header and "DV GZ" in {h.upper() for h in b.header}:
        return "weapons", "grenades"
    if b.type == "item" and b.stats and {"RANGE", "DURATION", "DV"} <= heads:
        cat = next((c for c in SPELL_CATEGORIES if c in norm(b.tags).split()), None)
        return "spells", cat
    if b.type == "item" and b.level == 4 and "cost" in labels and "locations of power" in chapter:
        return "qualities", "positive"  # (Brumeur: `New Quality:` in a place's section)
    if b.type == "item" and "threshold" in labels:
        return "rituals", None
    if b.type == "item" and {"cost", "activation"} <= labels and "adept powers" in sec:
        return "adeptpowers", None
    if b.type == "item" and b.level == 4 and "toxic metamagics" in sec:
        return "metamagics", None
    if b.type == "item" and b.level == 4 and "toxic magic traditions" in sec:
        return "traditions", None
    if b.type == "section" and b.level == 3 and "gifts and curses" in p2 and {"cost", "bonus"} & labels:
        return "qualities", "negative" if "bonus" in labels else "positive"
    if b.type == "item" and b.level == 4 and "path of" in sec and "cost" in labels:
        return "qualities", "positive"
    if b.type == "item" and b.stats and {"B", "A", "R"} <= heads:
        if "spirit" in norm(b.tags) or "spirits" in sec:
            return "spirits", "toxic" if "toxic" in norm(b.tags + sec) else "shadow"
        return "critters", "critter"
    return sw.kind(chapter, b, parent2)


def extract(regrouped, ctx=None):
    """Read the book's regrouped blocks into a catalog Result."""
    return catalog.read(prepare(blocks(regrouped)), ctx, sys.modules[__name__])
