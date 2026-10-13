"""The SR6 catalog reading every recipe shares: read() maps a book's regrouped.md (importer/sr6/regroup.py) to its
Result through the recipe module's tables (SECTIONS, PAGE_OFFSET, …: the core rulebook's are importer/sr6/recipes/
crb.py's), into a Catalog (one list of entries per kind, written as <kind>.xml); and the readers the recipes reuse on
their own shapes (md_tables, table_cells, text_stats, block_text, block_md, stat_lines, HEADERS, BEING, …). Layout
notes in importer/sr6/recipes/crb.md."""
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import replace
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr

from importer.recipes import Result
from importer.sr6.ids import slug
from importer.sr6 import KINDS, NS, archetypes, categories, effects, flags, formula, regroup, search, sections, shapes, tables
from importer.sr6.regroup import _names, blocks, norm
from importer.xmlio import HEAD, ILLEGAL

CORE = "CRB"  # the core rulebook's source (recipes/crb.py): its catalog comes first, its sample runners cite their own
# first header cells that make a table a catalog in regroup (its rows are items even when no description pairs)
NAME_HEADERS = {"WEAPON", "WEAPONS", "ARMOR", "ITEM", "AUGMENTATION", "DEVICE", "VEHICLE", "LIFESTYLE", "CYBERJACK",
                "HEADWARE", "EYEWARE", "EARWARE", "BODYWARE", "LIMB", "GEAR", "CLASS", "RCC"}
ATTRIBUTES = {"body": ("BOD", "physical"), "agility": ("AGI", "physical"), "reaction": ("REA", "physical"),
              "strength": ("STR", "physical"), "willpower": ("WIL", "mental"), "logic": ("LOG", "mental"),
              "intuition": ("INT", "mental"), "charisma": ("CHA", "mental"), "edge": ("EDG", "special"),
              "magic": ("MAG", "special"), "resonance": ("RES", "special"), "essence": ("ESS", "special")}

_PRICE = {"AVAIL": "avail", "AVAILABILITY": "avail", "COST": "cost"}
BEING = {"B": "bod", "BOD": "bod", "A": "agi", "AGI": "agi", "R": "rea", "REA": "rea", "S": "str", "STR": "str",
         "W": "wil", "WIL": "wil", "L": "log", "LOG": "log", "I": "int", "INT": "int", "C": "cha", "CHA": "cha",
         "ESS": "ess", "M": "mag", "MAG": "mag", "RES": "res", "EDG": "edg", "EDGE": "edg", "DR": "dr",
         "DEFENSE RATING": "dr", "I/ID": "init", "INIT": "init", "INITIATIVE": "init", "AC": "actions",
         "ACTIONS": "actions", "CM": "cm", "MOVE": "move", "RS": "res", "DEFENSE": "dr"}
# kind -> {printed column header or label (upper case) -> attribute}; the row's first column is the name
HEADERS = {
    "weapons": {"DV": "dv", "MODES": "modes", "MODE": "modes", "ATTACK RATINGS": "ar", "ATTACK RATING": "ar", "AR": "ar",
                "AMMO": "ammo", "TYPE": "type", "MOUNT": "mount", "BLAST": "blast", "DV GZ": "dv+", "DV CLOSE": "dv+",
                "DV NEAR": "dv+", "NOTES": "", "STATS": "", **_PRICE},
    "armor": {"DEFENSE RATING": "defense", "DEFENSE": "defense", "DR": "defense", "CAPACITY": "capacity", "SOCIAL": "social",
              "TYPE": "", "EXTRAS": "", **_PRICE},
    "augmentations": {"RATING": "rating", "ESSENCE": "essence", "ESS": "essence", "CAPACITY": "capacity", **_PRICE},
    "electronics": {"RATING": "rating", "DEVICE RATING": "rating", "ATTRIBUTE ARRAY": "array", "ARRAY": "array",
                    "ATTRIBUTES (D/F)": "array", "ATTRIBUTES (A/S)": "array", "PROGRAMS": "programs",
                    "ACTIVE PROGRAM SLOTS": "programs", "CAPACITY": "capacity", **_PRICE},
    "gear": {"RATING": "rating", "DEVICE RATING": "rating", "CAPACITY": "capacity", "BONDING COST (IN KARMA)": "karma",
             "MOD SLOTS": "slots", "DV": "", "ATTACK RATING": "", "BLAST PROFILE": "",  # an ammunition's modifiers: prose
             "ENERGY": "energy",  # a weapon power supply's charge (the shots an energy weapon gets from it)
             **_PRICE},
    "vehicles": {"HANDLING": "handling", "HAND": "handling", "ACCEL": "accel", "ACCELERATION": "accel",
                 "HAND (ON/OFF ROAD)": "handling", "HANDL": "handling", "SPEED INTERVAL": "interval", "INTERVAL": "interval", "TOP SPEED": "topSpeed", "BODY": "body",
                 "ARMOR": "armor", "PILOT": "pilot", "SENSOR": "sensor", "SEATS": "seats", "SEAT": "seats",
                 "SPD INT": "interval", "TOP SPD": "topSpeed", "BOD": "body", "ARM": "armor", "SENS": "sensor", **_PRICE},
    "spells": {"RANGE": "range", "TYPE": "type", "DURATION": "duration", "DV": "dv", "DRAIN": "dv", "DAMAGE": "damage"},
    "rituals": {"KEYWORDS": "keywords", "THRESHOLD": "threshold"},
    "adeptpowers": {"COST": "cost", "POWER POINTS": "cost", "ACTIVATION": "activation"},
    "complexforms": {"DURATION": "duration", "FADE": "fade", "FADE VALUE": "fade", "FV": "fade"},
    "critterpowers": {"TYPE": "type", "ACTION": "action", "RANGE": "range", "DURATION": "duration", "WEAKNESS": "weakness"},
    "critters": BEING, "spirits": BEING, "npcs": BEING,
    "sprites": {"ATTACK": "attack", "A": "attack", "SLEAZE": "sleaze", "S": "sleaze", "DATA PROCESSING": "data", "DATA PROC": "data",
                "DATA": "data", "D": "data", "FIREWALL": "firewall", "F": "firewall", "I/ID": "init", "INIT": "init",
                "INITIATIVE": "init", "RES": "res", "RESONANCE": "res"},
    "lifestyles": {"COST": "cost", "MONTHLY COST": "cost", "COST PER MONTH": "cost"},
    "contacts": {"CONNECTION": "connection", "LOYALTY": "loyalty", "ARCHETYPE": "archetype"},
    "qualities": {"COST": "karma", "BONUS": "karma"},
    "metamagics": {}, "echoes": {}, "skills": {},
    "martialarts": {"CATEGORY": "categories", "SIGNATURE TECHNIQUE": "signature"},
    "martialtechniques": {"CATEGORY": "category"},
    "traditions": {},
    "ammotypes": {"AR": "ar", "ATTACK RATINGS": "ar", "ATTACK RATING": "ar", "DV": "dv", "COST MULTIPLIER": "cost",
                  "MULTIPLIER": "cost", "COST": "cost", "AVAIL": "avail", "AVAILABILITY": "avail", "TYPE": "", "TYPES": "",
                  "CAPACITY": "", "BLAST PROFILE": ""},  # (a warhead type's band: prose)
}
# a being's labelled lists (label, lower case -> child element)
LISTS = {"skills": "skills", "powers": "powers", "optional powers": "optionalPowers", "weaknesses": "weaknesses",
         "weakness": "weaknesses",
         "attacks": "attacks", "attack": "attacks", "augmentations": "augmentations", "cyberware": "augmentations", "gear": "gear",
         "weapons": "weapons"}
PRICED = {"weapons", "armor", "augmentations", "electronics", "gear", "vehicles", "lifestyles"}  # cost/avail checked
# ordered (a tuple): the loops over it decide which kind's entry comes first (a category, a part name), the same every run
ROW_KINDS = ("weapons", "armor", "augmentations", "electronics", "gear", "vehicles", "ammotypes")  # need a table row and a category
STAT_KINDS = {"critters", "spirits", "npcs", "sprites"}  # need a stat band
BOX_KINDS = {"spells", "qualities", "adeptpowers", "critterpowers", "complexforms", "rituals"}  # need a band, labels or tags
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
MAGIC = (("mystic adept", "mystic-adept"), ("aspected", "aspected"), ("full", "full"), ("adept", "adept"),
         ("technomancer", "technomancer"))
LEVELS = re.compile(r"\s*\(\s*1\s+to\s+(\d+)\s*\)\s*$", re.I)
NAME_RATING = re.compile(r"\s*\((?:rating\s*)?(\d+\s*[–-]\s*\d+)\)(?=\)?\s*$)", re.I)  # (also a note's own: `X (Y (1–4))`)
TAG_RATING = re.compile(r"^\s*\(?\s*rating\s*(\d+\s*[–-]\s*\d+)\s*\)?\s*$", re.I)  # a tag line `(rating 1-4)`
TABLE_SEP = re.compile(r"\|(?:-+\|)+$")


def _s(v):
    return ILLEGAL.sub("", str(v))


def slash_options(name, text):
    """(owner, 2026-10-08) A heading naming two options joined by `/` with one price (`Increasing/Reducing Cargo
    Space (CF Mod)`) whose text offers them as a choice (`expands or reduces`): the two names, each with the heading's
    other words; else [] (one thing printed two ways: `Easy Assembly/Disassembly`, `Emergency Light Bars/Siren`)."""
    m = re.fullmatch(r"(.*?)\b([A-Za-z]+)/([A-Za-z]+)\b(.*)", name or "")
    if not m or "/" in m.group(1) + m.group(4):
        return []
    a, b = m.group(2), m.group(3)
    t = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join((text or "").split())).lower()[:500]
    if not any(re.search(rf"\b{w[:5].lower()}\w*\s+or\s+\w|\w+\s+or\s+{w[:5].lower()}", t) for w in (a, b)):
        return []
    cap = (lambda x: x[:1].upper() + x[1:]) if (name or "")[:1].isupper() else (lambda x: x)
    return [cap(f"{m.group(1)}{a}{m.group(4)}"), cap(f"{m.group(1)}{b}{m.group(4)}")]  # (`Dexter coprocessor`)


# fields whose slash is their own format, not two items' values: handling (on/off road), seats (front/back)
SLASH_FORMAT = {"handling", "seats"}
MATERIAL_ADD_ON = "Ammunition accessory"  # (its category: fits the ammunition kind, categories.KIND_WORDS)


def printed_value(attr, v):
    v = " ".join(str(v).split())
    if re.fullmatch(r"[-–—]+|n/a", v, re.I):
        return "—"
    if attr == "cost":
        v = re.sub(r"(?<=\d),(?=\d{3})", "", v).replace("¥", "").strip()
        v = re.sub(r"^(\d{1,3})\.(\d{3})$", r"\1\2", v)  # `1.200¥`: a thousands point
    return v


_LEGAL = re.compile(r"\s*(?:\(([LIF])\)|([LIF]))\s*$")
_VAR = re.compile(r"\b(?:rating|capacity|force|level)\b", re.I)


def readable(v):
    """True when the app can read the value (src/sr6/engine/values.ts rated()): a dash, a number or a formula of
    numbers, Rating (or Capacity, Force, Level: the rating the item is bought at), + × x * / ^ and parentheses, with an
    optional leading + (an add-on's price) and a legality suffix."""
    if v.strip() in ("", "—"):
        return True
    s = _VAR.sub(" R ", _LEGAL.sub("", re.sub(r"(?i)\s+each\s*$", "", v)).strip().lstrip("+"))  # (`1500 each`)
    toks = re.findall(r"\d+(?:\.\d+)?|\.\d+|R|[+*/^()]|\S", re.sub(r"[×x*]", " * ", s))
    if "/" in toks and "R" not in toks:
        return False  # `300/350`: two prices, not a division
    pos = [0]

    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else None

    def factor():
        t = peek()
        pos[0] += 1
        if t == "(":
            ok = expr() and peek() == ")"
            pos[0] += 1
            return ok
        return t == "R" or bool(t and re.fullmatch(r"\d+(?:\.\d+)?|\.\d+", t))

    def power():
        ok = factor()
        while ok and peek() == "^":
            pos[0] += 1
            ok = factor()
        return ok

    def term():
        ok = power()
        while ok and peek() in ("*", "/"):
            pos[0] += 1
            ok = power()
        return ok

    def expr():
        ok = term()
        while ok and peek() == "+":
            pos[0] += 1
            ok = term()
        return ok

    return expr() and pos[0] == len(toks)


def md_tables(text):
    """The markdown tables in a block's text: (header, rows)."""
    lines, out, i = text.splitlines(), [], 0
    while i < len(lines):
        if lines[i].startswith("|") and i + 1 < len(lines) and TABLE_SEP.match(lines[i + 1]):
            header, rows, i = table_cells(lines[i]), [], i + 2
            while i < len(lines) and lines[i].startswith("|") and not (i + 1 < len(lines) and TABLE_SEP.match(lines[i + 1])):
                rows.append(table_cells(lines[i]))
                i += 1
            out.append((header, rows))
        else:
            i += 1
    return out


def md_table(h, rows):
    """A table as markdown (the text md_tables reads it from): header h, rows."""
    return "\n".join(["| " + " | ".join(h) + " |", "|" + "---|" * len(h)] + ["| " + " | ".join(r) + " |" for r in rows])


def squash(s):
    """A name with its spaces gone (norm): a heading printed with stray spaces (`Mancatc her`) still matches."""
    return norm(s).replace(" ", "")


def describes(desc, name):
    """True when a heading (a block: desc.name) describes a box: a word of the box's title is in the heading."""
    return squash(name) in squash(desc.name) or any(w in squash(desc.name) for w in norm(name).split() if len(w) > 3)


def table_cells(line):
    return [c.strip() for c in line.strip()[1:-1].split("|")]


_STAT_PRICE = {"AVAIL", "AVAILABILITY", "COST"}
_STAT_NAME_COLUMNS = {"ITEM", "WEAPON", "NAME", "GEAR", "DEVICE", "VEHICLE", "AUGMENTATION", "ARMOR", "SYSTEM", "MOD", "MODIFICATION"}
_STAT_RULE_COLUMNS = {"GRADE", "RATING", "LEVEL", "FORCE", "PRIORITY", "METATYPE", "CLASS", "SIZE", "SIZE CLASS", "LIFESTYLE"}


def _cap_name(cell):
    """A name of two or more words, each capitalised (`Silver Bolts`, `Liar's Fetish`)."""
    return len(cell.split()) > 1 and all(w[:1].isupper() for w in cell.split())


