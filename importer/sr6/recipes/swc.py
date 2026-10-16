"""Shadowrun: Sixth World Companion (SWC) -> the SR6 catalog: life modules, metavariants (metatypes with their ranges),
qualities, critter powers, contacts (and their stat blocks as NPCs) and the rule sections, ids unscoped (run scopes them
as swc.<slug>), descriptions in the private texts. Reads only regrouped.md (importer/sr6/regroup.py); layout notes in
swc.md.

The book prints its entries as prose with labelled lines (`Cost: 6 Karma`, `Contact Points: 2`), its bold lost in the
PDF, and its few tables as text: they are read from the blocks' text here, never from regroup's rows. A line or value
that doesn't read is reported, never guessed."""
import re

from importer.recipes import Result
from importer.sr6.ids import slug
from importer.sr6 import KINDS, search, sections
from importer.sr6 import shapes
from importer.sr6.lifemodules import REQUIRES, lifemodule, plain
from importer.sr6.catalog import BEING, HEADERS, Catalog, block_md, block_text, md_tables, printed_value
from importer.sr6.regroup import blocks, norm, text_page

ID, NAME, PUBLISHER, CANON = "SWC", "Shadowrun: Sixth World Companion", "Catalyst Game Labs", True
SHA256 = ("348a545b057f2daaa2337636570dbc6151e8229fd1d1e30d8827664d5516e768",  # the owner's copy
          "464fcef8e463fc2c497c9e972119ee2ddc0d261859f1f02b7a844847c7c005de")  # an earlier copy, its fonts re-embedded
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 205  # PDF page: the table index (the book's tables reprinted) starts here (left out)
ALIASES = {}
NAME_HEADERS = frozenset()


LIFE = ("building a shadow", "life path")  # chapter, level-2 section
ADULT_GROUPS = ("choices life modules", "event life modules")
OPENING = ("born this way", "growing up", "coming of age")
METAVARIANTS = ("types and shadows", "creating a metavariant")  # chapter, section of the summary tables
QUALITY_CHAPTERS = ("people of exceptional quality", "express yourself", "darker alterations")
CONTACTS = "meta human resources"
RULE_CHAPTERS = ("runner s world", "exteriors and interiors", "building a shadow", "suit up", "types and shadows",
                 "darker alterations", "express yourself", "people of exceptional quality", "ways to play",
                 "meta human resources", "what you get", "a most false imposition")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    if re.search(r"sixth\s+world", hay, re.I) and re.search(r"companion", hay, re.I):
        return 0.9
    # the contents page: lifepath's modules and sum-to-ten are this book's
    return 0.75 if re.search(r"event\s+life\s+modules", hay, re.I) and re.search(r"sum-to-ten", hay, re.I) else 0.0




# --- life modules -------------------------------------------------------------------------------------------------

_HIDDEN = re.compile(r"^([A-Z][\w/' -]+?)\s*[\[(]\s*(\w+)\s+only\s*[\])]$")  # `Clairvoyant [ Awakened only ]`


def _split_hidden(name, text):
    """A module whose heading the converter couldn't read (a bracket in another font) is a `Name [ X only ]` line in
    the text before it: [(name, text)]."""
    out, cur, lines = [], [], text.splitlines()
    for ln in lines:
        m = _HIDDEN.match(ln.strip())
        prev = next((p.strip() for p in reversed(cur) if p.strip() not in ("", "•")), "")
        if m and m.group(2).lower() in REQUIRES and not re.search(r"(?:,|\bor|\band)$", prev):
            out.append((name, "\n".join(cur)))
            name, cur = f"{m.group(1).strip()} ({m.group(2)} only)", []
        else:
            cur.append(ln)
    return out + [(name, "\n".join(cur))]




# --- metavariants ---------------------------------------------------------------------------------------------------

_RANGE = r"\d+\s*[–-]\s*\d+\*?"
_HEAD = re.compile(r"(?:(?:BOD|AGI|REA|STR|WIL|LOG|INT|CHA|EDG|M)\s*)+")
_ROW = re.compile(rf"([A-Z][^\d]*?)\s+((?:{_RANGE}\s*)+)$")
_NUMS = re.compile(rf"(?:{_RANGE}\s*)+")
_ALL = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg")


