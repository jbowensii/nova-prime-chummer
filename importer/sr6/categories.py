"""An item's category is the title of the table it is printed in (owner, 2026-10-06): `cyberlimb cost and capacity` is
the category Cyberlimb, its row `Arm (synthetic)` the item. The title is what tells cyberware from bioware and a
cyberlimb's accessories from a weapon's.

For every table a book's catalog rows come from, this module:
- derives the category's human name from the title: the table's words less the words about the table itself (`cost and
  capacity`, `table`, `list`, a number), the last word singular (`cyberlimbs` -> Cyberlimb). A table with no title, or
  a title that names no category (`Table 4.2`), takes its section heading instead, with low confidence;
- reads an accessory table from its title's last word (`accessories`, `modifications`, `mods`, `enhancements`): the
  words before it name the host categories it fits (`cyberlimb accessories` fits Cyberlimb; `cyberarm and cyberleg
  mods` fits both). A host is a category of the same book by that name, or a kind or augmentation type by its own
  word (`weapon`, `armor`, `vehicle`, `bioware`); a host it can't match is an issue on the accessory category;
- writes one `<category>` record per (kind, category) to categories.xml: its name, the printed table and section
  titles, the accessory categories that fit it or the hosts it fits, its confidence and, when low, why;
- decides per row whether its name needs the category to be understood (a bare part: `Arm`, `Armor`, `Gel`), with a
  confidence; such an entry gets `group` (the category's name: the app shows `Cyberlimb: Arm (synthetic)`), and the
  composed names the book's own prose prints for it (`cyberarm`, `synthetic cyberarm`) as `<alias>` search names.

The tests (`classify`, `bare_part`) are general rules over the book's own words; nothing is listed per item."""

import collections
import re

from importer.sr6.ids import slug
from importer.sr6.formula import word_stem
from importer.sr6.regroup import norm

# a table's own words, not its category's
NOISE = re.compile(
    r"\btable\s*[\d.]+[a-z]?\b|\((?:[^()]*)\)|\b(?:cost|costs|and\s+capacity|capacity|table|tables|"
    r"chart|"
    r"list|listing|prices?|pricing|summary|stats|statistics|continued|cont)\b",
    re.I,
)
CONNECT = {"and", "or", "of", "the", "for", "with", "a", "an", "&", "to", "in", "on", "by"}
ACCESSORY = {"accessory", "accessorie", "modification", "mod", "enhancement"}  # (singular, as word_stem() leaves them)
SPLIT_END = {"and", "or", "of", "&", "for", "with", "the", "to", "-", "–", ","}
# a host named by a kind's or an augmentation type's own word: the kind (`weapon accessories` fit every weapon)
KIND_WORDS = {
    "weapon": "weapons",
    "armor": "armor",
    "armour": "armor",
    "vehicle": "vehicles",
    "drone": "vehicles",
    "device": "electronics",
    "electronic": "electronics",
    "commlink": "electronics",
    "cyberdeck": "electronics",
    "cyberware": "augmentations",
    "bioware": "augmentations",
    "geneware": "augmentations",
    "nanoware": "augmentations",
    "implant": "augmentations",
    "augmentation": "augmentations",
    "gear": "gear",
    "program": "programs",
    "ammunition": "ammotypes",
}
# a title naming only the kind it lists (`vehicles` over the drones): the kind's own word
KIND_ONLY = {
    "weapon": "weapons",
    "armor": "armor",
    "vehicle": "vehicles",
    "gear": "gear",
    "device": "electronics",
    "electronic": "electronics",
    "augmentation": "augmentations",
    "program": "programs",
}
GROUP_AT = 0.65  # the confidence from which a row's name shows its category


def words(s):
    return re.findall(r"[a-z0-9][a-z0-9'-]*|&", (s or "").lower())


def singular(w, seen=None):
    """A word's singular, when the book prints it (`clothes` stays: no `clothe`); without the book's words, word_stem's."""
    s = w[:-1] if len(w) > 5 and w.endswith("ae") else word_stem(w)  # (a Latin plural: `formulae`)
    return s if seen is None or s == w or s in seen else w


def category_name(title, seen=None):
    """The category a table title names, or None: `cyberlimb cost and capacity` -> `Cyberlimb`, `ammo types` -> `Ammo
    type`, `helmets and shields` -> `Helmet and shield`, `Table 4.2` -> None. seen: the book's words (singular() )."""
    ws = re.findall(r"[a-z0-9][a-z0-9'-]*|&|/", NOISE.sub(" ", title or "").lower())
    while ws and ws[0] in CONNECT | {"/"}:
        ws = ws[1:]
    while ws and ws[-1] in CONNECT | {"/"}:
        ws = ws[:-1]
    if not ws or not any(len(w) > 2 and w.replace("-", "").isalpha() for w in ws):
        return None
    # the head of each part a title joins (`and`, `/`): its last word, singular
    ws = [
        singular(w, seen) if i == len(ws) - 1 or ws[i + 1] in ("and", "or", "&", "/") else w for i, w in enumerate(ws)
    ]
    out = " ".join(ws).replace(" / ", "/")
    return out[:1].upper() + out[1:]


