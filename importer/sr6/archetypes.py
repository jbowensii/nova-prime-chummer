"""The core rulebook's archetypes (sample characters) -> SR6 runner files (sr6:character, docs/sr6-character-format.md),
built from each printed stat block against the book's own catalog (the recipe's entries, ids scoped as run() scopes them)
and, for another book's samples (Smooth Operations' faces), the core rulebook's catalog as already imported.

What maps: the metatype, the priorities that overspend least for what the block prints (fit.py, Sum-to-Ten when no
priority assignment fits: the attributes and skills spent from their pools, karma past them; without a priority table
that holds the runner, none, and each rank sits in the attribute or skill points, R), the attributes' natural values,
the magic kind (spells, adept powers, complex forms), skills with their specialization (+2) or expertise (+3),
knowledge skills and languages (Logic's points first, the rest bought with karma), qualities (one of the metatype's
own, or one printed "(… trait)", is a free metatype trait), spells, adept powers and complex forms, contacts (C/L),
the lifestyle, gear, augmentations (with a printed grade), vehicles and weapons found in the catalog by name, and fake
SINs with their licences. A standard boost carries the bonuses it gives (BOOSTS). The printed attributes, Essence,
initiative, condition monitors and Defense Rating go in <printed> for Review to compare, never corrected. Everything
else (the printed lines, starting nuyen, what the catalog doesn't have) goes in the notes and, when a listed thing
isn't found, in the report (unmatched-item).
No description text is copied."""
import math
import re
from xml.sax.saxutils import escape, quoteattr

from importer.recipes.dhsa import slug
from importer.sr6 import fit
from importer.sr6.regroup import keys, norm
from importer.xmlio import HEAD, ILLEGAL

CHAR_NS = "urn:chummer-sr6:character:1"
ATTRS = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg", "mag", "res")
BAND = {"B": "bod", "BOD": "bod", "A": "agi", "AGI": "agi", "R": "rea", "REA": "rea", "S": "str", "STR": "str", "W": "wil",
        "WIL": "wil", "L": "log", "LOG": "log", "I": "int", "INT": "int", "C": "cha", "CHA": "cha", "EDG": "edg",
        "EDGE": "edg", "M": "mag", "MAG": "mag", "RES": "res", "ESS": "ess"}
