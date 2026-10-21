"""Shadowrun: Firing Squad (FS), the core combat rulebook -> the SR6 catalog: weapons (and weapon modifications and
accessories, as the core rulebook files them), ammunition (gear), armor (and armor modifications), tac-apps, the trauma
qualities, the security and gang NPCs, the martial art styles and techniques and the rule sections (edge actions,
maneuvers: no catalog kind of their own), ids unscoped (run scopes them as fs.<slug>), descriptions in the private
texts. Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (catalog.read); layout notes in
fs.md.

The book prints an item as a heading, its description and a stat box titled with its name (TYPE, DV, ... AVAIL, COST):
the box becomes the item's row here. A few headers set too close together print as one (`AMMOAVAIL`): they are split,
their value at its last space. A line or value that doesn't read is reported, never guessed."""

import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6 import catalog, shapes
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "FS", "Shadowrun: Firing Squad", "Catalyst Game Labs", True
BOOK = "Firing Squad"
SHA256 = ("f686d75dd97844c7280186c17aefc130fc6e2dcd89948274e92bf574c0698a80",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 152  # PDF page: the weapon and armor stats (the book's tables reprinted) start here (left out)
ALIASES = {}
NAME_HEADERS = frozenset()

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = {"qualities"}
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("weapons rack", "suit up", "honing your edge", "violent ends", "fighting forces")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("weapons rack", "suit up")
WEAPON_PARTS = ("weapon modifications", "melee weapon modifications", "weapon accessories")  # SUIT UP level-2 sections
ARMOR_MODS = "accessories and modifications"
# headers printed as one: header -> the headers it holds (the value splits at its last space), or its real name
MERGED = {
    "AMMOAVAIL": ("AMMO", "AVAIL"),
    "RATINGSAMMOAVAIL": ("AMMO", "AVAIL"),
    "ATTACK": "ATTACK RATINGS",
    "DV CLOSEDV": "DV CLOSE",
    "NEAR": "DV NEAR",
}
_OWN_ROWS = 6
_TAG, _UPTO = re.compile(r"\(([^()]+)\)"), re.compile(r",?\s*1\s+to\s+(\d+)\s*$")
_RATING = re.compile(r"professional rating\s*(\d+)", re.I)


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"firing\s+squad", hay, re.I) else 0.0


_NAME_COLUMNS = {
    "ITEM",
    "WEAPON",
    "GRENADES",
    "GEAR",
    "APP",
}  # a box's first column naming the item: the heading names it


def _unmerge(cells):
    out = {}
    for h, v in cells.items():
        h = h.rstrip("*")  # a footnote mark (`I/ID*`)
        m = MERGED.get(h.upper())
        if isinstance(m, tuple):
            a, _, b = v.rpartition(" ")
            out[m[0]], out[m[1]] = (a, b) if a else (v, "")
        else:
            out[m or h] = v
    return out


def fix(b, parent2):
    """Merged headers split; an item's stat box (with a price) as its row, named by its heading; an NPC's
    `(Professional Rating N)` tag as the core rulebook's section form."""
    stats = [_unmerge(s) for s in b.stats]
    row = _unmerge(b.row) if b.row is not None else None
    header = list(row) if row is not None else b.header
    if b.type == "item" and row is None and stats and any(h.upper() in ("AVAIL", "COST") for h in stats[0]):
        cells = {h: v for i, (h, v) in enumerate(stats[0].items()) if i or h.upper() not in _NAME_COLUMNS}
        row, stats = {"ITEM": b.name, **cells}, stats[1:]
        header = list(row)
        b = replace(b, label="")
    section = b.section
    if (m := _RATING.search(b.tags)) and norm(b.chapter) == "fighting forces":
        section = f"Professional Rating {m.group(1)}: {b.section}"
    return replace(b, header=header, row=row, stats=stats, section=section)


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    p2, labels = norm(parent2), {k.lower() for k in b.labels}
    if mk := shapes.martial_kind(b):
        return mk
    if b.type == "section":
        if "violent ends" in chapter and b.level == 3 and ({"bonus", "cost"} & labels):
            return "qualities", "negative" if "bonus" in labels else "positive"
        return None, None
    if b.row is None:
        return ("npcs", None) if "fighting forces" in chapter and b.stats else (None, None)
    if b.name.startswith(("*", "†")):
        return "skip", None  # a table's footnote printed as a row
    head = {h.upper() for h in b.header}
    if "weapons rack" in chapter:
        if "ammo" not in (p2, norm(b.section)):
            return "weapons", slug(b.section) or None
        # the rEVOlution Arms pages (their heading reads as a caption, so they sit in the Ammo section): its weapons
        return ("weapons", "revolution-arms") if head & {"TYPE", "MODE"} else ("gear", "ammo")
    if "suit up" in chapter:
        if p2 in WEAPON_PARTS:
            return "weapons", slug(p2)
        if p2 == ARMOR_MODS or not head & {"DR", "DEFENSE RATING"} and "CAPACITY" in head:
            return "armor", "armor-modifications"
        return "armor", slug(p2) if p2 else "armor"
    if "honing your edge" in chapter and "APP" in head:
        return "gear", "tac-apps"
    return None, None