def _metavariants(cat, chunks):
    """The summary tables (`<X> Variant Attribute Ranges`), in either print: a header of attribute abbreviations (a table
    header, or a text line), rows `Name 1–7 1–6 …` (or a nameless table row whose name is the next line), and later
    number-only rows for the same names in the same order: under a header of the rest (`CHA EDG`), else the rows'
    missing attributes in order. Each row's `Racial Traits:` line (wrapped) follows it."""
    head, part, rows, last, traits, pending = [], None, [], None, None, None

    def missing(r):
        return [a for a in _ALL + ("mag",) if a not in r["ranges"] and (a != "mag" or r["mag"])]
    for page, raw in ((p, ln) for p, text in chunks for ln in text.splitlines()):
        ln, table = raw.replace("**", "").strip(), raw.startswith("|")
        if table:
            ln = " ".join(c.strip() for c in ln.strip("|").split("|"))
        if not ln or ln.startswith("#") or re.fullmatch(r"[-\s]+", ln):
            continue
        if _HEAD.fullmatch(ln):
            h = [BEING.get(t, "mag") for t in ln.split()]
            head, part, pending = (h, None, None) if h[0] == "bod" else (head, h, pending)
            traits = None
            continue
        if m := re.match(r"Racial Traits\s*:\s*(.*)", ln):
            traits = last
            if last is not None:
                last["traits"] = m.group(1)
            continue
        m = _ROW.match(ln)
        nums = m.group(2) if m else ln if _NUMS.fullmatch(ln) else None
        vals = re.findall(_RANGE, nums) if nums else []
        if table and nums and len(vals) == len(head):  # its name is the next line
            pending, traits = vals, None
            continue
        if pending and not nums and re.fullmatch(r"[A-Z][^\d:]*", ln):
            last = {"name": ln, "ranges": {}, "traits": "", "page": page, "mag": "mag" in head}
            rows.append(last)
            target, attrs, vals, pending, traits = last, head, pending, None, None
        elif m and head and len(vals) <= len(head):
            last = {"name": m.group(1).strip(), "ranges": {}, "traits": "", "page": page, "mag": "mag" in head}
            rows.append(last)
            target, attrs, traits = last, head[:len(vals)], None
        elif nums and part and len(part) == len(vals):
            want = [a for a in part if a in _ALL]
            target = next((r for r in rows if want and set(want) <= set(missing(r))), None)
            attrs, traits = part, None
        elif nums and not m:
            target = next((r for r in rows if len(missing(r)) == len(vals)), None)
            attrs, traits = (missing(target) if target else []), None
        elif nums:  # a named row with more columns than the header
            target = None
        elif traits is not None:
            traits["traits"] += " " + ln  # a wrapped trait list
            continue
        else:
            continue
        if target is None:
            cat.report.append({"kind": "book-value", "file": "metatypes.xml", "name": m.group(1) if m else "",
                               "field": "ranges", "value": ln, "page": page})
            continue
        for a, v in zip(attrs, vals):
            lo, hi = re.findall(r"\d+", v)
            target["ranges"][a] = (int(lo), int(hi))
    for r in rows:
        missing = [a for a in _ALL if a not in r["ranges"]]
        if missing:
            cat.report.append({"kind": "missing-value", "file": "metatypes.xml", "name": r["name"],
                               "field": " ".join(missing), "page": r["page"]})
        kids = [("range", {"attr": a, "min": lo, "max": hi}, None) for a, (lo, hi) in r["ranges"].items() if a in _ALL]
        kids += [("trait", {}, t) for t in _traits(r["traits"])]
        cat.add("metatypes", r["name"], r["page"], {}, kids)


# a development table row's name -> the metavariant it is (the row printed under another name)
DEV_ALIASES = {"dour": "duende"}
_BASE = {"human", "elf", "dwarf", "ork", "troll"}  # the core rulebook's: its priority table has them


