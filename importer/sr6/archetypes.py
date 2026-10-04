"""The core rulebook's archetypes (sample characters) -> SR6 runner files (sr6:character, docs/sr6-character-format.md),
built from each printed stat block against the book's own catalog (the recipe's entries, ids scoped as run() scopes them).

What maps: the metatype, the attributes (natural values; priorities aren't assigned, so each rank sits in the attribute
or skill points and the budgets read overspent until the GM or player sets them, R), the magic kind (spells, adept powers,
complex forms), skills with their specialization (+2) or expertise (+3), knowledge skills and languages, qualities (a
"(… trait)" one is a free metatype trait), spells, adept powers and complex forms, contacts (C/L), the lifestyle, gear,
augmentations, vehicles and weapons found in the catalog by name, and fake SINs with their licences. Everything else
(augmented values, the printed derived lines, Essence, starting nuyen, what the catalog doesn't have) goes in the notes
and, when a listed thing isn't found, in the report (unmatched-item). No description text is copied."""
import re
from xml.sax.saxutils import escape, quoteattr

from importer.recipes.dhsa import slug
from importer.sr6.regroup import keys, norm
from importer.xmlio import HEAD, ILLEGAL

CHAR_NS = "urn:chummer-sr6:character:1"
ATTRS = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg", "mag", "res")
BAND = {"B": "bod", "BOD": "bod", "A": "agi", "AGI": "agi", "R": "rea", "REA": "rea", "S": "str", "STR": "str", "W": "wil",
        "WIL": "wil", "L": "log", "LOG": "log", "I": "int", "INT": "int", "C": "cha", "CHA": "cha", "EDG": "edg",
        "EDGE": "edg", "M": "mag", "MAG": "mag", "RES": "res", "ESS": "ess"}
PURCHASES = {"gear": ("armor", "electronics", "gear", "vehicles", "weapons", "augmentations"),
             "augmentations": ("augmentations",), "cyberware": ("augmentations",), "bioware": ("augmentations",),
             "vehicles": ("vehicles",), "drones": ("vehicles",)}
PICKS = {"spells": "spells", "adept powers": "adeptpowers", "complex forms": "complexforms", "rituals": "rituals"}
# the labels read into the build; any other label goes in the notes as printed
READ = {"active skills", "skills", "knowledge skills", "languages", "qualities", "contacts", "lifestyle", "weapons",
        *PURCHASES, *PICKS}
PRINTED = ("initiative/actions", "initiative", "condition monitors (p/s)", "condition monitor", "defense rating",
           "starting nuyen")


def is_archetype(b):
    """A sample character's stat block: an item whose box is titled `metatype: <name>`."""
    return b.type == "item" and b.label.lower().startswith("metatype:")


def split(s):
    """A printed list split at its top-level commas (a comma inside ( ) or [ ] stays)."""
    out, cur, depth = [], "", 0
    for ch in s:
        depth = depth + 1 if ch in "([" else max(0, depth - 1) if ch in ")]" else depth
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [x.strip(" .;") for x in out + [cur] if x.strip(" .;")]


class _Index:
    """The catalog's names per kind: exact (norm; a `Jammer, area` also as `area jammer`) first, then looser
    (regroup.keys: a trailing ( … ), number or plural s cut; and an "es" plural)."""

    def __init__(self, entries, src):
        self.exact, self.loose, self.pre = {}, {}, src.lower() + "."
        for kind, es in entries.items():
            for e in es:
                m = re.fullmatch(r"([^,]+),\s*([^,]+)", e["name"])
                for n in [e["name"]] + ([f"{m.group(2)} {m.group(1)}"] if m else []):
                    self.exact.setdefault((kind, norm(n)), e)
                    for k in keys(n):
                        self.loose.setdefault((kind, k), e)

    def find(self, kinds, name, loose=True):
        """(kind, scoped id, catalog name) of the first kind with an entry named `name` (exactly: `loose` False), else None."""
        ks = keys(name) if loose else []
        for table, ks in ((self.exact, [norm(name)]), (self.loose, ks + [k[:-2] for k in ks if k.endswith("es")])):
            for kind in kinds:
                for k in ks:
                    if e := table.get((kind, k)):
                        return kind, self.pre + e["id"], e["name"]
        return None

    def prefix(self, kinds, name, rating):
        """The first entry whose name starts with `name` (`Cybereyes basic system (Rating 4)` for `cybereyes`), one
        naming `rating` first."""
        n = norm(name)
        hits = [(kind, e) for kind in kinds for (k2, key), e in self.exact.items() if k2 == kind and key.startswith(n + " ")]
        hits.sort(key=lambda h: not (rating and norm(h[1]["name"]).endswith(f"rating {rating}")))
        return (hits[0][0], self.pre + hits[0][1]["id"], hits[0][1]["name"]) if n and hits else None


