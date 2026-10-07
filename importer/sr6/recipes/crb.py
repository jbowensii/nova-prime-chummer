"""Shadowrun, Sixth World Core Rulebook (CRB) -> the SR6 catalog: one <kind>.xml per kind (ids unscoped; run scopes them
as crb.<slug>) and the private texts. Reads only regrouped.md (importer/sr6/regroup.py); layout notes in crb.md.

Each block maps to a kind by SECTIONS (chapter, then its table's first header, label, section or level-2 section) and
its values by HEADERS (printed column or label -> attribute). Values stay as printed: a lone dash becomes "—", costs lose
"¥" and thousands commas, a value off its column's pattern is kept and reported (book-value). A block that maps nowhere
is a rule section if it has no row or stat box (rule chapters only), else it is reported (unmapped). The priority and
metatype tables are rule tables in regroup's output: they are read from any block's text (or a catalog row) by their
first header. The archetypes chapter's sample characters become SR6 runner files (Result.samples,
importer/sr6/archetypes.py)."""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import replace
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr

from importer.recipes import Result
from importer.recipes.dhsa import slug
from importer.sr6 import KINDS, NS, archetypes, categories, formula, resolve, sections, tables
from importer.sr6.recipes import shapes
from importer.sr6.regroup import _names, blocks, norm
from importer.xmlio import HEAD, ILLEGAL

ID, NAME, PUBLISHER, CANON = "CRB", "Shadowrun, Sixth World Core Rulebook", "Catalyst Game Labs", True
SHA256 = ("15067e02c99c750f30cd94de95bbcc3c08497a2cf637a53d206761ef0cea18e3",  # the owner's 2019 printing
          # the City Editions (the same pages 1-321, then a chapter on the city): Hong Kong (2025), Seattle, Berlin
          "7c3a1cfdcd80f9a5ef6a7f4b3fb115b4a699e1fd48810683b33af2a06ccb05a6",
          "d44bc23010d8f0c6a9b67a8f9646e293a35240d467c544dbcfe1cfe294c7fec5",
          "6ebaedbde953f3bebe3c51ceab0dd265f924d0c1dc1a7c815d26b7471a124c6f")
# the printings, oldest first: of several imported, the newest is the one loaded (run.py); each City Edition's city
# chapter is a source of its own and loads from its own printing regardless
PRINTINGS = {SHA256[0]: "Current Printing (CAT28000, 2019)", SHA256[3]: "City Edition Berlin (CAT28000B)",
             SHA256[2]: "City Edition Seattle (CAT28000S, 2021)", SHA256[1]: "City Edition Hong Kong (CAT28000H, 2025)"}
# heading sizes -> levels (layout.fonts' guess takes the Hong Kong and Berlin chapters' 27 pt titles for a level)
HEADING_LEVELS = {60.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 305  # PDF page: the index and the reprinted tables start here (left out)
# the book's spelling differences between a table row and its description heading (norm form -> norm form; names only)
with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "crb_aliases.json"), encoding="utf8") as _f:
    ALIASES = json.load(_f)
# first header cells that make a table a catalog in regroup (its rows are items even when no description pairs)
NAME_HEADERS = {"WEAPON", "WEAPONS", "ARMOR", "ITEM", "AUGMENTATION", "DEVICE", "VEHICLE", "LIFESTYLE", "CYBERJACK",
                "HEADWARE", "EYEWARE", "EARWARE", "BODYWARE", "LIMB", "GEAR", "CLASS", "RCC"}

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
RULE_CHAPTERS = ("game concepts", "character creation", "skills", "combat", "magic", "matrix", "rigging", "wild life",
                 "running the game", "gear")
