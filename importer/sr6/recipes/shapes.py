"""Block shapes the SR6 core-line books (Deadly Arts, Hack & Slash, Street Wyrd) print past the core rulebook's, as
regroup hands them over: a stat box listing several items one a row (a name wrapped onto a second row, a second band
of columns under the first), a box under the heading it describes, an item's stat band printed as its own little
table. Pure functions over regroup's blocks; the recipes map what comes out with crb.extract. Nothing is guessed: a
box that doesn't read stays where it was (a rule's table)."""
import re
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.regroup import keys, norm

# a box's first column naming its rows (`NAME`, `CASE TYPE`, `DIGITAL WEAPON CODEMODS`, `IC`, …)
NAME_COL = re.compile(r"(?:^|\s)(?:NAME|ITEM|GEAR|APP|MODS?|MODIFICATIONS?|COMPONENT|TAP|ABUSE|HACKS|CODEMODS?|IC|"
                      r"LIBRARY|CASE TYPE|FOCUS|FOCI|PREPARATION|DRUG|TOOL)$")
# headers printed in short or run together -> the core rulebook's (a tuple: two headers, the value split at its last space)
RENAME = {"SPD INT": "SPEED INTERVAL", "SPD INTERVAL": "SPEED INTERVAL", "TOP SPD": "TOP SPEED", "SEAT": "SEATS",
          "ACC": "ACCEL", "BOD": "BODY", "ARM": "ARMOR", "PIL": "PILOT", "SENS": "SENSOR", "AVAILABILITY": "AVAIL",
          "AVAIL.": "AVAIL", "MODE": "MODES", "CAP": "CAPACITY", "ATTACK": "ATTACK RATINGS", "ATTR": "ATTRIBUTE ARRAY",
          "PROGRAM": "PROGRAMS", "AMMOAVAIL": ("AMMO", "AVAIL"), "RATINGSAMMOAVAIL": ("AMMO", "AVAIL"),
          "SPD INT TOP SPD": ("SPEED INTERVAL", "TOP SPEED")}
PRICE = {"AVAIL", "COST"}
VEHICLE = {"HANDLING", "HAND", "ACCEL", "SPEED INTERVAL", "TOP SPEED"}
WEAPON = {"DV", "ATTACK RATINGS", "ATTACK RATING", "AR", "MODES"}
DEVICE = {"DATA PROCESSING", "FIREWALL", "ATTRIBUTES (D/F)", "ATTRIBUTE ARRAY", "DEVICE RATING", "ACTIVE PROGRAM SLOTS",
          "PROGRAMS"}


def words(name):
    return {w[:-1] if w.endswith("s") and len(w) > 3 else w for w in norm(name).split()}


def cells(d):
    """A printed row with its headers as the core rulebook names them (footnote marks gone, run-together ones split)."""
    out = {}
    for h, v in d.items():
        h = " ".join(h.rstrip("*†").split())
        m = RENAME.get(h.upper(), h)
        if isinstance(m, tuple):
            a, _, b = v.rpartition(" ")
            out[m[0]], out[m[1]] = (a, b) if a else (v, "")
        else:
            out[m] = v
    if "DR" in out and out.keys() & {"ATTRIBUTE ARRAY", "PROGRAMS"}:  # a device's rating (`NAME | DR | ATTR | PROGRAM`)
        out = {("DEVICE RATING" if h == "DR" else h): v for h, v in out.items()}
    return out


def _filled(d):
    return sum(1 for v in list(d.values())[1:] if v.strip())


def _join(a, b):
    """Two halves of a wrapped row, cell by cell."""
    return {h: " ".join(x for x in (a.get(h, ""), b.get(h, "")) if x.strip()) for h in dict.fromkeys([*a, *b])}


def name_col(rs):
    """The first column when it names the rows (TYPE too when several rows of one header give distinct types)."""
    first = next(iter(rs[0]), "") if rs else ""
    if NAME_COL.search(first.upper()):
        return first
    same = [r[first] for r in rs if next(iter(r), "") == first]
    return first if first.upper() in ("TYPE", "SIZE", "CLASS") and len(same) > 1 and len(set(same)) == len(same) else None