def _num(v):
    m = re.match(r"\s*(\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\))?", v or "")
    return (float(m.group(1)), m.group(2) and float(m.group(2))) if m else (None, None)


def _named(idx, kinds, text):
    """A listed thing with an optional trailing level: (found, level, note), found None when the catalog lacks it."""
    m = re.fullmatch(r"(.*?)(?:\s+(\d+))?\s*(?:\((.*)\))?", text.strip())
    name, level, note = m.group(1), m.group(2) and int(m.group(2)), m.group(3)
    hit = idx.find(kinds, text) if not level else None  # `Combat Sense 2`: the name without its level
    hit = hit or idx.find(kinds, name) or idx.find(kinds, re.sub(r"\s*\(.*$", "", text))
    if not hit and (of := re.fullmatch(r"(.+?)\s+of\s+(.+)", name)):  # `Diffusion of Firewall`: Diffusion (Matrix Attribute)
        hit, note = idx.find(kinds, of.group(1)), of.group(2)
    if note and (lv := re.search(r"\blevel\s*(\d+)", note, re.I)) and not level:
        level = int(lv.group(1))
    return hit, level, note


def build(src, name, b, page, entries, updated):
    """One archetype block -> (file id, sr6:character XML, report rows). `entries`: the recipe's catalog (kind -> its
    entries, ids unscoped)."""
    idx, sid = _Index(entries, src), f"{src.lower()}.{slug(name) or 'runner'}"
    labels = {k.lower(): v for k, v in b.labels.items()}
    notes, missing, report = [], {}, []
    uid = iter(range(1, 10_000))

    def miss(field, item):
        missing.setdefault(field, []).append(item)
        report.append({"kind": "unmatched-item", "name": name, "field": field, "value": item, "page": page})

    meta = idx.find(["metatypes"], b.label.split(":", 1)[1].strip())
    if not meta:
        miss("Metatype", b.label.split(":", 1)[1].strip())
    band = {BAND[k.upper()]: v for s in b.stats for k, v in s.items() if k.upper() in BAND}
    attrs, augmented = {}, []
    for a in ATTRS:
        nat, aug = _num(band.get(a))
        if nat is not None:
            attrs[a] = int(nat)
            if aug is not None:
                augmented.append(f"{a.upper()} {band[a]}")
    picks = {kind: split(labels[label]) for label, kind in PICKS.items() if labels.get(label)}
    magic = ("technomancer" if "complexforms" in picks or "res" in attrs else
             "mystic-adept" if "spells" in picks and "adeptpowers" in picks else
             "full" if "spells" in picks else "adept" if "adeptpowers" in picks else "mundane")
    if magic == "technomancer" and "res" not in attrs:
        notes.append("Resonance isn’t printed: set it on Attributes.")

    lines = []
    for a in ATTRS:  # natural = 1 + points for the eight and Edge; Magic and Resonance start at 0 without priorities
        v = attrs.get(a, 0 if a in ("mag", "res") else 1)
        lines.append(f'<attribute id="{a}" points="{max(0, v - (0 if a in ("mag", "res") else 1))}" adjust="0" karma="0"/>')

    for s in split(labels.get("active skills") or labels.get("skills") or ""):
        m = re.fullmatch(r"([^\d(]+?)\s*(?:\(([^()]*)\)\s*)?(\d+)(?:\s*\((\d+)\))?\s*(?:\((.*)\))?", s)
        hit = m and idx.find(["skills"], m.group(1))
        if not hit:
            miss("Skills", s)
            continue
        spec = expertise = None
        for part in split(", ".join(x for x in (m.group(2), m.group(5)) if x)):
            p = re.fullmatch(r"(.*?)\s*\+\s*(\d)", part)
            if p and p.group(2) == "3":
                expertise = p.group(1)
            else:
                spec = p.group(1) if p else part
        if m.group(4):
            augmented.append(f"{hit[2]} {m.group(3)}({m.group(4)})")
        lines.append(f'<skill id={quoteattr(hit[1])} points="{m.group(3)}" karma="0"{_a("spec", spec)}{_a("expertise", expertise)}/>')
    for k in split(labels.get("knowledge skills", "")):
        lines.append(f'<knowledge uid="k{next(uid)}" kind="knowledge" points="1" karma="0">{_x(k)}</knowledge>')
    for k in split(labels.get("languages", "")):
        native = re.search(r"\(\s*native\s*\)", k, re.I)
        lang = re.sub(r"\s*\(\s*native\s*\)", "", k, flags=re.I)
        lines.append(f'<knowledge uid="k{next(uid)}" kind="language"{_a("native", native and "true")} '
                     f'points="{0 if native else 1}" karma="0">{_x(lang)}</knowledge>')
    for q in split(labels.get("qualities", "")):
        hit, level, note = _named(idx, ["qualities"], q)
        if not hit:
            miss("Qualities", q)
            continue
        free = note and re.search(r"\btrait\b", note, re.I)
        lines.append(f'<quality uid="q{next(uid)}" id={quoteattr(hit[1])} level="{level or 1}"{_a("free", free and "true")}'
                     f'{_a("note", None if free else note)} name={quoteattr(hit[2])}/>')
    for kind, items in picks.items():
        for p in items:
            hit, level, _ = _named(idx, [kind], p)
            if not hit:
                miss(next(k for k, v in PICKS.items() if v == kind).title(), p)
                continue
            lines.append(f'<pick uid="p{next(uid)}" kind="{kind}" id={quoteattr(hit[1])}{_a("level", level)} name={quoteattr(hit[2])}/>')

    sins, worn = [], False
    for label, kinds in PURCHASES.items():
        for item in split(labels.get(label, "")):
            if m := re.match(r"(?:(\d+)\s*x\s+)?fake\s+sin\b\s*(?:\((.*)\))?", item, re.I):
                r = re.search(r"rating\s*(\d+)", m.group(2) or "", re.I)
                lic = re.search(r"w/\s*(.*)", m.group(2) or "")
                for _ in range(int(m.group(1) or 1)):
                    sins.append((int(r.group(1)) if r else None, split(lic.group(1)) if lic else []))
                continue
            line, worn = _purchase(idx, kinds, item, next(uid), worn)
            if line:
                lines.append(line)
            else:
                miss(label.title(), item)
    for m in re.finditer(r"\s*([^\[\]]+?)\s*\[([^\[\]]*)(?:\]|$)", labels.get("weapons", "")):
        item = f"{m.group(1)} [{m.group(2)}]"
        line, worn = _purchase(idx, ["weapons"], m.group(1), next(uid), worn, note=item)
        if line:
            lines.append(line)
        else:
            miss("Weapons", item)

    for c in split(labels.get("contacts", "")):
        m = re.fullmatch(r"(.*?)\s*\(?\s*C\s*(\d+)\s*/\s*L\s*(\d+)\s*\)?", c)
        if not m:
            miss("Contacts", c)
            continue
        lines.append(f'<contact uid="c{next(uid)}" name={quoteattr(_s(m.group(1)))} archetype={quoteattr(_s(m.group(1)))} '
                     f'connection="{m.group(2)}" loyalty="{m.group(3)}"/>')
    if ls := labels.get("lifestyle"):
        hit = idx.find(["lifestyles"], re.sub(r"\s*\(.*$", "", ls))
        months = re.search(r"(\d+)\s*months?", ls)
        if hit:
            lines.append(f'<lifestyle id={quoteattr(hit[1])} months="{months.group(1) if months else 1}"/>')
        else:
            miss("Lifestyle", ls)
    for i, (rating, lic) in enumerate(sins, 1):
        kids = "".join(f'<licence name={quoteattr(_s(x))} rating="{rating or 1}"/>' for x in lic)
        lines.append(f'<sin uid="s{i}" name={quoteattr(f"Fake SIN {i}")} kind="fake"{_a("rating", rating)}>{kids}</sin>'
                     if kids else f'<sin uid="s{i}" name={quoteattr(f"Fake SIN {i}")} kind="fake"{_a("rating", rating)}/>')

    printed = [f"{k}: {v}" for k, v in b.labels.items() if k.lower() in PRINTED]
    if band.get("ess"):
        printed.append(f"Essence: {band['ess']}")
    if printed:
        notes.append("As printed: " + "; ".join(printed) + ".")
    if augmented:
        notes.append("Augmented as printed: " + ", ".join(augmented) + ".")
    for field, items in missing.items():
        notes.append(f"{field} not in the catalog: " + "; ".join(items) + ".")
    notes += [f"{k}: {v}" for k, v in b.labels.items() if k.lower() not in READ and k.lower() not in PRINTED]
    notes.append("Built from the printed stat block: the priorities aren’t set, so the budgets read overspent until they are.")

    root = {"formatVersion": 1, "id": sid, "streetName": name, "metatype": meta[1] if meta else "", "method": "priority",
            "updatedAt": updated}
    xml = (HEAD + f'<sr6:character xmlns:sr6="{CHAR_NS}"' + "".join(_a(k, v) for k, v in root.items()) + ">\n"
           f"  <background>{_x(f'{name} archetype. {src} p.{page}.')}</background>\n"
           f"  <notes>{_x(chr(10).join(notes))}</notes>\n"
           f'  <build method="priority" magic="{magic}">\n    ' + "\n    ".join(lines) + "\n  </build>\n</sr6:character>\n")
    return sid, xml, report


