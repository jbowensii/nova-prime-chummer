"""Shadowrun: Astral Ways (AW), the metaplanes setting book -> the SR6 catalog: its spirits (the elemental denizens, the
dinosaur spirits of beasts, the toxic conductors), critters (chimeras, golems, toxic horrors), NPCs (Professional
Rating stat blocks), the airships and their weapons, the astral devices (shadow cloak, sextant, maps, amulets), the
encounter suits, the new spell, ritual, critter power and metamagic, and the rule sections (each chapter's Game
Information and the techniques of travel: no catalog kind of their own), ids unscoped (run scopes them as aw.<slug>),
descriptions in the private texts. Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading
(crb.extract); layout notes in aw.md.

A being prints as a level-4 heading with a tag line (`(Fire, Force 4)`, `(Professional Rating 5)`), its description,
then a level-5 box (often titled in lower case) with its stat band: the box takes the heading's tag and text. A being
whose box has no band is reported, never guessed."""
import re
import sys
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.recipes import crb, ts
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "AW", "Shadowrun: Astral Ways", "Catalyst Game Labs", True
BOOK = "Astral Ways"
SHA256 = ("22a1ea35df2f5c66fbd9a330b37b319df65c6fcd2437fe6d4d99ec761f3ce420",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 184  # PDF page: the index starts here (left out)
ALIASES = {}
# first header cells that make a table a catalog (its rows are items even when no description pairs)
NAME_HEADERS = frozenset({"TYPE", "WEAPON"})

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("",)  # any chapter: kind() leaves out the setting (RULE_PARTS)
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ()
# where the rules are: a chapter's level-2 sections of these names, and the techniques of travel
RULE_PARTS = ("game information", "translation of characters to the elemental planes")
RULE_BOOK_CHAPTERS = ("techniques of travel",)
# printed header -> the core rulebook's (crb.HEADERS)
RENAME = {"HAND": "HANDLING", "SPD INT": "SPEED INTERVAL", "TOP SPD": "TOP SPEED", "BOD": "BODY", "ACC": "ACCEL",
          "INT": "SPEED INTERVAL", "SPD": "TOP SPEED", "ARM": "ARMOR", "PIL": "PILOT", "SENS": "SENSOR", "SEAT": "SEATS",
          "FORCE": "RATING", "BONDING COST": "BONDING COST (IN KARMA)", "DEFENSIVE RATING": "DEFENSE RATING"}
PROSE = {"SKILL"}  # an airship weapon's skill: to the text
_BAND = {"B", "BOD"}
_RATING = re.compile(r"professional rating\s*(\d+)", re.I)
_FORCE = re.compile(r"\bforce\s*\d+", re.I)
_QUALITY = re.compile(r"(Positive|Negative)\b[^:]*\bQuality:\s*(.+)", re.I)


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"astral\s+ways", hay, re.I) else 0.0


def _words(name):
    return {w[:-1] if w.endswith("s") else w for w in norm(name).split()}


def _banded(b):
    return any(_BAND & {h.upper() for h in s} for s in b.stats) or \
        any(_BAND & {h.upper() for h in t[0]} for t in crb._tables(b.text))


def _with_band(b):
    """A box's band printed as a bold header over a value line (`**B A R S W L I C M ESS**`) as its stat band."""
    if b.stats or not (bd := ts.band(b.text)):
        return b
    b = crb._text_stats(b, crb.HEADERS["npcs"])
    return replace(b, stats=bd + b.stats)


def _prep(bs, report):
    """A being's heading (its tag line) and its box -> one block (the box's band, the heading's name, tag and text); a
    tagged being with no band is reported. The new metamagic's section (`New Metamagic: X`) and its `Prerequisite: …`
    heading -> one item; a critter power's stat row (`M | Major …`, named by its table's title) takes its heading."""
    out, part = [], ""
    for b in bs:
        part = b.name if b.type == "section" and b.level <= 2 else part
        prev = out[-1] if out else None
        if b.type == "item" and b.level == 5 and b.row is None and prev is not None and prev.type == "item" \
                and prev.level == 4 and prev.row is None and not prev.stats and _words(b.name) <= _words(prev.name) | {""}:
            b = replace(b, name=prev.name, level=4, tags=prev.tags or b.tags, labels={**prev.labels, **b.labels},
                        text="\n\n".join(t for t in (prev.text.strip(), b.text.strip()) if t))
            out.pop()
            prev = out[-1] if out else None
        if prev is not None and prev.type == "section" and (m := re.match(r"new metamagic:\s*(.+)", prev.name, re.I)) \
                and b.type == "item" and b.name.lower().startswith("prerequisite:"):
            out[-1] = replace(b, name=m.group(1), level=4, labels={"Prerequisite": b.name.split(":", 1)[1].strip()},
                              label="metamagic")
            continue
        if b.row is not None and [h.upper() for h in b.header[:2]] == ["TYPE", "ACTION"] and b.label:
            name = re.sub(r"\s*critter power$", "", b.label, flags=re.I)
            head = next((i for i, x in enumerate(out) if x.type == "item" and norm(x.name) == norm(b.label)), None)
            text = out.pop(head).text if head is not None else ""
            b = replace(b, name=name, row=None, header=[], stats=[dict(list(b.row.items()))], text=text, label="critter power")
        if b.type == "item" and b.name[:1].islower():
            b = replace(b, name=b.name[:1].upper() + b.name[1:])
        if b.type == "section" and (m := _QUALITY.fullmatch(b.name)):  # `Negative Metagenetic Quality: Saurian`
            b = replace(b, name=m.group(2), label=f"{m.group(1).lower()} quality")
        out.append(_with_band(b) if b.type == "item" and b.row is None else b)
    for b in out:
        if b.type == "item" and b.row is None and not _banded(b) and any(re.search(r"\bB A\b", " ".join(s)) for s in b.stats):
            report.append({"kind": "missing-value", "file": "critters.xml", "name": b.name, "field": "stats",
                           "page": max(1, b.page - PAGE_OFFSET)})  # a band whose headers print run together
        if b.type == "item" and b.row is None and (_RATING.search(b.tags) or _FORCE.search(b.tags)) and not _banded(b):
            report.append({"kind": "missing-value", "file": "npcs.xml" if _RATING.search(b.tags) else "spirits.xml",
                           "name": b.name, "field": "stats", "page": max(1, b.page - PAGE_OFFSET)})
    return [b for b in out if not (b.type == "item" and b.row is None and (_RATING.search(b.tags) or _FORCE.search(b.tags))
                                   and not _banded(b))]