def rows(stats, known=frozenset()):
    """A box's printed rows (one dict each, every band in order) -> [cells], one per item, or None when they don't
    read as items (unnamed rows of one header: a rule's table). A row naming an item starts one; a band without the
    name column continues the item above it (`ARMOR | PILOT …` under `NAME | HAND …`). A named row with at most one
    other cell beside full rows is a name wrapped onto two rows (`Ruhrmetall` over `SF-10 …`): it joins the row whose
    joined name is a heading's (`known`: norm keys), else the row below when one of its cells breaks off (`50(c) or`),
    else the row above. A row named in parentheses or lower case (`(when link fired)`) is a variant of the one above."""
    rs = [cells(s) for s in stats]
    col = name_col(rs)
    named = lambda r: col is not None and next(iter(r), "") == col and bool(r[col].strip())
    out, i = [], 0
    while i < len(rs):
        r = rs[i]
        if not named(r):
            if out and list(out[-1])[:len(r)] == list(r) and not named(out[-1]):
                return None  # unnamed rows of one header
            if out:
                out[-1] = {**out[-1], **{h: v for h, v in r.items() if h not in out[-1] or not out[-1][h]}}
            else:
                out.append(r)
            i += 1
            continue
        nxt = rs[i + 1] if i + 1 < len(rs) and named(rs[i + 1]) and list(rs[i + 1]) == list(r) else None
        if len(r) > 3 and _filled(r) <= 1:
            name = r[col]
            below = nxt is not None and _filled(nxt) > 1
            above = bool(out) and list(out[-1]) == list(r) and _filled(out[-1]) > 1 and not out[-1].get("_wrapped")
            down = below and (norm(f"{name} {nxt[col]}") in known or not (above and norm(f"{out[-1][col]} {name}") in known)
                              and (any(v.rstrip().endswith((" or", "-", ",")) for v in r.values()) or not above))
            if down:
                out.append({**_join(r, nxt), "_wrapped": True})
                i += 2
                continue
            if above:
                out[-1] = {**_join(out[-1], r), "_wrapped": True}
                i += 1
                continue
        if out and named(out[-1]) and re.match(r"\(|[a-z]", r[col].strip()):
            r = {**r, col: f"{out[-1][col]} {r[col].strip()}"}
        out.append(r)
        i += 1
    return [{h: v for h, v in r.items() if h != "_wrapped"} for r in out]


def kind_of(head):
    """The catalog kind of an item by its columns (upper case)."""
    if head & VEHICLE:
        return "vehicles"
    if head & {"ESSENCE", "ESS"}:
        return "augmentations"  # an implant weapon's price (its attack is a weapon in the core rulebook)
    if head & WEAPON:
        return "weapons"
    if head & DEVICE:
        return "electronics"
    if head & {"DEFENSE RATING", "DEFENSE", "DR"}:
        return "armor"
    return "gear"


def _desc(b):
    return b.type in ("item", "section") and b.level >= 3 and not b.stats and b.row is None and b.text.strip()


def _match(name, d):
    return bool(set(keys(name)) & set(keys(d))) or len(words(name)) > 1 and words(name) <= words(d)


def _row_block(b, name, c, label, text=None, labels=None, col=None):
    if col is not None:
        c = {h: v for h, v in c.items() if h != col}
    row = {"ITEM": name, **c}
    return replace(b, type="item", name=name, row=row, header=list(row), stats=[], label=label,
                   text=b.text if text is None else text, labels=b.labels if labels is None else labels)


def priced(c):
    return bool({h.upper() for h in c} & (PRICE | VEHICLE))