ATTRIBUTE_CHAPTERS = ("game concepts", "character creation")
CATALOG_CHAPTERS = ("gear",)  # a table row there with a name header is a catalog item: reported when it maps nowhere
BOOK = "the Shadowrun 6 core rulebook"
ATTRIBUTES = {"body": ("BOD", "physical"), "agility": ("AGI", "physical"), "reaction": ("REA", "physical"),
              "strength": ("STR", "physical"), "willpower": ("WIL", "mental"), "logic": ("LOG", "mental"),
              "intuition": ("INT", "mental"), "charisma": ("CHA", "mental"), "edge": ("EDG", "special"),
              "magic": ("MAG", "special"), "resonance": ("RES", "special"), "essence": ("ESS", "special")}

_PRICE = {"AVAIL": "avail", "AVAILABILITY": "avail", "COST": "cost"}
_BEING = {"B": "bod", "BOD": "bod", "A": "agi", "AGI": "agi", "R": "rea", "REA": "rea", "S": "str", "STR": "str",
          "W": "wil", "WIL": "wil", "L": "log", "LOG": "log", "I": "int", "INT": "int", "C": "cha", "CHA": "cha",
          "ESS": "ess", "M": "mag", "MAG": "mag", "RES": "res", "EDG": "edg", "EDGE": "edg", "DR": "dr",
          "DEFENSE RATING": "dr", "I/ID": "init", "INIT": "init", "INITIATIVE": "init", "AC": "actions",
          "ACTIONS": "actions", "CM": "cm", "MOVE": "move", "RS": "res", "DEFENSE": "dr"}
# kind -> {printed column header or label (upper case) -> attribute}; the row's first column is the name
HEADERS = {
    "weapons": {"DV": "dv", "MODES": "modes", "MODE": "modes", "ATTACK RATINGS": "ar", "ATTACK RATING": "ar", "AR": "ar",
                "AMMO": "ammo", "TYPE": "type", "MOUNT": "mount", "BLAST": "blast", "DV GZ": "dv+", "DV CLOSE": "dv+",
                "DV NEAR": "dv+", "NOTES": "", "STATS": "", **_PRICE},
    "armor": {"DEFENSE RATING": "defense", "DEFENSE": "defense", "DR": "defense", "CAPACITY": "capacity", "SOCIAL": "",
              "TYPE": "", "EXTRAS": "", **_PRICE},
    "augmentations": {"RATING": "rating", "ESSENCE": "essence", "ESS": "essence", "CAPACITY": "capacity", **_PRICE},
    "electronics": {"RATING": "rating", "DEVICE RATING": "rating", "ATTRIBUTE ARRAY": "array", "ARRAY": "array",
                    "ATTRIBUTES (D/F)": "array", "ATTRIBUTES (A/S)": "array", "PROGRAMS": "programs",
                    "ACTIVE PROGRAM SLOTS": "programs", "CAPACITY": "capacity", **_PRICE},
    "gear": {"RATING": "rating", "DEVICE RATING": "rating", "CAPACITY": "capacity", "BONDING COST (IN KARMA)": "karma",
             "MOD SLOTS": "slots", "DV": "", "ATTACK RATING": "",  # an ammunition's modifiers: prose
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
    "critters": _BEING, "spirits": _BEING, "npcs": _BEING,
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
                  "MULTIPLIER": "cost", "COST": "cost", "AVAIL": "avail", "AVAILABILITY": "avail", "TYPE": "", "TYPES": ""},
}
# a being's labelled lists (label, lower case -> child element)
LISTS = {"skills": "skills", "powers": "powers", "optional powers": "optionalPowers", "weaknesses": "weaknesses",
         "weakness": "weaknesses",
         "attacks": "attacks", "attack": "attacks", "augmentations": "augmentations", "cyberware": "augmentations", "gear": "gear",
         "weapons": "weapons"}
