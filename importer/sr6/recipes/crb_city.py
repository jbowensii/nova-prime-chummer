"""The core rulebook's City Editions (Seattle, Berlin, Hong Kong): each prints the 2019 book's pages, then a city chapter
after the reference tables. The CRB recipe reads the book (crb.py); this reads the city chapter as a source of its own
(CRB-SEA, CRB-BER, CRB-HK; crb.extra -> Result.extra): its qualities, contacts (each with its NPC), gear, vehicles and
weapons, and its rule sections (the plot hooks, the city's reputation and heat modifiers). The fiction and the city
overview are left out (CITIES: the pages read). Layout notes in crb.md."""
import re
from dataclasses import replace
from types import SimpleNamespace

from importer.recipes.dhsa import slug
from importer.sr6 import regroup
from importer.sr6.recipes import crb, ts
from importer.sr6.regroup import blocks, norm

# fingerprint -> (source id, name, chapter, first PDF page read, first PDF page left out)
CITIES = {
    "d44bc23010d8f0c6a9b67a8f9646e293a35240d467c544dbcfe1cfe294c7fec5":
        ("CRB-SEA", "Shadowrun, Sixth World Core Rulebook: City Edition Seattle", "SEATTLE", 328, 342),
    "6ebaedbde953f3bebe3c51ceab0dd265f924d0c1dc1a7c815d26b7471a124c6f":
        ("CRB-BER", "Shadowrun, Sixth World Core Rulebook: City Edition Berlin", "BERLIN", 331, 346),
    "7c3a1cfdcd80f9a5ef6a7f4b3fb115b4a699e1fd48810683b33af2a06ccb05a6":
        ("CRB-HK", "Shadowrun, Sixth World Core Rulebook: City Edition Hong Kong", "HONG KONG", 330, 340),
}
NAME_HEADERS = frozenset({"ITEM", "VEHICLE", "TYPE"})
# printed header -> the core rulebook's (crb.HEADERS)
RENAME = {"HANDL": "HANDLING", "SPD INT": "SPEED INTERVAL", "TOP SPD": "TOP SPEED", "INTERVAL": "SPEED INTERVAL",
          "ARM": "ARMOR", "SENS": "SENSOR", "SEAT": "SEATS", "ACCEL.": "ACCEL", "AVAIL.": "AVAIL", "CAP": "CAPACITY",
          "AVAIL (BERLIN)": "AVAIL", "AVAIL. (BERLIN)": "AVAIL"}
PROSE = {"SIZE"}  # (and ARMOR in a table with no handling: a tent's)
_PRICE = {"AVAIL", "COST", "AVAIL.", "AVAIL (BERLIN)", "AVAIL. (BERLIN)"}
_PERSON = re.compile(r"(?:male|female|non-binary)\b", re.I)
# `**Sorokin Predator I** [Heavy Pistol, DV 3P, SA, 10/9/8/—/— , 15(c), Avail: 2(L), Cost: 200¥]`
_WEAPON = re.compile(r"\*\*([^*\[]+?)\*\*\s*\[([^\[\]]+?),\s*DV\s*([^,]+),\s*([^,]+),\s*([^,]+?)\s*,\s*([^,]+),"
                     r"\s*Avail:\s*([^,]+),\s*Cost:\s*([^\]]+)\]")


def extra(md, sha):
    """The edition's city chapter as its own source: [Result], or [] for a printing with none."""
    if sha not in CITIES:
        return []
    sid, name, chapter, first, end = CITIES[sha]
    pages = re.split(r"(?=<!-- page \d+ -->)", md)
    keep = [p for p in pages if (m := re.match(r"<!-- page (\d+) -->", p)) and first <= int(m.group(1)) < end]
    text, report = regroup.regroup(f"# {chapter}\n" + "".join(keep), {}, name_headers=NAME_HEADERS)
    book = SimpleNamespace(ID=sid, NAME=name, PUBLISHER=crb.PUBLISHER, CANON=True, BOOK=name, PAGE_OFFSET=crb.PAGE_OFFSET,
                           SECTIONS=[], SECTION_KINDS={"qualities"}, LABEL_SECTIONS={}, RULE_CHAPTERS=(norm(chapter),),
                           ATTRIBUTE_CHAPTERS=(), CATALOG_CHAPTERS=(), fix=fix, kind=kind)
    rows = []
    res = crb.extract(_prep(list(blocks(text)), rows), book=book)
    for r in report:  # regroup reports PDF pages; the import report prints the book's
        if isinstance(r.get("page"), int):
            r["page"] = max(1, r["page"] - crb.PAGE_OFFSET)
    res.report = [{**r, "source": sid} for r in report + res.report + rows]
    return [res]