def stat_lines(b, names=frozenset()):
    """A heading whose text holds its own stat line(s): one priced table with no name column (`TYPE | DV | … | AVAIL |
    COST`, the type its first cell; a vehicle's `HAND | ACCEL | … | COST` under a title line naming it): the block as
    that item, its row the table's (the acid thrower, Collapsing Now p. 38; the Lamplighter, Deadly Arts p. 136;
    Krime Gloves, p. 30: the first of its mode tables). Several rows of a TYPE column with an availability and a
    cost, each type a word or two of its own (`Wooden`, `Silver` under `Stakes`, Shadows in Focus: New Orleans p. 27;
    not a list of items the book names elsewhere, `names`, half its rows or more; one such row, `Hunter's alloy` also a
    weapon modification, is still a variant): one item a row, named `<heading> (<first cell>)`. [b] when
    the block is no such thing."""
    if b.row is None and b.stats and b.type == "item" and not b.text.strip() and list(b.stats[0])[:1] == ["TYPE"] \
            and _STAT_PRICE & {k.upper() for k in b.stats[0]}:
        # (its priced TYPE box, regroup's stats of the item heading, Krime Gloves' `TYPE | DV | … | COST`: its row,
        # the heading its name; a second box of the same type its mode, left)
        return [replace(b, row={"ITEM": b.name, **b.stats[0]}, header=["ITEM", *b.stats[0]], stats=b.stats[1:])]
    if b.row is not None or b.stats or (b.level or 0) < 3 or not b.name or not (b.text or "").strip():
        return [b]
    ts = md_tables(b.text)
    priced = [(h, rows) for h, rows in ts if _STAT_PRICE & {x.upper() for x in h}]
    if len(ts) > 2 or not priced:
        return [b]
    h, rows = priced[0]
    for h2, rows2 in priced[1:]:  # (one-row bands stacked under one heading, `Silver Arrows`, `Silver Bolts`: one table;
        if [x.upper() for x in h2] == [x.upper() for x in h]:  # the same type twice, Krime Gloves' modes: the first)
            rows = rows + [r for r in rows2 if r[0] not in {x[0] for x in rows}]
    md_all = [t for t in (priced if len(priced) > 1 else []) if [x.upper() for x in t[0]] == [x.upper() for x in h]]
    # (a table of the block's own run-in labels, `SYSTEM | … | COST` under `Secondary Propulsion Systems` whose rows
    # `**Hovercraft:**`, `**Rotor:**` … the text describes, Double Clutch p. 136: the item's versions, one entry a row,
    # grouped under it, each with its paragraph)
    runins = {norm(m.group(1)): m.group(2).strip() for m in re.finditer(r"(?m)^\W*\*\*([^*\n]{2,40}?):\*\*\s*(.*(?:\n(?![\s•]*\*\*|\||<!--).*)*)", b.text)}
    if len(rows) > 1 and all(r[0] and norm(r[0]) in runins for r in rows) and all(len(r) == len(h) for r in rows):
        md = "\n".join(["| " + " | ".join(h) + " |", "|" + "---|" * len(h)] + ["| " + " | ".join(r) + " |" for r in rows])
        out = []
        for r in rows:
            row = {"ITEM": r[0], **dict(zip(h[1:], r[1:]))}
            out.append(replace(b, type="item", name=r[0], row=row, header=list(row), label=b.label or b.name, group=b.name,
                               text=runins[norm(r[0])]))
        return out + [replace(b, text=b.text.replace(md, "", 1).strip())]
    # (one row: its stat line, whatever its first column; several: a TYPE column's variants only, never a rule
    # table's grades, ratings or classes, nor items of their own)
    hw = set(norm(b.name).split())
    if not rows or h[0].upper() in _STAT_NAME_COLUMNS or not re.search(r"[A-Z]{2}", h[0]) or any(len(r) != len(h) for r in rows) \
            or any(not r[0] or r[0].upper() == h[0].upper() for r in rows):
        return [b]
    if len(rows) > 1 and (h[0].upper() != "TYPE" or len({x.upper() for x in h} & _STAT_PRICE) < 2
                          or any(not re.match(r"[^\W\d_]", r[0]) or len(r[0].split()) > 2 or "(" in r[0]
                                 or set(norm(r[0]).split()) & hw and not _cap_name(r[0]) for r in rows)
                          or 2 * sum(norm(r[0]) in names for r in rows) >= len(rows)):
        return [b]
    text = b.text
    for th, trows in md_all or [(h, rows)]:
        md = "\n".join(["| " + " | ".join(th) + " |", "|" + "---|" * len(th)] + ["| " + " | ".join(r) + " |" for r in trows])
        text = text.replace(md, "", 1)
    text = re.sub(r"(?m)^[A-Za-z][\w –-]{2,40}\n(?=\| )", "", text).strip()  # (less the bands and a title line over them)
    if len(rows) == 1:
        row = {"ITEM": b.name, **dict(zip(h, rows[0]))}
        return [replace(b, type="item", row=row, header=list(row), text=text)]
    out = []
    for r in rows:  # (a type that is a name of its own, `Silver Bolts`: the item's; a word, `Wooden`: the heading's variant)
        name = r[0] if _cap_name(r[0]) else f"{b.name} ({r[0]})"
        row = {"ITEM": name, **dict(zip(h, r))}
        # (a table with a name sharing a word with its heading, `Liar's Fetish` under `Liar's Medium`: its rows grouped under it)
        out.append(replace(b, type="item", name=name, row=row, header=list(row), text=text,
                           **({"group": b.name} if any(set(norm(x[0]).split()) & hw for x in rows) else {})))
    return out