PRICED = {"weapons", "armor", "augmentations", "electronics", "gear", "vehicles", "lifestyles"}  # cost/avail checked
ROW_KINDS = {"weapons", "armor", "augmentations", "electronics", "gear", "vehicles", "ammotypes"}  # need a table row and a category
STAT_KINDS = {"critters", "spirits", "npcs", "sprites"}  # need a stat band
BOX_KINDS = {"spells", "qualities", "adeptpowers", "critterpowers", "complexforms", "rituals"}  # need a band, labels or tags
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
MAGIC = (("mystic adept", "mystic-adept"), ("aspected", "aspected"), ("full", "full"), ("adept", "adept"),
         ("technomancer", "technomancer"))
LEVELS = re.compile(r"\s*\(\s*1\s+to\s+(\d+)\s*\)\s*$", re.I)
NAME_RATING = re.compile(r"\s*\((?:rating\s*)?(\d+\s*[–-]\s*\d+)\)(?=\)?\s*$)", re.I)  # (also a note's own: `X (Y (1–4))`)
TAG_RATING = re.compile(r"^\s*\(?\s*rating\s*(\d+\s*[–-]\s*\d+)\s*\)?\s*$", re.I)  # a tag line `(rating 1-4)`
_TABLE_SEP = re.compile(r"\|(?:-+\|)+$")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"sixth\s+world", hay, re.I) and re.search(r"core\s+rulebook", hay, re.I) else 0.0


def _s(v):
    return ILLEGAL.sub("", str(v))


def _value(attr, v):
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


def _tables(text):
    """The markdown tables in a block's text: (header, rows)."""
    lines, out, i = text.splitlines(), [], 0
    while i < len(lines):
        if lines[i].startswith("|") and i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1]):
            header, rows, i = _cells(lines[i]), [], i + 2
            while i < len(lines) and lines[i].startswith("|") and not (i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1])):
                rows.append(_cells(lines[i]))
                i += 1
            out.append((header, rows))
        else:
            i += 1
    return out


def _cells(line):
    return [c.strip() for c in line.strip()[1:-1].split("|")]


