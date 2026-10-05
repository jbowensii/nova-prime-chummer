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
from dataclasses import replace
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr

from importer.recipes import Result
from importer.recipes.dhsa import slug
from importer.sr6 import KINDS, NS, archetypes
from importer.sr6.regroup import _names, blocks, norm
from importer.xmlio import HEAD, ILLEGAL

ID, NAME, PUBLISHER, CANON = "CRB", "Shadowrun, Sixth World Core Rulebook", "Catalyst Game Labs", True
SHA256 = ("15067e02c99c750f30cd94de95bbcc3c08497a2cf637a53d206761ef0cea18e3",  # the owner's 2019 printing
          # the City Editions (the same pages 1-321, then a chapter on the city): Hong Kong (2025), Seattle, Berlin
          "7c3a1cfdcd80f9a5ef6a7f4b3fb115b4a699e1fd48810683b33af2a06ccb05a6",
          "d44bc23010d8f0c6a9b67a8f9646e293a35240d467c544dbcfe1cfe294c7fec5",
          "6ebaedbde953f3bebe3c51ceab0dd265f924d0c1dc1a7c815d26b7471a124c6f")
# heading sizes -> levels (layout.fonts' guess takes the Hong Kong and Berlin chapters' 27 pt titles for a level)
HEADING_LEVELS = {60.0: 1, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 305  # PDF page: the index and the reprinted tables start here (left out)
# the book's spelling differences between a table row and its description heading (norm form -> norm form; names only)
with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "crb_aliases.json"), encoding="utf8") as _f:
    ALIASES = json.load(_f)
# first header cells that make a table a catalog in regroup (its rows are items even when no description pairs)
NAME_HEADERS = {"WEAPON", "WEAPONS", "ARMOR", "ITEM", "AUGMENTATION", "DEVICE", "VEHICLE", "LIFESTYLE", "CYBERJACK",
                "HEADWARE", "EYEWARE", "EARWARE", "BODYWARE", "LIMB", "GEAR", "CLASS"}

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
LABEL_SECTIONS = {("matrix", "echoes"): "echoes", ("matrix", "basic"): ("programs", {"type": "basic"}),
                  ("matrix", "hacking"): ("programs", {"type": "hacking"})}
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
              "TYPE": "", **_PRICE},
    "augmentations": {"RATING": "rating", "ESSENCE": "essence", "ESS": "essence", "CAPACITY": "capacity", **_PRICE},
    "electronics": {"RATING": "rating", "DEVICE RATING": "rating", "ATTRIBUTE ARRAY": "array", "ARRAY": "array",
                    "ATTRIBUTES (D/F)": "array", "ATTRIBUTES (A/S)": "array", "PROGRAMS": "programs",
                    "ACTIVE PROGRAM SLOTS": "programs", "CAPACITY": "capacity", **_PRICE},
    "gear": {"RATING": "rating", "DEVICE RATING": "rating", "CAPACITY": "capacity", "BONDING COST (IN KARMA)": "karma",
             **_PRICE},
    "vehicles": {"HANDLING": "handling", "HAND": "handling", "ACCEL": "accel", "ACCELERATION": "accel",
                 "HAND (ON/OFF ROAD)": "handling", "SPEED INTERVAL": "interval", "INTERVAL": "interval", "TOP SPEED": "topSpeed", "BODY": "body",
                 "ARMOR": "armor", "PILOT": "pilot", "SENSOR": "sensor", "SEATS": "seats", "SEAT": "seats", **_PRICE},
    "spells": {"RANGE": "range", "TYPE": "type", "DURATION": "duration", "DV": "dv", "DRAIN": "dv", "DAMAGE": "damage"},
    "rituals": {"KEYWORDS": "keywords", "THRESHOLD": "threshold"},
    "adeptpowers": {"COST": "cost", "POWER POINTS": "cost", "ACTIVATION": "activation"},
    "complexforms": {"DURATION": "duration", "FADE": "fade", "FADE VALUE": "fade", "FV": "fade"},
    "critterpowers": {"TYPE": "type", "ACTION": "action", "RANGE": "range", "DURATION": "duration"},
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
}
# a being's labelled lists (label, lower case -> child element)
LISTS = {"skills": "skills", "powers": "powers", "optional powers": "optionalPowers", "weaknesses": "weaknesses",
         "attacks": "attacks", "attack": "attacks", "augmentations": "augmentations", "cyberware": "augmentations", "gear": "gear",
         "weapons": "weapons"}