def split_title(title):
    """A title cut off where the converter broke it over two lines: it ends on a joining word (`cyberlimb and`)."""
    ws = (title or "").lower().split()
    return bool(ws) and (ws[-1] in SPLIT_END or ws[0] in ("and", "or", "of"))


def hosts(name):
    """The host categories an accessory category's name fits, or None when it is no accessory category:
    `Cyberlimb accessory` -> [`cyberlimb`], `Cyberarm and cyberleg mod` -> [`cyberarm`, `cyberleg`]."""
    ws = words(name)
    if not ws or word_stem(ws[-1]) not in ACCESSORY:
        return None
    rest = " ".join(ws[:-1])
    parts = re.split(r"\s*(?:\band\b|\bor\b|&|/|,)\s*", rest)
    return [h for h in (" ".join(word_stem(w) for w in p.split()) for p in parts) if h]


def key(s):
    """A category name compared with a host's: singular words, lower case."""
    return " ".join(word_stem(w) for w in words(s))


class Vocabulary:
    """The book's prose: the words it prints in lower case (a common noun, not a maker's name) and every word and pair
    of words, to find a composed name (`cyberarm`, `gel rounds`)."""

    def __init__(self, texts):
        self.lower, self.seen, self.pairs = collections.Counter(), set(), set()
        for t in texts:
            toks = re.findall(r"[A-Za-z][A-Za-z'-]*", t or "")
            self.lower.update(w for w in toks if w.islower())
            low = [w.lower() for w in toks]
            self.seen.update(low)
            self.pairs.update(zip(low, low[1:]))

    def common(self, w):
        return self.lower[w.lower()] > 0 or w.isupper() and 2 <= len(w) <= 5  # (an acronym: APDS)

    def composed(self, part, category):
        """The names the prose prints for the part with its category's stem (any first letters of a category word, 4 at
        least): joined (`cyber` + `arm`: `cyberarm`) or as two words (`gel ammo`, `ammo` from `ammo type`)."""
        p = part.lower()
        out = []
        cw = words(category)
        for i, w in enumerate(cw):
            for n in range(len(w), 3, -1):
                stem = w[:n]
                if stem + p in self.seen and stem + p != w:
                    out.append(stem + p)
                if i < len(cw) - 1 and (p, stem) in self.pairs:  # (a modifier's stem: `gel ammo`, not `knife blade`)
                    out.append(f"{p} {stem}")
        return list(dict.fromkeys(out))


def core_of(name):
    return re.sub(r"\s*\([^()]*\)\s*$", "", name).strip()


def makers(names, voc):
    """The makers a book's item names start with (`Ares Predator VI`, `Ares Alpha`: Ares): a first word in capitals
    the prose never prints in lower case, starting two names or more. The vocabulary is learned, never listed."""
    first = collections.Counter(core_of(n).split()[0] for n in names if len(core_of(n).split()) > 1)
    return {w for w, n in first.items() if n > 1 and w[:1].isupper() and not voc.common(w)}


def bare_part(name, cat, voc, others, accessory, cohesion, parts=False, maker=frozenset(), made=None):
    """(confidence 0-1, composed names) that the row name is a bare part needing its category: a short name (+0.3 one
    word, +0.2 two) of common words (+0.2: printed in lower case in the book), printed elsewhere in the book as a
    composed name (+0.3: `cyberarm`), naming something else too (+0.2: `Armor` is a spell and a rule as well), in an
    accessory table (+0.25), among rows mostly of one word (+0.1) or a third of them composed (+0.15: a table of
    parts). A maker's or model's name (a digit, a capital inside a word, a learned maker first, a first word the prose
    never prints in lower case), or one with its category's own words, is named enough: 0."""
    core = core_of(name)
    toks = re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", core)
    if not toks or len(toks) > 3:
        return 0.0, []
    if (
        any(re.search(r"\d|[a-z][A-Z]", t) for t in toks)
        or toks[0] in maker
        or len(toks) > 1
        and toks[0][:1].isupper()
        and not voc.common(toks[0])
    ):
        return 0.0, []  # a maker's or model's name
    cw = {word_stem(w) for w in words(cat) if len(w) > 3}
    if cw & {word_stem(w.lower()) for w in toks}:
        return 0.0, []  # it names its category already
    made = (voc.composed(toks[-1], cat) if len(toks) == 1 else []) if made is None else made
    s = {1: 0.3, 2: 0.2}.get(len(toks), 0.0)
    s += 0.2 if all(voc.common(x) for t in toks for x in t.split("/") if x) else 0.0
    s += 0.3 if made else 0.0
    s += 0.2 if norm(core) in others else 0.0
    s += 0.25 if accessory else 0.0
    s += 0.1 if cohesion >= 0.5 else 0.0
    s += 0.15 if parts else 0.0
    return round(min(s, 1.0), 2), made