class _Catalog:
    def __init__(self, source=ID, recipe="crb", book=BOOK):
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
        self.index = None  # the book's tables and prose (resolve.Index): where a value an entry's row leaves out is found
        self.last_weapon = None  # the weapon read last: a supply table printed right after it is its ammunition
        self.where = ("", "")  # the (chapter, section) of the block being read: an entry's place, for section rules
        # the tables the catalog rows come from (categories.py): index -> {title, section, header, page}; the open one
        self.tables, self._table = {}, None
        self.idcat = {k: {} for k in KINDS}  # id -> its entry's category: a name another category repeats

    def add(self, kind, name, page, attrs=None, children=(), text="", parent=None, row=None, aliases=(), cid=None):
        name = re.sub(r"\s*\*.*$", "", name) or name  # a footnote mark (`Bullwhip*`), or its note run into the cell
        base = cid or slug(name) or KINDS[kind]
        i, n = base, 2
        if kind == "rules" and i in self.ids[kind] and parent:
            i = base = f"{parent}-{base}"
        cat = (attrs or {}).get("category")
        if kind in ROW_KINDS and cat and i in self.ids[kind] and self.idcat[kind].get(i) != cat:
            # the same name in another category is another item (a cyberlimb's Armor, a cybereye's): its id names it
            i = base = f"{slug(cat)}.{base}"
        while i in self.ids[kind]:
            i, n = f"{base}-{n}", n + 1
        if n > 2 and kind != "rules":  # repeated rule subheadings (Advantages, Step 1) are normal
            self.report.append({"kind": "duplicate-id", "file": f"{kind}.xml", "id": i, "name": name, "page": page})
        self.ids[kind].add(i)
        self.idcat[kind][i] = cat
        for r in self.pending:
            if (r["file"], r["column"]) not in self.cols:
                self.cols.add((r["file"], r["column"]))
                self.report.append(r)
        self.pending = []
        aliases = [*aliases, *series_models(name, text)]
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
            self.tables[len(self.tables)] = {"title": k[0], "section": k[1], "page": page, "product": b.product}
        return self._table[1]

    def section(self, f):
        """Add a sections.py entry, unless the recipe's own reading wrote it already (a quality heading with its Cost
        line; a program of the same type). A heading of a kind this module reads (a sprite power's Range and Duration
        lines) has its fields read as the recipe would."""
        same = lambda e: norm(e["name"]) == norm(f.name) and all(  # noqa: E731
            e["attrs"].get(k) == f.attrs.get(k) for k in ("type",) if f.attrs.get(k))
        if any(same(e) for e in self.entries[f.kind]):
            return
        a = dict(f.attrs)
        if f.block is not None and f.kind in HEADERS and HEADERS[f.kind]:
            fl = self.fields(f.kind, _text_stats(f.block, HEADERS[f.kind]), f.page)
            fl.pop("prose", None)
            a = {**fl, **a}
            self.pending = []
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
        self.add(f.kind, f.name, f.page, a, f.children, f.text)

    def derived(self, f, a):
        """An item a section derives from one of the book's (sections.derived): the base item found by its name
        (singular, the first words of a longer name: `gills` is `Gills (freshwater/saltwater/air)`) in the kind whose
        entries are of the base's type (`bioware`); its rating range and availability kept, each field the rule
        names its base's times the factor (`ref()`, at the item's rating). No base found: the rule as an ambiguous
        issue (`priced from another item`)."""
        want = [regroup_stem(w) for w in norm(a["_base"]).split()]
        kinds = [k for k in formula.PRICED if any(a["_basekind"].lower() in (e["attrs"].get("type") or "").lower()
                                                   for e in self.entries[k])] or [f.kind]
        base, kind = next(((e, k) for k in kinds for e in self.entries[k]
                     if [regroup_stem(w) for w in norm(re.sub(r"\([^()]*\)", "", e["name"])).split()][:len(want)] == want
                     and (e["attrs"].get("type") or "").lower() == a["_basekind"].lower()), (None, kinds[0]))
        rule, kids, attrs = a["_rule"], [], {}
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
                elif a is None and (m := re.fullmatch(r"COST \(PER (.+)\)", hu)):
                    a, out["per"] = "cost", m.group(1).lower()
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
                        out[a] = f"{out[a]}/{_value(a, v)}" if a in out else _value(a, v)
                elif v and a not in out:
                    out[a] = _value(a, v)
        for k, v in b.labels.items():
            a = cols.get(k.upper())
            if a and v and a not in out:
                out[a] = _value(a, v)
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
                g = dict(f, cost=_value("cost", m.group(1) if m else val))
                if m:
                    g["capacity"] = m.group(2)
                out.append((f"{name} ({v})", g))
            return out
        cost = f.get("cost", "")
        if m := re.fullmatch(r"(.+?)\s*/\s*(\w+)\s+or\s+(.+?)\s*/\s*(\w+)", cost):
            return [(f"{name} ({m.group(2)})", dict(f, cost=m.group(1), per=m.group(2))),
                    (f"{name} ({m.group(4)})", dict(f, cost=m.group(3), per=m.group(4)))]
        for v in (cost, f.get("avail", "")):
            parts = v.split("/")
            names = _names(name)[:len(parts)] if "/" in name else []
            if len(parts) > 1 and len(names) == len(parts) and all(re.fullmatch(r"\s*\d+\s*(\(\w\))?", p) for p in parts):
                def part(k, v, i):
                    ps = v.split("/")
                    return ps[i].strip() if k in ("cost", "avail") and len(ps) == len(parts) else v
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
        elif first == "METATYPE" and len(header) >= 9:  # the ranges table, not an adjustment chart
            for r in rows:
                self.metatype(header, r, page)
        elif first == "GRADE" and any("ESS" in h.upper() for h in header):  # the implant grades table
            for r in rows:
                self.grade(r[0], {h: c for h, c in zip(header[1:], r[1:])}, page)

    def grade(self, name, cells, page, types=None):
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
        self.add("grades", name, page, {**attrs, "types": types})

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
            a = _BEING.get(h.upper(), h[:3].lower())
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
            b = _text_stats(b, HEADERS["npcs" if kind == "contacts" else kind])
        if kind in STAT_KINDS and len(parts := _side_by_side(b)) > 1:
            return all([self._entry(kind, cat, p, page, ctx) for p in parts])
        if kind in STAT_KINDS and self.split and len(parts := self.split(b)) > 1:
            return all([self._entry(kind, cat, p, page, ctx) for p in parts])  # one stat block, several names
        if kind in ROW_KINDS and b.row is not None and not any(list(b.row.values())[1:]):
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
            # the table's title, else its first header when it names a category (CARS, not WEAPON), else the section
            label, head = slug(b.label), slug(b.header[0] if b.header else "")
            head = "" if head.upper() in NAME_HEADERS or head == "type" else head
            attrs["category"] = cat or (label if label not in ("", kind) else head) or slug(b.section) or label or kind
            if kind == "augmentations":
                attrs = {"type": ware_type([*ctx, attrs["category"]]), **attrs}
            if (m := NAME_RATING.search(name)) and "rating" not in f and kind not in ("weapons", "armor", "vehicles"):
                name, f["rating"] = name[:m.start()] + name[m.end():].strip(), m.group(1)
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
            for n, g in self.variants(name, f):
                if "rating" not in g and _VAR.search(g.get("cost", "") + g.get("avail", "")) \
                        and re.fullmatch(r"\d+\s*[–-]\s*\d+", g.get("capacity", "")):
                    g["rating"] = g["capacity"]  # priced by capacity: bought at a capacity in its range
                a = {**attrs, **g}
                self.check(kind, n, a, page)
                # (its printed cells, those a recipe moved to labels too: a per-unit price's count range)
                e = self.add(kind, n, page, a, notes, "\n".join(prose + [_text(b)]), row={**b.labels, **(b.row or {})},
                             aliases=(b.aliases if n == name else []) or code_alias(n, b.label))  # (a heading's fuller name first)
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
            ks = [int(n) for m in re.finditer(r"(-?\d+)(?:\s*(?:to|or|[–-])\s*(\d+))?\s*karma", karma, re.I)
                  for n in m.groups() if n] or [int(m.group(1)) for m in re.finditer(r"(-?\d+)", karma)][:1]
            attrs = {"kind": cat, "karma": min(ks) if ks else None, "karmaMax": max(ks) if len(set(ks)) > 1 else None,
                     "perLevel": "true" if re.search(r"per\s+level", karma, re.I) else None}
            name, attrs["maxLevel"] = self._levels(name)
            if not attrs["maxLevel"] and (m := re.search(r"\(\s*1\s+to\s+(\d+)\s*\)", karma)):
                attrs["maxLevel"] = int(m.group(1))  # `5 Karma per level (1 to 4)`: the levels in the price
            if not attrs["maxLevel"] and (m := re.search(r",\s*1\s+to\s+(\d+)\s*\)\s*$", name)):
                attrs["maxLevel"] = int(m.group(1))  # `Addiction (Substance, 1 to 6)`: the levels in the name's note, kept
        elif kind == "adeptpowers":
            cost = f.pop("cost", "")
            m = re.search(r"([\d.]+)\s*PP", cost, re.I)
            name, levels = self._levels(name)
            if not levels and (n := re.search(r"max(?:imum)?\.?\s+(\d+)\s+levels?", cost, re.I)):
                levels = int(n.group(1))  # `0.25 PP per level (max 4 levels)`
            attrs = {"cost": m.group(1) if m else cost or None,
                     "perLevel": "true" if re.search(r"per\s+level", cost, re.I) else None, "maxLevel": levels}
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
        self.check(kind, name, attrs, page)
        self.add(kind, name, page, attrs, children + notes, "\n".join(prose + [_text(b, listed)]), aliases=b.aliases)
        return True

    def contact(self, b, page):
        """A sample contact: a contacts entry (its archetype: an `Archetype` label a recipe set, else the name; the book
        prints no connection or loyalty) and its stat block as an npcs entry (group "Contact", no Professional
        Rating)."""
        f = self.fields("npcs", b, page)
        f.pop("prose", None)
        if len(f) < 3:
            return False
        lists = {LISTS[k.lower()]: v for k, v in b.labels.items() if k.lower() in LISTS and v}
        listed = {k for k in b.labels if k.lower() in LISTS or k == "Archetype"}
        self.add("contacts", b.name, page, {"archetype": b.labels.get("Archetype", b.name)}, (), _text(b, listed))
        self.add("npcs", b.name, page, {"group": "Contact", **f},
                 [(t, {}, lists[t]) for t in dict.fromkeys(LISTS.values()) if t in lists], _text(b, listed))
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
        specs = [x.strip(" .") for x in re.split(r"\s*,\s*", spec or "") if x.strip(" .")]
        self.add("skills", b.name, page, {"attr": attr, "untrained": "true" if u and u.group(1).lower() == "yes" else "false"},
                 [("spec", {}, s) for s in specs], _text(b))
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
        """The issues' fields found elsewhere in the book (resolve.py's first two circles), written to the entry's
        attributes: [("found", {field, how, page}, None)]. A field the row prints but no rule reads (unreadable) is
        looked for too; two values printed, or a rule pricing it off another item (ambiguous), is the book's."""
        out = []
        for t, a, _ in kids:
            if t != "issue" or a["code"] == "ambiguous":
                continue
            f = a["field"]
            r = resolve.search_book(self.index, HEADERS, kind, e, f, e.get("text") or "")
            if not r:
                continue
            v, how, page = r
            e["attrs"][f] = int(v) if kind == "qualities" and f == "karma" else v
            out.append(("found", {"field": f, "how": how, "source": self.source, "page": page}, None))
            if how == "table":  # the same row's other columns the entry's own row leaves empty (a capacity range)
                for g, w in resolve.same_row(self.index, HEADERS, kind, e, f, v).items():
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


