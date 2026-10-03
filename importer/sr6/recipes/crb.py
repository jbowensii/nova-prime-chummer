"""Shadowrun, Sixth World Core Rulebook (CRB) -> the SR6 catalog: one <kind>.xml per kind (ids unscoped; run scopes them
as crb.<slug>) and the private texts. Reads only regrouped.md (importer/sr6/regroup.py); layout notes in crb.md.

Each block maps to a kind by SECTIONS (chapter, then its table's first header, label, section or level-2 section) and
its values by HEADERS (printed column or label -> attribute). Values stay as printed: a lone dash becomes "—", costs lose
"¥" and thousands commas, a value off its column's pattern is kept and reported (book-value). A block that maps nowhere
is a rule section if it has no row or stat box (rule chapters only), else it is reported (unmapped). The priority and
metatype tables are rule tables in regroup's output: they are read from any block's text (or a catalog row) by their
first header."""
import json
import os
import re
from xml.sax.saxutils import escape, quoteattr

from importer.recipes import Result
from importer.recipes.dhsa import slug
from importer.sr6 import KINDS, NS
from importer.sr6.regroup import blocks, norm
from importer.xmlio import HEAD, ILLEGAL

ID, NAME, PUBLISHER, CANON = "CRB", "Shadowrun, Sixth World Core Rulebook", "Catalyst Game Labs", True
SHA256 = ("15067e02c99c750f30cd94de95bbcc3c08497a2cf637a53d206761ef0cea18e3",)  # the owner's current printing
PAGE_OFFSET = 1  # printed page = PDF page - 1
# the book's spelling differences between a table row and its description heading (norm form -> norm form; names only)
with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "crb_aliases.json"), encoding="utf8") as _f:
    ALIASES = json.load(_f)
# first header cells that make a table a catalog in regroup (its rows are items even when no description pairs)
NAME_HEADERS = {"WEAPON", "WEAPONS", "ARMOR", "ITEM", "AUGMENTATION", "DEVICE", "VEHICLE", "LIFESTYLE"}

# (chapter key, context key, kind, category), first match wins. The chapter key is a substring of the block's chapter,
# the context key of its table's first header, its label, its section or its level-2 section (all in norm form; "" is
# any). A level-3 section block maps only to SECTION_KINDS (with its level-2 section as context). category: a string,
# or None for the slug of the label (else the section).
SECTIONS = [
    ("gear", "weapon", "weapons", None),
    ("gear", "armor", "armor", None),
    ("gear", "device", "electronics", None),
    ("gear", "commlink", "electronics", None),
    ("gear", "cyberdeck", "electronics", None),
    ("gear", "bioware", "augmentations", None),
    ("gear", "cyberware", "augmentations", None),
    ("gear", "augmentation", "augmentations", None),
    ("gear", "vehicle", "vehicles", None),
    ("gear", "drone", "vehicles", None),
    ("gear", "lifestyle", "lifestyles", None),
    ("gear", "", "gear", None),
    ("magic", "ritual", "rituals", None),
    ("magic", "adept power", "adeptpowers", None),
    ("magic", "metamagic", "metamagics", None),
    ("magic", "spell", "spells", None),
    ("matrix", "complex form", "complexforms", None),
    ("matrix", "echo", "echoes", None),
    ("matrix", "sprite", "sprites", None),
    ("wild life", "power", "critterpowers", None),
    ("wild life", "spirit", "spirits", "spirit"),
    ("wild life", "", "critters", "critter"),
    ("running the game", "professional rating", "npcs", None),
    ("character creation", "positive", "qualities", "positive"),
    ("character creation", "negative", "qualities", "negative"),
    ("character creation", "lifestyle", "lifestyles", None),
    ("character creation", "contact", "contacts", None),
    ("skills", "", "skills", None),
]
SECTION_KINDS = {"skills", "rituals", "lifestyles"}  # level-3 section blocks in this book, not item blocks
# chapters whose unmapped sections (and level-4 headings with no row or box) are rule sections
RULE_CHAPTERS = ("game concepts", "character creation", "skills", "combat", "magic", "matrix", "rigging", "wild life",
                 "running the game", "gear")