def _aliases(name, made):
    """Search names from the composed forms: `cyberarm` -> Cyberarm, `Cyberarm (synthetic)`, `Synthetic cyberarm`."""
    v = re.search(r"\(([^()]*)\)\s*$", name)
    out = []
    for m in made:
        c = m[:1].upper() + m[1:]
        out.append(c)
        if v:
            out += [f"{c} ({v.group(1)})", f"{v.group(1)[:1].upper()}{v.group(1)[1:]} {m}"]
    return out


def classify(t, kinds_of, names, seen=None):
    """A table's verdict: (category name, confidence high|low, why). why is None when it fits the pattern (a title
    naming
    a category, rows of one kind, an accessory table with its host); else one of WHY. A title naming only the kind
    (`vehicles` over `Microdrones`) takes its section's category. names: the book's category names by key()."""
    title, section = t["title"], t["section"]
    if t.get("product"):  # a product's configurations (shapes.configurations): the product as printed
        return t["product"], "high", None
    cname, sname = category_name(title, seen), category_name(section, seen)
    why = None
    if not title:
        why = "category named only by its section heading" if section else "no title"
    elif split_title(title):
        why = "title split across lines"
    elif not cname:
        why = "title isn't a category"
    elif (
        key(cname) in KIND_ONLY
        and sname
        and key(sname) != key(cname)
        and len(kinds_of) == 1
        and KIND_ONLY[key(cname)] in kinds_of
    ):
        why, cname = "title names only its kind", sname
    if why and why != "title names only its kind":
        cname = sname or cname or (section or "").strip() or None
    if len(kinds_of) > 1 and not why:
        why = "mixed rows"
    hs = hosts(cname) if cname else None
    if hs is not None and not why and (not hs or any(h not in names and h not in KIND_WORDS for h in hs)):
        why = "accessory table with no matching host"
    return cname, "low" if why in LOW else "high", why


def human(e, t, seen=None):
    """A row's category name: its product (a configuration); else the category the recipe gave it (its table's title,
    else its section: a box titled with its own item's name isn't one), read from the printed words that gave it."""
    if e.get("product"):
        return e["product"]
    c = e["attrs"].get("category") or ""
    for x in (t["title"], t["section"]):
        if x and slug(x) == c:
            n = category_name(x, seen) or x.strip()
            s = category_name(t["section"], seen)
            # (a title naming only the kind: `vehicles` over `Microdrones`)
            return s if x == t["title"] and key(n) in KIND_ONLY and s and key(s) != key(n) else n
    return category_name(c.replace("-", " "), seen) or c


WHY = (
    "no title",
    "title isn't a category",
    "category named only by its section heading",
    "title split across lines",
    "title names only its kind",
    "mixed rows",
    "accessory table with no matching host",
)
LOW = WHY[:4]