_MULTIPLE = re.compile(r"^\s*(?:x\s*\d+(?:\.\d+)?|\+\s*\d+\s*%)\s*$", re.I)
_AMMO_WORDS = re.compile(r"\b(?:ammo|ammunition|rounds?|bolts?|arrows?|warheads?|slugs?|shells?|bullets?)\b", re.I)


def ammo_type(b):
    """A row priced as a multiple of the ammunition it modifies (a COST MULTIPLIER column, or `x2` / `+100%` in an
    ammunition table): an ammunition type, not an item of its own."""
    if b.row is None or not b.header:
        return False
    if any("MULTIPLIER" in h.upper() for h in b.header):
        return True
    cost = next((v for h, v in b.row.items() if h.upper() in ("COST", "PRICE")), "")
    return bool(_MULTIPLE.match(cost or "")) and bool(_AMMO_WORDS.search(" ".join([b.name, b.label, b.section, *b.header])))


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


def _text(b, skip=()):
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


def _text_stats(b, cols):
    """The block with its stat band found in its text (a band printed after the description) and labels printed two to
    a line (`**Skills:** …; **Powers:** …`) split."""
    labels = {}
    for k, v in b.labels.items():
        parts = _INLINE_LABEL.split(v)
        labels[k] = parts[0].strip()
        labels.update({parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)})
    stats, text = list(b.stats), b.text
    if not stats:
        for header, rows in _tables(b.text):
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