class Catalog:
    def __init__(self, source, recipe, book):
        self.source, self.note = source, f"recipe sr6 {recipe}) from {book}"
        self.entries = {k: [] for k in KINDS}
        self.ids = {k: set() for k in KINDS}
        self.texts = []
        self.report = []
        self.cols = set()  # (kind, column) already reported unknown
        self.pending = []  # unknown columns of the entry being read: reported when it is added
        self.last_meta = None
        self.unrated = None  # a book's group for named NPCs printed with no Professional Rating (else they're no NPCs)
        self.split = None  # a book's split_being(block): the blocks a stat block printed for several names stands for
        self.index = None  # the book's tables and prose (search.Index): where a value an entry's row leaves out is found
        self.last_weapon = None  # the weapon read last: a supply table printed right after it is its ammunition
        self.where = ("", "")  # the (chapter, section) of the block being read: an entry's place, for section rules
        # the tables the catalog rows come from (categories.py): index -> {title, section, header, page}; the open one
        self.tables, self._table = {}, None
        self.idcat = {k: {} for k in KINDS}  # id -> its entry's category: a name another category repeats
        self.idgrp = {k: {} for k in KINDS}  # id -> its entry's group (a name another group of the category repeats)

    def add(self, kind, name, page, attrs=None, children=(), text="", parent=None, row=None, aliases=(), cid=None, split=True):
        name = re.sub(r"\s*\*.*$", "", name) or name  # a footnote mark (`Bullwhip*`), or its note run into the cell
        context = (attrs or {}).pop("_context", ())  # (the headings it is printed under: flags.metamagic)
        if kind == "metamagics":  # who may take it, and whether again (flags.py); `(Adepts Only)` leaves the name
            printed, (name, more) = name, flags.metamagic(name, text, context)
            attrs, aliases = {**(attrs or {}), **more}, (*aliases, printed)
        elif kind == "spells":  # an opposed test, a threshold counting Essence (flags.py)
            attrs = {**(attrs or {}), **flags.spell((attrs or {}).get("category"), text)}
        elif kind == "qualities":  # one the six-quality limit doesn't count (flags.py)
            attrs = {**(attrs or {}), **flags.uncounted(text)}
        elif kind == "martialtechniques":  # the prerequisites its closing line prints (flags.py)
            children = [*children, *flags.requires(text)]
        if split and not cid and (opts := flags.options(text)):  # learned in one of the options it lists: an entry each
            first = None
            for o in opts:
                e = self.add(kind, f"{name} ({o})", page, dict(attrs or {}), children, text, parent, row, (*aliases, name), split=False)
                e["split_of"] = name  # (sections.py's reading of the printed heading is these: section())
                first = first or e
            return first
        base = cid or slug(name) or KINDS[kind]
        i, n = base, 2
        if kind == "rules" and i in self.ids[kind] and parent:
            i = base = f"{parent}-{base}"
        cat, grp = (attrs or {}).get("category"), (attrs or {}).get("group")
        if kind in ROW_KINDS and cat and i in self.ids[kind] and self.idcat[kind].get(i) != cat:
            # the same name in another category is another item (a cyberlimb's Armor, a cybereye's): its id names it
            i = base = f"{slug(cat)}.{base}"
        elif kind in ROW_KINDS and grp and i in self.ids[kind] and self.idgrp[kind].get(i) != grp:
            i = base = f"{slug(grp)}.{base}"  # (or in another group of its category: a line's Tonfa, Zoé Heritage Line's)
        while i in self.ids[kind]:
            i, n = f"{base}-{n}", n + 1
        if n > 2 and kind != "rules":  # repeated rule subheadings (Advantages, Step 1) are normal
            self.report.append({"kind": "duplicate-id", "file": f"{kind}.xml", "id": i, "name": name, "page": page})
        self.ids[kind].add(i)
        self.idcat[kind][i], self.idgrp[kind][i] = cat, grp
        for r in self.pending:
            if (r["file"], r["column"]) not in self.cols:
                self.cols.add((r["file"], r["column"]))
                self.report.append(r)
        self.pending = []
        aliases = [*aliases, *series_models(name, text), *(known_as(name, text) + version_names(name, text) if kind in ROW_KINDS else [])]
        if (fixed := _TRIPLE.sub(r"\1\1", name)) != name:
            aliases.append(fixed)  # a letter printed three times (`Actioneeer`): the spelling as a search name, never a rename
        al = [a for a in dict.fromkeys(aliases) if a and norm(a) != norm(name)]  # another name it is printed under
        e = {"id": i, "name": name, "page": page, "attrs": attrs or {},
             "children": list(children) + [("alias", {}, a) for a in al], "row": row or {}, "where": self.where,
             "text": text, "aliases": al}
        if kind == "weapons":
            self.last_weapon = e
        elif kind == "gear" and self.last_weapon and (sup := supply_aliases(name, self.last_weapon)):
            e["children"] += [("alias", {}, a) for a in sup]
            e["aliases"] += sup
        self.entries[kind].append(e)
        if text.strip():
            self.texts.append((kind, i, text.strip()))
        return e

    def table_of(self, b, page):
        """The index of the table the row block `b` is printed in: the open one while its title and section stay the
        same (categories.py)."""
        k = (b.label or "", b.section or "")
        if self._table is None or self._table[0] != k:
            self._table = (k, len(self.tables))
            self.tables[len(self.tables)] = {"title": k[0], "section": k[1], "page": page, "product": b.product,
                                             "parent": b.table,  # (a sub-table's: its table's title)
                                             "header": list(b.header or [])}
        return self._table[1]

    def section(self, f):
        """Add a sections.py entry, unless the recipe's own reading wrote it already (a quality heading with its Cost
        line; a program of the same type). A heading of a kind this module reads (a sprite power's Range and Duration
        lines) has its fields read as the recipe would."""
        same = lambda e: norm(e["name"]) == norm(f.name) and all(  # noqa: E731
            e["attrs"].get(k) == f.attrs.get(k) for k in ("type", "group") if f.attrs.get(k)) and (  # (a path's `Step 1`)
            not f.attrs.get("category") or slug(e["attrs"].get("category") or "") in ("", slug(f.attrs["category"])))
        a = dict(f.attrs)
        head, aliases = a.pop("_heading", None), ()
        if head:  # a quality path's step, read under its name without the path's (`Consumed`)
            es = self.entries[f.kind]
            # the recipe's reading of the same heading under its printed name is this step: one entry, its name the alias
            es[:] = [e for e in es if norm(e["name"]) != norm(head) or abs(int(e["page"]) - f.page) > 1]
            aliases = (head,)
            if any(norm(e["name"]) == norm(f.name) and abs(int(e["page"]) - f.page) > 1 for e in es):
                f, aliases = replace(f, name=head), ()  # another quality of its name elsewhere: the printed heading's
        # (a focus kind `Ritual Spellcasting` is not the formula row of that name; a path's step read already, its
        # printed heading the alias)
        if any(same(e) or norm(f.name) == norm(e.get("split_of") or "") or f.kind == "qualities" and norm(f.name) in {norm(x) for x in e.get("aliases", ())}
               and abs(int(e["page"]) - f.page) <= 1 for e in self.entries[f.kind]) \
                or sections.reprint(f, self.entries[f.kind]):
            return
        have = {norm(e["name"]) for e in self.entries[f.kind]}
        if f.kind == "qualities" and (m := re.fullmatch(r"(.*?)\b(\w+)/(\w+)\b(.*)", f.name)):
            if all(norm(f"{m.group(1)}{x}{m.group(4)}") in have for x in m.group(2, 3)):
                return  # (`Representation I/II`, read already as its two qualities)
            if f.attrs.get("karmaMax") and len(ks := sections.karma_list(re.sub(r"\s+", " ", f.text or ""))[:2]) == 2:
                for x, k in zip(m.group(2, 3), ks):  # (`Bonus: 5/8 Karma`: two qualities, each its price)
                    self.section(replace(f, name=f"{m.group(1)}{x}{m.group(4)}",
                                         attrs={**{k2: v for k2, v in f.attrs.items() if k2 != "karmaMax"}, "karma": str(k)}))
                return
        if f.block is not None and f.kind in HEADERS and HEADERS[f.kind]:
            fl = self.fields(f.kind, text_stats(f.block, HEADERS[f.kind]), f.page)
            fl.pop("prose", None)
            fl.pop("_notes", None)
            a = {**fl, **a}
            self.pending = []
        if f.kind in ("critterpowers", "adeptpowers") and not (a.get("action") or a.get("activation")) and (
                m := re.match(r"\W*As\s+an?\s+(Major|Minor)\s+Action\b", " ".join((f.text or "").split()), re.I)):
            # (a power stating its action in its first words: `As a Major Action, a protosapient …`)
            a["action" if f.kind == "critterpowers" else "activation"] = m.group(1).title() + (
                "" if f.kind == "critterpowers" else " Action")
        if f.kind == "qualities" and a.get("karma") is not None:
            a["karma"] = int(a["karma"])
        if "_base" in a:
            return self.derived(f, a)
        cls = a.pop("_class", None)
        if cls:  # a kind of a class the book prices by one row (`Enchanting focus`): that row's price
            row = next((e for e in self.entries[f.kind] if norm(e["name"]) == norm(cls)), None)
            if row is None:
                return
            a.update({k: row["attrs"][k] for k in ("rating", "karma", "avail", "cost") if row["attrs"].get(k)})
        cid = a.pop("_id", None)  # (an id of its own: `Gestalt Step 1`, the printed name `Step 1` shared)
        self.add(f.kind, f.name, f.page, a, f.children, f.text, cid=slug(cid) if cid else None, aliases=aliases)

    def derived(self, f, a):
        """An item a section derives from one of the book's (sections.derived): the base item found by its name
        (singular, the first words of a longer name: `gills` is `Gills (freshwater/saltwater/air)`) in the kind whose
        entries are of the base's type (`bioware`); its rating range and availability kept, each field the rule
        names its base's times the factor (`ref()`, at the item's rating). No base found: the rule as an ambiguous
        issue (`priced from another item`)."""
        want = [regroup_stem(w) for w in norm(a["_base"]).split()]
        kinds = [k for k in formula.PRICED if any(a["_basekind"].lower() in (e["attrs"].get("type") or "").lower()
                                                   for e in self.entries[k])] or [f.kind]
        named = [(e, k) for k in kinds for e in self.entries[k]
                 if [regroup_stem(w) for w in norm(re.sub(r"\([^()]*\)", "", e["name"])).split()][:len(want)] == want
                 and (e["attrs"].get("type") or "").lower() == a["_basekind"].lower()]
        # (a priced one first: `Awareness`, a group head printing no price, over its `Awareness (Basic)`)
        base, kind = next((x for x in named if re.search(r"\d", str(x[0]["attrs"].get("cost") or ""))),
                          named[0] if named else (None, kinds[0]))
        if base is None:  # (owner, 2026-10-08) the same words in another order and form: `webbed hands and feet`
            want_set = word_stems(a["_base"])     # is `Hand and foot webbing`
            base, kind = next(((e, k) for k in kinds for e in self.entries[k]
                               if word_stems(re.sub(r"\([^()]*\)", "", e["name"])) == want_set
                               and (e["attrs"].get("type") or "").lower() == a["_basekind"].lower()), (None, kinds[0]))
        rule, kids, attrs = a["_rule"], [], {}
        if base is None:  # (owner 2026-10-11) the base printed as a group header over its versions (`Awareness` over
            # `Basic`, `Tactical`): one entry per version, each priced from its own base, named `… (Basic)`
            rows = [(e, k) for k in kinds for e in self.entries[k]
                    if [regroup_stem(w) for w in norm(e["attrs"].get("group") or "").split()] == want
                    and (e["attrs"].get("type") or "").lower() == a["_basekind"].lower()]
            if rows:
                for e, k in rows:
                    attrs = {x: e["attrs"][x] for x in ("type", "category", "rating", "avail") if e["attrs"].get(x)}
                    r = ", R" if e["attrs"].get("rating") else ""
                    kids = []
                    for fld, x in a["_factors"].items():
                        attrs[fld] = _short_rule(rule, fld)
                        kids.append(("formula", {"field": fld}, f"ref({k}:{self.source.lower()}.{e['id']}, {fld}{r})*{x:g}"))
                    self.add(k, f"{f.name} ({e['name']})", f.page, attrs, kids, f.text)["derived"] = True
                return
        if base:
            attrs = {k: base["attrs"][k] for k in ("type", "category", "rating", "avail") if base["attrs"].get(k)}
            r = ", R" if base["attrs"].get("rating") else ""
            for fld, x in a["_factors"].items():
                attrs[fld] = _short_rule(rule, fld)
                kids.append(("formula", {"field": fld}, f"ref({kind}:{self.source.lower()}.{base['id']}, {fld}{r})*{x:g}"))
        else:  # (its type the base's, its category the rule's word: `transgenic`)
            attrs = {"type": a["_basekind"].lower(), "category": slug(f.name.split()[0])}
            for fld in a["_factors"]:
                kids.append(("issue", {"field": fld, "code": "ambiguous", "page": f.page},
                             f"priced from another item: {_short_rule(rule, fld)}"))
        self.add(kind, f.name, f.page, attrs, kids, f.text)["derived"] = True  # (its table row is its base's)

    def check(self, kind, name, attrs, page):
        """Report a price the app can't read (book-value): kept as printed."""
        for a in ("cost", "avail"):
            v = attrs.get(a)
            if kind in PRICED and v and not readable(v):
                self.report.append({"kind": "book-value", "file": f"{kind}.xml", "name": name, "field": a, "value": v,
                                    "page": page})

    def fields(self, kind, b, page):
        """attribute -> value from the row (its name column skipped), the stat bands, then the labels. A column mapped
        to "x+" joins attribute x with "/" (a grenade's three DVs); one mapped to "" is prose (`prose`, for the text).
        A "<VARIANT> COST (CAPACITY)" column gives that variant's price and capacity (`variant:<variant>`), a
        "COST (PER <unit>)" column the cost and its unit (`per`)."""
        cols, out = HEADERS[kind], {}
        tables = ([dict(list(b.row.items())[1:])] if b.row else []) + list(b.stats)
        for t in tables:
            for h, v in t.items():
                hu = h.upper()
                a = cols.get(hu)
                if a is None and (m := re.fullmatch(r"(\w+) COST \(CAPACITY\)", hu)):
                    a = f"variant:{m.group(1).lower()}"
                elif a is None and (m := re.fullmatch(r"COST \(PER (.+)\)|COST PER (\w+)", hu)):  # (`COST PER 10`)
                    a, out["per"] = "cost", (m.group(1) or m.group(2)).lower()
                if a is None:  # reported once the entry is added (add()); its value goes to the text
                    self.pending.append({"kind": "unknown-column", "file": f"{kind}.xml", "column": h, "name": b.name,
                                         "page": page})
                    a = ""
                if a == "":
                    if v:
                        out.setdefault("prose", []).append(f"**{h.capitalize()}:** {v}")
                elif a.endswith("+"):
                    if v:
                        a = a[:-1]
                        out[a] = f"{out[a]}/{printed_value(a, v)}" if a in out else printed_value(a, v)
                elif v and a not in out:
                    out[a] = printed_value(a, v)
        for k, v in b.labels.items():
            a = cols.get(k.upper())
            if a and v and a not in out:
                out[a] = printed_value(a, v)
        if kind == "weapons" and (m := re.fullmatch(r"(.+?)\s*\(\s*(\d[\d.,]*\s*m)\s+blast\s*\)", out.get("dv", ""), re.I)):
            out["dv"] = m.group(1)  # `8P(10m blast)`: the DV and the blast run into one cell
            out.setdefault("blast", m.group(2))
        if kind == "weapons" and (m := re.fullmatch(r"(\d+\s*[PS](?:\([^)]*\))?)\s*\+\s*([a-z].*)", out.get("dv", ""), re.I)):
            out["dv"] = m.group(1)  # `1P + special`: the DV, and a note for the text
            out.setdefault("prose", []).append(f"**DV:** {m.group(1)} + {m.group(2)}")
        if kind in PRICED and (m := re.fullmatch(r"(.+?)\s+per\s+(.+)", out.get("cost", ""))) \
                and m.group(1).count("(") == m.group(1).count(")"):  # (not `2,000¥ (+500¥ per additional dart)`)
            out["cost"] = m.group(1)  # "50 per 100m"; "15 per 10" under a COST (PER 10 ROUNDS) column
            out.setdefault("per", m.group(2))
        for a, v in list(out.items()):  # a footnote mark on a cell (`10/6*/—`): the footnote is the field's note
            if a != "prose" and isinstance(v, str) and (m := _MARK.search(v)) and _MARK.sub("", v).strip() \
                    and (note := footnote(b.text, m.group(1))):
                out[a] = _MARK.sub("", v)
                out.setdefault("_notes", []).append((a, note))
        return out

    @staticmethod
    def variants(name, f):
        """One row printing two items -> [(name, fields)]: `A/B` names with `x/y` prices (cost and avail split when
        they have as many parts), `x/month or y/year` prices, and `variant:<v>` prices with their capacity in
        parentheses."""
        f = dict(f)
        vs = {k[8:]: f.pop(k) for k in list(f) if k.startswith("variant:")}
        if vs:
            out = []
            for v, val in vs.items():
                m = re.fullmatch(r"(.*?)\s*\(([^()]*)\)", val)
                g = dict(f, cost=printed_value("cost", m.group(1) if m else val))
                if m:
                    g["capacity"] = m.group(2)
                out.append((f"{name} ({v})", g))
            return out
        cost = f.get("cost", "")
        mats = re.findall(r"\bx\s*(\d+(?:\.\d+)?)\s+for\s+([a-z]+)\b", cost, re.I)
        if len(mats) > 1 and re.search(r"\bmaterials?\b", cost, re.I):
            # (owner, 2026-10-08) material multipliers (`x2 for copper or other common materials, x5 for silver …`): an
            # add-on per material for the ammunition it is loaded in, priced at that ammunition's price times its factor
            return [(f"{name} ({m.lower()})", dict(f, cost=f"x{x}", category=MATERIAL_ADD_ON, **{"_formula:cost": f"H*{x}"}))
                    for x, m in mats]
        if m := re.fullmatch(r"(.+?)\s*/\s*(\w+)\s+or\s+(.+?)\s*/\s*(\w+)", cost):
            return [(f"{name} ({m.group(2)})", dict(f, cost=m.group(1), per=m.group(2))),
                    (f"{name} ({m.group(4)})", dict(f, cost=m.group(3), per=m.group(4)))]
        for v in (cost, f.get("avail", "")):
            parts = v.split("/")
            names = _names(name)[:len(parts)] if "/" in name else []
            if len(names) == 2 and len(names[0].split()) > 1 and names[1].split()[0] != names[0].split()[0] \
                    and len(names[1].split()) > 1:
                # (a product row `Maker A/B C`: B shares the maker's words, `Federated Boeing Osprey X`)
                names[1] = " ".join(names[0].split()[:-1] + names[1].split())
            if len(parts) > 1 and len(names) == len(parts) and all(re.fullmatch(r"\s*\d+\s*(\(\w\))?", p) for p in parts):
                # (owner, 2026-10-08: A takes each cell's first value, B its second, a cell without a slash is shared;
                # not a column whose slash is its own format: handling on/off road, seats)
                def part(k, v, i):
                    ps = v.split("/") if isinstance(v, str) else []
                    own = k in ("cost", "avail") or k not in SLASH_FORMAT and all(
                        re.fullmatch(r"\s*\d+(?:\.\d+)?\s*(\(\w\))?\s*", p) for p in ps)
                    return ps[i].strip() if own and len(ps) == len(parts) else v
                return [(n, {k: part(k, v, i) for k, v in f.items()}) for i, n in enumerate(names)]
        return [(name, f)]

    def missing(self, kind, b, page, field):
        self.report.append({"kind": "missing-value", "file": f"{kind}.xml", "name": b.name, "field": field, "page": page})

    # --- the priority and metatype tables ---

    def table(self, header, rows, page):
        first = header[0].upper() if header else ""
        if first == "PRIORITY":
            for r in rows:
                self.priority(header, r, page)
        elif first == "METATYPE" and len(header) >= 9 or _variant_table(header):
            # the ranges table, not an adjustment chart; a variant attribute table (Hack & Slash's AI variants) too
            for r in rows:
                self.metatype(header, r, page)
        elif first == "GRADE" and any("ESS" in h.upper() for h in header):  # the implant grades table
            for r in rows:
                self.grade(r[0], {h: c for h, c in zip(header[1:], r[1:])}, page)

    def grade(self, name, cells, page, types=None, replaces=None):
        """An implant grade (`Alphaware | x0.8 | x1.2 | +1`): its Essence and cost multipliers and Availability
        modifier as numbers (`x`, `+` dropped, `–` as `-`); a cell that isn't one is reported, the grade kept."""
        attrs = {}
        for h, cell in cells.items():
            h = h.upper()
            a = "essence" if "ESS" in h else "avail" if "AVAIL" in h else "cost" if "COST" in h else None
            v = re.sub(r"^[x×+]\s*", "", (cell or "").strip().replace("–", "-").replace("−", "-"), flags=re.I)
            if not a or not v or v == "—":
                continue
            if re.fullmatch(r"-?\d+(?:\.\d+)?", v):
                attrs[a] = v
            else:
                self.report.append({"kind": "book-value", "file": "grades.xml", "name": name, "field": a, "value": cell,
                                    "page": page})
        self.add("grades", name, page, {**attrs, "types": types, "replaces": replaces})

    def priority(self, header, row, page):
        letter = (row[0] if row else "").strip()
        if not re.fullmatch(r"[A-E]", letter):
            self.report.append({"kind": "book-value", "file": "priorities.xml", "name": letter, "field": "letter",
                                "value": letter, "page": page})
            return
        metas, attrs, skills, magic, res = [], [], [], [], []
        for h, cell in zip(header[1:], row[1:]):
            h = h.upper()
            if "METATYPE" in h:
                for m in re.finditer(r"([^()]+?)\s*\((\d+)\)", cell):
                    metas += [("metatype", {"name": n.strip(" ,;"), "points": int(m.group(2))}, None)
                              for n in m.group(1).split(",") if n.strip(" ,;")]
            elif "ATTRIBUTE" in h and (n := re.search(r"\d+", cell)):
                attrs.append(("attributes", {"points": int(n.group())}, None))
            elif "SKILL" in h and (n := re.search(r"\d+", cell)):
                skills.append(("skills", {"points": int(n.group())}, None))
            elif "MAGIC" in h or "RESONANCE" in h:
                rest = cell
                for word, kind in MAGIC:
                    if m := re.search(rf"\b{word}\b\s*:?\s*(\d+)?", rest, re.I):
                        magic.append((m.start(), ("magic", {"kind": kind, "rating": m.group(1) and int(m.group(1))}, None)))
                        rest = rest[:m.start()] + " " * (m.end() - m.start()) + rest[m.end():]
                magic = [m for _, m in sorted(magic, key=lambda x: x[0])] or [("magic", {"kind": "mundane"}, None)]
            elif ("RESOURCE" in h or "NUYEN" in h) and (n := re.sub(r"\D", "", cell)):
                res.append(("resources", {"nuyen": int(n)}, None))
        self.add("priorities", f"Priority {letter}", page, {"letter": letter}, metas + attrs + skills + magic + res)

    def metatype(self, header, row, page):
        joined = " ".join(c for c in row if c)
        if m := re.search(r"racial qualit\w*\s*:?\s*(.*)", joined, re.I):  # the sub-row under a metatype's row
            if self.last_meta:
                self.last_meta["children"] += [("trait", {}, t) for t in re.split(r"\s*[,;]\s*", m.group(1).strip(" ."))
                                               if t and t.lower() != "none"]
            return
        name = (row[0] if row else "").strip()
        if not name:
            return
        ranges = []
        for h, cell in zip(header[1:], row[1:]):
            a = BEING.get(h.upper(), h[:3].lower())
            if a not in ("bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg"):
                continue
            if r := re.search(r"(\d+)\s*[–—-]\s*(\d+)", cell):
                ranges.append(("range", {"attr": a, "min": int(r.group(1)), "max": int(r.group(2))}, None))
            else:
                self.report.append({"kind": "book-value", "file": "metatypes.xml", "name": name, "field": a,
                                    "value": cell, "page": page})
        self.last_meta = self.add("metatypes", name, page, {}, ranges)

    # --- one block -> one entry ---

    def entry(self, kind, cat, b, page, ctx):
        """Add the block as a `kind` entry; False when it lacks what the kind needs."""
        try:
            return self._entry(kind, cat, b, page, ctx)
        finally:
            self.pending = []

    def _entry(self, kind, cat, b, page, ctx):
        if kind in ("contacts", *STAT_KINDS, *BOX_KINDS):
            b = text_stats(b, HEADERS["npcs" if kind == "contacts" else kind])
        if kind in STAT_KINDS and len(parts := _side_by_side(b)) > 1:
            return all([self._entry(kind, cat, p, page, ctx) for p in parts])
        if kind in STAT_KINDS and self.split and len(parts := self.split(b)) > 1:
            return all([self._entry(kind, cat, p, page, ctx) for p in parts])  # one stat block, several names
        if kind in ROW_KINDS and b.row is not None and not any(list(b.row.values())[1:]) and not b.unlisted:
            return True  # a group heading printed as a row (`Patches` over the patches): no entry
        if kind in ROW_KINDS and b.row is None or kind in STAT_KINDS and not b.stats \
                or kind in BOX_KINDS and not (b.stats or b.labels or b.tags):
            return False
        if kind == "contacts":
            return self.contact(b, page)
        if kind == "skills":
            return self.skill(b, page)
        f, name, children, attrs = self.fields(kind, b, page), b.name, [], {}
        prose = f.pop("prose", [])
        notes = [("note", {"field": a}, t) for a, t in f.pop("_notes", [])]  # its cells' footnotes
        if kind == "qualities" and "karma" not in f and (m := re.search(r"\bCost:\s*([^.\n]*Karma[^.\n]*)", b.text)):
            f["karma"] = m.group(1)  # a cost printed in the text, not as a label
        if kind in STAT_KINDS and len(f) < 3 or kind in BOX_KINDS and not (
                f or b.tags or kind in ("qualities", "adeptpowers") and b.labels):
            return False  # a rule table under the heading, not the kind's stat band
        if kind in ROW_KINDS:
            # the first header when it names a class of things (GRENADES under the title `explosives`, not WEAPON or
            # TYPE: owner, 2026-10-07), else the table's title, else the section
            label, head = slug(b.label), slug(b.header[0] if b.header else "")
            head = "" if head.upper() in NAME_HEADERS or head.upper().replace("-", " ") in regroup.NAME_COLUMNS else head
            # (a plural class the title doesn't name: `weapon accessories` over ACCESSORY keeps its title)
            narrower = head if re.search(r"[^s]s$", head) and formula._stem(head.split("-")[-1]) not in {
                formula._stem(w) for w in label.split("-")} else ""
            attrs["category"] = cat or narrower or (label if label not in ("", kind) else head) or slug(b.section) or label or kind
            if b.group:  # a row printed under a name-only row (`DocWagon contracts`): `DocWagon contract: Basic`
                attrs["group"] = group_name(b.group)
            if kind == "augmentations":
                attrs = {"type": ware_type([*ctx, attrs["category"]]), **attrs}
            if (m := NAME_RATING.search(name)) and "rating" not in f and kind not in ("weapons", "armor", "vehicles"):
                name, f["rating"] = name[:m.start()] + name[m.end():].strip(), m.group(1)
            if b.group:  # (its id with its group, `awareness-basic`, not `basic`; owner 2026-10-11)
                attrs["_id"] = f"{attrs['group']} {name}"
            if "rating" not in f and (m := TAG_RATING.match(b.tags or "")):
                f["rating"] = m.group(1)  # the heading's tag line gives its range: `(rating 1-4)`
            if "rating" not in f and re.search(r"(?i)\b(?:size|level|force|grade)\b", f.get("cost", "") + f.get("avail", "")):
                # priced by its Size (Level, Force…): the range its SIZE column prints is the rating it comes in
                rng = next((v for h, v in (b.row or {}).items() if h.upper() in ("SIZE", "LEVEL", "FORCE", "GRADE")
                            and re.fullmatch(r"\s*\d+\s*[–-]\s*\d+\s*", v or "")), None)
                if rng:
                    f["rating"] = rng.strip()
            if kind == "weapons" and "ammo" not in f and (ammo := ammo_from_text(b.text)):
                f["ammo"] = ammo  # its row prints no ammo, its description does (`internal magazines that hold …`)
            if kind == "weapons" and (spec := CLOSE_COMBAT.get(formula._stem((f.get("type") or "").strip().lower()))):
                attrs.update(skill="Close Combat", spec=spec)  # its TYPE (`Blade`): the specialization it is used with
            if b.maker:
                attrs["maker"] = b.maker  # a product's configuration row: its title's maker
            if b.config_of:
                attrs["configOf"] = slug(b.config_of)  # a shape the item takes (shapes.configuration_rows)
            opts = slash_options(name, block_text(b)) if b.level else []
            for n, g in [(o, dict(f)) for o in opts] or self.variants(name, f):
                if "rating" not in g and _VAR.search(g.get("cost", "") + g.get("avail", "")) \
                        and re.fullmatch(r"\d+\s*[–-]\s*\d+", g.get("capacity", "")):
                    g["rating"] = g["capacity"]  # priced by capacity: bought at a capacity in its range
                fx = [("formula", {"field": k[9:]}, g.pop(k)) for k in [k for k in g if k.startswith("_formula:")]]
                a = {**attrs, **g}
                cid = a.pop("_id", None)
                self.check(kind, n, a, page)
                # (its printed cells, those a recipe moved to labels too: a per-unit price's count range)
                e = self.add(kind, n, page, a, [*notes, *fx], "\n".join(prose + [block_text(b)]), row={**b.labels, **(b.row or {})},
                             aliases=(b.aliases if n == name else []) or code_alias(n, b.label)
                             or (printed_short(n, self.index) if n != name else [])  # (a heading's fuller name first)
                             or ([f"{a['group']} {n}", *grouped_names(n, a["group"])] if a.get("group") else []),
                             cid=slug(f"{cid} {n}") if cid and n != name else slug(cid) if cid else None)
                e["tab"] = self.table_of(b, page)
                if b.product:
                    e["product"] = b.product
            return True
        elif kind == "spells":
            cat = next((c for c in SPELL_CATEGORIES for k in ctx if c in k.split()), None)
            if not cat:
                return False  # a rule about spells
            attrs = {"category": cat, "tags": b.tags or None}
        elif kind == "qualities":
            karma = _karma_line(f.pop("karma", ""), b.text)
            # every price it prints (`4 to 12 Karma`, `Common: 12 Karma; … Very Rare: 3 Karma`): the lowest, the highest
            # (a list of them: `3,6, or 9 Karma`, `5, 10 Karma`, `5/8 Karma`)
            ks = sections.karma_list(karma) or [int(m.group(1)) for m in re.finditer(r"(-?\d+)", karma)][:1]
            ks = ks or ([0] if re.fullmatch(r"\s*none\W*", karma, re.I) else [])  # (`Bonus: None`: In Debt, CRB p. 77)
            attrs = {"kind": cat, "karma": min(ks) if ks else None, "karmaMax": max(ks) if len(set(ks)) > 1 else None,
                     "karmaSteps": sections.karma_steps(karma) if len(set(ks)) > 1 else None,
                     "perLevel": "true" if re.search(r"per\s+level", karma, re.I) else None}
            name, attrs["maxLevel"] = self._levels(name)
            if not attrs["maxLevel"] and (m := re.search(r"\(\s*1\s+to\s+(\d+)\s*\)", karma)):
                attrs["maxLevel"] = int(m.group(1))  # `5 Karma per level (1 to 4)`: the levels in the price
            if not attrs["maxLevel"] and (m := re.search(r",\s*1\s+to\s+(\d+)\s*\)\s*$", name)):
                attrs["maxLevel"] = int(m.group(1))  # `Addiction (Substance, 1 to 6)`: the levels in the name's note, kept
        elif kind == "adeptpowers":
            cost = f.pop("cost", "")
            # (`0.5 PP`, and `0.5 per level` with the PP left out: the Power Points the number is)
            m = re.search(r"([\d.]+)\s*PP", cost, re.I) or re.match(r"\s*([\d.]+)\s*(?:per\s+level\b|$)", cost, re.I)
            name, levels = self._levels(name)
            if not levels and (n := re.search(r"max(?:imum)?\.?\s+(\d+)\s+levels?", cost, re.I)):
                levels = int(n.group(1))  # `0.25 PP per level (max 4 levels)`
            attrs = {"cost": m.group(1) if m else cost or None,
                     "perLevel": "true" if re.search(r"per\s+level", cost, re.I) else None, "maxLevel": levels}
            attrs.update(effects.split_cost(cost))
        elif kind in ("critters", "spirits", "npcs"):
            if kind == "npcs":
                # `Professional Rating 3: Street Crew`; a recipe's `Professional Rating: <group>` for a book printing none,
                # or a recipe's NPCs with no rating (`Group: X`)
                m = re.search(r"professional rating\s*(\d+)?\s*[:–—-]?\s*(.*)", b.section, re.I)
                g = re.fullmatch(r"group:\s*(.+)", b.section, re.I)
                attrs = {"rating": m and m.group(1) and int(m.group(1)),
                         "group": (m.group(2).strip() if m else g.group(1) if g else self.unrated) or None}
                if not m and not g and not self.unrated:
                    return False
            else:
                attrs = {"category": cat}
            lists = {LISTS[k.lower()]: v for k, v in b.labels.items() if k.lower() in LISTS and v}
            children = [(t, {}, lists[t]) for t in dict.fromkeys(LISTS.values()) if t in lists]
        elif kind == "sprites":
            lists = {k.lower(): v for k, v in b.labels.items() if k.lower() in ("skills", "powers") and v}
            children = [(t, {}, lists[t]) for t in ("skills", "powers") if t in lists]
        elif kind == "rituals" and "keywords" not in f and b.tags:
            f["keywords"] = b.tags
        elif kind == "lifestyles":
            if "cost" not in f:
                return False
            c = re.sub(r"\s*(nuyen|¥)?\s*(a|per)\s+month$", "", f["cost"], flags=re.I).strip()
            f["cost"] = "0" if c.lower() == "free" else c
        attrs.update(f)
        listed = {k for k in b.labels if k.lower() in LISTS} if kind in STAT_KINDS else set()
        if kind == "qualities" and (two := re.search(r"(\d+)\s*/\s*(\d+)\s*karma", karma, re.I)) \
                and (m := re.fullmatch(r"(.*?)\b(\w+)/(\w+)\b(.*)", name)):
            # (owner rule 1 on a heading: `Representation I/II`, `Bonus: 5/8 Karma`: two qualities, each its price)
            for n, k in ((m.group(2), two.group(1)), (m.group(3), two.group(2))):
                a = {**attrs, "karma": int(k), "karmaMax": None}
                self.check(kind, f"{m.group(1)}{n}{m.group(4)}", a, page)
                self.add(kind, f"{m.group(1)}{n}{m.group(4)}", page, a, children + notes,
                         "\n".join(prose + [block_text(b, listed)]))
            return True
        if kind == "metamagics":
            attrs["_context"] = [*ctx, b.section, b.tags]  # (`Adept Metamagics`, `(Adepts Only)`: flags.metamagic)
        self.check(kind, name, attrs, page)
        self.add(kind, name, page, attrs, children + notes, "\n".join(prose + [block_text(b, listed)]), aliases=b.aliases)
        return True

    def contact(self, b, page):
        """A sample contact: a contacts entry (its archetype: an `Archetype` label a recipe set, else the name; the book
        prints no connection or loyalty) and its stat block as an npcs entry (group "Contact", no Professional
        Rating)."""
        f = self.fields("npcs", b, page)
        f.pop("prose", None)
        notes = [("note", {"field": a}, t) for a, t in f.pop("_notes", [])]  # its cells' footnotes
        if len(f) < 3:
            return False
        lists = {LISTS[k.lower()]: v for k, v in b.labels.items() if k.lower() in LISTS and v}
        listed = {k for k in b.labels if k.lower() in LISTS or k == "Archetype"}
        self.add("contacts", b.name, page, {"archetype": b.labels.get("Archetype", b.name)}, (), block_text(b, listed))
        self.add("npcs", b.name, page, {"group": "Contact", **f},
                 [(t, {}, lists[t]) for t in dict.fromkeys(LISTS.values()) if t in lists] + notes, block_text(b, listed))
        return True

    @staticmethod
    def _levels(name):
        m = LEVELS.search(name)
        return (name[:m.start()].strip(), int(m.group(1))) if m else (name, None)

    def skill(self, b, page):
        blob = "; ".join([f"{k}: {v}" for k, v in b.labels.items()] + [b.tags])
        m = re.search(r"attributes?\s*:\s*([A-Za-z]+)", blob, re.I)
        attr = m and m.group(1).lower()[:3]
        if attr not in ("bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg", "mag", "res"):
            return False
        u = re.search(r"untrained\s*:?\s*(yes|no)", blob, re.I)
        if not u:
            self.missing("skills", b, page, "untrained")
        spec = next((v for k, v in b.labels.items() if re.match(r"speciali[sz]ation", k, re.I)), None)
        if spec is None and (s := re.search(r"speciali[sz]ations?\s*:\s*([^;]+)", blob, re.I)):
            spec = s.group(1)
        specs = [x.strip(" .") for x in re.split(r"\s*,\s*(?![^()]*\))", spec or "") if x.strip(" .")]  # (no split at a comma inside parentheses)
        self.add("skills", b.name, page, {"attr": attr, "untrained": "true" if u and u.group(1).lower() == "yes" else "false"},
                 [("spec", {}, s) for s in specs], block_text(b))
        return True

    # --- the files ---

    def rules(self):
        """Each entry's <formula> and <issue> children (importer/sr6/formula.py), once, after every entry is read: a
        band group's rule needs all its rows."""
        if getattr(self, "_ruled", False):
            return
        self._ruled = True
        # a section's statement of a cheaper or dearer version (`open construction versions … at half the listed
        # cost`): an option on the priced items of its section that its heading names
        said = [(e["where"], e["name"], o) for es in self.entries.values() for e in es
                for o in formula.section_options(e.get("text") or "")]
        # the book's weapon power supplies (gear with an Energy): an energy weapon's shots are read off the one it
        # comes with
        supplies = {re.sub(r"^.*\((.+)\)\s*$", r"\1", e["name"]).lower(): f"{self.source.lower()}.{e['id']}"
                    for e in self.entries["gear"] if (e["attrs"].get("energy") or "").strip()}
        sections = {}  # the section prose (rule entries) by place
        for e in self.entries["rules"]:
            sections.setdefault(e["where"], []).append(e.get("text") or "")
        for kind, es in self.entries.items():
            tiered = formula.tier_groups(es) if kind in formula.FORMULA_FIELDS else {}
            for e in es:
                opts = [o for w, n, o in said if kind in formula.PRICED and w == e["where"] and formula.names(n, e["name"])]
                kids = formula.children(kind, e["attrs"], e["page"], e.get("row"), tiered.get(id(e)), readable, opts,
                                        e.get("text") or "")
                # (a field the entry already has a formula for, a derived item's: no issue for its printed rule)
                have = {ca["field"] for t, ca, _ in e["children"] if t in ("formula", "issue")}
                kids = [k for k in kids if k[1].get("field") not in have]
                if self.index is not None and not e.get("derived") and any(c[0] == "issue" for c in kids):
                    found = self.resolve(kind, e, kids)
                    if found:
                        kids = formula.children(kind, e["attrs"], e["page"], e.get("row"), tiered.get(id(e)),
                                                readable, opts, e.get("text") or "") + found
                    kids = [(t, {**a, "searched": "book"} if t == "issue" else a, x) for t, a, x in kids]
                e["children"] += kids
                if kind == "weapons" and supplies and re.fullmatch(r"(?i)\s*energy\s*", e["attrs"].get("ammo") or "") and (
                        x := formula.energy_ammo(e.get("text"), "\n".join(sections.get(e["where"], ())), supplies)):
                    e["children"].insert(next((i for i, c in enumerate(e["children"]) if c[0] == "issue"),
                                              len(e["children"])), ("formula", {"field": "ammo", "round": "down"}, x))

    def resolve(self, kind, e, kids):
        """The issues' fields found elsewhere in the book (search.py's first two circles), written to the entry's
        attributes: [("found", {field, how, source, page}, None)]. A field the row prints but no rule reads (unreadable)
        is looked for too; two values printed, or a rule pricing it off another item (ambiguous), is the book's."""
        out = []
        for t, a, _ in kids:
            if t != "issue" or a["code"] == "ambiguous":
                continue
            f = a["field"]
            if re.fullmatch(r"\s*(?:[*†‡]+|see text)\s*", str(e["attrs"].get(f) or ""), re.I):
                continue  # (a cell printing `*`, see text: its value is the entry's text, no other row's)
            r = search.search_book(self.index, HEADERS, kind, e, f, e.get("text") or "")
            if not r:
                continue
            v, how, page = r
            e["attrs"][f] = int(v) if kind == "qualities" and f == "karma" else v
            out.append(("found", {"field": f, "how": how, "source": self.source, "page": page}, None))
            if how == "table":  # the same row's other columns the entry's own row leaves empty (a capacity range)
                for g, w in search.same_row(self.index, HEADERS, kind, e, f, v).items():
                    if not (e["attrs"].get(g) or "").strip():
                        e["attrs"][g] = w
                        out.append(("found", {"field": g, "how": how, "source": self.source, "page": page}, None))
        a = e["attrs"]
        if out and not (a.get("rating") or "").strip() and _VAR.search(f"{a.get('cost', '')} {a.get('avail', '')}"):
            # a rated price found: the range its name or its capacity prints is the rating it comes in
            m = NAME_RATING.search(e["name"])
            rng = m.group(1) if m else a.get("capacity") if re.fullmatch(r"\s*\d+\s*[–-]\s*\d+\s*", a.get("capacity") or "") else None
            if rng:
                a["rating"] = rng.strip()
        return out

    def xml(self, kind):
        self.rules()
        tag, lines = KINDS[kind], []
        for e in self.entries[kind]:
            a = {"id": e["id"], "source": self.source, "page": e["page"], **e["attrs"]}
            if (m := re.fullmatch(r"\s*(\d+)\s*[–-]\s*(\d+)\s*", _s(a.get("rating")))):
                a["rating"] = f"{m.group(1)}–{m.group(2)}"  # one dash (en, as Commlink6 prints it) for every rating range
            kids = "".join(f"<{t}{_attrs(ca)}>{escape(_s(tx))}</{t}>" if tx is not None else f"<{t}{_attrs(ca)}/>"
                           for t, ca, tx in e["children"])
            lines.append(f"  <{tag}{_attrs(a)}><name>{escape(_s(e['name']))}</name>{kids}</{tag}>\n")
        return (HEAD + f"<!-- Generated by the importer ({self.note}. -->\n"
                f'<sr6:data xmlns:sr6="{NS}" kind="{kind}" version="1">\n' + "".join(lines) + "</sr6:data>\n")

    def texts_xml(self):
        body = "".join(f"  <text of={quoteattr(of)} id={quoteattr(i)}>{escape(_s(t))}</text>\n" for of, i, t in self.texts)
        return (HEAD + "<!-- PRIVATE: book text. Do not commit. -->\n"
                f'<sr6:data xmlns:sr6="{NS}" kind="texts" version="1">\n{body}</sr6:data>\n')