PURCHASES = {"gear": ("armor", "electronics", "gear", "vehicles", "weapons"),  # (an implant is printed under Augmentations)
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
    """The catalog's names per kind: exact (norm; a `Jammer, area` also as `area jammer`, a `Combat/survival knife` also
    as `Combat knife` and `survival knife`) first, then looser (regroup.keys: a trailing ( … ), number or plural s cut;
    and an "es" plural). The book's own entries (ids unscoped) come first, then `core`'s (the core rulebook's as
    imported, ids scoped), which another book's samples cite."""

    def __init__(self, entries, src, core=None):
        self.exact, self.loose = {}, {}
        for pre, cat in ((src.lower() + ".", entries), ("", core or {})):
            for kind, e in ((kind, {**e, "id": pre + e["id"]}) for kind, es in cat.items() for e in es):
                m = re.fullmatch(r"([^,]+),\s*([^,]+)", e["name"])
                for n in [e["name"]] + ([f"{m.group(2)} {m.group(1)}"] if m else []) + _slashed(e["name"]):
                    for k in {norm(n), norm(n).replace(" ", "")}:  # (`Roto-Drone` printed `Rotodrone`)
                        self.exact.setdefault((kind, k), e)
                    for k in keys(n):
                        self.loose.setdefault((kind, k), e)

    def find(self, kinds, name, loose=True):
        """(kind, scoped id, catalog name, entry) of the first kind with an entry named `name` (exactly: `loose` False),
        else None."""
        ks = keys(name) if loose else []
        for table, ks in ((self.exact, [norm(name), norm(name).replace(" ", "")]), (self.loose, ks + [k[:-2] for k in ks if k.endswith("es")])):
            for kind in kinds:
                for k in ks:
                    if e := table.get((kind, k)):
                        return kind, e["id"], e["name"], e
        return None

    def prefix(self, kinds, name, rating):
        """The first entry whose name starts with `name` (`Cybereyes basic system (Rating 4)` for `cybereyes`), one
        naming `rating` first."""
        n = norm(name)
        hits = [(kind, e) for kind in kinds for (k2, key), e in self.exact.items() if k2 == kind and key.startswith(n + " ")]
        hits.sort(key=lambda h: not (rating and norm(h[1]["name"]).endswith(f"rating {rating}")))
        return (hits[0][0], hits[0][1]["id"], hits[0][1]["name"], hits[0][1]) if n and hits else None


def _slashed(name):
    """`Spirit/Sprite Bane` -> [`Spirit Bane`, `Sprite Bane`]: each word of a slashed pair in its place; else []."""
    m = re.search(r"(\w+)/(\w+)", name)
    return [name[:m.start()] + w + name[m.end():] for w in m.groups()] if m else []


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


def build(src, name, b, page, entries, updated, core=None, cs=None):
    """One archetype block -> (file id, sr6:character XML, report rows). `entries`: the recipe's catalog (kind -> its
    entries, ids unscoped); `core`: the core rulebook's as imported (ids scoped), for what the book cites from it; `cs`:
    the creation settings the priorities are fitted with (fit.py; default the shipped standard ones)."""
    idx, sid = _Index(entries, src, core), f"{src.lower()}.{slug(name) or 'runner'}"
    cs = fit.settings() if cs is None else cs
    num = lambda v: fit.value(str(v)) or 0
    setting = lambda k: cs.get(k) if isinstance(cs.get(k), float) else 0
    # what the printed things cost, for fitting the priorities (fit.spend's `need`)
    need = {"raised": set(), "skills": [], "karma": 0, "neg": 0, "spells": 0, "forms": 0, "pp": 0, "nuyen": 0,
            "debt": False}
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

    lines, skills = [], []
    if meta:  # its core attributes whose maximum is above the base take adjustment points too (rules.ts adjustTargets)
        need["raised"] = {c[1]["attr"] for c in meta[3].get("children", []) if c[0] == "range" and c[1].get("attr") in fit.CORE
                          and num(c[1].get("max")) > setting("attributeBaseMax")}

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
        skills.append((hit[1], int(m.group(3)), spec, expertise))
    free = attrs.get("log", 1)  # Logic's knowledge points (CRB p.67) go first; a skill or language past them is karma's
    for k in split(labels.get("knowledge skills", "")):
        lines.append(f'<knowledge uid="k{next(uid)}" kind="knowledge" {_rank(free)}>{_x(k)}</knowledge>')
        need["karma"] += 0 if free > 0 else setting("karmaKnowledge")
        free -= 1
    for k in split(labels.get("languages", "")):
        native = re.search(r"\(\s*native\s*\)", k, re.I)
        lang = re.sub(r"\s*\(\s*native\s*\)", "", k, flags=re.I)
        ranks = 'points="0" karma="0"' if native else _rank(free)
        need["karma"] += 0 if native or free > 0 else setting("karmaKnowledge")
        free -= 0 if native else 1
        lines.append(f'<knowledge uid="k{next(uid)}" kind="language"{_a("native", native and "true")} {ranks}>{_x(lang)}</knowledge>')
    # the metatype's own qualities (CRB p.64) are free whether or not the block marks them "(… trait)"
    traits = {norm(t or "") for tag, _, t in meta[3].get("children", []) if tag == "trait"} if meta else set()
    for q in split(labels.get("qualities", "")):
        hit, level, note = _named(idx, ["qualities"], q)
        if not hit:
            miss("Qualities", q)
            continue
        free = (note and re.search(r"\btrait\b", note, re.I)) or norm(f"{hit[2]} {level or ''}") in traits
        qa = hit[3].get("attrs", {})  # its karma (budgets.ts qualityCost): × level when per level; a ranged one's own
        took = _allergy(hit[2], note, num(qa.get("karmaMax"))) if qa.get("karmaMax") else None
        cost = 0 if free else took or abs(num(qa.get("karma"))) * ((level or 1) if qa.get("perLevel") == "true" else 1)
        if qa.get("kind") == "negative":
            need["neg"] += cost
        else:
            need["karma"] += cost * (setting("positiveQualityFactor") or 1)
        need["debt"] |= hit[1] == cs.get("inDebtQuality")
        lines.append(f'<quality uid="q{next(uid)}" id={quoteattr(hit[1])} level="{level or 1}"{_a("karma", took)}{_a("free", free and "true")}'
                     f'{_a("note", None if free else note)} name={quoteattr(hit[2])}/>')
    for kind, items in picks.items():
        for p in items:
            hit, level, _ = _named(idx, [kind], p)
            if not hit:
                miss(next(k for k, v in PICKS.items() if v == kind).title(), p)
                continue
            pa = hit[3].get("attrs", {})
            need["spells" if kind in ("spells", "rituals") else "forms" if kind == "complexforms" else "pp"] += (
                num(pa.get("cost")) * ((level or 1) if pa.get("perLevel") == "true" else 1) if kind == "adeptpowers" else 1)
            lines.append(_closed(f'<pick uid="p{next(uid)}" kind="{kind}" id={quoteattr(hit[1])}{_a("level", level)} name={quoteattr(hit[2])}',
                                 _bonuses(hit[2], level), "pick"))

    sins, worn = [], False
    for label, kinds in PURCHASES.items():
        for item in split(labels.get(label, "")):
            if m := re.match(r"(?:(\d+)\s*x\s+)?fake\s+sin\b\s*(?:\((.*)\))?", item, re.I):
                r = re.search(r"rating\s*(\d+)", m.group(2) or "", re.I)
                lic = re.search(r"w/\s*(.*)", m.group(2) or "")
                for _ in range(int(m.group(1) or 1)):
                    sins.append((int(r.group(1)) if r else None, split(lic.group(1)) if lic else []))
                continue
            line, worn, cost = _purchase(idx, kinds, item, next(uid), worn, cs)
            need["nuyen"] += cost
            if line:
                lines.append(line)
            else:
                miss(label.title(), item)
    for m in re.finditer(r"\s*([^\[\]]+?)\s*\[([^\[\]]*)(?:\]|$)", labels.get("weapons", "")):
        item = f"{m.group(1)} [{m.group(2)}]"
        line, worn, cost = _purchase(idx, ["weapons"], m.group(1), next(uid), worn, cs, note=item)
        need["nuyen"] += cost
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
            need["nuyen"] += num(hit[3].get("attrs", {}).get("cost")) * int(months.group(1) if months else 1)
        else:
            miss("Lifestyle", ls)
    for i, (rating, lic) in enumerate(sins, 1):
        need["nuyen"] += (rating or 1) * (setting("fakeSinPerRating") + len(lic) * setting("licencePerRating"))
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

    # the priorities that overspend least (fit.py): the attributes and skills spent from their pools, karma past them
    left = re.sub(r"\D", "", labels.get("starting nuyen", ""))
    ess = _num(band.get("ess"))[0]
    need.update(meta=meta[2] if meta else "", magic=magic, left=int(left) if left else None,
                loss=math.ceil(setting("essence") - ess - 1e-9) if ess is not None and setting("essence") > ess else 0,
                attrs={a: attrs.get(a, 0 if a in ("mag", "res") else 1) for a in ATTRS},
                skills=[(r, 1 if sp else 0) for _, r, sp, _ in skills])
    rows = {}
    for e in entries.get("priorities") or (core or {}).get("priorities") or []:
        r = rows.setdefault(e.get("attrs", {}).get("letter"), {"metas": {}, "magic": {}})
        for tag, ca, _ in e.get("children", []):
            if tag == "metatype":
                r["metas"][ca["name"].lower()] = int(num(ca["points"]))
            elif tag == "magic":
                r["magic"][ca["kind"]] = int(num(ca.get("rating") or 0))
            elif tag in ("attributes", "skills"):
                r[tag] = int(num(ca["points"]))
            elif tag == "resources":
                r["nuyen"] = num(ca["nuyen"])
    got = fit.fit(need, rows, cs) if meta and rows and cs else None
    method = got["method"] if got else "priority"
    if got:
        head = [f'<priority column="{c}" letter="{L}"/>' for c, L in got["letters"].items()]
        head += [f'<attribute id="{a}" points="{p}" adjust="{j}" karma="{k}"/>' for a, (p, j, k) in ((a, got["attrs"][a]) for a in ATTRS)]
        head += [f'<skill id={quoteattr(i)} points="{p}" karma="{k}"{_a("spec", sp)}{_a("expertise", ex)}/>'
                 for (i, _, sp, ex), (p, k) in zip(skills, got["skills"])]
        notes.append("Priorities fitted to the printed stat block: the letters that overspend least; what the attribute, "
                     "adjustment and skill points can’t hold is bought with karma, and nuyen past the resources with karma."
                     + (" No priority assignment holds it within the karma, so it’s built with Sum-to-Ten (Sixth World "
                        "Companion), whose letters may repeat." if got["method"] == "sumtoten" else ""))
    else:  # natural = 1 + points for the eight and Edge; Magic and Resonance start at 0 without priorities
        head = [f'<attribute id="{a}" points="{max(0, v - (0 if a in ("mag", "res") else 1))}" adjust="0" karma="0"/>'
                for a, v in need["attrs"].items()]
        head += [f'<skill id={quoteattr(i)} points="{r}" karma="0"{_a("spec", sp)}{_a("expertise", ex)}/>' for i, r, sp, ex in skills]
        notes.append("Built from the printed stat block: the priorities aren’t set, so the budgets read overspent until they are.")

    # the numbers Review compares with the rules' (the book's, never corrected): attributes as printed (`5(7)`), Essence,
    # initiative (`8(10) + 3D6`, the actions left out), the condition monitors (`11/10`) and the Defense Rating
    # (a book printing them in a second band, `DR | I/ID | AC | CM`: initiative `10/1` is 10 + 1D6)
    row = {k.upper(): v for s in b.stats for k, v in s.items()}
    iid = re.fullmatch(r"\s*(\S+)\s*/\s*(\d+)\s*", row.get("I/ID", ""))
    shown = {**{a: band[a] for a in (*ATTRS, "ess") if band.get(a)},
             "init": (labels.get("initiative/actions") or labels.get("initiative") or "").split("/")[0]
             or (iid and f"{iid.group(1)} + {iid.group(2)}D6"),
             "cm": labels.get("condition monitors (p/s)") or labels.get("condition monitor") or row.get("CM"),
             "dr": labels.get("defense rating") or row.get("DR")}
    shown = "".join(f'<value key="{k}" value={quoteattr(_s(v))}/>' for k, v in shown.items() if v and _s(v))

    root = {"formatVersion": 1, "id": sid, "streetName": name, "metatype": meta[1] if meta else "", "method": method,
            "updatedAt": updated}
    xml = (HEAD + f'<sr6:character xmlns:sr6="{CHAR_NS}"' + "".join(_a(k, v) for k, v in root.items()) + ">\n"
           f"  <background>{_x(f'{name} archetype. {src} p.{page}.')}</background>\n"
           f"  <notes>{_x(chr(10).join(notes))}</notes>\n"
           + (f'  <printed source={quoteattr(src)} page="{page}">{shown}</printed>\n' if shown else "") +
           f'  <build method="{method}" magic="{magic}"{_a("karmaToNuyen", got and got["karmaToNuyen"])}>\n    '
           + "\n    ".join(head + lines) + "\n  </build>\n</sr6:character>\n")
    return sid, xml, report


# CRB p.75, Allergy: its most karma less the allergen's modifier and the severity's; an allergen printed without its kind
# takes the kind of the book's example it names
ALLERGEN = {"common": 0, "seasonal": 3, "uncommon": 6, "rare": 9}
SEVERITY = {"extreme": 0, "severe": 3, "moderate": 6, "mild": 9}
EXAMPLES = {"pollen": "seasonal", "insect stings": "seasonal", "seasonal molds": "seasonal", "grass": "common",
            "molds": "common", "soy": "common", "strawberries": "uncommon", "wheat": "uncommon", "dairy": "uncommon",
            "precious metals": "rare"}


def _allergy(name, note, top):
    """An Allergy's karma from its printed `(severity, allergen)`, or None when it isn't one or doesn't say both."""
    words = [norm(w) for w in split(note or "")]
    kind = next((w for w in words if w in ALLERGEN), None) or next((EXAMPLES[w] for w in words if w in EXAMPLES), None)
    sev = next((SEVERITY[w] for w in words if w in SEVERITY), None)
    return int(top - ALLERGEN[kind] - sev) if norm(name).startswith("allergy") and kind and sev is not None else None


def _rank(free):
    return 'points="1" karma="0"' if free > 0 else 'points="0" karma="1"'


# a cyberlimb printed by its part and kind (`cyberarm (obvious left, …)`): the catalog's `Arm (obvious)`
_LIMB = re.compile(r"cyber\s?(\w+)\s*\(\s*(obvious|synthetic)\b", re.I)


def _purchase(idx, kinds, item, n, worn, cs, note=None):
    """A gear line -> (purchase XML or None when the catalog lacks it, worn, its cost at its rating, grade and quantity
    (budgets.ts priced), 0 when it can't be read): `3 x …` the quantity, `(rating N …)` or a trailing number the rating;
    the printed text in its note when it says more than the name."""
    m = re.match(r"(?:(\d+)\s*x\s+)?(.*)", item.strip(), re.I)
    qty, rest = int(m.group(1) or 1), m.group(2)
    base = re.split(r"\s*\(|\s+w/", rest, maxsplit=1)[0].strip()
    printed = re.search(r"\b(?:device\s+)?rating\s*(\d+)", rest, re.I)
    printed = printed and int(printed.group(1))
    tail = re.fullmatch(r"(.*?)\s+(\d{1,2})", base)  # `muscle toner 1`: rating 1 (`Beretta 201`: a model)
    names = ([(tail.group(1), int(tail.group(2)))] if tail else []) + [(base, None)]
    if idx.find(kinds, base, loose=False):  # `Ares Light Fire 75`: the number is the name's
        names = [(base, None)]
    # `Bone lacing (titanium)`: the catalog's own variant (a grade printed with it, `(plastic, alpha)`, left out)
    whole = re.sub(r"\s*,?\s*\b(?:alpha|beta|delta|used)(?:ware)?\b", "", re.split(r"\s+w/", rest, maxsplit=1)[0]).strip()
    if limb := _LIMB.match(rest):
        whole = f"{limb.group(1)} ({limb.group(2)})"
    hit = r = None
    if found := idx.find(kinds, whole, loose=False):
        hit, names, r = found, [], printed
    for name, rating in names:
        r = printed or rating
        hit = (r and idx.find(kinds, f"{name} (Rating {r})")) or idx.find(kinds, name) or idx.prefix(kinds, name, r)
        if hit:
            break
    if not hit and len(base.split()) > 1:  # `Sony Emperor commlink`, `Honda Spirit car`; no prefix match (`Combat` axe)
        r, hit = printed, idx.find(kinds, base.rsplit(None, 1)[0])
    if not hit:
        return None, worn, 0
    wear = hit[0] == "armor" and not worn
    grade = hit[0] == "augmentations" and re.search(r"\((?:[^()]*\W)?(alpha|beta|delta|used)(?:ware)?\s*\)", rest, re.I)
    note = note or (rest if norm(rest) != norm(hit[2]) else None)
    ha = hit[3].get("attrs", {})
    low = re.match(r"\s*(\d*)", ha.get("rating") or "").group(1)  # unrated: the lowest it comes in (budgets.ts ratingOf)
    cost = (fit.value(ha.get("cost"), r or int(low or 1)) or 0) * qty * (cs.get(f"grade:{grade.group(1).lower()}:cost", 1) if grade else 1)
    return _closed(f'<purchase uid="g{n}" kind="{hit[0]}" id={quoteattr(hit[1])} name={quoteattr(hit[2])}{_a("rating", r)} '
                   f'qty="{qty}"{_a("grade", grade and grade.group(1).lower())}{_a("worn", wear and "true")}{_a("note", note)}',
                   _bonuses(hit[2], r), "purchase"), worn or wear, cost


# what a standard boost adds per rating or level (the engine counts only the bonuses a line carries, the catalog has none):
# CRB p.157 (Improved Reflexes), pp.286-292 (dermal plating, bone lacing's table, wired reflexes, reaction enhancers,
# muscle toner and augmentation). The book's printed augmented values are compared to these on Review.
BOOSTS = {"improved reflexes": (("rea", 1), ("initDice", 1)), "wired reflexes": (("rea", 1), ("initDice", 1)),
          "reaction enhancers": (("rea", 1),), "muscle toner": (("agi", 1),), "muscle augmentation": (("str", 1),),
          "dermal plating": (("defense", 1),), "bone lacing plastic": (("defense", 1),),
          "bone lacing aluminum": (("defense", 1),), "bone lacing titanium": (("defense", 2),)}


def _bonuses(name, rating):
    """The <bonus> lines of a catalog entry named `name` bought at `rating` (or level): per rating, or at the level its
    name ends with (`Wired Reflexes 2`); none for anything else."""
    m = re.fullmatch(r"(.*?)(?:\s+(\d+))?", norm(name))
    per = BOOSTS.get(m.group(1), ())
    return "".join(f'<bonus target="{t}" value="{v}" perRating="true"/>' if rating else
                   f'<bonus target="{t}" value="{v * int(m.group(2) or 1)}"/>' for t, v in per)


def _closed(head, kids, tag):
    return f"{head}>{kids}</{tag}>" if kids else f"{head}/>"


def _s(v):
    return ILLEGAL.sub("", str(v)).strip()


def _x(v):
    return escape(_s(v))


def _a(k, v):
    return f" {k}={quoteattr(_s(v))}" if v not in (None, "", False) else ""