ATTRIBUTE_CHAPTERS = ("game concepts", "character creation")
ATTRIBUTES = {"body": ("BOD", "physical"), "agility": ("AGI", "physical"), "reaction": ("REA", "physical"),
              "strength": ("STR", "physical"), "willpower": ("WIL", "mental"), "logic": ("LOG", "mental"),
              "intuition": ("INT", "mental"), "charisma": ("CHA", "mental"), "edge": ("EDG", "special"),
              "magic": ("MAG", "special"), "resonance": ("RES", "special"), "essence": ("ESS", "special")}

_PRICE = {"AVAIL": "avail", "AVAILABILITY": "avail", "COST": "cost"}
_BEING = {"B": "bod", "BOD": "bod", "A": "agi", "AGI": "agi", "R": "rea", "REA": "rea", "S": "str", "STR": "str",
          "W": "wil", "WIL": "wil", "L": "log", "LOG": "log", "I": "int", "INT": "int", "C": "cha", "CHA": "cha",
          "ESS": "ess", "M": "mag", "MAG": "mag", "RES": "res", "EDG": "edg", "EDGE": "edg", "DR": "dr",
          "DEFENSE RATING": "dr", "I/ID": "init", "INIT": "init", "INITIATIVE": "init", "AC": "actions",
          "ACTIONS": "actions", "CM": "cm", "MOVE": "move"}
# kind -> {printed column header or label (upper case) -> attribute}; the row's first column is the name
HEADERS = {
    "weapons": {"DV": "dv", "MODES": "modes", "MODE": "modes", "ATTACK RATINGS": "ar", "ATTACK RATING": "ar", "AR": "ar",
                "AMMO": "ammo", **_PRICE},
    "armor": {"DEFENSE RATING": "defense", "DEFENSE": "defense", "CAPACITY": "capacity", **_PRICE},
    "augmentations": {"RATING": "rating", "ESSENCE": "essence", "ESS": "essence", "CAPACITY": "capacity", **_PRICE},
    "electronics": {"RATING": "rating", "DEVICE RATING": "rating", "ATTRIBUTE ARRAY": "array", "ARRAY": "array",
                    "PROGRAMS": "programs", **_PRICE},
    "gear": {"RATING": "rating", "CAPACITY": "capacity", **_PRICE},
    "vehicles": {"HANDLING": "handling", "HAND": "handling", "ACCEL": "accel", "ACCELERATION": "accel",
                 "SPEED INTERVAL": "interval", "INTERVAL": "interval", "TOP SPEED": "topSpeed", "BODY": "body",
                 "ARMOR": "armor", "PILOT": "pilot", "SENSOR": "sensor", "SEATS": "seats", "SEAT": "seats", **_PRICE},
    "spells": {"RANGE": "range", "TYPE": "type", "DURATION": "duration", "DV": "dv", "DRAIN": "dv", "DAMAGE": "damage"},
    "rituals": {"KEYWORDS": "keywords", "THRESHOLD": "threshold"},
    "adeptpowers": {"COST": "cost", "POWER POINTS": "cost", "ACTIVATION": "activation"},
    "complexforms": {"DURATION": "duration", "FADE": "fade", "FV": "fade"},
    "critterpowers": {"TYPE": "type", "ACTION": "action", "RANGE": "range", "DURATION": "duration"},
    "critters": _BEING, "spirits": _BEING, "npcs": _BEING,
    "sprites": {"ATTACK": "attack", "A": "attack", "SLEAZE": "sleaze", "S": "sleaze", "DATA PROCESSING": "data",
                "DATA": "data", "D": "data", "FIREWALL": "firewall", "F": "firewall", "I/ID": "init", "INIT": "init",
                "INITIATIVE": "init", "RES": "res", "RESONANCE": "res"},
    "lifestyles": {"COST": "cost", "MONTHLY COST": "cost", "COST PER MONTH": "cost"},
    "contacts": {"CONNECTION": "connection", "LOYALTY": "loyalty", "ARCHETYPE": "archetype"},
    "qualities": {"COST": "karma", "BONUS": "karma"},
    "metamagics": {}, "echoes": {}, "skills": {},
}
# a being's labelled lists (label, lower case -> child element)
LISTS = {"skills": "skills", "powers": "powers", "optional powers": "optionalPowers", "weaknesses": "weaknesses",
         "attacks": "attacks", "augmentations": "augmentations", "cyberware": "augmentations", "gear": "gear",
         "weapons": "weapons"}