def merge_xml(old, new):
    """One kind's catalog file (xml()'s shape) with another's entries added; an entry of `new` replaces the one of
    `old` with its id (the book's own reading is the closer one)."""
    entry = re.compile(r'  <\w+ id="([^"]+)"')
    add = [ln for ln in new.splitlines(keepends=True) if entry.match(ln)]
    ids = {entry.match(ln).group(1) for ln in add}
    keep = [ln for ln in old.splitlines(keepends=True) if not ((m := entry.match(ln)) and m.group(1) in ids)]
    out = "".join(keep)
    i = out.rindex("</sr6:data>")
    return out[:i] + "".join(add) + out[i:]


def _attrs(d):
    return "".join(f" {k}={quoteattr(_s(v))}" for k, v in d.items() if v is not None and v != "")


# what a weapon's ammunition comes in, as the books' AMMO cells abbreviate it (the game's vocabulary)
AMMO_HOLDERS = {"internal magazine": "m", "clip": "c", "drum": "d", "belt": "belt", "cylinder": "cy",
                "break action": "b", "muzzle": "ml"}
_COUNT_WORDS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve")
_AMMO_TEXT = re.compile(r"\b(" + "|".join(AMMO_HOLDERS) + r")s?\b[^.]{0,40}?\bhold(?:s|ing)?\s+(?:up\s+to\s+)?(\d+|"
                        + "|".join(_COUNT_WORDS) + r")\s+(?:bolts?|rounds?|arrows?|darts?|shells?|shots?|grenades?)\b", re.I)