def _development(cat, rows):
    """The development tables (`METAVARIANT | … | CUSTOMIZATION KARMA | PRIORITY A | … | PRIORITY E`): each metavariant's
    adjustment points at the metatype priorities it can be taken at (`N/A`: not at that letter), as its <priority>
    children. The core rulebook's metatypes' rows are skipped (its priority table has them); a row naming no
    metavariant of the book is reported. The karma column is a creation setting (metatypeKarma)."""
    by = {}
    for e in cat.entries["metatypes"]:
        by[norm(e["name"])] = e
    for header, row, page in rows:
        name = norm(row[0])
        e = by.get(DEV_ALIASES.get(name, name)) or (by.get(name[:-1]) if name.endswith("s") else None)
        if e is None:
            if name not in _BASE and name.rstrip("s") not in _BASE and any(c.strip() for c in row[1:]):
                cat.report.append({"kind": "unmatched", "file": "metatypes.xml", "name": row[0], "page": page})
            continue
        for h, v in zip(header, row):
            m = re.search(r"PRIORITY\s+([A-E])$", h.upper())
            if m and re.fullmatch(r"\d+", v.strip()) and not any(t == "priority" and a["letter"] == m.group(1)
                                                                  for t, a, _ in e["children"]):
                e["children"].append(("priority", {"letter": m.group(1), "points": int(v)}, None))


def _traits(s):
    """`A, B (2), C (x, y)` -> names, split at commas outside parentheses."""
    out, depth, cur = [], 0, ""
    for ch in s:
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [t.strip(" .") for t in out + [cur] if t.strip(" .")]


# --- qualities, critter powers, contacts ----------------------------------------------------------------------------

_KARMA = re.compile(r"^\W*(Cost|Bonus)\s*:\s*(.*?(?:Karma|see text).*)$", re.I)
_SUBNAME = re.compile(r"^[A-Z0-9<][\w’'/<>,-]*(?:\s+(?:[A-Z0-9<][\w’'/<>,-]*|of|and|the|or|\([^)]*\)))*$")


def _qualities(cat, name, text, page, block=None):
    """Each `Cost: N Karma` (positive) or `Bonus: N Karma` (negative) line in the block is one quality: the block's,
    or a sub-quality named by the short title line above it (`Camouflage` under `Animal Pelage`). False: no karma line."""
    lines = [ln.replace("**", "").strip() for ln in text.splitlines()]
    found = False

    def sub_at(i):  # the sub-quality title line over karma line i (`Thorns` over `Cost: 5 Karma`), its index, else None
        j = next((j for j in range(i - 1, -1, -1) if lines[j] and lines[j] != "•"), None)
        p = lines[j] if j is not None else ""
        return j if _SUBNAME.match(p) and len(p.split()) <= 5 and p != name else None
    karma_at = [i for i, ln in enumerate(lines) if _KARMA.match(ln)]
    for i, ln in enumerate(lines):
        m = _KARMA.match(ln)
        if not m:
            continue
        found = True
        j = sub_at(i)
        sub = lines[j] if j is not None else None
        own = text
        if sub:  # a sub-quality's own lines: from its title to the next sub-quality's title (not its neighbours')
            nxt = next((k for k in karma_at if k > i and sub_at(k) is not None), None)
            own = "\n".join(lines[j:sub_at(nxt) if nxt is not None else len(lines)])
        qname = sub or name  # a sub-quality is a quality of its own (`Monkey Paws`)
        karma, j = m.group(2), i + 1
        while karma.count("(") > karma.count(")") and j < len(lines) and lines[j] and not lines[j].endswith(":"):
            karma, j = f"{karma} {lines[j]}", j + 1  # (a price note wrapped onto the next line: `(–10 Karma if … already` `Awakened)`)
        kids = []
        if aw := _AWAKENED_LESS.search(karma):  # (`54 Karma (–10 Karma if character is already Awakened)`, p. 113)
            karma = karma[:aw.start()]
        k = sections.karma_list(karma)  # (`5, 10 Karma`: the first, the highest)
        if aw and k:
            n = int(aw.group(1))
            kids.append(("karmaif", {"flag": "awakened", "value": k[0] - n,
                                     "note": f"less {n} if the character is already Awakened"}, None))
        lv = re.search(r"max(?:imum)?\.?\s*(?:of\s*)?(\d+)\s*levels?", karma, re.I)
        attrs = {"kind": "positive" if m.group(1).lower() == "cost" else "negative", "karma": k[0] if k else None,
                 "karmaMax": max(k) if k and max(k) > k[0] else None, "karmaSteps": sections.karma_steps(karma) if k and max(k) > k[0] else None,
                 "perLevel": "true" if re.search(r"per\s+level", karma, re.I) else None, "maxLevel": lv and int(lv.group(1))}
        if not k and re.search(r"\bsee\s+text\b", karma, re.I):
            # `Bonus: See text`: the prices its own paragraphs print (`a bonus of 8 Karma … a bonus of 15 Karma`),
            # up to the next quality's price line
            nxt = next((j for j in range(i + 1, len(lines)) if _KARMA.match(lines[j])), len(lines))
            para = plain("\n".join(lines[i + 1:nxt]))
            ks = [int(x) for x in re.findall(r"\b(?:bonus|cost)\s+of\s+(\d+)\s+Karma", para, re.I)]
            by = {bool(w.group(1)): int(w.group(2)) for w in _AWAKENED_PRICE.finditer(para)}
            if set(by) == {True, False}:
                # (`For non-Awakened characters, this quality has a bonus of 8 Karma. For Awakened individuals, … 15
                # Karma`, Astral Hazing p. 127: one price and its Awakened price, owner 2026-10-16)
                k = True
                attrs["karma"] = by[True]
                kids.append(("karmaif", {"flag": "awakened", "value": by[False],
                                         "note": f"{by[False]} if the character is Awakened"}, None))
            elif ks:
                k = True
                attrs.update(karma=min(ks), karmaMax=max(ks) if len(set(ks)) > 1 else None,
                             karmaSteps=" ".join(map(str, sorted(set(ks)))) if len(set(ks)) > 1 else None)
        if not k:
            cat.report.append({"kind": "book-value", "file": "qualities.xml", "name": qname, "field": "karma",
                               "value": karma, "page": page})
        # (a sub-quality on its own page: its title line's, the block printed over several pages)
        at = max(1, text_page(block, sub) - PAGE_OFFSET) if sub and block is not None else page
        cat.add("qualities", qname, at, attrs, kids, _plain_text(own))
    return found


