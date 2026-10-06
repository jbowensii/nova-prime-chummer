"""Block shapes the SR6 core-line books (Deadly Arts, Hack & Slash, Street Wyrd) print past the core rulebook's, as
regroup hands them over: a stat box listing several items one a row (a name wrapped onto a second row, a second band
of columns under the first), a box under the heading it describes, an item's stat band printed as its own little
table. Pure functions over regroup's blocks; the recipes map what comes out with crb.extract. Nothing is guessed: a
box that doesn't read stays where it was (a rule's table)."""
import re
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.regroup import full_name, keys, norm, other_name

# a box's first column naming its rows (`NAME`, `CASE TYPE`, `DIGITAL WEAPON CODEMODS`, `IC`, …)
NAME_COL = re.compile(r"(?:^|\s)(?:NAME|ITEM|GEAR|APP|MODS?|MODIFICATIONS?|COMPONENT|TAP|ABUSE|HACKS|CODEMODS?|IC|"
                      r"LIBRARY|CASE TYPE|FOCUS|FOCI|PREPARATION|DRUG|TOOL|WEAPON)$")
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
    else the row above. A row named in parentheses or lower case (`(when link fired)`) is a variant of the one above; a model code
    (`m60`) is not."""
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
        if out and named(out[-1]) and re.match(r"\(|[a-z]", r[col].strip()) and not re.match(r"[a-z]+-?\d", r[col].strip()):
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
    """A box row's name and a description heading name the same item: a shared key, the row's words all in the
    heading's, or a one-word row name (a model name, 5 letters or more) the heading prints after its maker (`Firebolt`
    under `Ares Firebolt`)."""
    nw, dw = norm(name).split(), norm(d).split()
    return bool(set(keys(name)) & set(keys(d))) or len(words(name)) > 1 and words(name) <= words(d) or (
        len(nw) == 1 and len(nw[0]) >= 5 and len(dw) == 2 and dw[1] == nw[0] and name[:1].isupper())


def _row_block(b, name, c, label, text=None, labels=None, col=None, aliases=None):
    if col is not None:
        c = {h: v for h, v in c.items() if h != col}
    row = {"ITEM": name, **c}
    return replace(b, type="item", name=name, row=row, header=list(row), stats=[], label=label,
                   text=b.text if text is None else text, labels=b.labels if labels is None else labels,
                   aliases=list(b.aliases) if aliases is None else aliases)


def _alias(name, head):
    """The heading's name as an alias when the row prints the item shorter (`ZX-48` under `Bloop ZX-48 Thunderer`)."""
    return [head] if head and norm(head) != norm(name) and other_name(name, head) else []


def priced(c):
    return bool({h.upper() for h in c} & (PRICE | VEHICLE))


# the words a maker's name ends with (`Cougar Weapons`, `Ares Arms`): the game's corporate vocabulary
CORPORATE = {"weapons", "arms", "armaments", "firearms", "munitions", "ordnance", "industries", "industrial", "systems",
             "technologies", "technology", "tech", "defense", "defence", "corporation", "corp", "inc", "ltd",
             "manufacturing", "motors", "dynamics", "electronics", "enterprises", "international", "labs", "aerospace"}


def maker_split(title):
    """(maker, product) of a title that prints a maker before its product (`Cougar Weapons Armsman Collapsible
    Polearm`: Cougar Weapons, Armsman Collapsible Polearm): the words up to a corporate word among the first three, a
    product of two words or more after them; else ("", title)."""
    ws = title.split()
    for k in range(1, min(3, len(ws) - 2) + 1):
        if ws[k - 1].lower().strip(".,") in CORPORATE and all(w[:1].isupper() for w in ws[:k]):
            return " ".join(ws[:k]), " ".join(ws[k:])
    return "", title