_SEVERAL = re.compile(r",|\band\b")  # a heading naming several items


def _words(name):
    return {w[:-1] if w.endswith("s") else w for w in norm(name).split()}


def _boxes(bs):
    """A stat box regroup couldn't pair (its title shorter than the heading: `hk p50` under `HK P50 Tactical`, or the
    heading a section: SUIT UP's modifications) takes the description right before it when every word of its title
    is in that heading; it is named by the heading. A title still in lower case gets a capital. A SUIT UP heading
    whose stat table regroup left in its text (the table below the text: `CycleWear`) takes it as its box: a table of
    its own has no name column and a few rows (a list of the chapter's armor or modifications isn't one); so does a
    WEAPONS RACK heading whose few TYPE rows (`Paint Grenades`: Standard, Large) are its variants. A box under
    a heading naming several items (`Rhino, Behemoth, Juggernaut`, `Mod 1 and Mod 2`) is the one its title names."""
    out, several = [], None
    for b in bs:
        prev = out[-1] if out else None
        if (
            b.level in (3, 4)
            and not b.stats
            and b.row is None
            and norm(b.chapter) in ("suit up", "weapons rack")
            and (
                t := next(
                    (
                        (h, r)
                        for h, r in catalog.md_tables(b.text)
                        if 0 < len(r) <= _OWN_ROWS
                        and h[0].upper() not in _NAME_COLUMNS
                        and {"AVAIL", "COST"} & {x.upper() for x in h}
                        and (norm(b.chapter) == "suit up" or h[0].upper() == "TYPE")
                    ),
                    None,
                )
            )
        ):
            b = replace(
                b,
                type="item",
                stats=[
                    dict(zip(t[0], r))
                    for r in t[1]  # its stat table printed in its text
                    if not re.search(r"[*†‡]", r[0]) and len(r[0].split()) <= 4
                ],
            )  # (not a garbled note)
        if b.type == "item" and (m := _TAG.fullmatch(b.name)) and prev is not None and not prev.text.strip():
            n = _UPTO.search(m.group(1))  # `(Behavior, 1 to 6)`: a tag line read as a heading
            out[-1] = replace(
                prev,
                name=prev.name + (f" (1 to {n.group(1)})" if n else ""),
                tags=m.group(1)[: n.start()] if n else m.group(1),
                labels={**prev.labels, **b.labels},
                text=b.text,
                stats=b.stats,
                row=b.row,
                header=b.header,
            )
            continue
        if (
            b.type == "item"
            and b.label == b.name
            and b.row is None
            and b.stats
            and several is not None
            and several.chapter == b.chapter
            and _words(b.name) <= _words(several.name)
        ):
            # one of the items a heading names (`rhino` under `rEVOlution Arms Rhino, Behemoth, Juggernaut`): named
            # as the heading spells its words, the heading's description theirs
            spelt = {norm(w): w for w in several.name.replace(",", " ").split()}
            out.append(
                replace(
                    b,
                    name=" ".join(spelt.get(norm(w), w) for w in b.name.split()),
                    tags=several.tags or b.tags,
                    text="\n\n".join(t for t in (several.text.strip(), b.text.strip()) if t),
                )
            )
            continue
        if b.level in (3, 4) and not b.stats and b.row is None and b.text.strip():
            several = b if _SEVERAL.search(b.name) else None
        if (
            b.type == "item"
            and (
                b.label == b.name
                or not b.label
                and not b.text.strip()
                and norm(b.name) == norm(prev.name if prev else "")
            )
            and b.row is None
            and b.stats
            and prev is not None
            and prev.chapter == b.chapter
            and not prev.stats
            and prev.row is None
            and prev.text.strip()
            and _words(b.name) <= _words(prev.name)
        ):
            # (a box titled as its heading, `Securetech SkinShield` under `### Securetech SkinShield`: one item, the
            # heading's description its text, no rule section of its own)
            out[-1] = replace(
                b,
                name=prev.name,
                level=prev.level,
                tags=prev.tags or b.tags,
                labels={**prev.labels, **b.labels},
                text="\n\n".join(t for t in (prev.text.strip(), b.text.strip()) if t),
            )
            continue
        if b.type == "item" and b.name == b.name.lower():
            b = replace(b, name=b.name[:1].upper() + b.name[1:])
        out.append(b)
    return out