_PER = re.compile(r"\(\s*per\s+(?:level|point)\s*\)", re.I)


def _priced_list(cat, b, page):
    """A block that is only a `QUALITY | KARMA` table (its rows no blocks of their own, no prose: the Infected Optional
    Powers Table) lists qualities bought at the price its row prints: each row a positive quality, its name as printed
    (`Armor (per point)`: per level), its category the table's title without `Table`. Returns the category, else None."""
    rows = [list(r.items()) for r in b.stats]  # (regroup's box tables: one header -> cell dict per row)
    if b.row is not None or not rows or (b.text or "").strip() or b.labels or \
            any([norm(h) for h, _ in r] != ["quality", "karma"] for r in rows):
        return None
    category = re.sub(r"\s+table$", "", b.name.strip(), flags=re.I)
    for (_, name), (_, karma) in rows:
        k = re.fullmatch(r"(\d+)", karma.strip())
        if not k:
            cat.report.append({"kind": "book-value", "file": "qualities.xml", "name": name, "field": "karma", "value": karma, "page": page})
        cat.add("qualities", name, page, {"kind": "positive", "karma": k and int(k.group(1)), "category": category,
                                          "perLevel": "true" if _PER.search(name) else None},
                cid=f"{slug(category)}.{slug(name)}")  # (its own id: a same-named quality of another table, Biosonar's)
    return category


def _list_texts(cat, categories):
    """A priced-list row prints no description: the book's critter power of its name (its `(per level)` aside) is its
    description (`Sharpened Natural Weapon` under New Critter Powers)."""
    powers = {norm(e["name"]): e for e in cat.entries["critterpowers"] if e["text"].strip()}
    for e in cat.entries["qualities"]:
        if e["attrs"].get("category") in categories and not e["text"] and (p := powers.get(norm(_PER.sub("", e["name"])))):
            e["text"] = p["text"]
            cat.texts.append(("qualities", e["id"], p["text"].strip()))


# --- Infected qualities (pp. 104-114; owner decisions 2026-10-16) ---------------------------------------------------