PATTERNS = {"cost": re.compile(r"—|[\d.]+\+?(\s*(a|per)\s+month)?|.*\bRating\b.*|Var\w*", re.I),
            "avail": re.compile(r"—|\d+\s*\(?[LI]?\)?\+?|.*\bRating\b.*", re.I)}
ROW_KINDS = {"weapons", "armor", "augmentations", "electronics", "gear", "vehicles"}  # need a table row and a category
STAT_KINDS = {"critters", "spirits", "npcs", "sprites"}  # need a stat band
BOX_KINDS = {"spells", "qualities", "adeptpowers", "critterpowers", "complexforms", "rituals"}  # need a band, labels or tags
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
MAGIC = (("mystic adept", "mystic-adept"), ("aspected", "aspected"), ("full", "full"), ("adept", "adept"),
         ("technomancer", "technomancer"))
LEVELS = re.compile(r"\s*\(\s*1\s+to\s+(\d+)\s*\)\s*$", re.I)
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
    if re.fullmatch(r"[-–—]+", v):
        return "—"
    if attr == "cost":
        v = re.sub(r"(?<=\d),(?=\d{3})", "", v).replace("¥", "").strip()
    return v


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
    def __init__(self):
        self.entries = {k: [] for k in KINDS}
        self.ids = {k: set() for k in KINDS}
        self.texts = []
        self.report = []
        self.cols = set()  # (kind, column) already reported unknown
        self.last_meta = None

    def add(self, kind, name, page, attrs=None, children=(), text="", parent=None):
        base = slug(name) or KINDS[kind]
        i, n = base, 2
        if kind == "rules" and i in self.ids[kind] and parent:
            i = base = f"{parent}-{base}"
        while i in self.ids[kind]:
            i, n = f"{base}-{n}", n + 1
        if n > 2 and kind != "rules":  # repeated rule subheadings (Advantages, Step 1) are normal
            self.report.append({"kind": "duplicate-id", "file": f"{kind}.xml", "id": i, "name": name, "page": page})
        self.ids[kind].add(i)
        e = {"id": i, "name": name, "page": page, "attrs": attrs or {}, "children": list(children)}
        self.entries[kind].append(e)
        if text.strip():
            self.texts.append((kind, i, text.strip()))
        return e

    def value(self, kind, attr, v, name, page):
        v = _value(attr, v)
        p = PATTERNS.get(attr) if kind in ROW_KINDS or kind == "lifestyles" else None  # an adept power's cost is PP
        if p and v and not p.fullmatch(v):
            self.report.append({"kind": "book-value", "file": f"{kind}.xml", "name": name, "field": attr, "value": v,
                                "page": page})
        return v

    def fields(self, kind, b, page):
        """attribute -> value from the row (its name column skipped), the stat bands, then the labels."""
        cols, out = HEADERS[kind], {}
        tables = ([dict(list(b.row.items())[1:])] if b.row else []) + list(b.stats)
        for t in tables:
            for h, v in t.items():
                a = cols.get(h.upper())
                if a is None:
                    if (kind, h) not in self.cols:
                        self.cols.add((kind, h))
                        self.report.append({"kind": "unknown-column", "file": f"{kind}.xml", "column": h,
                                            "name": b.name, "page": page})
                elif v and a not in out:
                    out[a] = self.value(kind, a, v, b.name, page)
        for k, v in b.labels.items():
            a = cols.get(k.upper())
            if a and v and a not in out:
                out[a] = self.value(kind, a, v, b.name, page)
        return out

    def missing(self, kind, b, page, field):
        self.report.append({"kind": "missing-value", "file": f"{kind}.xml", "name": b.name, "field": field, "page": page})

    # --- the priority and metatype tables ---

    def table(self, header, rows, page):
        first = header[0].upper() if header else ""
        if first == "PRIORITY":
            for r in rows:
                self.priority(header, r, page)
        elif first == "METATYPE":
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
                                               if t]
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
        if kind in ROW_KINDS and b.row is None or kind in STAT_KINDS and not b.stats \
                or kind in BOX_KINDS and not (b.stats or b.labels or b.tags):
            return False
        f, name, children, attrs = self.fields(kind, b, page), b.name, [], {}
        if kind in ROW_KINDS:
            attrs["category"] = cat or slug(b.label or b.section) or "general"
            if kind == "augmentations":
                attrs = {"type": "bioware" if any("bioware" in c for c in ctx) else "cyberware", **attrs}
        elif kind == "spells":
            cat = next((c for c in SPELL_CATEGORIES for k in ctx if c in k.split()), None)
            if not cat:
                self.missing(kind, b, page, "category")
                return True
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
            else:
                attrs = {"category": cat}
            lists = {LISTS[k.lower()]: v for k, v in b.labels.items() if k.lower() in LISTS and v}
            children = [(t, {}, lists[t]) for t in dict.fromkeys(LISTS.values()) if t in lists]
        elif kind == "sprites":
            lists = {k.lower(): v for k, v in b.labels.items() if k.lower() in ("skills", "powers") and v}
            children = [(t, {}, lists[t]) for t in ("skills", "powers") if t in lists]
        elif kind == "skills":
            return self.skill(b, page)
        elif kind == "rituals" and "keywords" not in f and b.tags:
            f["keywords"] = b.tags
        elif kind == "lifestyles" and "cost" not in f:
            return False
        elif kind == "contacts" and not ({"connection", "loyalty"} & set(f)):
            return False
        attrs.update(f)
        listed = {k for k in b.labels if k.lower() in LISTS} if kind in STAT_KINDS else set()
        self.add(kind, name, page, attrs, children, _text(b, listed))
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
            a = {"id": e["id"], "source": ID, "page": e["page"], **e["attrs"]}
            kids = "".join(f"<{t}{_attrs(ca)}>{escape(_s(tx))}</{t}>" if tx is not None else f"<{t}{_attrs(ca)}/>"
                           for t, ca, tx in e["children"])
            lines.append(f"  <{tag}{_attrs(a)}><name>{escape(_s(e['name']))}</name>{kids}</{tag}>\n")
        return (HEAD + "<!-- Generated by the importer (recipe sr6 crb) from the Shadowrun 6 core rulebook. -->\n"
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


def _kind(chapter, ctx, section):
    for ch, key, kind, cat in SECTIONS:
        if ch in chapter and (not section or kind in SECTION_KINDS) and (not key or any(key in c for c in ctx)):
            return kind, cat
    return None, None


def extract(regrouped, ctx=None):
    cat = _Catalog()
    chapter, parent2, stack, seen_attrs = None, "", [], set()
    for b in blocks(regrouped):
        if b.chapter != chapter:
            chapter, parent2, stack = b.chapter, "", []
        ch, page = norm(b.chapter), max(1, b.page - PAGE_OFFSET)
        for header, rows in _tables(b.text):  # the priority and metatype tables (rule tables in regroup's output)
            cat.table(header, rows, page)
        if b.row is not None and b.header and b.header[0].upper() in ("PRIORITY", "METATYPE"):
            cat.table(b.header, [[b.row.get(h, "") for h in b.header]], page)
            continue
        section = b.type == "section"
        if section and b.level == 2:
            parent2 = b.name
        a = ATTRIBUTES.get(norm(b.name))
        if a and any(c in ch for c in ATTRIBUTE_CHAPTERS) and a[0] not in seen_attrs:
            seen_attrs.add(a[0])
            cat.add("attributes", b.name, page, {"abbr": a[0], "group": a[1]}, (), _text(b))
            if not section:
                continue
        if section:
            ctx_keys = [norm(parent2)] if b.level == 3 and parent2 else []
            kind, kcat = _kind(ch, ctx_keys, True) if b.level == 3 else (None, None)
        else:
            ctx_keys = [norm(x) for x in (b.header[0] if b.header else "", b.label, b.section, parent2) if x]
            kind, kcat = _kind(ch, ctx_keys, False)
        if kind and cat.entry(kind, kcat, b, page, ctx_keys):
            continue
        if not section and (b.row is not None or b.stats):
            cat.report.append({"kind": "unmapped", "name": b.name, "chapter": b.chapter, "section": b.section,
                               "label": b.label, "page": page})
            continue
        if not ch or not any(c in ch for c in RULE_CHAPTERS):
            continue
        level = min(b.level, 3) if section else 4
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent = stack[-1][1] if stack else None
        e = cat.add("rules", b.name, page, {"chapter": b.chapter, "level": max(1, level), "parent": parent}, (),
                    _text(b), parent=parent)
        stack.append((level, e["id"]))
    files = {f"{k}.xml": cat.xml(k) for k in KINDS if cat.entries[k]}
    return Result(files=files, texts=cat.texts_xml() if cat.texts else None, report=cat.report,
                  source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON})