PRICED = {"weapons", "armor", "augmentations", "electronics", "gear", "vehicles", "lifestyles"}  # cost/avail checked
ROW_KINDS = {"weapons", "armor", "augmentations", "electronics", "gear", "vehicles"}  # need a table row and a category
STAT_KINDS = {"critters", "spirits", "npcs", "sprites"}  # need a stat band
BOX_KINDS = {"spells", "qualities", "adeptpowers", "critterpowers", "complexforms", "rituals"}  # need a band, labels or tags
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
MAGIC = (("mystic adept", "mystic-adept"), ("aspected", "aspected"), ("full", "full"), ("adept", "adept"),
         ("technomancer", "technomancer"))
LEVELS = re.compile(r"\s*\(\s*1\s+to\s+(\d+)\s*\)\s*$", re.I)
NAME_RATING = re.compile(r"\s*\((?:rating\s*)?(\d+\s*[–-]\s*\d+)\)\s*$", re.I)
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
    return v


_LEGAL = re.compile(r"\s*(?:\(([LIF])\)|([LIF]))\s*$")
_VAR = re.compile(r"\b(?:rating|capacity|force|level)\b", re.I)


def readable(v):
    """True when the app can read the value (src/sr6/engine/values.ts rated()): a dash, a number or a formula of
    numbers, Rating (or Capacity, Force, Level: the rating the item is bought at), + × x * / ^ and parentheses, with an
    optional leading + (an add-on's price) and a legality suffix."""
    if v.strip() in ("", "—"):
        return True
    s = _VAR.sub(" R ", _LEGAL.sub("", v).strip().lstrip("+"))
    toks = re.findall(r"\d+(?:\.\d+)?|R|[+*/^()]|\S", re.sub(r"[×x*]", " * ", s))
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
        return t == "R" or bool(t and re.fullmatch(r"\d+(?:\.\d+)?", t))

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

    def add(self, kind, name, page, attrs=None, children=(), text="", parent=None):
        name = re.sub(r"\s*\*.*$", "", name) or name  # a footnote mark (`Bullwhip*`), or its note run into the cell
        base = slug(name) or KINDS[kind]
        i, n = base, 2
        if kind == "rules" and i in self.ids[kind] and parent:
            i = base = f"{parent}-{base}"
        while i in self.ids[kind]:
            i, n = f"{base}-{n}", n + 1
        if n > 2 and kind != "rules":  # repeated rule subheadings (Advantages, Step 1) are normal
            self.report.append({"kind": "duplicate-id", "file": f"{kind}.xml", "id": i, "name": name, "page": page})
        self.ids[kind].add(i)
        for r in self.pending:
            if (r["file"], r["column"]) not in self.cols:
                self.cols.add((r["file"], r["column"]))
                self.report.append(r)
        self.pending = []
        e = {"id": i, "name": name, "page": page, "attrs": attrs or {}, "children": list(children)}
        self.entries[kind].append(e)
        if text.strip():
            self.texts.append((kind, i, text.strip()))
        return e

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
        if kind in PRICED and (m := re.fullmatch(r"(.+?)\s+per\s+(.+)", out.get("cost", ""))):
            out["cost"] = m.group(1)  # "50 per 100m"; "15 per 10" under a COST (PER 10 ROUNDS) column
            out.setdefault("per", m.group(2))
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
                attrs = {"type": "bioware" if any("bioware" in c for c in ctx) else "cyberware", **attrs}
            if (m := NAME_RATING.search(name)) and "rating" not in f:
                name, f["rating"] = name[:m.start()], m.group(1)
            for n, g in self.variants(name, f):
                if "rating" not in g and _VAR.search(g.get("cost", "") + g.get("avail", "")) \
                        and re.fullmatch(r"\d+\s*[–-]\s*\d+", g.get("capacity", "")):
                    g["rating"] = g["capacity"]  # priced by capacity: bought at a capacity in its range
                a = {**attrs, **g}
                self.check(kind, n, a, page)
                self.add(kind, n, page, a, (), "\n".join(prose + [_text(b)]))
            return True
        elif kind == "spells":
            cat = next((c for c in SPELL_CATEGORIES for k in ctx if c in k.split()), None)
            if not cat:
                return False  # a rule about spells
            attrs = {"category": cat, "tags": b.tags or None}
        elif kind == "qualities":
            karma = f.pop("karma", "")
            m = re.search(r"(-?\d+)\s*karma", karma, re.I) or re.search(r"(-?\d+)", karma)
            attrs = {"kind": cat, "karma": m and int(m.group(1)), "perLevel": "true" if re.search(r"per\s+level", karma, re.I) else None}
            name, attrs["maxLevel"] = self._levels(name)
        elif kind == "adeptpowers":
            cost = f.pop("cost", "")
            m = re.search(r"([\d.]+)\s*PP", cost, re.I)
            name, levels = self._levels(name)
            attrs = {"cost": m.group(1) if m else cost or None,
                     "perLevel": "true" if re.search(r"per\s+level", cost, re.I) else None, "maxLevel": levels}
        elif kind in ("critters", "spirits", "npcs"):
            if kind == "npcs":
                m = re.search(r"professional rating\s*(\d+)\s*[:–—-]?\s*(.*)", b.section, re.I)
                attrs = {"rating": m and int(m.group(1)), "group": (m and m.group(2).strip()) or None}
                if not m:
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
        self.add(kind, name, page, attrs, children, "\n".join(prose + [_text(b, listed)]))
        return True

    def contact(self, b, page):
        """A sample contact: a contacts entry (its archetype: the name; the book prints no connection or loyalty) and
        its stat block as an npcs entry (group "Contact", no Professional Rating)."""
        f = self.fields("npcs", b, page)
        f.pop("prose", None)
        if len(f) < 3:
            return False
        lists = {LISTS[k.lower()]: v for k, v in b.labels.items() if k.lower() in LISTS and v}
        listed = {k for k in b.labels if k.lower() in LISTS}
        self.add("contacts", b.name, page, {"archetype": b.name}, (), _text(b, listed))
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

    def xml(self, kind):
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