_AWAKENED_LESS = re.compile(r"\(\s*[–-]\s*(\d+)\s*Karma\s+if\s+(?:the\s+)?character\s+is\s+already\s+Awakened\s*\)", re.I)
_AWAKENED_PRICE = re.compile(r"\bFor\s+(non-?)?Awakened\s+\w+,\s*this\s+quality\s+has\s+a\s+(?:bonus|cost)\s+of\s+(\d+)\s+Karma", re.I)
# The chapter's rules every Infected quality follows (game numbers, not text): two free physical and two free mental
# attribute points (p. 104, Creating Infected Characters); Essence and Magic by strain (p. 106, Infection and Magic):
# Strain II and III set Essence to 5 and give Magic 1, or take 1 from a Magic the character has, its maximum 5 + initiate
# grade; Strain I (and Ia, treated as I) gives no starting Essence, its maximum Magic Essence + initiate grade.
_FREE_POINTS = {"freePhysical": 2, "freeMental": 2}
_STRAIN = {"I": {"magicMax": "ess+initiate-grade"},
           "II": {"essence": 5, "magic": 1, "magicLoss": 1, "magicMax": "5+initiate-grade"},
           "III": {"essence": 5, "magic": 1, "magicLoss": 1, "magicMax": "5+initiate-grade"}}
_ATTRS = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha")


def _split_top(s):
    """`A (x, y), B, C (p. 1)` -> the items at commas outside parentheses."""
    out, depth, cur = [], 0, ""
    for ch in s:
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth <= 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [x.strip(" .") for x in out + [cur] if x.strip(" .")]


def _head_args(item):
    """`Enhanced Senses (Hearing, p. 12)` -> ("enhanced sense", ["hearing"]): the name's words, each less a plural `s`, and
    its parenthesis' items less page citations and book names; a trailing `+1` (`Armor +1`) is no part of the name."""
    head, _, rest = item.partition("(")
    head = re.sub(r"\s*\+\d+\s*$", "", head).strip()
    args = [a for a in _split_top(rest[:rest.rfind(")")] if ")" in rest else rest)
            if not re.match(r"(?:p\.|pp\.|SR6\b|Street Wyrd|Core)", a.strip(), re.I)]
    return _words(head), [norm(a) for a in args]


def _words(s):
    return " ".join(re.sub(r"ies$", "y", w).rstrip("s") for w in norm(s).split())


def _optional(cat, e, label, page, rows):
    """The type's `Optional Powers:` items as the optional-power entries they name (rows: [(head words, qualifier, id)] of
    the priced list): a row of the item's name and of one of its parenthesis' items (`Enhanced Senses (Hearing, Smell)`:
    two rows), else the one row of its name (`Magical Guard (self only, …)`). An item naming no row is reported."""
    out = []
    for item in _split_top(label):
        head, args = _head_args(item)
        same = [r for r in rows if r[0] == head]
        variants = [r for r in same if r[1] and not re.fullmatch(r"per (?:point|level)", r[1])]
        if variants:
            got = [r for r in variants if r[1] in args]
            missing = [a for a in args if a not in {r[1] for r in variants}]
        else:
            got, missing = same[:1], [] if same else [item]
        for a in missing:
            cat.report.append({"kind": "unmatched", "file": "qualities.xml", "name": e["name"], "field": "optional power",
                               "value": f"{item}: {a}" if a != item else item, "page": page})
        out += [r for r in got if r not in out]
    return out


def _free(cat, e, powers, page, rows):
    """The free Optional Power the type's Gained Powers offer (`Gain one of the Enhanced Senses or Immunities as a free
    Optional Power`, `Gain either Armor +1, Enhanced Senses (Hearing), or Immunity (Toxins) …`, `Gain one Optional Powers
    (except Regeneration) for free`): the ones of `rows` (the type's optional powers) it names; [] when it offers none."""
    m = re.search(r"\bGain\s+(?:one\s+of\s+the|either|one)\s+(.+?)\s+(?:as\s+a\s+free\s+Optional\s+Power|Optional\s+Powers?\s+for\s+free|for\s+free)",
                  powers, re.I)
    if not m:
        return []
    if ex := re.fullmatch(r"Optional\s+Powers?\s*\(\s*except\s+(.+?)\s*\)", m.group(1), re.I):
        no = {_words(x) for x in re.split(r",\s*|\s+or\s+|\s+and\s+", ex.group(1))}
        return [r for r in rows if r[0] not in no]
    out = []
    for term in re.split(r",\s*(?:or\s+)?|\s+or\s+", m.group(1)):
        head, args = _head_args(term)
        got = [r for r in rows if r[0] == head and (not args or r[1] in args)]
        if not got:
            cat.report.append({"kind": "unmatched", "file": "qualities.xml", "name": e["name"], "field": "free optional power",
                               "value": term, "page": page})
        out += [r for r in got if r not in out]
    return out