SUPPLIES = ("fuel", "ammo", "ammunition", "rounds", "bolts", "arrows", "darts", "rockets", "missiles", "grenades",
            "batteries", "power packs")  # what a weapon's supply table is titled after (the game's words)


_SERIES = re.compile(r"\b(X{2,})(-?\d+)\b")


_KNOWN = re.compile(r"\bknown\s+as\s+(?:the\s+)?[“\"]?([A-Z][\w+'’\-]*(?:\s+[A-Z0-9][\w+'’\-]*)*)")
_SAID_OF = re.compile(r"\b(?:variants?|versions?|models?)\b[^,;()]*$", re.I)


# what a description says its things come in: `Skateboards can be found in both hardened and bladed versions, while
# roller skates only come in bladed`
_COME_IN = re.compile(r"\b([a-z]+(?:\s+[a-z]+)?)s\s+(?:can\s+be\s+found|(?:only\s+)?comes?|are\s+(?:only\s+)?(?:available|sold))"
                      r"\s+(?:only\s+)?in\s+(?:both\s+)?([a-z]+)(?:\s+(?:and|or)\s+([a-z]+))?", re.I)


def version_names(name, text):
    """(owner, 2026-10-08) A variant row `Item (Version)` whose description says which things come in that version
    (`Skateboards can be found in both hardened and bladed versions, while roller skates only come in bladed` under
    `Rolling Blades`): `Skateboard (hardened)`, `Roller skate (bladed)`, search names."""
    m = re.fullmatch(r"(.+?)\s*\(([A-Za-z]+)\)", name or "")
    if not m:
        return []
    v = m.group(2).lower()
    t = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join((text or "").replace("**", "").split()))
    out = []
    for c in _COME_IN.finditer(t):
        noun = re.sub(r"^(?:while|and|but|the)\s+", "", c.group(1).lower())
        if v in {x.lower() for x in c.groups()[1:] if x} and noun not in ("version", "model"):
            out.append(f"{noun[:1].upper()}{noun[1:]} ({v})")
    return out


_IRREGULAR = {"feet": "foot", "teeth": "tooth", "mice": "mouse", "men": "man", "women": "woman"}


def word_stems(name):
    """A name's words as a set of rough stems, `and`/`or`/`of` left out: `webbed hands and feet` and `Hand and foot
    webbing` are both {web, hand, foot}."""
    out = set()
    for w in re.findall(r"[a-z]+", (name or "").lower()):
        if w in ("and", "or", "of", "the", "a", "an"):
            continue
        w = _IRREGULAR.get(w, w)
        w = re.sub(r"(?:ing|ed|es|s)$", "", w) if len(w) > 4 else w
        w = re.sub(r"([b-df-hj-np-tv-z])\1$", r"\1", w)  # (`webb` of webbed, webbing)
        out.add(w)
    return frozenset(out)


def known_as(name, text):
    """(owner, 2026-10-08) Another name an item's own description gives it, a search name: `Collectively known as
    “Zippies”` opening a sentence, `the Utility-One (also known as the U1)` after the item's own product name,
    `wraith paint was also known as “Nopaint”` with the item as the subject, `the licensed variants are simply known
    as the Krime IV+` said of its variants. Not a thing it mentions (`a rocker … known as Bobby V`, `an engine known as
    the F245`, `the original White Knight (known as Mod 1 …)`)."""
    out, words = [], {w for w in norm(name).split() if len(w) > 3}
    for sent in re.split(r"(?<=[.!?])\s+", re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join((text or "").split()))):
        for m in _KNOWN.finditer(sent):
            x, before = m.group(1).strip(), sent[:m.start()]
            if len(x) < 2 or len(x) <= 3 and x.isalpha() and sent.rstrip().endswith(x + "."):
                continue  # (`the St.` of `St. Bernard`, the sentence cut at its point)
            pm = re.search(r"([A-Z][\w’'-]*(?:\s+[\w’'-]+){0,4})\s*\(\s*(?:also\s+)?$", before)
            subj = re.search(r"\b(?:is|are|was|were)\s+(?:also\s+|simply\s+|commonly\s+|better\s+)?$", before)
            if re.fullmatch(r"\W*(?:[A-Z]\w*\s+)?", before) or _SAID_OF.search(before) \
                    or pm and norm(name).endswith(norm(pm.group(1))) \
                    or subj and words and words <= set(norm(before).split()):
                out.append(x)
    return out


def series_models(name, text):
    """A series named with a placeholder (`Zap XX-10 Series`): the models its text prints in the placeholder's place
    (`ZB-10`, `QB-10`), each as `Zap ZB-10`."""
    m = _SERIES.search(name)
    if not m or not text:
        return []
    stem = re.sub(r"\s+series\s*$", "", name, flags=re.I)
    codes = re.findall(rf"\b([A-Z]{{{len(m.group(1))}}}){re.escape(m.group(2))}\b", text)
    return [stem.replace(m.group(0), c + m.group(2)) for c in dict.fromkeys(codes) if c != m.group(1)]


def regroup_stem(w):
    return formula._stem(w)


def _short_rule(rule, field):
    """The part of a derivation rule about one field, as printed (`fifty percent more Essence`)."""
    word = "essence" if field == "essence" else "nuyen"
    m = re.search(rf"[\w-]+\s*(?:%|percent)\s+(?:more|less)\s+{word}", rule, re.I)
    return f"{m.group(0)} than the base item" if m else rule


CODE = re.compile(r"[A-Za-z]{0,3}-?\d+[A-Za-z]{0,2}|[A-Z]{2,5}")  # a row named by a code: `m60`, `B25`, `HEX`
_CLASS_WORDS = re.compile(r"\s+(?:ammunition|ammo|rounds)$", re.I)


def group_name(head):
    """A group row's name as its rows' group: its last word singular, the rest as printed (`DocWagon contracts` ->
    `DocWagon contract`, `Slap patches` -> `Slap patch`)."""
    ws = head.split()
    if not ws:
        return head
    last = categories.singular(ws[-1].lower())
    if last == ws[-1].lower():
        last = ws[-1]  # (as printed: `Zoé Heritage Line`, `System (MEMS)`)
    elif ws[-1][:1].isupper():
        last = last[:1].upper() + last[1:]
    return " ".join(ws[:-1] + [last])


def grouped_names(name, group):
    """The search names of a row named within its group (owner, 2026-10-07: as Commlink6 composes them): the row
    inside the group's name and in front of it (`Basic` in `DocWagon contract`: `DocWagon Basic contract`, `Basic
    DocWagon contract`); a row ending in the group's own last word once (`Antidote patch` in `Slap patch`: `Slap
    Antidote patch`). A qualifier the row's name ends with (`(month)`) stays at the end."""
    m = re.match(r"(.*?)\s*(\([^()]*\))?\s*$", name)
    core, tail = m.group(1), f" {m.group(2)}" if m.group(2) else ""
    gw, cw = group.split(), core.split()
    if not gw or not cw:
        return []
    if formula._stem(cw[-1].lower()) == formula._stem(gw[-1].lower()):
        return [" ".join(gw[:-1] + cw) + tail] if len(gw) > 1 else []
    return [" ".join(gw[:-1] + cw + gw[-1:]) + tail, f"{core} {group}{tail}"]


def printed_short(name, index):
    """A part of a row printing two names that the book never prints whole (`Colt Government Manhunter` from `Colt
    Government 2076/Manhunter`): its first and last words when the book prints those together (`Colt Manhunter`, in
    the text and the NPCs' gear), as its other name."""
    ws = name.split()
    if index is None or len(ws) < 3 or index.mentions(name):
        return []
    short = f"{ws[0]} {ws[-1]}"
    return [short] if index.mentions(short) else []


def code_alias(name, title):
    """A row named only by a code (and no heading's fuller name) takes its table's title in front as its other name,
    the title's last word made
    singular and an `Ammunition` word dropped (`m60` in `Mortar bombs`: `Mortar bomb m60`; `B60` in `Autocannon
    Ammunition`: `Autocannon B60`)."""
    stem = _CLASS_WORDS.sub("", (title or "").strip())
    if not CODE.fullmatch(name.strip()) or not stem or not stem[:1].isalpha() or len(stem.split()) > 4:
        return []
    w = stem.split()
    last = w[-1][:-3] + "y" if w[-1].lower().endswith("ies") else w[-1][:-1] if re.search(r"[^s]s$", w[-1]) else w[-1]
    return [" ".join(w[:-1] + [last, name.strip()])]


def supply_aliases(name, weapon):
    """`<words> Fuel` printed right after a weapon whose heading ends with those words (`Vehicle Flamethrower Fuel`
    after `Hellfire`, headed `Ares Hellfire Vehicle Flamethrower`) is that weapon's: `Hellfire Fuel`, `Fuel for
    Hellfire`. [] otherwise."""
    n = norm(name).split()
    sup = next((w for w in SUPPLIES if " ".join(n[-len(w.split()):]) == w), None)
    head = n[:-len(sup.split())] if sup else []
    if not sup or not head:
        return []
    for h in [weapon["name"], *weapon.get("aliases", ())]:
        if norm(h).split()[-len(head):] == head:
            w, s = weapon["name"], name.split()[-len(sup.split()):]
            return [f"{w} {' '.join(s)}", f"{' '.join(s)} for {w}"]
    return []


_MULTIPLE = re.compile(r"^\s*(?:x\s*\d+(?:\.\d+)?|\+\s*\d+\s*%)\s*¥?\s*$", re.I)  # (`x2¥`: a stray yen sign)
_AMMO_WORDS = re.compile(r"\b(?:ammo|ammunition|rounds?|bolts?|arrows?|warheads?|slugs?|shells?|bullets?)\b", re.I)


# an ammunition priced in a sentence as a multiple of the weapon's normal ammunition (`Small caliber railgun ammo is 3x
# the normal cost for the weapon type`): an ammunition type, its cost the multiplier
_AMMO_MULTIPLE = re.compile(r"(?:^|[.!?]\s+)([A-Z][\w-]*(?:\s+[\w-]+){0,4}?\s+(?:ammo|ammunition|rounds))\s+(?:is|are|costs?)\s+"
                            r"(\d+(?:\.\d+)?)\s*(?:x|×|times)\s+(?:the\s+)?(?:normal|base|regular|listed)\s+(?:cost|price)")
# an item priced in a sentence as another book's item (`The Foundation focus is a spell focus for purposes of cost,
# availability, and bonding cost (p. 168, SR6)`): its price fields that item's, at its own rating
_PRICED_AS = re.compile(r"\bThe\s+([A-Z][\w-]*(?:\s+[\w-]+){0,3}?)\s+is\s+an?\s+([\w-]+(?:\s+[\w-]+){0,3}?)\s+"
                        r"for\s+(?:the\s+)?purposes?\s+of\s+(cost[^()]*?)\s*\(p\.\s*\d+,\s*SR6\)")
_CORE = "crb"  # `SR6` in a cross-reference: the core rulebook
# a heading naming an item with the class it is one of: `Unique Qi Focus: Raptor Skull`
_CLASS_HEADING = re.compile(r"(?:(?:Unique|New)\s+)?((?:[A-Z][a-z]+\s+){0,2}Focus):\s*([A-Z].+)")


# an item a heading prices in one line of its text: `Availability 6, Cost 5,000¥`
_PRICE_LINE = re.compile(r"^\s*Avail(?:ability)?:?\s*(\d+\s*(?:\([A-Z]\))?)\s*,\s*Cost:?\s*([\d,]+)\s*¥\s*$", re.M)


# (owner, 2026-10-08) a replacement a section's prose prices, in figures or words: `a replacement instrument costs one
# thousand nuyen`
_NUMWORD = r"(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand)"
_REPLACEMENT_COSTS = re.compile(rf"\ba\s+replacement\s+([a-z]+(?:\s+[a-z]+)?)\s+costs\s+([\d,]+|{_NUMWORD}(?:[\s-]+(?:and\s+)?{_NUMWORD})*)\s*(?:¥|nuyen)\b", re.I)
_UNITS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
          "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50}


# an item a note prices in a sentence, with its availability: `Shadowmarket solvent spray in a 10-dose aerosol can be
# purchased for 150¥ and has an availability of 6(I)` (not a price by a rule: `500 nuyen x the critter's Body`)
_PURCHASED = re.compile(r"(?:^|[.!?:]\s+)([A-Z][\w-]*(?:\s+[a-z][\w-]*){0,3}?)\s+(?:in\s+an?\s+[\w-]+(?:\s+[\w-]+){0,2}\s+)?"
                        r"can\s+be\s+(?:purchased|bought)\s+for\s+([\d,]+)\s*(?:¥|nuyen)(?!\s*x\b)"
                        r"(?:\s+and\s+has\s+an?\s+availability\s+of\s+(\d+\s*(?:\(\s*[LI]\s*\)|[LI])?))?")


def number_words(s):
    """`one thousand` -> 1000, `two hundred fifty` -> 250, `1,500` -> 1500; None when it isn't a number."""
    s = s.strip().lower()
    if re.fullmatch(r"[\d,]+", s):
        return int(s.replace(",", ""))
    total, cur = 0, 0
    for w in re.split(r"[\s-]+", s):
        if w == "and":
            continue
        if w in _UNITS:
            cur += _UNITS[w]
        elif w == "hundred":
            cur = max(cur, 1) * 100
        elif w == "thousand":
            total, cur = total + max(cur, 1) * 1000, 0
        else:
            return None
    return total + cur


_RUNIN_NAME = re.compile(r"^\W{0,3}\*\*([A-Z][^*:]{1,40}?):\*\*")


_DV_RANGE = re.compile(r"^\s*\(\s*(\d+)\s*[–-]\s*(\d+)\s*\)\s*([PS])\s*[*†‡]*\s*$")
_SETTINGS = re.compile(r"\b([a-z]+)\s*\(\s*(\d+)\s*([PS])\s*\)\s*or\s*([a-z]+)\s*\(\s*(\d+)\s*([PS])\s*\)")