def _strays(bs):
    """A SUIT UP armor table (TYPE, DR …) printed in a later section's text (Vashon Island's lands in `Cumulative`)
    goes back to the section before it whose text names its first row (`Ace of Cups`), as that section's box. Its
    `Extras:` rows (the suit's built-in modifications: a row of their own, or the label after the last row) become
    the row above's EXTRAS cell."""
    bs = list(bs)
    for i, b in enumerate(bs):
        if norm(b.chapter) != "suit up":
            continue
        for h, rows in catalog.md_tables(b.text):
            if h[0].upper() != "TYPE" or "DR" not in {x.upper() for x in h} or not rows:
                continue
            names = lambda t: re.search(rf"\b{re.escape(norm(rows[0][0]))}\b", norm(t))  # noqa: E731
            if names(b.text.replace(catalog.md_table(h, rows), "")):
                continue  # its own text names its rows (`Rapid Transit … comes in Basic, Elite …`): its own table
            j = next(
                (
                    j
                    for j in range(i - 1, -1, -1)
                    if bs[j].chapter == b.chapter and bs[j].level == 3 and not bs[j].stats and names(bs[j].text)
                ),
                None,
            )
            if j is None:
                continue
            stats, labels = [], dict(b.labels)
            for r in rows:
                cells = [c for c in r if c]
                if cells and re.match(r"extras\s*:", cells[0], re.I) and stats:  # `Extras: None`, `Extras : | Holster`
                    stats[-1]["EXTRAS"] = " ".join([re.sub(r"(?i)^extras\s*:\s*", "", cells[0])] + cells[1:]).strip()
                elif r[0]:
                    stats.append(dict(zip(h, r)))
            md = catalog.md_table(h, rows)
            if stats and "EXTRAS" not in stats[-1] and (x := next((k for k in labels if k.lower() == "extras"), None)):
                stats[-1]["EXTRAS"] = labels.pop(x)
                tail = f"\n**{x}:** {stats[-1]['EXTRAS']}"
                md += tail if md + tail in b.text else ""
            bs[j] = replace(bs[j], type="item", stats=stats)
            bs[i] = b = replace(b, labels=labels, text=b.text.replace(md, "").strip())
    return bs


def _hosted(bs):
    """A box printing its item's own band (no name column: the Underbarrel Weapon Attachment Mount's `AVAIL COST`) over
    priced rows a name column names (`WEAPON`: Shotgun, Grenade Launcher …): the item keeps its band, each row is an
    item of its own, named as printed and grouped under the item it fits (`Underbarrel Weapon Attachment Mount:
    Shotgun`)."""
    first = lambda s: next(iter(s), "")  # noqa: E731
    priced = lambda s: any(re.search(r"\d", v) for h, v in s.items() if h.upper() in ("COST", "AVAIL"))  # noqa: E731
    out = []
    for b in bs:
        rest = b.stats[1:]
        if (
            b.type != "item"
            or b.row is not None
            or len(rest) < 2
            or first(b.stats[0]).upper() in _NAME_COLUMNS
            or not all(first(s).upper() in _NAME_COLUMNS - {"APP"} and s[first(s)] and priced(s) for s in rest)
        ):
            out.append(b)
            continue
        out.append(replace(b, stats=b.stats[:1]))
        for s in rest:
            n = s[first(s)]
            row = {"ITEM": n, **{h: v for h, v in s.items() if h != first(s)}}
            out.append(replace(b, name=n, row=row, header=list(row), stats=[], label=b.name, group=b.name))
    return out