def _other_base(bs):
    """A sidebar giving a type for other base metatypes (`NON-HUMAN VAMPIRES`, p. 109: `apply the same attribute modifiers
    to maximums as per a vampire to a human: +1 BOD, STR, WILL, and +2 REA and CHA … a total cost of 32`): {type words:
    (karma, {attr: +n}, page)}."""
    out = {}
    for b in bs:
        t = re.fullmatch(r"non-? ?human (.+)", norm(b.name))
        s = plain(b.text or "")
        cost = re.search(r"\btotal cost of (\d+)", s, re.I)
        if not (t and cost):
            continue
        add = {}
        for m in re.finditer(r"\+(\d+)\s+((?:[A-Z]{3,4}\b(?:,?\s*(?:and\s+)?)?)+)", s):
            for w in re.findall(r"[A-Z]{3,4}", m.group(2)):
                if w.lower()[:3] in _ATTRS:
                    add[w.lower()[:3]] = int(m.group(1))
        out[_words(t.group(1))] = (int(cost.group(1)), add, max(1, b.page - PAGE_OFFSET))
    return out


def _infected(cat, found, lists, bs):
    """Each Infected quality's rules as data (docs/sr6-data-format.md, Infected characters): <infected> (its strain from
    its Notes, `carry HMHVV Strain Ia`: Ia is Strain I, owner; its base metatype, the attributes table's BASE; whom it
    Awakens as, `Awaken as adepts`; the chapter's free points and its strain's Essence and Magic), an <infectedalt> for
    another base metatype a sidebar gives it (the non-human vampire), and an <optionalpower> per optional power it may
    buy, `free` on those its free pick may take. Placed first among the entry's children (the Quality schema's order)."""
    rows = [(_words(e["name"].partition("(")[0]), norm(e["name"].partition("(")[2].rstrip(")")), e["id"])
            for e in cat.entries["qualities"] if e["attrs"].get("category") in lists]
    others = _other_base(bs)
    for b, entries in found:
        page = max(1, b.page - PAGE_OFFSET)
        lab = _labels(block_text(b), ["Cost", "Gained Powers", "Optional Powers", "Gained Weaknesses", "Attack", "Notes"])
        notes = lab.get("notes", "")
        strain = re.search(r"\bStrain\s+(III|II|Ia|I)\b", notes)
        if not strain:
            cat.report.append({"kind": "missing-value", "file": "qualities.xml", "name": b.name, "field": "strain", "page": page})
            continue
        printed = strain.group(1)
        awakens = re.search(r"\bAwaken\s+as\s+(adept|magician)s?\b", notes, re.I)
        for e in entries:
            base = re.search(r"\(([^()]+)\)$", e["name"]) if e["name"] != b.name else None
            a = {"strain": "I" if printed == "Ia" else printed, "printed": printed if printed == "Ia" else None,
                 "base": base.group(1) if base else b.row.get("BASE", "").strip(),
                 "awakens": awakens and awakens.group(1).lower(), **_FREE_POINTS, **_STRAIN["I" if printed == "Ia" else printed]}
            kids = [("infected", {k: v for k, v in a.items() if v is not None}, None)]
            if alt := others.get(_words(b.name)):
                karma, add, at = alt
                kids.append(("infectedalt", {"base": "other", "karma": karma, **{x: add[x] for x in _ATTRS if x in add},
                                             "page": at, "note": f"{karma} Karma for a non-human {b.name.lower()}"}, None))
            opt = _optional(cat, e, lab.get("optional powers", ""), page, rows)
            free = _free(cat, e, lab.get("gained powers", ""), page, opt)
            kids += [("optionalpower", {"ref": r[2], **({"free": "true"} if r in free else {})}, None) for r in opt]
            e["children"][:0] = kids