def _attrs(d):
    return "".join(f" {k}={quoteattr(_s(v))}" for k, v in d.items() if v is not None and v != "")


def _text(b, skip=()):
    """The block's prose: its box labels (those not already in its text, nor taken as lists), then its text."""
    lines = [f"**{k}:** {v}" for k, v in b.labels.items() if k not in skip and f"**{k}:**" not in b.text]
    return "\n".join(lines + ([b.text] if b.text else []))


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
    chapter, parent2, sub, stack, seen_attrs, samples = None, "", "", [], set(), []
    for b in blocks(regrouped) if isinstance(regrouped, str) else regrouped:
        if b.chapter != chapter:
            chapter, parent2, sub, stack = b.chapter, "", "", []
        if b.type == "section" and b.level == 2:
            parent2 = b.name
        b = bk.fix(b, parent2) if hasattr(bk, "fix") else b
        ch, page = norm(b.chapter), max(1, b.page - bk.PAGE_OFFSET)
        for header, rows in _tables(b.text):  # the priority and metatype tables (rule tables in regroup's output)
            cat.table(header, rows, page)
        if cat.last_meta is not None and not any(t == "trait" for t, _, _ in cat.last_meta["children"]) \
                and (q := next((v for k, v in b.labels.items() if re.match(r"racial qualit", k, re.I)), None)):
            cat.metatype([], [f"Racial Qualities: {q}"], page)  # printed as a labelled line under the table
        if b.row is not None and b.header and b.header[0].upper() in ("PRIORITY", "METATYPE"):
            cat.table(b.header, [[b.row.get(h, "") for h in b.header]], page)
            continue
        if "archetypes" in ch and archetypes.is_archetype(b):
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
    for e in cat.entries["programs"]:  # a program's price: the book's `Cyberprogram, <type>` row (the core rulebook's)
        row = next((g for g in cat.entries["gear"] if g["name"].lower() == f"cyberprogram, {e['attrs']['type']}"), None)
        if row:
            e["attrs"].update({a: row["attrs"][a] for a in ("avail", "cost") if a in row["attrs"]})
    files = {f"{k}.xml": cat.xml(k) for k in KINDS if cat.entries[k]}
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    runners = []
    for name, b, page in samples:
        sid, xml, rows = archetypes.build(bk.ID, name, b, page, cat.entries, updated)
        runners.append({"file": f"{sid}.xml", "xml": xml, "name": name, "role": "Archetype", "page": page})
        cat.report += rows
    return Result(files=files, texts=cat.texts_xml() if cat.texts else None, samples=runners, report=cat.report,
                  source={"id": bk.ID, "name": bk.NAME, "publisher": bk.PUBLISHER, "canon": bk.CANON})