def configurations(b, items, col, described, lower=frozenset()):
    """A box whose rows are one product's configurations (`Knife`, `One-hand`, `Spear`, `Pike` under `Cougar Weapons
    Armsman Collapsible Polearm`): rows named by short generic words (two at most, no digit, words the book prints in
    lower case: `lower`; a model's name is none, `Estolica`; no description heading of their own) under a title of three
    words or more. Each row is its own item with its own printed stats, named as printed; the box's title is their
    product (and maker), its description, notes and wireless bonus theirs. None when the box isn't one."""
    names = [" ".join(c[col].split()) for c in items]
    if len(b.name.split()) < 3 or any(len(n.split()) > 2 or re.search(r"\d|[a-z][A-Z]", n) or not n[:1].isupper()
                                      or not all(w.lower() in lower for w in re.findall(r"[A-Za-z]+", n)) for n in names):
        return None
    if any(described(n, peek=True)[2] for n in names):
        return None  # a row with a description of its own is an item of its own
    text, labels, head = described(b.name)
    maker, product = maker_split(b.name)
    body = "\n\n".join(t for t in (text.strip(), b.text.strip()) if t)
    return [replace(_row_block(b, n, c, b.name, body, {**labels, **b.labels}, col), product=product, maker=maker)
            for n, c in zip(names, items)]


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
    lower = {w for b in bs for w in re.findall(r"(?<![A-Za-z])[a-z]+", b.text or "")}  # the words the prose prints in lower case
    said = {(b.chapter, norm(k)): v for b in bs for k, v in b.labels.items() if v}  # `**Code Buddy:** …` lines
    gone, out = set(), []

    def described(i, b, name, peek=False):
        """(text, labels, heading) of the description of `name`: the nearest heading of its name with text and no box
        of its own (it then goes, unless only peeking), else a labelled line of its name in the chapter (heading "")."""
        near = sorted((j for j, d in enumerate(bs) if j not in gone and d.chapter == b.chapter and _desc(d)
                       and _match(name, d.name)), key=lambda j: (j > i, abs(j - i)))
        if near:
            if not peek:
                gone.add(near[0])
            return bs[near[0]].text, bs[near[0]].labels, bs[near[0]].name
        return said.get((b.chapter, norm(name)), ""), {}, ""

    for i, b in enumerate(bs):
        if b.row is not None:
            first = next(iter(b.row), "")
            row = {first: b.row[first], **cells({h: v for h, v in b.row.items() if h != first})}
            b = replace(b, row=row, header=list(row))
            if not b.text.strip():
                text, labels, head = described(i, b, b.name)
                full = full_name(b.name, head)
                b = replace(b, text=text, labels={**labels, **b.labels}, name=head if full else b.name,  # its full name
                            aliases=b.aliases or ([] if full else _alias(b.name, head)))
            out.append(b)
            # a stat box printed under the row's table, its own named rows of the same columns (a weapon table
            # stacked over two more): each row an item
            more = rows(b.stats, known) if b.stats else None
            col = name_col([cells(s) for s in b.stats]) if more else None
            if more and col is not None and col.upper() not in ("TYPE", "SIZE", "CLASS") and all(priced(c) for c in more):
                out[-1] = replace(b, stats=[])
                for c in more:
                    name = " ".join(c[col].split())
                    text, labels, head = described(i, b, name)
                    full = full_name(name, head)
                    out.append(_row_block(b, head if full else name, c, b.label, text, labels, col,
                                          [] if full else _alias(name, head)))
            continue
        items = rows(b.stats, known) if b.stats else None
        if not items or not all(priced(c) for c in items):
            out.append(b)
            continue
        col = name_col([cells(s) for s in b.stats])
        if col is not None and col.upper() not in ("TYPE", "SIZE", "CLASS") and len(items) > 1 and (cfg := configurations(
                b, items, col, lambda n, peek=False: described(i, b, n, peek), lower)):
            out += cfg
            continue
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
            text, labels, head = described(i, b, name)
            full = full_name(name, head)  # (a maker in front: the heading's full name)
            al = [] if full else _alias(name, head)
            if not al and not full and len(items) == 1 and words(name) < words(b.name):  # a box of one: its title heads it
                al = [b.name]
            out.append(_row_block(b, head if full else name, c, b.name, text, labels, col, al))
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


# a stat band printed as text: its bold headers on one line (`**B A R S W L I C EDG ESS**`, `**DR I/ID AC CM MOVE**`)
_TEXT_BAND = re.compile(r"^\*\*((?:[A-Z][A-Z/]{0,4} ){3,}[A-Z][A-Z/]{0,4})\*\*\n(.+)$", re.M)


def text_bands(text):
    """A being's stat bands printed as text lines (the cards' and the athletes' books), the values on the line under
    the bold headers -> (header -> value over all its bands, the text without them). A value's `(6)` printed apart
    (`4 (6)`) or two run together (`2(+4)3(7)`) are read as printed; a band whose values don't line up stays text."""
    row, cut = {}, []
    for m in _TEXT_BAND.finditer(text):
        heads = m.group(1).split()
        vals = [v for t in re.sub(r"\s+\(", "(", m.group(2).strip()).split() for v in re.findall(r"[^()\s]+(?:\([^)]*\))?", t)]
        if len(heads) == len(vals):
            row.update(zip(heads, vals))
            cut.append((m.start(), m.end() + 1))  # with its line break
    for a, b in reversed(cut):
        text = text[:a] + text[b:]
    return row, text.strip()