def dv_settings(bs, cat, offset):
    """(owner, 2026-10-08) A weapon whose DV prints a range (`(5–10)S†`) where its page's text names two settings in
    that range (`the setting of the device—low (5S) or high (10S)`): its DV the first setting's (the default), each
    setting a configuration of it (`Handheld (low)`, `Handheld (high)`: configOf, not priced apart)."""
    texts = {}
    for b in bs:
        texts.setdefault(max(1, b.page - offset), []).append(re.sub(r"(?<=[a-z])- (?=[a-z])", "",
                                                                    " ".join((b.text or "").replace("**", "").split())))
    for e in list(cat.entries["weapons"]):
        m = _DV_RANGE.match(e["attrs"].get("dv") or "")
        if not m or e["attrs"].get("configOf"):
            continue
        lo, hi, kind = int(m.group(1)), int(m.group(2)), m.group(3)
        near = " ".join(t for p in (e["page"] - 1, e["page"], e["page"] + 1) for t in texts.get(p, ()))
        hit = next((x for x in _SETTINGS.finditer(near) if x.group(3) == x.group(6) == kind
                    and lo <= int(x.group(2)) <= hi and lo <= int(x.group(5)) <= hi), None)
        if not hit:
            continue
        e["attrs"]["dv"] = f"{hit.group(2)}{kind}"
        e["children"] = [c for c in e["children"] if c[1].get("field") != "dv"]
        for word, n in ((hit.group(1), hit.group(2)), (hit.group(4), hit.group(5))):
            attrs = {k: v for k, v in e["attrs"].items() if k not in ("cost", "avail")}
            attrs.update(dv=f"{n}{kind}", configOf=e["id"], avail="—", cost="—")
            cat.add("weapons", f"{e['name']} ({word})", e["page"], attrs, (), "")


def run_in_items(bs, cat, offset):
    """(owner, 2026-10-08) A bold run-in printed between two run-ins that name rows of one group (`**Increased
    Myelination:**` between `**Hyper-Glucagon:**` and `**Myostatin Inhibitor:**`, the rows `Genotype Enhancement
    (Hyper-Glucagon)`, `… (Myostatin Inhibitor)`) is an item of that group the table leaves out: `Genotype Enhancement
    (Increased Myelination)`, its neighbours' kind and category, its values missing (issues)."""
    parts = {}  # norm(part) -> (kind, entry) for grouped rows `Group (Part)`
    for kind in ROW_KINDS:
        for e in cat.entries[kind]:
            if m := re.fullmatch(r"(.+?)\s+\((.+)\)", e["name"]):
                # (a part with its own parenthetical, `Fear Response Dampener (basic)`, under its bare name too)
                for part in dict.fromkeys([m.group(2), re.sub(r"\s*\([^()]*\)\s*$", "", m.group(2))]):
                    parts.setdefault(norm(part), (kind, e, m.group(1)))
    have = {norm(e["name"]) for k in ROW_KINDS for e in cat.entries[k]}
    # (every name the book's rows go by: their own, their search names, their parts; a run-in naming one, or heading
    # several (`Pathogen Resistance` over its `(general)` and `(specific)` rows), is no left-out item)
    known = have | set(parts) | {norm(a) for k in ROW_KINDS for e in cat.entries[k] for a in e.get("aliases", ())}
    for b in bs:
        names = [m.group(1).strip() for ln in (b.text or "").splitlines() if (m := _RUNIN_NAME.match(ln))]
        for i in range(1, len(names) - 1):
            a, x, c = parts.get(norm(names[i - 1])), names[i], parts.get(norm(names[i + 1]))
            g = norm(f"{a[2]} {x}") if a else ""
            if not a or not c or a[2] != c[2] or a[0] != c[0] or norm(x) in known \
                    or any(k.startswith(norm(x) + " ") or k.startswith(g + " ") for k in known) \
                    or x.isupper() and any(len(k) == len(norm(x)) and sum(p != q for p, q in zip(k, norm(x))) == 1
                                           for k in parts):
                continue  # (a part's typo, `NDE` for the row `NDI`: the corpus pass makes it the row's search name)
            kind, e, group = a
            name = f"{group} ({x})"
            if norm(name) in have:
                continue
            have.add(norm(name))
            attrs = {k: v for k, v in e["attrs"].items() if k in ("type", "category", "group")}
            kids = [("issue", {"field": f, "code": "missing", "page": e["page"]}, f"no {f} printed: the table leaves it out")
                    for f in ("essence", "avail", "cost") if f in e["attrs"] or f == "cost"]
            cat.add(kind, name, e["page"], attrs, kids, "")


def sentence_items(bs, offset):
    """[(kind, name, page, attrs, children, text)] of the items a book prices only in a sentence of another block's
    text (_AMMO_MULTIPLE, _PRICED_AS), each once (a description printed twice: its first)."""
    heads = {norm(b.name): b.name for b in bs}
    out, seen = [], set()
    for b in bs:
        text = " ".join(" ".join([b.text, *b.labels.values()]).split())
        page = max(1, b.page - offset)
        for m in _AMMO_MULTIPLE.finditer(text):
            name = m.group(1)[:1].upper() + m.group(1)[1:]
            if norm(name) not in seen:
                seen.add(norm(name))
                out.append(("ammotypes", name, page, {"category": "Ammo type", "cost": f"x{m.group(2)}"}, (), m.group(0).strip(". ")))
        if b.row is None and (m := _PRICE_LINE.search(b.text or "")):  # `Availability 6, Cost 5,000¥` under a heading
            words = b.name.split()
            name = " ".join(words[:-1] + [categories.singular(words[-1])]) if b.name[:1].islower() else b.name
            name = name[:1].upper() + name[1:]
            if norm(name) not in seen and norm(name) not in {norm(x.name) for x in bs if x.row is not None}:
                seen.add(norm(name))
                out.append(("gear", name, page, {"category": b.section or b.chapter or "Gear",  # (its section's)
                                                 "avail": " ".join(m.group(1).split()), "cost": m.group(2).replace(",", "")},
                            (), b.text))
        for m in _PURCHASED.finditer(re.sub(r"\*\*", "", text)):
            name = m.group(1)[:1].upper() + m.group(1)[1:]
            if norm(name) not in seen:
                seen.add(norm(name))
                attrs = {"category": b.section or "Gear", "cost": m.group(2).replace(",", "")}
                kids = ()
                if m.group(3):
                    attrs["avail"] = " ".join(m.group(3).split())
                else:
                    kids = (("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it"),)
                out.append(("gear", name, page, attrs, kids, m.group(0).strip(" .")))
        for m in _REPLACEMENT_COSTS.finditer(text):
            name, price = f"Replacement {m.group(1).lower()}", number_words(m.group(2))
            if price is not None and norm(name) not in seen:
                seen.add(norm(name))
                out.append(("gear", name, page, {"category": "Supply", "cost": str(price)},
                            (("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it"),),
                            m.group(0).strip(". ")))
        if (m := _CLASS_HEADING.fullmatch(b.name.strip())) and norm(m.group(2)) not in seen:
            # (owner, 2026-10-08) `Unique Qi Focus: Raptor Skull`: an item of a class the core rulebook prices, priced as
            # that class at its own Force; the bonding Karma its text prints (`(Force x 3) Karma`) its own
            name, base = m.group(2).strip(), m.group(1).strip()
            seen.add(norm(name))
            ref = f"gear:{_CORE}.{slug(base)}"
            kids = [("formula", {"field": f}, f"ref({ref}, {f}, R)") for f in ("cost", "avail")]
            attrs = {"category": "Foci", "cost": f"As {base.lower()}", "avail": f"As {base.lower()}"}
            if k := re.search(r"(?i)\bbond\b[^.]*?\(\s*Force\s*x\s*(\d+)\s*\)\s*Karma", text):
                attrs["karma"] = f"Force x {k.group(1)}"
                kids.append(("formula", {"field": "karma"}, f"R*{k.group(1)}"))
            out.append(("gear", name, page, attrs, tuple(kids), b.text))
        for m in _PRICED_AS.finditer(text):
            name, base, fields = heads.get(norm(m.group(1)), m.group(1)), m.group(2), m.group(3)
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            flds = [f for f, w in (("cost", "cost"), ("avail", "availability"), ("karma", "bonding")) if w in fields]
            ref = f"gear:{_CORE}.{slug(base)}"
            kids = tuple(("formula", {"field": f}, f"ref({ref}, {f}, R)") for f in flds)
            attrs = {"category": "Foci" if base.lower().endswith("focus") else "", **{f: f"As {base}" for f in flds}}
            out.append(("gear", name, page, {k: v for k, v in attrs.items() if v}, kids, m.group(0).strip(". ")))
    return out


# (owner, 2026-10-08) a supply priced in an item's text: `Batteries cost 100¥ each`, `Tank refills are 200¥ each`,
# `Replacement pitons cost 300 per set`
_SUPPLY = re.compile(r"(?:^|[.!?:]\s+)(?:The\s+)?([A-Z][a-z]+(?:\s+[a-z]+){0,2}?)\s+(?:costs?|are|is)\s+([\d,]+)\s*"
                     r"(?:(?:¥|nuyen)\s+each|(?:¥|nuyen)?\s*per\s+set)\b")
# an add-on priced in an item's text: `a proprietary laser sight (additional 50 nuyen)`, `“stabilizing arm-brace” for an
# additional 100 nuyen`
_ADD_ON = re.compile(r"\b(?:an?|the)\s+(?:[a-z-]+\s+){0,3}?([a-z][\w-]*(?:\s+[a-z][\w-]*){0,2})\s*\(\s*(?:an\s+)?additional\s+"
                     r"([\d,]+)\s*(?:¥|nuyen)\s*\)"
                     r"|[“\"]([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})[”\"]\s+for\s+an\s+additional\s+([\d,]+)\s*(?:¥|nuyen)")
_PER_SPARE = re.compile(r"\b([a-z]+)\s*\(\s*([\d,]+)\s*(?:¥|nuyen)\s+per\s+spare\s*\)")
_ADDITIONAL = re.compile(r"^\s*(?:an?\s+)?additional\s+([\d,]+)\s*¥?\s*$", re.I)
# a refill or replacement parts priced in an item's text: `can be completely refilled for 50 nuyen`, `replacement balloons
# and panels are available as aftermarket accessories for 100 nuyen each`
_REFILL = re.compile(r"\brefill(?:ed)?\s+for\s+([\d,]+)\s*(?:¥|nuyen)")
_REPLACEMENT = re.compile(r"\breplacement\s+([a-z]+)(?:\s+and\s+([a-z]+))?\s+(?:are|is)\s+available\b[^.()]*?\bfor\s+"
                          r"([\d,]+)\s*(?:¥|nuyen)\s+each")
# a price column naming a second thing it prices in parentheses (`COST (RECHARGE)`), and that price (`1,100¥ (200¥)`)
_COST_OF = re.compile(r"^\s*COST\s*\(\s*([A-Za-z][A-Za-z ]*?)\s*\)\s*$", re.I)
_SECOND_THINGS = {"RECHARGE", "REFILL"}  # such a column's second thing, once a recipe has split it off
_SECOND_PRICE = re.compile(r"\(\s*([\d,]+)\s*¥?\s*\)\s*$")
_NOT_MODIFIERS = {"a", "an", "the", "its", "their", "his", "her", "and", "or", "of", "for", "to", "with", "new", "replacement"}


def _named_before(text, noun, end):
    """A bare noun as the text first named it, with its modifier (`panels` after `balloon and solar panel components`:
    `solar panel`), else the noun."""
    m = re.search(rf"\b([a-z]+)\s+{re.escape(noun)}s?\b", text[:end])
    return f"{m.group(1)} {noun}" if m and m.group(1) not in _NOT_MODIFIERS else noun


_TRIPLE = re.compile(r"([a-z])\1{2,}")  # no English word prints a letter three times (lower case: not `III`, `AAA`)


def _flat(text):
    return re.sub(r"(?<=[a-z])-\s+(?=[a-z])", "", " ".join((text or "").split()))  # (`sta- bilizing`)