def _bands(b):
    """How many attribute bands the block prints (more than one: two beings' boxes printed into each other)."""
    return sum("B" in {h.upper() for h in s} for s in b.stats) + len(ts.band(b.text)) + \
        sum("B" in {h.upper() for h in t[0]} for t in crb._tables(b.text))


def _contact(b, p):
    """The block with its band as a contact block (crb's contact: a contact and its NPC), named by its person's section
    `p` (its description and labels, its metatype line)."""
    b = crb._text_stats(b, crb.HEADERS["npcs"])
    return replace(b, type="item", level=4, name=p.name, section="contact", labels={"Metatype": p.tags, **p.labels, **b.labels},
                   stats=ts.band(b.text) + b.stats, text="\n\n".join(t for t in ((p.text if p is not b else ""), b.text) if t))


def _prep(bs, report):
    """The chapter's blocks as the core rulebook's reading needs them: a person (a section with a `Female Elf` line)
    and the box with their band -> one contact block, named by the section; a box's stat table -> its row (a table
    whose first column names several items: one row each); a vehicle table printed in a section's text -> a row named
    by the section (unless a box of that name has its own: then it's another's, reported); the weapons printed as
    bold names with bracketed stats -> rows. A person or a titled box whose values don't read is reported."""
    out, persons, sections, used, empty = [], {}, [], set(), []
    boxed = {norm(b.name) for b in bs if b.type == "item" and (b.stats or crb._tables(b.text))}
    for i, b in enumerate(bs):
        nxt = bs[i + 1] if i + 1 < len(bs) else None
        page = max(1, b.page - crb.PAGE_OFFSET)
        if b.type == "section":
            if b.level == 3 and (_PERSON.match(b.tags) or nxt is not None and nxt.type == "item" and _PERSON.match(nxt.name)):
                persons[ts._squash(b.name)] = (b, page)
                if _bands(b) == 1:  # the band printed in the person's own text
                    used.add(id(b))
                    out.append(_contact(b, b))
                    continue
            sections = [b] if b.level <= 2 else [s for s in sections if s.level < 3] + [b]
        if b.type == "item" and _PERSON.fullmatch(b.name.strip()) and out and out[-1].type == "section":
            out[-1] = replace(out[-1], tags=b.name, text="\n\n".join(t for t in (out[-1].text, b.text) if t))
            persons[ts._squash(out[-1].name)] = (out[-1], persons.get(ts._squash(out[-1].name), (None, page))[1])
            continue  # a person's metatype line read as a heading
        if b.type == "item" and b.row is None and _bands(b):
            p = next((p for k, (p, _) in persons.items() if ts._describes(p, b.name)), None)
            if _bands(b) > 1:
                continue  # two beings' boxes printed into each other: their persons are reported
            if p is not None:
                used.add(id(p))
                b = _contact(b, p)
            out.append(b)
            continue
        if b.row is None and (ws := _WEAPON.findall(" ".join(b.text.split()))):
            for n, typ, dv, modes, ar, ammo, av, cost in ws:
                row = {"WEAPON": n.strip(), "TYPE": typ, "DV": dv, "MODES": modes, "ATTACK RATINGS": ar.replace(" ", ""),
                       "AMMO": ammo, "AVAIL": av, "COST": cost}
                out.append(replace(b, type="item", name=row["WEAPON"], header=list(row), row=row, stats=[], labels={},
                                   text="", label=slug(typ)))
            out.append(replace(b, text=_WEAPON.sub("", b.text)))
            continue
        if b.type == "section" and (lines := re.findall(r"^•?\s*(Cost|Bonus):\s*(.+)$", b.text, re.M)):
            b = replace(b, labels={**dict(lines), **b.labels})  # a quality's `• Cost: 5 Karma` printed plain
        tabs = [(list(s), [list(s.values())]) for s in b.stats] if b.row is None and b.type == "item" else []
        tabs += [t for t in crb._tables(b.text) if t[0][:1] and t[0][0].upper() not in NAME_HEADERS]  # (those are rows)
        tabs = [t for t in tabs if _PRICE & {h.upper() for h in t[0]}]
        if tabs:
            text = "\n".join(ln for ln in b.text.splitlines() if not ln.startswith("|"))
            if b.type == "section" and norm(b.name) in boxed:
                report.append({"kind": "missing-value", "file": "vehicles.xml", "name": f"a box in {b.name}",
                               "field": "name", "page": page})  # another's values, printed in this section
                out.append(replace(b, text=text))
                continue
            desc = None if b.type == "section" else next((d for d in reversed(sections) if ts._describes(d, b.name)), None)
            if desc is not None:
                used.add(id(desc))
                text = "\n\n".join(t for t in (desc.text, text) if t)
            names, own = [], desc.name if desc is not None and ts._squash(desc.name) == ts._squash(b.name) else b.name
            for h, rows in tabs:
                vehicle = bool({"HANDL", "HANDLING"} & {x.upper() for x in h})
                for r in rows:
                    first = h[0].upper() in ("TYPE", "ITEM")
                    n = r[0] if first else own[:1].upper() + own[1:]
                    names.append(n)  # several tables under one title (its tables' own titles print as captions)
                    n = f"{n} ({names.count(n)})" if names.count(n) > 1 else n
                    row = {"ITEM": n, **dict(zip(h[1:], r[1:]))} if first else {"ITEM": n, **dict(zip(h, r))}
                    # the category: a vehicle's class tag (`(Medium Drone)`), else the item's description heading
                    cat = slug((desc or b).tags.strip("()")) if vehicle or b.type == "section" else \
                        slug(desc.name if desc is not None else b.name)
                    out.append(replace(b, type="item", level=max(b.level, 4), name=n, header=list(row), row=row, stats=[],
                                       text=text, label=cat))
            continue
        if b.type == "item" and b.level == 5 and not b.text.strip() and not b.stats and not b.labels \
                and ts._squash(b.name) not in persons:
            empty.append((b, page))  # a box title: reported unless an entry of its name is read
            continue
        out.append(b)
    read = {norm(b.name) for b in out if b.row is not None or b.section == "contact"}
    for b, page in empty:
        if norm(b.name) not in read:
            report.append({"kind": "missing-value", "file": "vehicles.xml", "name": b.name, "field": "stats", "page": page})
    for k, (p, page) in persons.items():
        if id(p) not in used:
            report.append({"kind": "missing-value", "file": "contacts.xml", "name": p.name, "field": "stats", "page": page})
    return [b for b in out if id(b) not in used or b.type != "section"]