def _lists(bs):
    """A box listing several items, one a row: by a name column (`GEAR`: the armor modifications, whose descriptions
    print earlier under headings of their own) or by distinct TYPEs (`Mil-spec Armor` Light, Medium, Heavy) -> one
    block per row, named by its cell (a TYPE after the box's name). An item's own heading block gives it its text
    and leaves the rules. A named row the chapter printed before as a row of its own (the MEMS section's own list,
    reprinted in the chapter's list of armor modifications) is that row's: no second entry."""
    first = lambda b: next(iter(b.stats[0]), "") if b.stats else ""
    priced = lambda s: any(re.search(r"\d", v) for h, v in s.items() if h.upper() in ("COST", "AVAIL", "AVAILABILITY"))
    listed = [
        b
        for b in bs
        if b.type == "item"
        and b.row is None
        and len(b.stats) > 1
        and all(map(priced, b.stats))
        and first(b).upper() in _NAME_COLUMNS | {"TYPE"}
        and len({s.get(first(b)) for s in b.stats}) == len(b.stats)
    ]
    have = {(b.chapter, norm(b.name)) for b in bs if b.row is not None}
    again = lambda b, n: first(b).upper() != "TYPE" and (b.chapter, norm(n)) in have  # noqa: E731
    named = {
        norm(s[first(b)]): s[first(b)]
        for b in listed
        if first(b).upper() != "TYPE"
        for s in b.stats
        if not again(b, s[first(b)])
    }
    descs = {}
    for b in bs:  # a heading whose words are all in a listed name (`Reactive Armor`: `Reactive Armor Plates`)
        k = next(
            (
                k
                for k, n in named.items()
                if b.type == "section"
                and b.level == 3
                and not b.stats
                and (norm(b.name) == k or _words(b.name) <= _words(n))
            ),
            None,
        )
        if k and k not in descs:
            descs[k] = b
    out = []
    for b in bs:
        if any(b is d for d in descs.values()):
            continue
        if not any(b is x for x in listed):
            out.append(b)
            continue
        col = first(b)
        for s in b.stats:
            n = s[col] if col.upper() != "TYPE" else f"{b.name} ({s[col]})"
            if again(b, n):
                continue
            d = descs.get(norm(n))
            # (a row with no heading of its own, named in the text of a heading that tags a rating range: `Reactive Armor
            # (Rating 1-4)` over `plates and GelWeave`: that heading's range)
            said = next(
                (x.tags for x in descs.values() if x.tags and re.search(rf"(?i)\b{re.escape(n)}\b", x.text)), ""
            )
            out.append(
                replace(
                    b,
                    name=n,
                    stats=[{h: v for h, v in s.items() if h != col}],
                    label="",
                    text=d.text if d else b.text,
                    tags=d.tags if d else b.tags or said,
                )
            )
    return out


_STATS_ON = re.compile(r"\(stats\s+on\s+p\.\s*(\d+)\)", re.I)


def _squash(s):
    return re.sub(r"(.)\1+", r"\1", " ".join(s.split()))  # (a letter printed twice too many: `Actioneeer`)


def _pointed(bs):
    """A SUIT UP section whose text points to its stats on another page (`(stats on p. 55)`: Vashon Island's later
    lines) owns the rows of the armor list printed there (ITEM, DR …) whose first word its text prints as a name (with
    its capital: `Steampunk`, not the list's `Armor Jacket`) and that no entry of the chapter has: one item each, named
    as the row prints, grouped under the section."""
    out = list(bs)
    for i, b in enumerate(bs):
        if norm(b.chapter) != "suit up" or b.level != 3 or not (pages := _STATS_ON.findall(b.text)):
            continue
        said = _squash(b.text)
        have = {norm(x.name) for x in bs if x.chapter == b.chapter and (x.row is not None or x.stats)} | {
            norm(v) for x in bs if x.chapter == b.chapter for s in x.stats for v in list(s.values())[:1]
        }  # (a box's rows)
        rows = []
        for t in bs:
            if t.chapter != b.chapter or not any(abs(t.page - (int(p) + PAGE_OFFSET)) <= 1 for p in pages):
                continue
            for h, rs in catalog.md_tables(t.text):
                if h[0].upper() == "ITEM" and "DR" in {x.upper() for x in h}:  # (its page: the one pointed to)
                    rows += [
                        (int(pages[0]) + PAGE_OFFSET, h, r)
                        for r in rs
                        if r[0]
                        and norm(r[0]) not in have
                        and r[0][:1].isupper()
                        and re.search(rf"\b{re.escape(_squash(r[0].split()[0]))}\b", said)
                    ]
        j = next(k for k, x in enumerate(out) if x is b) + 1
        out[j:j] = [
            replace(
                b,
                type="item",
                name=r[0],
                header=list(h),
                row=dict(zip(h, r)),
                stats=[],
                text="",
                label="",
                page=page,
                level=4,
                group=b.name,
            )
            for page, h, r in rows
        ]
    return out


def extract(regrouped, ctx=None):
    bs = _lists(_hosted(shapes.configuration_rows(_boxes(_pointed(_strays(blocks(regrouped)))))))
    return catalog.read([x for b in bs for x in shapes.martial_pair(shapes.martial(b))], ctx, sys.modules[__name__])