def _purchase(idx, kinds, item, n, worn, note=None):
    """A gear line -> (purchase XML or None when the catalog lacks it, worn): `3 x …` the quantity, `(rating N …)` or
    a trailing number the rating; the printed text in its note when it says more than the name."""
    m = re.match(r"(?:(\d+)\s*x\s+)?(.*)", item.strip(), re.I)
    qty, rest = int(m.group(1) or 1), m.group(2)
    base = re.split(r"\s*\(|\s+w/", rest, maxsplit=1)[0].strip()
    printed = re.search(r"\b(?:device\s+)?rating\s*(\d+)", rest, re.I)
    tail = re.fullmatch(r"(.*?)\s+(\d+)", base)  # `muscle toner 1`: rating 1
    names = ([(tail.group(1), int(tail.group(2)))] if tail else []) + [(base, None)] \
        + ([(base.rsplit(None, 1)[0], None)] if len(base.split()) > 1 else [])  # `Sony Emperor commlink`, `Honda Spirit car`
    if idx.find(kinds, base, loose=False):  # `Ares Light Fire 75`: the number is the name's
        names = [(base, None)]
    hit = r = None
    for name, rating in names:
        r = int(printed.group(1)) if printed else rating
        hit = (r and idx.find(kinds, f"{name} (Rating {r})")) or idx.find(kinds, name) or idx.prefix(kinds, name, r)
        if hit:
            break
    if not hit:
        return None, worn
    wear = hit[0] == "armor" and not worn
    note = note or (rest if norm(rest) != norm(hit[2]) else None)
    return (f'<purchase uid="g{n}" kind="{hit[0]}" id={quoteattr(hit[1])} name={quoteattr(hit[2])}{_a("rating", r)} '
            f'qty="{qty}"{_a("worn", wear and "true")}{_a("note", note)}/>'), worn or wear


def _s(v):
    return ILLEGAL.sub("", str(v)).strip()


def _x(v):
    return escape(_s(v))


def _a(k, v):
    return f" {k}={quoteattr(_s(v))}" if v not in (None, "", False) else ""