def fix(b, parent2):
    """Printed headers renamed to the core rulebook's (a column with no attribute to the text); an NPC's
    `(Professional Rating N)` tag as the core rulebook's section form; a spell's category in its label."""
    if (m := _RATING.search(b.tags)) and b.row is None:
        b = replace(b, section=f"Professional Rating {m.group(1)}: {b.section}")
    if m := re.search(r"(\w+) spell", b.tags, re.I):
        b = replace(b, label=f"{m.group(1).lower()} spells")
    if b.row is None:
        return b
    labels, row = dict(b.labels), {}
    for i, (h, v) in enumerate(b.row.items()):
        if i and h.upper() in PROSE:
            if v and v != "—":
                labels.setdefault(h.capitalize(), v)
        else:
            row[RENAME.get(h.upper(), h) if i else h] = v
    return replace(b, row=row, header=list(row), labels=labels)


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None) (a rule section where the book has rules, else left out)."""
    if b.label == "metamagic":
        return "metamagics", None
    if b.label == "critter power":
        return "critterpowers", None
    if b.label.endswith(" quality"):
        return "qualities", b.label.split()[0]
    if re.search(r"\bspell$", b.tags, re.I):
        return "spells", None
    if b.type == "item" and re.search(r"\britual$", b.name, re.I) and "threshold" in {k.lower() for k in b.labels}:
        return "rituals", None
    if b.row is not None and b.header:
        head = {h.upper() for h in b.header}
        if "HANDLING" in head:
            return "vehicles", "airships" if "AVAIL" in head else "motorcycles"
        if b.header[0].upper() == "WEAPON":
            return "weapons", "airship-weapons"
        if "BONDING COST (IN KARMA)" in head:
            return "gear", "astral-devices"
        if "DEFENSE RATING" in head:
            return "armor", "encounter-suits"
    if b.type == "item" and b.row is None and _banded(b):
        if _RATING.search(b.tags):
            return "npcs", None
        if _FORCE.search(b.tags):
            m = re.search(r"force\s*\d+\s+([^,]+)", b.tags, re.I)
            return "spirits", slug(m.group(1)) if m else slug(b.tags.split(",")[0])
        return "critters", slug(chapter) or "critters"
    if b.type == "item" and b.row is None and "HAND" in b.text and "BOD" in b.text:  # a vehicle box with no price
        return "vehicles", None
    if any(c in chapter for c in RULE_BOOK_CHAPTERS) or any(norm(parent2).startswith(p) for p in RULE_PARTS):
        return None, None
    return "skip", None


def _vehicles(bs):
    """A vehicle box whose table is in its text (`HAND | ACC | INT | SPD …`, no price) -> a row named by the box."""
    out = []
    for b in bs:
        t = next((t for t in crb._tables(b.text) if t[0][:1] == ["HAND"] and len(t[1]) == 1), None)
        if b.type == "item" and b.row is None and not b.stats and t is not None:
            row = {"VEHICLE": b.name, **dict(zip(t[0], t[1][0]))}
            b = replace(b, header=list(row), row=row, text="\n".join(ln for ln in b.text.splitlines()
                                                                      if not ln.startswith("|") and ln.strip() != "**SPD TOP**"))
        out.append(b)
    return out


def extract(regrouped, ctx=None):
    report = []
    res = crb.extract(_vehicles(_prep(list(blocks(regrouped)), report)), ctx, book=sys.modules[__name__])
    res.report += report  # a being whose band doesn't read
    return res