def _plain_text(text):
    return text.replace("**", "").strip()


def _labels(text, keys):
    """`Key: value` lines (bullets and wrapped values joined) for the given keys."""
    s = plain(text)
    out = {}
    for k in keys:
        if m := re.search(rf"\b{k}\s*:\s*(.*?)(?=\s(?:{'|'.join(keys)})\s*:|$)", s, re.I):
            out[k.lower()] = m.group(1).strip()
    return out


def _critterpower(cat, name, text, page):
    f = _labels(text, ["Type", "Action", "Range", "Duration"])
    if len(f) < 2:
        return False
    # the description follows the last label on the same run of text: keep only the label's first word or two
    attrs = {k: re.match(r"[\w/()+-]+(?:\s[\w/()+-]+)?", v).group(0) if v else None for k, v in f.items()}
    for k, v in attrs.items():
        attrs[k] = v.split()[0] if k != "range" and v else v
    cat.add("critterpowers", name, page, attrs, (), _plain_text(text))
    return True


_BAND = re.compile(r"^(?:(?:B|A|R|S|W|L|I|C|ESS|M|RES|EDG)\s+){4,}(?:B|A|R|S|W|L|I|C|ESS|M|RES|EDG)$")


def _contact(cat, name, text, page, band=""):
    """A contact archetype (`Typical Connection Rating: N`) and its stat band (`B A R S …` over its values: text lines, or
    `band`, the block's stat table as markdown) as an NPC."""
    s = plain(text)
    m = re.search(r"Typical Connection Rating\s*:\s*(\d+)", s)
    if not m:
        return False
    lines = [" ".join(c.strip() for c in ln.strip().strip("|").split("|")) if ln.startswith("|") else ln.replace("**", "").strip()
             for ln in (band + "\n" + text).splitlines() if not re.fullmatch(r"\|(?:-+\|)+", ln.strip())]
    cat.add("contacts", name, page, {"archetype": name, "connection": int(m.group(1))}, (), _plain_text(text))
    for i, ln in enumerate(lines[:-1]):
        if _BAND.match(ln) and len(ln.split()) == len(lines[i + 1].split()):
            stats = {BEING[h]: v for h, v in zip(ln.split(), lines[i + 1].split()) if h in BEING}
            rest = " ".join(lines[i + 2:])
            sk = re.search(r"Active Skills\s*:\s*(.*?)(?=Knowledge Skills|$)", rest)
            kids = [("skills", {}, sk.group(1).strip())] if sk else []
            cat.add("npcs", name, page, {"group": "Contact", **stats}, kids, "")
            break
    return True


def _vehicle(cat, b, band, page):
    """A vehicle printed with its stats in its text (shapes.vehicle_band): a vehicles entry, its tag line the
    category, a lower-case title capitalized."""
    cols = HEADERS["vehicles"]
    attrs = {"category": slug(b.tags) or "vehicles", **{cols[h]: printed_value(cols[h], v) for h, v in band.items() if h in cols}}
    name = b.name.title() if b.name[:1].islower() else b.name
    keep = [ln for ln in b.text.splitlines() if not ln.startswith("|") and not re.fullmatch(r"\*\*[A-Z .]+\*\*", ln.strip())
            and not re.fullmatch(r"[\d/—–\-+*.,()¥A-Z ]+", ln.strip())]
    cat.add("vehicles", name, page, attrs, (), "\n".join(keep).strip())
    return True


# --- the book ------------------------------------------------------------------------------------------------------