def boxes(bs):
    """Stat boxes -> item blocks with the box as their row (crb.extract's ROW_KINDS read a row): a box listing several
    items one a row becomes one block a row, each with the description of the heading of its name (its words all in
    that heading, nearest first) when there is one, that heading then going; a box of one item (its bands joined)
    takes the heading right before it when the box's title is that heading's or its words all are in it (`Shadowdancer`
    under `Ares Model 301 "Shadowdancer" CVW`), else it is named by its title. Distinct TYPE rows (`Light`, `Heavy`) are
    variants: `<title> (<type>)`. Boxes without a price (spells, beings, bands of rules) stay as they are; a catalog
    row regroup paired keeps its pairing, its headers named as the core rulebook's."""
    bs = list(bs)
    known = {k for b in bs if b.type in ("item", "section") for k in keys(b.name)}
    gone, out = set(), []
    for i, b in enumerate(bs):
        if b.row is not None:
            first = next(iter(b.row), "")
            row = {first: b.row[first], **cells({h: v for h, v in b.row.items() if h != first})}
            out.append(replace(b, row=row, header=list(row)))
            continue
        items = rows(b.stats, known) if b.stats else None
        if not items or not all(priced(c) for c in items):
            out.append(b)
            continue
        col = name_col([cells(s) for s in b.stats])
        if col is not None and col.upper() in ("TYPE", "SIZE", "CLASS"):
            out += [_row_block(b, f"{b.name} ({c[col]})", c, b.name, col=col) for c in items]
            continue
        if col is None:
            prev = len(out) - 1
            p = out[prev] if out else None
            if p is not None and _desc(p) and p.chapter == b.chapter and b.type == "item" and (
                    norm(p.name) == norm(b.name) or words(b.name) <= words(p.name)):
                text = "\n\n".join(t for t in (p.text.strip(), b.text.strip()) if t)
                out[prev] = _row_block(b, p.name, items[0], b.name, text, {**p.labels, **b.labels})
                continue
            out.append(_row_block(b, b.name, items[0], b.label or b.name))
            continue
        for c in items:
            name = " ".join(c[col].split())
            near = sorted((j for j, d in enumerate(bs) if j not in gone and d.chapter == b.chapter and _desc(d)
                           and _match(name, d.name)), key=lambda j: (j > i, abs(j - i)))
            if near:
                gone.add(near[0])
            d = bs[near[0]] if near else None
            out.append(_row_block(b, name, c, b.name, d.text if d else "", d.labels if d else {}, col))
    taken = {id(bs[j]) for j in gone}
    return [b for b in out if id(b) not in taken]


def category(b, parent2=""):
    """A row item's category: its table's or box's title, else its section, else its level-2 section, the first that
    isn't the item's own name (a box titled with its vehicle's name); None when all are."""
    own = words(b.name)
    for c in (b.label, b.section, parent2):
        if c and not (words(c) <= own or own <= words(c)):
            return slug(c)
    return None


_MA_BREAK = re.compile(r"-\*\*\n\*\*")  # a bold label hyphenated across two lines: `**Catego-**` + `**ry:**`
# (`Techniques:` alone at a line's start: its `Signature` lost in print)
_MA = re.compile(r"(?:^|\*\*)(Categor(?:y|ies)|(?:Signature )?Techniques?|Similar Styles)(?:\*\*)?\s*:\s*(?:\*\*)?\s*", re.M)


def martial(b):
    """A martial art style's or technique's closing lines (`Similar Styles: …`, `Category: …`, `Signature Technique: …`,
    plain or bold, in a line of their own or after the last sentence, wrapped at times) as its labels, out of its text;
    a table after them stays text. A technique's category is what comes before a `;` (`Weapon; may only be used with
    polearms`): the rest is its Restriction label. Blocks without such lines come back unchanged."""
    text = _MA_BREAK.sub("", b.text)
    m = _MA.search(text)
    if not m:
        return b
    head, tail = text[:m.start()].rstrip(), text[m.start():]
    lines = tail.splitlines()
    cut = next((i for i, ln in enumerate(lines) if ln.startswith(("|", "#"))), len(lines))
    tail, rest = "\n".join(lines[:cut]), "\n".join(lines[cut:])
    parts = _MA.split(tail)  # ['', label, value, label, value, …]
    labels = {}
    for k, v in zip(parts[1::2], parts[2::2]):
        k = {"Categories": "Category", "Technique": "Signature Technique", "Techniques": "Signature Technique",
             "Signature Techniques": "Signature Technique"}.get(k.title(), k.title())
        v = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(v.replace("**", "").split()))  # `Weap-` + `on`
        labels[k] = v.rstrip(" ,.")
    if ";" in labels.get("Category", ""):
        labels["Category"], r = (x.strip() for x in labels["Category"].split(";", 1))
        labels["Restriction"] = r[:1].upper() + r[1:]
    return replace(b, labels={**b.labels, **labels}, text="\n".join(t for t in (head, rest) if t.strip()))


def martial_kind(b):
    """("martialarts" | "martialtechniques", None) for a martial art section's item with those lines, else None."""
    if b.type != "item" or "martial art" not in norm(b.section):
        return None
    if "Signature Technique" in b.labels:
        return "martialarts", None
    return ("martialtechniques", None) if "Category" in b.labels else None