def add_ons(cat):
    """Supplies and accessories an item's own text prices (owner, 2026-10-08), each linked to the item:
    - `Batteries cost 100¥ each`: gear `<item> battery` (`Battery for <item>`), `supplyOf` the item;
    - `a proprietary laser sight (additional 50 nuyen)`, `“stabilizing arm-brace” for an additional 100 nuyen`: an
      accessory `<item> <add-on>`, `accessoryOf` the item, what the text states it does to the item its effects
      (effects.accessory);
    - a box row priced `additional 100¥` (`Tactical hammer (knife/spike)`) is an accessory of the box's other rows
      (`Tactical hammer (short)`, `(long)`): its own price the addition.
    Their availability the book doesn't print: an issue."""
    hosts = [(k, e) for k in sorted(ROW_KINDS) for e in cat.entries[k] if not e["attrs"].get("supplyOf")]
    for kind, e in hosts:
        m = _ADDITIONAL.match(str(e["attrs"].get("cost") or ""))
        if m and "(" in e["name"]:
            stem = e["name"][:e["name"].index("(")].strip().lower()
            sib = [x["id"] for x in cat.entries[kind] if x is not e and x["name"].lower().startswith(stem + " (")
                   and re.fullmatch(r"[\d.]+", str(x["attrs"].get("cost") or ""))]
            if sib:
                e["attrs"].update(cost=m.group(1).replace(",", ""), accessoryOf=" ".join(sib))
                e["children"] = [c for c in e["children"] if not (c[0] == "issue" and c[1].get("field") == "cost")]
    seen = {norm(e["name"]) for k in ROW_KINDS for e in cat.entries[k]}
    for kind, e in hosts:
        text = _flat("\n".join([e.get("text") or "", *[str(v) for v in (e.get("row") or {}).values()]]))
        page, label = e["page"], e["name"]
        for m in _SUPPLY.finditer(text):
            one = categories.singular(m.group(1).lower())
            name = f"{label} {one}"
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            cat.add("gear", name, page, {"category": "Supply", "cost": m.group(2).replace(",", ""), "supplyOf": e["id"]},
                    [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it")],
                    m.group(0).strip(" .:"), aliases=[f"{one[:1].upper()}{one[1:]} for {label}"])
        supplies = [("refill", m.group(1), m) for m in _REFILL.finditer(text)]
        for k, v in (e.get("row") or {}).items():  # a `COST (RECHARGE)` column printing `1,100¥ (200¥)`
            if (h := _COST_OF.match(k or "")) and (m := _SECOND_PRICE.search(str(v or ""))):
                supplies.append((h.group(1).lower(), m.group(1), m))
            elif k in _SECOND_THINGS and (m := re.match(r"^\s*([\d,]+)\s*¥\s*$", str(v or ""))):  # (a recipe split it)
                supplies.append((k.lower(), m.group(1), m))
        # (owner, 2026-10-08) `a single specially designed magazine (30¥ per spare)`: its spare magazine
        supplies += [("spare " + m.group(1), m.group(2), m) for m in _PER_SPARE.finditer(text)]
        for m in _REPLACEMENT.finditer(text):
            supplies += [("replacement " + _named_before(text, categories.singular(t), m.start()), m.group(3), m)
                         for t in m.groups()[:2] if t]
        for thing, price, m in supplies:
            r = re.match(r"^(.*?)\s*(\(rating \d+\))$", label, re.I)
            name = f"{r.group(1)} {thing} {r.group(2)}" if r else f"{label} {thing}"
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            cat.add("gear", name, page, {"category": "Supply", "cost": price.replace(",", ""), "supplyOf": e["id"]},
                    [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it")],
                    m.group(0).strip(" .:"))
        for m in _ADD_ON.finditer(text):
            thing, price = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
            name = f"{label} {thing}"
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            fx = effects.accessory(text, thing)
            cat.add(kind if kind == "weapons" else "gear", name, page,
                    {"category": "Weapon accessory" if kind == "weapons" else "Accessory",
                     "cost": price.replace(",", ""), "accessoryOf": e["id"]},
                    [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it"),
                     *fx], m.group(0).strip(" .:"))


# --- the owner's final decisions (importer v6, 2026-10-08) ------------------------------------------------------------

# (owner, CRB example 5) the magic types: a fixed vocabulary, like the attributes (core rulebook pp. 65-66)
MAGIC_TYPES = (("Full magician", 65), ("Aspected magician", 65), ("Mundane", 65), ("Adept", 66), ("Mystic adept", 66),
               ("Technomancer", 66))
# (owner, CRB example 6) the licence types Fake License's choice offers: the four its text prints (p. 273) and the common
# ones the sample characters' fake SINs carry; any other Licensed (L) item is written in
LICENCE_TYPES = ("Hunting license", "Firearm license", "Concealed carry license", "Spellcasting license",
                 "Cyberware license", "Cyberdeck license", "Rigger remote console license", "Driver's license")
_SPEND = re.compile(r"^Spend an? (Major|Minor) Action to\b")
_CHOOSE_SENSE = re.compile(r"\b(?:select|choose|pick)\s+an?\s+sense\s*\(([^()]+)\)", re.I)
_GAINS = re.compile(r"\bgains?\s+the\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)\s*\(([^(),]+),\s*(\d+)\)\s+(positive|negative)\s+quality\b")
_LIST_BELOW = re.compile(r"\bselected\s+from\s+the\s+(?:list|table)\s+below\b", re.I)
_RUN_IN = re.compile(r"^\*\*([A-Z][^*]{1,40}?)\.\*\*\s*(.*)$")
_ANY_HOST = re.compile(r"\bAny\s+(?:piece\s+of\s+)?([a-z]+)\s+can\s+have\s+an?\s+[^.]*?\bfor\s+([\d,]+)\s*(?:¥|nuyen)")
_LIST_SPLIT = re.compile(r"\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+")


def _first_sentences(text, n=2):
    return re.split(r"(?<=[.!?])\s+", _flat(re.sub(r"\*\*", "", text or "")))[:n]


def _items(value):
    """A label's list (`Accident, Astral Form, Skill (choose one from A, B, or C …)`) split at its top-level commas."""
    out, depth, cur = [], 0, ""
    for ch in value:
        depth += (ch in "([") - (ch in ")]")
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    return [x for x in out + [cur.strip()] if x]


def _skill_choices(defn):
    """The choices a power's bracketed definition offers: `choose one from Biotech, …, or Piloting and a Specialization
    in the chosen skill as well as an appropriate Knowledge Skill`; `choose any Close Combat skill specialization`."""
    if m := re.search(r"\bchoose\s+any\s+(.+?)\s+skill\s+specialization\b", defn, re.I):
        return [("choice", {"kind": "specialization", "category": m.group(1), "count": "1"}, None)]
    kids = []
    if m := re.search(r"\bchoose\s+one\s+(?:from|of)\s+(.+?)(?=\s+and\s+an?\s+specialization\b|\s+as\s+well\s+as\b|$)",
                      defn, re.I):
        opts = [x for x in _LIST_SPLIT.split(m.group(1)) if x]
        kids.append(("choice", {"kind": "skill", "count": "1", "from": "; ".join(opts)}, None))
    if kids and re.search(r"\bspecialization\b", defn, re.I):
        kids.append(("choice", {"kind": "specialization", "count": "1"}, None))
    if re.search(r"\bknowledge\s+skill\b", defn, re.I):
        kids.append(("choice", {"kind": "knowledgeskill", "count": "1"}, None))
    return kids


# a rating-band price table's columns by what they print, under any of the book's headers (a later printing adds an
# AVAILABILITY column to the core rulebook's Explosive Packages: `RATING | AVAILABILITY | COST`)
_BAND_COLUMNS = {"RATING": "rating", "COST": "cost", "AVAILABILITY": "avail", "AVAIL": "avail", "AVAIL.": "avail"}


def _band_tier(rows, header=("RATING", "COST")):
    """A rating-band price table read by its columns (_BAND_COLUMNS; RATING and COST required, any other column not a
    band table's): (`tier(R; 1-3: R*10; …)` of the cost, the availability's tier or None, lowest rating, highest rating,
    the availability's legality letter when every band prints the same one); None when it isn't one. A row naming an
    item instead of a band (`Detonator Cap`) is the item's, not a band."""
    cols = {_BAND_COLUMNS.get(" ".join(h.split()).upper()): i for i, h in enumerate(header)}
    if None in cols or not {"rating", "cost"} <= set(cols):
        return None
    cost, avail, legal = [], [], set()
    for r in rows:
        cell = lambda k: (r[cols[k]] or "") if k in cols and cols[k] < len(r) else ""  # noqa: E731
        b = re.fullmatch(r"\s*(\d+)\s*[–-]\s*(\d+)\s*", cell("rating"))
        if not b:
            continue
        c = re.fullmatch(r"\s*Rating\s*[x×]\s*([\d,]+)\s*¥?\s*", cell("cost"), re.I)
        a = re.fullmatch(r"\s*(\d+)\s*(?:\(([LIF])\)|([LIF]))?\s*", cell("avail"))
        if not c or "avail" in cols and not a:
            return None
        band = f"{b.group(1)}-{b.group(2)}"
        cost.append((int(b.group(1)), int(b.group(2)), f"{band}: R*{c.group(1).replace(',', '')}"))
        if a:
            avail.append(f"{band}: {a.group(1)}")
            legal.add(a.group(2) or a.group(3) or "")
    if not cost:
        return None
    return (f"tier(R; {'; '.join(p for _, _, p in cost)})", f"tier(R; {'; '.join(avail)})" if avail else None,
            cost[0][0], cost[-1][1], legal.pop() if len(legal) == 1 else "")


def stated_items(bs, cat, offset, core=False):
    """The items the books state in prose, by the owner's general rules (2026-10-08):
    - an action: a heading whose first or second sentence is `Spend a Major/Minor Action to …` (Augmentation
      Overdrive), kept as a rule too (a section's forms are actions by sections.py);
    - a sense the text lets the player choose (`select a sense (sight, hearing, touch, taste, or smell)`): each sense an
      entry, the choice the item's;
    - a rule saying a character gains `the X (Y, N) negative quality`: X (Y), granted, 0 Karma, its level not capped;
    - a power named in a power list with its definition in brackets (`Skill (choose one from …)`) and no entry of its
      own: a critter power, the brackets its text and its choices;
    - a heading whose text ends `selected from the list below` and the bold run-ins of the box after it: options of
      that kind (true element focus options, category `True Earth sandcasting`), the heading's rule offering one;
    - `Any piece of armor can have a … applied to it for 100 nuyen`: an accessory of that host (category `Armor
      accessory`), its availability an issue;
    - a section's unpriced item headings its rating-band price table prices (`Explosive Packages`): rated, the tier
      formula their cost, their availability an issue (Conventional, Plastic and Foam Explosives);
    - the core rulebook's magic types and licence types (fixed vocabularies), Fake License choosing one."""
    names = {k: {norm(e["name"]) for e in es} for k, es in cat.entries.items()}

    def add(kind, name, page, attrs, kids=(), text="", cid=None, aliases=()):
        if norm(name) in names[kind] and not cid:
            return None
        names[kind].add(norm(name))
        return cat.add(kind, name, page, attrs, list(kids), text, cid=cid, aliases=aliases)

    def entry(kind, name):
        return next((e for e in cat.entries[kind] if norm(e["name"]) == norm(name)), None)

    for i, b in enumerate(bs):
        page = max(1, b.page - offset)
        text = _flat(re.sub(r"\*\*", "", b.text or ""))
        if b.row is None and not b.stats and (b.level or 0) >= 3 and (s := next(
                (s for s in _first_sentences(b.text) if _SPEND.match(s)), None)):
            bare = re.sub(r"\s*\((?:I|A)\)\s*$", "", b.name).strip()
            t = re.search(r"\((I|A)\)\s*$", b.name)  # (its timing: `Zanshin (A)`, anytime)
            if not {norm(bare), norm(b.name)} & names["actions"]:
                add("actions", bare[:1].upper() + bare[1:], page,
                    {"type": _SPEND.match(s).group(1).lower(), "category": b.section or b.chapter,
                     **({"timing": {"I": "initiative", "A": "anytime"}[t.group(1)]} if t else {})}, (), b.text)
        for m in _GAINS.finditer(text):
            add("qualities", f"{m.group(1)} ({m.group(2).strip()})", page,
                {"kind": m.group(4), "karma": 0, "granted": "true", "category": m.group(1)}, (), m.group(0))
        for label in ("Powers", "Optional Powers"):
            for it in _items(b.labels.get(label, "")):
                if (p := re.fullmatch(r"([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)\s*[(\[]\s*(choose\b.+?)\s*[)\]]", it)) \
                        and norm(p.group(1)) not in names["critterpowers"] | names["adeptpowers"]:
                    add("critterpowers", p.group(1), page, {}, _skill_choices(p.group(2)), p.group(2))
        if _LIST_BELOW.search(text) and i + 1 < len(bs) \
                and (h := re.fullmatch(r"(\w+?)\s+(?:with|in)\s+(True\s+\w+)", b.name.strip())):
            # (its box printed under it: in its own text after that sentence, else the next block's)
            body = (b.text or "").splitlines()
            body = body[next((k for k, ln in enumerate(body) if re.search(r"\bbelow\.", ln)), len(body)):]
            if not any(_RUN_IN.match(ln.strip()) for ln in body):
                body = (bs[i + 1].text or "").splitlines()
            starts = [k for k, ln in enumerate(body) if _RUN_IN.match(ln.strip())]
            if len(starts) >= 2:
                category = f"{h.group(2)} {h.group(1).lower()}"  # (`Sandcasting with True Earth`: True Earth sandcasting)
                for k, end in zip(starts, starts[1:] + [len(body)]):
                    m = _RUN_IN.match(body[k].strip())
                    para = [m.group(2)] + [ln for ln in body[k + 1:end] if not ln.startswith("<!--")]
                    add("trueelements", m.group(1), page, {"category": category}, (), _flat("\n".join(para)),
                        cid=slug(f"{category} {m.group(1)}"))
                if e := entry("rules", b.name):
                    e["children"].append(("choice", {"kind": "trueelement", "category": category, "count": "1"}, None))
        if b.type == "item" and b.row is None and (m := _ANY_HOST.search(text)):
            free = re.search(r"\bdoes\s+not\s+use\s+any\s+capacity\b", text)
            add("armor" if m.group(1) == "armor" else "gear", b.name, page,
                {"category": f"{m.group(1).capitalize()} accessory", "cost": m.group(2).replace(",", ""),
                 **({"capacity": "0"} if free else {})},
                [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it")], b.text)
        if b.type == "section" and b.level == 3 and b.name.split() and b.name.split()[-1][:1].isupper():
            sec = [d for d in bs[i + 1:i + 40] if d.section == b.section and d.chapter == b.chapter]
            # (the band table: its rows printed as one-row boxes, or as a table in the text)
            band = next(((d, t) for d in sec
                         for h, rows in ([(list(d.stats[0]), [list(x.values()) for x in d.stats])] if d.stats else [])
                         + md_tables(d.text)
                         if (t := _band_tier(rows, h))), None)
            if band:
                (tb, (tier, avail, lo, hi, legal)), noun = band, b.name.split()[-1]
                stem = noun.lower().rstrip("s")
                for d in sec:
                    if d is tb or d.row is not None or d.stats or d.type != "item":
                        continue
                    first = _first_sentences(d.text, 1)
                    subject = re.split(r"\s(?:is|are)\s", first[0])[0] if first else ""
                    if stem not in subject.lower() and stem not in d.name.lower():
                        continue  # (a detonator cap is used with them, it is none of them)
                    name = d.name if stem in d.name.lower() else f"{d.name} {noun}"
                    dp = max(1, d.page - offset)
                    priced = {"avail": f"By rating ({tb.name})" + (f"({legal})" if legal else "")} if avail else {}
                    add("weapons", name, dp, {"category": categories.singular(tb.name) or "Explosive", "rating": f"{lo}–{hi}",
                                              "cost": f"By rating ({tb.name})", **priced},
                        [("formula", {"field": "cost"}, tier),
                         *([("formula", {"field": "avail"}, avail)] if avail else
                           [("issue", {"field": "avail", "code": "missing", "page": dp}, "not printed: the packages table prices it")])],
                        d.text, aliases=[d.name] if name != d.name else ())
        for m in _CHOOSE_SENSE.finditer(text):
            for s in _LIST_SPLIT.split(m.group(1)):
                if s.strip():
                    add("senses", s.strip()[:1].upper() + s.strip()[1:], page, {}, (), m.group(0))
            owner = next((e for k in cat.entries if k != "rules" for e in cat.entries[k] if norm(e["name"]) == norm(b.name)), None)
            if owner is not None:
                owner["children"].append(("choice", {"kind": "sense", "count": "1"}, None))
    if core and any(es for k, es in cat.entries.items() if k not in ("magictypes", "licencetypes")):
        for n, p in MAGIC_TYPES:
            add("magictypes", n, p, {})
        for n in LICENCE_TYPES:
            add("licencetypes", n, 273, {})
        if fake := entry("gear", "Fake license"):
            fake["children"].append(("choice", {"kind": "licencetype", "count": "1", "free": "other (L) item"}, None))


def ammo_type(b):
    """A row priced as a multiple of the ammunition it modifies (a COST MULTIPLIER column, or `x2` / `+100%` in an
    ammunition table): an ammunition type, not an item of its own."""
    if b.row is None or not b.header:
        return False
    if any("MULTIPLIER" in h.upper() for h in b.header) or regroup.TYPES_TITLE.search(b.label or ""):
        return True  # (a row of a list titled as ammunition types: `warhead types`)
    cost = next((v for h, v in b.row.items() if h.upper() in ("COST", "PRICE")), "")
    multiple = _MULTIPLE.match(cost or "") or re.search(r"(?i)\bx\s*\d+(?:\.\d+)?\s+for\s+[a-z]+\b.*\bmaterials?\b", cost or "")
    return bool(multiple) and bool(_AMMO_WORDS.search(" ".join([b.name, b.label, b.section, *b.header])))


def ammo_from_text(text):
    """A weapon's ammo as its description words it (`internal magazines that hold up to four bolts` -> `4(m)`), or
    None."""
    m = _AMMO_TEXT.search(" ".join((text or "").split()))
    if not m:
        return None
    n = m.group(2).lower()
    n = str(_COUNT_WORDS.index(n)) if n in _COUNT_WORDS else n
    return f"{n}({AMMO_HOLDERS[m.group(1).lower()]})"


_MARK = re.compile(r"\s*([*†‡]+)")


def footnote(text, mark):
    """The footnote a mark refers to: a line of the block's text opening with it (`* Maximum range is 4 meters`), not
    a bold label (`**Wireless Bonus:**`)."""
    m = re.search(rf"^\s*{re.escape(mark)}(?![*†‡])\s*([^*\s].*?)\s*$", text or "", re.M)
    return m.group(1) if m else None


# a close-combat weapon's TYPE (`Blade`): the Close Combat specialization it is used with (the game's vocabulary)
CLOSE_COMBAT = {"blade": "Blades", "club": "Clubs", "unarmed": "Unarmed"}


def block_text(b, skip=()):
    """The block's prose: its box labels (those not already in its text, nor taken as lists), then its text."""
    lines = [f"**{k}:** {v}" for k, v in b.labels.items() if k not in skip and f"**{k}:**" not in b.text]
    return "\n".join(lines + ([b.text] if b.text else []))


def _karma_line(karma, text):
    """A quality's printed price, with its wrapped rest from the text when the label stopped short (regroup ends a
    label's value at a line opening with a capital: `**Bonus:** Common: 12 Karma; Uncommon: 9` + `Karma; Rare: …`)."""
    m = re.search(r"\*\*(?:Cost|Bonus):\*\*\s*(.*(?:\n(?!\*\*|\n).*)?)", text) if karma else None
    full = " ".join(m.group(1).split()) if m else ""
    return full if re.search(r"\d\s*$", karma) and full.startswith(karma) else karma


_INLINE_LABEL = re.compile(r";\s*\*\*([^*]+?):\*\*\s*")


def _label_text(text, label, value):
    """A labelled line's value, or its paragraph in the text (`**Label:**` to the next label line, blank line, table or
    heading) when that is longer: a list printed as labelled lines over its full paragraphs."""
    found = [m.group(1).strip() for m in re.finditer(
        rf"^(?:•\s*)?\*\*{re.escape(label)}:\*\*\s*(.+?)(?=\n(?:•\s*)?\*\*[^*\n]+:\*\*|\n\s*\n|\n[|#]|\n<!--|\Z)", text, re.M | re.S)]
    best = max(found, key=lambda t: len(" ".join(t.split())), default="")
    return best if len(" ".join(best.split())) > len(value) else value


def text_stats(b, cols):
    """The block with its stat band found in its text (a band printed after the description) and labels printed two to
    a line (`**Skills:** …; **Powers:** …`) split."""
    labels = {}
    for k, v in b.labels.items():
        parts = _INLINE_LABEL.split(v)
        labels[k] = parts[0].strip()
        labels.update({parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)})
    stats, text = list(b.stats), b.text
    if not stats:
        for header, rows in md_tables(b.text):
            if rows and any(h.upper() in cols for h in header):
                stats += [dict(zip(header, r)) for r in rows]
                md = "\n".join(["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
                               + ["| " + " | ".join(r) + " |" for r in rows])
                text = text.replace(md, "").strip()
    return replace(b, labels=labels, stats=stats, text=text)


def _side_by_side(b):
    """A box printing several beings side by side (`ice wyrm fire wyrm`: each band printed once per being,
    the labels two to a line) -> one block per being, named by an equal share of the title's words."""
    first = list(b.stats[0]) if b.stats else []
    n = sum(1 for s in b.stats if list(s) == first)
    words = b.name.split()
    if n < 2 or len(words) % n:
        return [b]
    k, groups = len(words) // n, {}
    for s in b.stats:
        groups.setdefault(tuple(s), []).append(s)
    if any(len(g) != n for g in groups.values()):
        return [b]
    out = []
    for i in range(n):
        labels = {}
        for key, v in b.labels.items():
            vs = re.split(rf"\s*\*\*{re.escape(key)}:\*\*\s*", v)
            labels[key] = vs[i] if len(vs) == n else v
        out.append(replace(b, name=" ".join(words[i * k:(i + 1) * k]).title(), stats=[g[i] for g in groups.values()],
                           labels=labels))
    return out


def block_md(b):
    """A block's row and stat bands as markdown tables (an item that becomes a rule keeps them in its text)."""
    rows = ([(b.header, [b.row.get(h, "") for h in b.header])] if b.row is not None else []) \
        + [(list(s), list(s.values())) for s in b.stats]
    return "\n".join("\n".join(["| " + " | ".join(h) + " |", "|" + "---|" * len(h), "| " + " | ".join(r) + " |"])
                     for h, r in rows)


# the words in an augmentation table's title, first header or category that name its type (the first found wins: a
# geneware table's header reads `BIOWARE GENEWARE …`); else cyberware
WARE_TYPES = (("symbiont", "symbionts"), ("transgenic", "transgenics"), ("geneware", "geneware"), ("genetic", "geneware"),
              ("nano", "nanoware"), ("bioware", "bioware"))


def ware_type(keys):
    """An augmentation's type (common.xsd): cyberware, bioware, geneware, nanoware, symbionts or transgenics."""
    hay = " ".join(keys).lower()
    return next((t for w, t in WARE_TYPES if w in hay), "cyberware")


def _variant_table(header):
    """A metatype ranges table titled by variant: first header VARIANT, at least four mental attributes' columns."""
    return bool(header) and header[0].upper() == "VARIANT" and len(
        {h.upper() for h in header} & {"WIL", "LOG", "INT", "CHA", "EDG"}) >= 4


def _kind(chapter, ctx, section, book):
    for ch, key, kind, cat in book.SECTIONS:
        if ch in chapter and (not section or kind in book.SECTION_KINDS) and (
                not key or any(key in c for c in ctx if (key[0] == "|") == (c[:1] == "|"))):
            return kind, cat
    return None, None


def spell_features(bs, cat, offset):
    """The features the book's spells are tagged with (`Direct Combat`, `Indirect Combat, Area`, `Single Sense`,
    Street Wyrd's `Focus`): each a spell feature of the book (CRB pp. 132, 137), described by the heading naming it
    (`Direct Combat Spells`, `Multi-Sense`) where the book prints one; left out where the recipe already read it."""
    spells = [b for b in bs if b.stats and {"RANGE", "DURATION"} <= {h.upper() for h in b.stats[0]} and b.tags]
    if not spells:
        return
    have = {norm(e["name"]) for e in cat.entries["spellfeatures"]}
    heads = {norm(re.sub(r"(?i)\s+spells?$", "", b.name)): b for b in bs if b.name and (b.text or "").strip() and not b.stats and b.row is None}
    for b in spells:
        for tag in re.split(r",\s*", b.tags):
            tag = tag.strip()
            if not tag or norm(tag) in have or not re.fullmatch(r"[A-Z][\w-]*(?: [A-Z][\w-]*){0,2}", tag) \
                    or tag.lower() in SPELL_CATEGORIES or re.search(r"(?i)\bspells?$", tag):
                continue  # (a spell's category is no feature)
            have.add(norm(tag))
            h = heads.get(norm(tag))
            page = max(1, (h.page if h else b.page) - offset)
            cat.add("spellfeatures", tag, page, {}, (), block_text(h) if h else "")


def read(regrouped, ctx, book):
    """regrouped: regroup's text, or its blocks. book: the recipe module whose tables drive the reading (ID, NAME, PUBLISHER, CANON, BOOK, PAGE_OFFSET, SECTIONS,
    SECTION_KINDS, LABEL_SECTIONS, RULE_CHAPTERS, ATTRIBUTE_CHAPTERS, CATALOG_CHAPTERS; optional fix(block, parent2)
    -> the block as this reading needs it, and kind(chapter, block, parent2) -> (kind, category) in place of
    SECTIONS)."""
    bk = book
    cat = Catalog(bk.ID, bk.ID.lower(), bk.BOOK)
    cat.unrated = getattr(bk, "UNRATED_NPCS", None)
    cat.split = getattr(bk, "split_being", None)
    chapter, parent2, sub, stack, seen_attrs, samples = None, "", "", [], set(), []
    bs = list(blocks(regrouped) if isinstance(regrouped, str) else regrouped)
    known = {norm(b.name) for b in bs if b.name} | {norm(b.row.get(b.header[0], "")) for b in bs if b.row and b.header}
    bs = [x for b in bs for x in stat_lines(b, known)]  # (a heading whose text holds its stat line: that item)
    cat.index = search.Index(bs, bk.PAGE_OFFSET, md_tables, shapes.RENAME)
    sec, found = sections.Reader(), []
    for b in bs:
        if b.chapter != chapter:
            chapter, parent2, sub, stack = b.chapter, "", "", []
        if b.type == "section" and b.level == 2:
            parent2 = b.name
        b = bk.fix(b, parent2) if hasattr(bk, "fix") else b
        cat.where = (b.chapter, b.section)
        ch, page = norm(b.chapter), max(1, b.page - bk.PAGE_OFFSET)
        found += sec.feed(b, page)  # the kinds the book prints as sections (actions, mentor spirits, …): sections.py
        for header, rows in md_tables(b.text):  # the priority and metatype tables (rule tables in regroup's output)
            cat.table(header, rows, page)
        if cat.last_meta is not None and not any(t == "trait" for t, _, _ in cat.last_meta["children"]) \
                and (q := next((v for k, v in b.labels.items() if re.match(r"racial qualit", k, re.I)), None)):
            cat.metatype([], [f"Racial Qualities: {q}"], page)  # printed as a labelled line under the table
        if b.row is not None and b.header and (b.header[0].upper() in ("PRIORITY", "METATYPE") or _variant_table(b.header)):
            cat.table(b.header, [[b.row.get(h, "") for h in b.header]], page)
            continue
        if getattr(bk, "ARCHETYPES", "archetypes") in ch and archetypes.is_archetype(b):  # sample characters
            samples.append((b.section or b.name, b, page))  # built once the catalog is read: they cite its entries
            continue
        section = b.type == "section"
        a = ATTRIBUTES.get(norm(b.name))
        if a and any(c in ch for c in bk.ATTRIBUTE_CHAPTERS) and a[0] not in seen_attrs:
            seen_attrs.add(a[0])
            cat.add("attributes", b.name, page, {"abbr": a[0], "group": a[1]}, (), block_text(b))
            if not section:
                continue
        if section:
            sub = ""
        if norm(b.name).endswith(" spells"):  # `Direct Glow Spells`: an item heading over its spells
            sub = norm(b.name)
        lk = next((k for (c, n), k in bk.LABEL_SECTIONS.items() if c in ch and n == norm(b.name)), None)
        if lk:
            lk, la = (lk, {}) if isinstance(lk, str) else lk
            for k, v in b.labels.items():
                cat.add(lk, k, page, dict(la), (), _label_text(b.text, k, v))
        if section:
            ctx_keys = [norm(parent2)] if b.level == 3 and parent2 else []
            kind, kcat = _kind(ch, ctx_keys, True, bk) if b.level == 3 else (None, None)
        else:
            ctx_keys = ([norm(x) for x in (b.header[0], b.label) if x] + ["|" + norm(" ".join(b.header))]
                        if b.row is not None else
                        [norm(x) for x in (b.label, b.section, parent2, sub) if x])
            kind, kcat = _kind(ch, ctx_keys, False, bk)
        if b.type == "item" and b.row is None and not b.stats and (b.text or "").lstrip().startswith("|"):
            # a band printed under another title right after the heading (a side box's lower-case title between them:
            # `Hose`, its band under `example objects for spell formula`): its band, its box's
            first = next(iter(md_tables(b.text)), ([], []))[0]
            for k in ("spells", "critterpowers", "adeptpowers", "complexforms", "rituals"):
                if len({h.upper() for h in first} & set(HEADERS[k])) >= 3 and (lifted := text_stats(b, HEADERS[k])).stats:
                    b = lifted
                    break
        if hasattr(bk, "kind"):
            kind, kcat = bk.kind(ch, b, parent2)
        if not kind and b.row is not None and b.header and (g := tables.kind_of(b.header, b.label, b.section)) \
                and (b.label or b.header[0].upper() in NAME_HEADERS) and re.search(r"[A-Za-z]{2}", b.name):
            kind, kcat = g, None  # a priced table the recipe leaves unread: the general reader's (tables.py)
        if kind in ("gear", "weapons") and ammo_type(b):
            kind = "ammotypes"  # priced as a multiple of the ammunition it modifies
        if kind == "skip" or kind and cat.entry(kind, kcat, b, page, ctx_keys):
            continue
        rule_chapter = ch and any(c in ch for c in bk.RULE_CHAPTERS)
        catalog = any(c in ch for c in bk.CATALOG_CHAPTERS) and b.row is not None and b.header and b.header[0].upper() in NAME_HEADERS
        if not section and (b.row is not None or b.stats) and (catalog or not rule_chapter):
            cat.report.append({"kind": "unmapped", "name": b.name, "chapter": b.chapter, "section": b.section,
                               "label": b.label, "page": page})
            continue
        if not rule_chapter:
            continue
        level = min(b.level, 3) if section else 4
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent = stack[-1][1] if stack else None
        text = "\n\n".join(x for x in (block_md(b), block_text(b)) if x)  # an item that is no kind keeps its table
        e = cat.add("rules", b.name, page, {"chapter": b.chapter, "level": max(1, level), "parent": parent}, (),
                    text, parent=parent)
        stack.append((level, e["id"]))
    for kind, name, page, attrs, kids, text in sentence_items(bs, bk.PAGE_OFFSET):
        if not any(norm(e["name"]) == norm(name) for e in cat.entries[kind]):
            cat.add(kind, name, page, attrs, kids, text)
    run_in_items(bs, cat, bk.PAGE_OFFSET)
    spell_features(bs, cat, bk.PAGE_OFFSET)
    dv_settings(bs, cat, bk.PAGE_OFFSET)
    add_ons(cat)
    stated_items(bs, cat, bk.PAGE_OFFSET, core=bk.ID == CORE)
    template = sections.template_headings(bs)
    for f in found:  # (after the book's own entries: one the recipe reads as well is the recipe's)
        if sections.is_path(f, template):
            cat.section(f)
    for e in cat.entries["programs"]:
        # a program's price: the book's `Cyberprogram, <type>` row; an autosoft's the `Autosoft` row, with its ratings
        # (the core rulebook's)
        t = e["attrs"]["type"]
        row = next((g for g in cat.entries["gear"] if g["name"].lower() == (t if t == "autosoft" else f"cyberprogram, {t}")), None)
        if row:  # (`Rating (1-9)`: the rating formula, its range restated)
            e["attrs"].update({a: re.sub(r"^(rating)\s*\(\s*\d+\s*[–-]\s*\d+\s*\)$", r"\1", row["attrs"][a], flags=re.I)
                               for a in ("rating", "avail", "cost") if a in row["attrs"]})
    # each table's category (its title), the accessory tables' hosts, the rows whose names need their category
    verdicts, _ = categories.build(cat, [b.text for b in bs] + [v for b in bs for v in b.labels.values()], ROW_KINDS)
    for t, cname, conf, why, kinds_of in verdicts:
        if why:
            cat.report.append({"kind": "category", "name": t["title"] or t["section"], "why": why, "title": t["title"], "section": t["section"],
                               "category": cname, "confidence": conf, "page": t["page"], "kinds": " ".join(sorted(kinds_of))})
    files = {f"{k}.xml": cat.xml(k) for k in KINDS if cat.entries[k]}
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    runners, core = [], _core(ctx, bk.ID) if samples and bk.ID != CORE else None
    for name, b, page in samples:
        sid, xml, rows = archetypes.build(bk.ID, name, b, page, cat.entries, updated, core)
        runners.append({"file": f"{sid}.xml", "xml": xml, "name": name, "role": "Archetype", "page": page})
        cat.report += rows
    return Result(files=files, texts=cat.texts_xml() if cat.texts else None, samples=runners, report=cat.report,
                  source={"id": bk.ID, "name": bk.NAME, "publisher": bk.PUBLISHER, "canon": bk.CANON})


def _core(ctx, own=None):
    """The catalogs already imported (custom/sr6/imported/<book>/<kind>.xml; ctx["custom_dir"]: custom/sr6), which
    another book's sample runners cite (a face printed with a Sixth World Companion quality): kind -> [{id (scoped), name,
    attrs, children}], the core rulebook's first, then the other books' (not `own`'s) by folder; {} before any is."""
    base = os.path.join((ctx or {}).get("custom_dir") or "", "imported")
    found = (ctx or {}).get("custom_dir") and os.path.isdir(base)
    books = sorted(os.listdir(base), key=lambda b: (b != CORE.lower(), b)) if found else []
    out = {}
    for b in books:
        d = os.path.join(base, b)
        if b == (own or "").lower() or not os.path.isdir(d):
            continue
        # its entries' text (custom/sr6/texts/<book>.xml): what a host says it has (cybereyes' image link)
        tf = os.path.join(os.path.dirname(base), "texts", f"{b}.xml")
        texts = {(t.get("of"), t.get("id")): t.text or "" for t in ET.parse(tf).getroot()} if os.path.isfile(tf) else {}
        for f in sorted(os.listdir(d)):
            if f.endswith(".xml"):
                root = ET.parse(os.path.join(d, f)).getroot()
                out.setdefault(root.get("kind"), []).extend(
                    {"id": e.get("id"), "name": e.findtext("name") or "", "attrs": dict(e.attrib),
                     "children": [(c.tag, dict(c.attrib), c.text) for c in e if c.tag not in ("name", "text")],
                     "text": texts.get((root.get("kind"), e.get("id")), "")} for e in root)
    return out