def _md(b):
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


def _kind(chapter, ctx, section, book=None):
    book = book or sys.modules[__name__]
    for ch, key, kind, cat in book.SECTIONS:
        if ch in chapter and (not section or kind in book.SECTION_KINDS) and (
                not key or any(key in c for c in ctx if (key[0] == "|") == (c[:1] == "|"))):
            return kind, cat
    return None, None


def extract(regrouped, ctx=None, book=None):
    """regrouped: regroup's text, or its blocks. book: the recipe module whose tables drive the reading (ID, NAME, PUBLISHER, CANON, BOOK, PAGE_OFFSET, SECTIONS,
    SECTION_KINDS, LABEL_SECTIONS, RULE_CHAPTERS, ATTRIBUTE_CHAPTERS, CATALOG_CHAPTERS; optional fix(block, parent2)
    -> the block as this reading needs it, and kind(chapter, block, parent2) -> (kind, category) in place of
    SECTIONS); this one by default."""
    bk = book or sys.modules[__name__]
    cat = _Catalog(bk.ID, bk.ID.lower(), bk.BOOK)
    cat.unrated = getattr(bk, "UNRATED_NPCS", None)
    cat.split = getattr(bk, "split_being", None)
    chapter, parent2, sub, stack, seen_attrs, samples = None, "", "", [], set(), []
    bs = list(blocks(regrouped) if isinstance(regrouped, str) else regrouped)
    cat.index = resolve.Index(bs, bk.PAGE_OFFSET, _tables, shapes.RENAME)
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
        for header, rows in _tables(b.text):  # the priority and metatype tables (rule tables in regroup's output)
            cat.table(header, rows, page)
        if cat.last_meta is not None and not any(t == "trait" for t, _, _ in cat.last_meta["children"]) \
                and (q := next((v for k, v in b.labels.items() if re.match(r"racial qualit", k, re.I)), None)):
            cat.metatype([], [f"Racial Qualities: {q}"], page)  # printed as a labelled line under the table
        if b.row is not None and b.header and b.header[0].upper() in ("PRIORITY", "METATYPE"):
            cat.table(b.header, [[b.row.get(h, "") for h in b.header]], page)
            continue
        if getattr(bk, "ARCHETYPES", "archetypes") in ch and archetypes.is_archetype(b):  # sample characters
            samples.append((b.section or b.name, b, page))  # built once the catalog is read: they cite its entries
            continue
        section = b.type == "section"
        a = ATTRIBUTES.get(norm(b.name))
        if a and any(c in ch for c in bk.ATTRIBUTE_CHAPTERS) and a[0] not in seen_attrs:
            seen_attrs.add(a[0])
            cat.add("attributes", b.name, page, {"abbr": a[0], "group": a[1]}, (), _text(b))
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
        text = "\n\n".join(x for x in (_md(b), _text(b)) if x)  # an item that is no kind keeps its table
        e = cat.add("rules", b.name, page, {"chapter": b.chapter, "level": max(1, level), "parent": parent}, (),
                    text, parent=parent)
        stack.append((level, e["id"]))
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
    runners, core = [], _core(ctx, bk.ID) if samples and bk.ID != ID else None
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
    books = sorted(os.listdir(base), key=lambda b: (b != ID.lower(), b)) if found else []
    out = {}
    for d in (os.path.join(base, b) for b in books if b != (own or "").lower() and os.path.isdir(os.path.join(base, b))):
        for f in sorted(os.listdir(d)):
            if f.endswith(".xml"):
                root = ET.parse(os.path.join(d, f)).getroot()
                out.setdefault(root.get("kind"), []).extend(
                    {"id": e.get("id"), "name": e.findtext("name") or "", "attrs": dict(e.attrib),
                     "children": [(c.tag, dict(c.attrib), c.text) for c in e if c.tag not in ("name", "text")]} for e in root)
    return out


def extra(md, sha):
    """A City Edition's city chapter as a source of its own (crb_city.py; run.py writes Result.extra)."""
    from importer.sr6.recipes import crb_city
    return crb_city.extra(md, sha)