def build(cat, texts, row_kinds):
    """Categories, groups and composed aliases for a book's catalog `cat` (catalog.Catalog) once every block is read.
    texts: the book's prose. Sets each table row's `category` to its table's category name, adds the categories
    entries, sets `group` and the composed aliases on bare-part rows. Returns the tables' verdicts [(table, name,
    confidence, why, kinds)] and the rows' [(entry, kind, category record, confidence, composed)]."""
    voc = Vocabulary(texts)
    by_table = collections.defaultdict(list)
    for kind in row_kinds:
        for e in cat.entries[kind]:
            if e.get("tab") is not None:
                by_table[e["tab"]].append((kind, e))
    # each table's category name, before the accessory tables look for their hosts among them
    first = {
        i: (category_name(t["title"], voc.seen) if t["title"] and not split_title(t["title"]) else None)
        or category_name(t["section"], voc.seen)
        for i, t in cat.tables.items()
    }
    names = {key(n): n for n in first.values() if n}
    verdicts, cats = [], {}
    for i, t in sorted(cat.tables.items()):
        rows = by_table.get(i, [])
        if not rows:
            continue
        kinds_of = collections.Counter(k for k, _ in rows)
        cname, conf, why = classify(t, kinds_of, names, voc.seen)
        verdicts.append((t, cname, conf, why, dict(kinds_of)))
        if cname:
            names.setdefault(key(cname), cname)
        for kind, e in rows:
            name = human(e, t, voc.seen)
            c = cats.setdefault(
                (kind, key(name)),
                {
                    "name": name,
                    "table": t.get("parent") or t["title"],
                    "section": t["section"],
                    "page": e["page"],
                    "confidence": conf,
                    "why": why if conf == "low" else None,
                    "entries": [],
                    "head": (t.get("header") or [""])[0],
                },
            )
            c["entries"].append(e)
            e["attrs"]["category"] = c["name"]
    # the book's names (every kind, the rule sections too): a part named like something else is ambiguous
    seen = collections.defaultdict(set)
    for kind, es in cat.entries.items():
        for e in es:
            seen[norm(core_of(e["name"]))].add((kind, key(e["attrs"].get("category") or "")))
    mk = makers([e["name"] for k in row_kinds for e in cat.entries[k]], voc)
    groups, acc_of = [], collections.defaultdict(list)  # host category key -> its accessory categories' names
    for (kind, ckey), c in cats.items():
        hs = hosts(c["name"])
        c["fits"] = hs
        for h in hs or ():
            acc_of[h].append(c["name"])
        es = c["entries"]
        cohesion = sum(1 for e in es if len(core_of(e["name"]).split()) == 1) / len(es)
        made = {
            id(e): voc.composed(core_of(e["name"]), c["name"]) if len(core_of(e["name"]).split()) == 1 else []
            for e in es
        }
        parts = sum(1 for m in made.values() if m) * 3 >= len(es)
        if parts:  # the stem the prose composes two siblings or more with (`cyber`: cyberarm, cyberskull): every part
            n = collections.Counter(m[: -len(core_of(e["name"]))] for e in es for m in set(made[id(e)]) if " " not in m)
            stems = {s for s, k in n.items() if k > 1}
            for e in es:
                p = core_of(e["name"]).lower()
                if not made[id(e)] and " " not in p:
                    made[id(e)] = [s + p for s in sorted(stems)]
        # (owner, 2026-10-08) a first column headed by a class (`GRENADES`), not a column word (WEAPON, ITEM, TYPE, GEAR):
        # its rows are parts of that class, shown `Grenade: Gas`, searched as the prose composes them (`gas grenade`)
        cls = singular(c["head"].lower()) if re.fullmatch(r"[A-Z]+S", c["head"] or "") else ""
        cls = cls if cls and key(cls) == key(c["name"]) else ""
        for e in es:
            core = norm(core_of(e["name"]))
            others = {core} if seen[core] - {(kind, ckey)} else set()
            conf, m = bare_part(e["name"], c["name"], voc, others, hs is not None, cohesion, parts, mk, made[id(e)])
            # (a bare part only: not a product's own name, `Honda Spirit`, nor one naming the class, `Cybereyes Rating 5`)
            bare = not re.search(r"\s[A-Z0-9]", core_of(e["name"])) and key(cls) not in key(e["name"])
            if cls and bare:
                conf = 1.0
                m = [
                    f"{p.strip().lower()} {cls}"
                    for p in core_of(e["name"]).split("/")
                    if p.strip() and (p.strip().split()[-1].lower(), cls) in voc.pairs
                ]
            if e.get("product"):
                conf, m = 1.0, []  # a configuration (`Spear`) is named by its product
            elif c["confidence"] == "low":
                conf = round(max(0.0, conf - 0.1), 2)
            groups.append((e, kind, c, conf, m))
            if conf >= GROUP_AT and not e["attrs"].get("group"):  # (a printed group row's name stays: regroup)
                e["attrs"]["group"] = c["name"]
                have = {norm(x) for x in e["aliases"] + [e["name"]]}
                al = [a for a in _aliases(e["name"], m) if norm(a) not in have]
                e["children"] += [("alias", {}, a) for a in al]
                e["aliases"] += al
    for (kind, ckey), c in cats.items():
        if not c["name"]:
            continue
        hs, kids = c["fits"], []
        if hs is not None:
            missing = [h for h in hs if h not in names and h not in KIND_WORDS]
            if missing or not hs:
                kids.append(
                    (
                        "issue",
                        {"field": "fits", "code": "missing", "page": c["page"]},
                        f"no {' or '.join(missing)} category in the book" if missing else "the title names no host",
                    )
                )
        fits = [names.get(h) or h.capitalize() for h in hs if h in names or h in KIND_WORDS] if hs else []
        attrs = {
            "of": kind,
            "table": c["table"] or None,
            "section": c["section"] or None,
            "confidence": "low" if c["confidence"] == "low" else None,
            "why": c["why"],
            "fits": "; ".join(dict.fromkeys(fits)) or None,
            "accessories": "; ".join(dict.fromkeys(acc_of.get(ckey, []))) or None,
        }
        cat.add("categories", c["name"], c["page"], attrs, kids, "", cid=f"{kind}.{slug(c['name']) or 'none'}")
    return verdicts, groups