# a vehicle's stat columns as the books print them (spelled out, cut short, on two lines) -> the core rulebook's
VEHICLE_COLUMNS = {"HAND": "HANDLING", "HANDLING": "HANDLING", "HANDL": "HANDLING", "ACC": "ACCEL", "ACCEL": "ACCEL",
                   "ACCELERATION": "ACCEL", "SPD INT": "SPEED INTERVAL", "SPEED INT": "SPEED INTERVAL",
                   "SPEED INTERVAL": "SPEED INTERVAL", "TOP SPD": "TOP SPEED", "SPEED TOP": "TOP SPEED",
                   "TOP SPEED": "TOP SPEED", "BOD": "BODY", "BODY": "BODY", "ARM": "ARMOR", "ARMOR": "ARMOR",
                   "PIL": "PILOT", "PILOT": "PILOT", "SENS": "SENSOR", "SENSE": "SENSOR", "SENSOR": "SENSOR",
                   "SEAT": "SEATS", "SEATS": "SEATS", "AVAIL": "AVAIL", "AVAILABILITY": "AVAIL", "COST": "COST"}
_SQUASHED = {k.replace(" ", ""): v for k, v in VEHICLE_COLUMNS.items()}
_HEAD_LINE = re.compile(r"^\*\*([A-Z][A-Z .]+)\*\*\s*$")


def _columns(tokens):
    """A bold header line's tokens -> the core rulebook's column names, else None: each column a token or a few run
    together (`SPEED INT.`), two run into one token (`SEATAVAIL`), or a two-line header the converter interleaved
    (`S INP TD`, regroup.deinterleave)."""
    from importer.sr6.regroup import deinterleave
    out, i = [], 0
    while i < len(tokens):
        for k in (1, 2, 3, 4):
            s = "".join(tokens[i:i + k]).replace(".", "")
            if s in _SQUASHED:
                out.append(_SQUASHED[s])
                break
            if k == 1 and (two := next(((a, b) for a in _SQUASHED for b in _SQUASHED if a + b == s), None)):
                out += [_SQUASHED[two[0]], _SQUASHED[two[1]]]
                break
            if (d := deinterleave(" ".join(tokens[i:i + k]))) and d in VEHICLE_COLUMNS:
                out.append(VEHICLE_COLUMNS[d])
                break
        else:
            return None
        i += k
    return out


def vehicle_band(text):
    """A vehicle's stats printed in its text: a bold header line over a value line (`**HAND ACC BOD … SEATAVAIL COST**`
    / `2 5 2 1 …`), with a speed table printed before it (`SPD INT | TOP SPD`) when the line lacks those -> {core
    rulebook column: value}, else {} (the values must come one a column)."""
    lines = text.splitlines()
    for n, ln in enumerate(lines[:-1]):
        m = _HEAD_LINE.match(ln.strip())
        if not m or not (cols := _columns(m.group(1).split())):
            continue
        vals = [v for t in re.sub(r"\s+\(", "(", lines[n + 1].strip()).split() for v in [t]]
        if len(vals) != len(cols):
            continue
        out = dict(zip(cols, vals))
        before = "\n".join(lines[:n])
        for h, rows in reversed(_md_tables(before)):
            heads = [VEHICLE_COLUMNS.get(" ".join(x.upper().split())) for x in h]
            if rows and all(heads) and not set(heads) & set(out):
                out = {**dict(zip(heads, rows[0])), **out}
                break
        return out
    return {}


def _md_tables(text):
    out, ls, i = [], text.splitlines(), 0
    while i < len(ls):
        if ls[i].startswith("|") and i + 1 < len(ls) and re.match(r"\|(?:-+\|)+$", ls[i + 1]):
            h = [c.strip() for c in ls[i].strip()[1:-1].split("|")]
            rows, i = [], i + 2
            while i < len(ls) and ls[i].startswith("|"):
                rows.append([c.strip() for c in ls[i].strip()[1:-1].split("|")])
                i += 1
            out.append((h, rows))
        else:
            i += 1
    return out