def fix(b, parent2):
    """Printed headers renamed to the core rulebook's (a column with no attribute to the text); a price's thousands
    printed with dots (`32.000¥`, Berlin's) without them."""
    if b.row is None:
        return b
    labels, row = dict(b.labels), {}
    prose = PROSE | ({"ARMOR"} if not {"HANDL", "HANDLING"} & {h.upper() for h in b.row} else set())
    for i, (h, v) in enumerate(b.row.items()):
        if i and h.upper() in prose:
            if v and v != "—":
                labels.setdefault(h.capitalize(), v)
        else:
            if h.upper() == "COST":
                v = re.sub(r"(?<=\d)\.(?=\d{3}(?:\D|$))", "", v)
            row[RENAME.get(h.upper(), h) if i else h] = v
    return replace(b, row=row, header=list(row), labels=labels)


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None): a rule section."""
    labels = {k.lower(): v for k, v in b.labels.items()}
    if b.row is None and b.section == "contact":
        return "contacts", None
    if b.row is None and b.level in (3, 4) and ("cost" in labels or "bonus" in labels) and not b.stats:
        return "qualities", "negative" if "bonus" in labels else "positive"
    if b.row is None or not b.header:
        return None, None
    head = {h.upper() for h in b.header}
    if "HANDLING" in head:
        return "vehicles", slug(b.label) or "vehicles"
    if b.header[0].upper() == "WEAPON" or "ATTACK RATING" in head or "ATTACK RATINGS" in head:
        return "weapons", slug(b.label) or "weapons"
    if "ESSENCE" in head:
        return "augmentations", slug(b.label) or "augmentations"
    if {"DR", "DEFENSE RATING"} & head:
        return "armor", slug(b.label) or "armor"
    return "gear", slug(b.label) or "gear"