def extract(regrouped, ctx=None):
    cat = Catalog(ID, "swc", "the Shadowrun Sixth World Companion")
    chapter, group, stack, ranges, dev = None, "", [], [], []
    bs = list(blocks(regrouped))
    cat.index = search.Index(bs, PAGE_OFFSET, md_tables, shapes.RENAME)
    kinds, found, lists, infected = sections.Reader(), [], set(), []
    bases = {}  # (the Infected Metatype Attributes table, p. 109: a type's name -> the base metatypes it prints, in order)
    for b in bs:
        if b.row is not None and [norm(h) for h in (b.header or [])[:2]] == ["type", "base"]:
            bases.setdefault(norm(b.row.get(b.header[0], "")), []).append(b.row.get(b.header[1], "").strip())
    for b in bs:
        ch, page, sec = norm(b.chapter), max(1, b.page - PAGE_OFFSET), norm(b.section)
        found += kinds.feed(b, page)  # the kinds the book prints as sections (sections.py)
        if b.chapter != chapter:
            chapter, group, stack = b.chapter, "", []
        if b.level <= 4:
            group = norm(b.name)
        text = block_text(b)
        done = False
        if ch == METAVARIANTS[0]:  # the development tables: a row of its own, a block's band or a table in its text
            tables = ([(b.header, [[b.row.get(h, "") for h in b.header]])] if b.row is not None and b.header else [])                 + [(list(x), [list(x.values())]) for x in b.stats] + md_tables(b.text)
            dev += [(h, r, page) for h, rs in tables if norm(h[0]) == "metavariant" and any("PRIORITY" in x.upper() for x in h)
                    for r in rs]  # (they stay rules too)
        if ch == LIFE[0] and sec == LIFE[1] and b.type == "item":
            if any(norm(b.name).startswith(o) for o in OPENING):
                lifemodule(cat, "opening", b.name, text, page)
                done = True
            elif group in ADULT_GROUPS and b.level == 5:
                for n, t in _split_hidden(b.name, text):
                    lifemodule(cat, "adult", n, t, page)
                done = True
            elif norm(b.name) in ADULT_GROUPS and "Event" in b.labels:  # the first event, its heading read as a label
                lifemodule(cat, "adult", f"Event: {b.labels['Event']}", b.text, page)
                done = True
        elif ch == METAVARIANTS[0] and sec.startswith(METAVARIANTS[1]) and "variant attribute ranges" in norm(b.name):
            ranges.append((page, "\n".join(x for x in (block_md(b), text) if x)))
            done = True
        elif ch in QUALITY_CHAPTERS and b.type == "item" and "new critter powers" in group and b.level == 5:
            done = _critterpower(cat, b.name, text, page)
        elif ch in QUALITY_CHAPTERS and b.type == "item":
            before = len(cat.entries["qualities"])
            own = (b.row or {}).get("BASE")
            per_base = [own] + [x for x in bases.get(norm(b.name), ()) if x != own] if own else []
            if len(per_base) > 1:  # (a type the attributes table prints for several base metatypes: one quality each)
                done = any([_qualities(cat, f"{b.name} ({x})", text, page, b) for x in per_base])
            else:
                done = _qualities(cat, b.name, text, page, b)
            if done and own:
                infected.append((b, cat.entries["qualities"][before:]))
            if not done and (listed := _priced_list(cat, b, page)):
                lists.add(listed)
                done = True
        elif ch == CONTACTS and b.type == "item":
            done = _contact(cat, b.name, text, page, block_md(b))
        elif b.type == "item" and len(band := shapes.vehicle_band(b.text)) >= 6:
            done = _vehicle(cat, b, band, page)
        if done:
            continue
        if not any(c == ch for c in RULE_CHAPTERS):
            continue
        section = b.type == "section"
        level = min(b.level, 3) if section else 4
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent = stack[-1][1] if stack else None
        e = cat.add("rules", b.name, page, {"chapter": b.chapter, "level": max(1, level), "parent": parent}, (),
                    "\n\n".join(x for x in (block_md(b), text) if x), parent=parent)
        stack.append((level, e["id"]))
    _list_texts(cat, lists)
    _infected(cat, infected, lists, bs)
    template = sections.template_headings(bs)
    for f in found:  # (after the book's own entries: one the recipe reads as well is the recipe's)
        if sections.is_path(f, template):
            cat.section(f)
    if ranges:
        _metavariants(cat, ranges)
    _development(cat, dev)
    files = {f"{k}.xml": cat.xml(k) for k in KINDS if cat.entries[k]}
    return Result(files=files, texts=cat.texts_xml() if cat.texts else None, report=cat.report,
                  source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON})
