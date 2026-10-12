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
from importer.sr6.recipes.crb import _BEING, HEADERS, _Catalog, _md, _tables, _text, _value
from importer.sr6.regroup import blocks, norm, text_page

ID, NAME, PUBLISHER, CANON = "SWC", "Shadowrun: Sixth World Companion", "Catalyst Game Labs", True
SHA256 = ("348a545b057f2daaa2337636570dbc6151e8229fd1d1e30d8827664d5516e768",  # the owner's copy
          "464fcef8e463fc2c497c9e972119ee2ddc0d261859f1f02b7a844847c7c005de")  # an earlier copy, its fonts re-embedded
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 205  # PDF page: the table index (the book's tables reprinted) starts here (left out)
ALIASES = {}
NAME_HEADERS = frozenset()

# the core rulebook's attributes and skills, by name (game terms): a life module's options name them
ATTRS = {"body": "bod", "agility": "agi", "reaction": "rea", "strength": "str", "willpower": "wil", "logic": "log",
         "intuition": "int", "charisma": "cha", "edge": "edg", "magic": "mag", "resonance": "res"}
SKILLS = ("Astral", "Athletics", "Biotech", "Close Combat", "Con", "Conjuring", "Cracking", "Electronics", "Enchanting",
          "Engineering", "Exotic Weapons", "Firearms", "Influence", "Outdoors", "Perception", "Piloting", "Sorcery",
          "Stealth", "Tasking")
SKILL_IDS = {norm(s): f"skill:crb.{slug(s)}" for s in SKILLS}
CONTACT_TYPES = ("academic", "corporate", "criminal", "engineering", "government", "magic", "matrix", "media", "medical",
                 "street")
NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8}
REQUIRES = {"awakened": "awakened", "adepts": "adept", "adept": "adept", "emerged": "emerged", "magicians": "magician"}

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


def _plain(text):
    """Text with the bold markers, bullets and line breaks gone, words split at a line end joined."""
    s = re.sub(r"\*\*|•", " ", text)
    s = re.sub(r"(?<=[a-z])-\n(?=[a-z])", "", s)
    return " ".join(s.split())


# --- life modules -------------------------------------------------------------------------------------------------

_HIDDEN = re.compile(r"^([A-Z][\w/' -]+?)\s*[\[(]\s*(\w+)\s+only\s*[\])]$")  # `Clairvoyant [ Awakened only ]`
_ONLY = re.compile(r"\s*[\[(]\s*(\w+)\s+only\s*[\])]", re.I)
_ITEM = re.compile(r"(?=Choose (?:one|two|three|an? \w+):|(?<!: )\+\d+ to |Resources:|Contact Points:|Contact Types:|"
                   r"Knowledge [Ss]kills?\b|One rank in|Option:)")


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


def _options(word):
    """An option word -> its tokens: an attribute, a skill (`Exotic Weapon` too), `+25,000 nuyen`, or a group (`any
    mental attribute`, `any other skill or attribute`)."""
    w = re.sub(r"^(?:or|and)\s+", "", norm(re.sub(r"\(.*?\)", "", word)))
    if m := re.fullmatch(r"(?:or\s+)?\+?\s*([\d,]+)\s*nuyen", word.strip()):
        return [f"nuyen:{m.group(1).replace(',', '')}"]
    w = re.sub(r"^\d+\s+(?=[a-z])", "", w)  # (an errata's `+1 Con or +1 Influence`: each option its own bonus)
    if re.fullmatch(r"(?:your )?(?:other )?drain attribute", w):  # Willpower and the tradition's other one
        return ["log", "int", "cha"]
    if w in ATTRS or w in SKILL_IDS or w + "s" in SKILL_IDS:
        return [ATTRS.get(w) or SKILL_IDS.get(w) or SKILL_IDS[w + "s"]]
    if m := re.fullmatch(r"(?:any )?(?:other )?(mental |physical )?(skill|attribute)(?: or (skill|attribute))?", w):
        groups = {"mental ": ["wil", "log", "int", "cha"], "physical ": ["bod", "agi", "rea", "str"],
                  None: ["bod", "agi", "rea", "str", "wil", "log", "int", "cha"]}
        return [t for g in (m.group(2), m.group(3)) if g
                for t in (list(SKILL_IDS.values()) if g == "skill" else groups[m.group(1)])]
    return None


def _choice(body, module, page, report):
    """`+N to A, B, or C` (or `+N A, or +25,000 nuyen`) -> (points, [options]); words that are no attribute or skill
    are reported."""
    m = re.match(r"\+(\d+)\s+(?:to\s+)?(.*)", body)
    if not m:
        return None
    points, rest = int(m.group(1)), re.sub(r"\s*\(\s*\w+ only\s*\)", "", m.group(2)).strip(" .")
    words = [w.strip() for w in re.split(r",?\s+or\s+|,\s+", rest) if w.strip()]
    if any(len(w.split()) > 4 for w in words):  # prose (a sidebar run into the list), not options
        report.append({"kind": "unread-line", "file": "lifemodules.xml", "name": module, "value": body[:80], "page": page})
        return None
    opts, bad = [], []
    for w in words:
        o = _options(w)
        (opts if o else bad).extend(o or [w])
    for w in bad:
        report.append({"kind": "unread-option", "file": "lifemodules.xml", "name": module, "value": w, "page": page})
    return (points, list(dict.fromkeys(opts))) if opts else None


def _module_grants(name, text, page, report):
    """attrs, children (choices) from an adult module's labelled lines."""
    attrs, kids = {}, []
    s = re.sub(r"\+\s(?=\d)", "+", _plain(text))  # `+ 1 to`
    items = [x.strip() for x in _ITEM.split(s)[1:]]

    def add(k, v):
        attrs[k] = attrs.get(k, 0) + v
    for it in items:
        if m := re.match(r"Choose (one|two|three):\s*(.*)", it):
            body = m.group(2)
            if re.match(r"\+\d+ to (?:any|an) (?:one )?skill", body):
                add("skillPoints", int(re.match(r"\+(\d+)", body).group(1)) * NUMBERS[m.group(1)])
                continue
            c = _choice(body, name, page, report)
            if c:
                kids += [("choice", {"kind": "mixed", "points": c[0], "options": " ".join(c[1])}, None)] * NUMBERS[m.group(1)]
            continue
        if m := re.match(r"\+(\d+) to (?:any|an) (?:one )?(attribute|skill)", it):
            add("attributePoints" if m.group(2) == "attribute" else "skillPoints", int(m.group(1)))
            continue
        if m := re.match(r"\+(\d+) to (\w+) different skills", it):
            add("skillPoints", int(m.group(1)) * NUMBERS.get(m.group(2), 1))
            continue
        if it.startswith("+"):
            if c := _choice(it, name, page, report):
                kids.append(("choice", {"kind": "mixed", "points": c[0], "options": " ".join(c[1])}, None))
            continue
        if m := re.match(r"Resources:\s*\+?([\d,]+)(?:\s*(?:nuyen|¥))?", it):  # (an errata's `Resources: +75,000`)
            add("nuyen", int(m.group(1).replace(",", "")))
        elif m := re.match(r"Contact Points:\s*(\d+)", it):
            add("contactPoints", int(m.group(1)))
        elif m := re.match(r"Contact Types:\s*(.*)", it):
            types = [norm(t) for t in re.split(r",\s*|\s+or\s+|\s+and\s+", m.group(1).strip(" ."))]
            types = [t for t in types if t]
            # (the last type run into the prose after the list: `Media Add a negative quality …`)
            types = [t if t in CONTACT_TYPES or t.split()[0] not in CONTACT_TYPES else t.split()[0] for t in types]
            if types and types[0] != "any":
                bad = [t for t in types if t not in CONTACT_TYPES]
                for t in bad:
                    report.append({"kind": "unread-option", "file": "lifemodules.xml", "name": name, "field": "contactTypes",
                                   "value": t, "page": page})
                attrs["contactTypes"] = " ".join(t for t in types if t in CONTACT_TYPES) or None
        elif m := re.match(r"Knowledge skills?\s*(?:\(choose (\w+)\)|:\s*choose (?:any |up to )?(\w+))", it, re.I):
            add("knowledgeSkills", NUMBERS.get(m.group(1) or m.group(2), 1))
        elif it.startswith("One rank in"):
            add("knowledgeSkills", 1)
        # Choose an Alignment, Option: (karma spends) and qualities are no grants
    return attrs, kids


def _opening_grants(text):
    """The opening modules print their grants as sentences."""
    s, attrs = _plain(text), {}
    if m := re.search(r"Choose (\w+) of the following skills.*?at rank (\d)", s):
        attrs["skillPoints"] = NUMBERS.get(m.group(1), 0) * int(m.group(2))
    if m := re.search(r"Gain that skill at rank (\d)", s):
        attrs["skillPoints"] = attrs.get("skillPoints", 0) + int(m.group(1))
    if re.search(r"Gain the .{0,40}?Knowledge skill", s):
        attrs["knowledgeSkills"] = 1
    if m := re.search(r"Gain ([\d,]+) nuyen", s):
        attrs["nuyen"] = int(m.group(1).replace(",", ""))
    if m := re.search(r"Assign (\w+) total points", s):
        attrs["contactPoints"] = NUMBERS.get(m.group(1), 0)
    return attrs


def _lifemodule(cat, stage, name, text, page):
    req = None
    if m := _ONLY.search(name):
        req, name = REQUIRES.get(m.group(1).lower()), _ONLY.sub("", name).strip()
    first = text.strip().splitlines()[0] if text.strip() else ""
    if m := re.fullmatch(r"\s*\(\s*(\w+)\s+only\s*\)\s*", first):  # `( Awakened only )` on the line under the heading
        req = REQUIRES.get(m.group(1).lower())
    if stage == "opening":
        attrs, kids = _opening_grants(text), []
    else:
        attrs, kids = _module_grants(name, text, page, cat.report)
        if not attrs and not kids:
            cat.report.append({"kind": "missing-value", "file": "lifemodules.xml", "name": name, "field": "grants",
                               "page": page})
    cat.add("lifemodules", name, page, {"stage": stage, "requires": req, **attrs}, kids)


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
            h = [_BEING.get(t, "mag") for t in ln.split()]
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
        karma = m.group(2)
        k = sections.karma_list(karma)  # (`5, 10 Karma`: the first, the highest)
        lv = re.search(r"max(?:imum)?\.?\s*(?:of\s*)?(\d+)\s*levels?", karma, re.I)
        attrs = {"kind": "positive" if m.group(1).lower() == "cost" else "negative", "karma": k[0] if k else None,
                 "karmaMax": max(k) if k and max(k) > k[0] else None, "karmaSteps": sections.karma_steps(karma) if k and max(k) > k[0] else None,
                 "perLevel": "true" if re.search(r"per\s+level", karma, re.I) else None, "maxLevel": lv and int(lv.group(1))}
        if not k and re.search(r"\bsee\s+text\b", karma, re.I):
            # `Bonus: See text`: the prices its own paragraphs print (`a bonus of 8 Karma … a bonus of 15 Karma`),
            # up to the next quality's price line
            nxt = next((j for j in range(i + 1, len(lines)) if _KARMA.match(lines[j])), len(lines))
            ks = [int(x) for x in re.findall(r"\b(?:bonus|cost)\s+of\s+(\d+)\s+Karma", " ".join(lines[i + 1:nxt]), re.I)]
            if ks:
                k = True
                attrs.update(karma=min(ks), karmaMax=max(ks) if len(set(ks)) > 1 else None,
                             karmaSteps=" ".join(map(str, sorted(set(ks)))) if len(set(ks)) > 1 else None)
        if not k:
            cat.report.append({"kind": "book-value", "file": "qualities.xml", "name": qname, "field": "karma",
                               "value": karma, "page": page})
        # (a sub-quality on its own page: its title line's, the block printed over several pages)
        at = max(1, text_page(block, sub) - PAGE_OFFSET) if sub and block is not None else page
        cat.add("qualities", qname, at, attrs, (), _plain_text(own))
    return found


def _plain_text(text):
    return text.replace("**", "").strip()


def _labels(text, keys):
    """`Key: value` lines (bullets and wrapped values joined) for the given keys."""
    s = _plain(text)
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
    s = _plain(text)
    m = re.search(r"Typical Connection Rating\s*:\s*(\d+)", s)
    if not m:
        return False
    lines = [" ".join(c.strip() for c in ln.strip().strip("|").split("|")) if ln.startswith("|") else ln.replace("**", "").strip()
             for ln in (band + "\n" + text).splitlines() if not re.fullmatch(r"\|(?:-+\|)+", ln.strip())]
    cat.add("contacts", name, page, {"archetype": name, "connection": int(m.group(1))}, (), _plain_text(text))
    for i, ln in enumerate(lines[:-1]):
        if _BAND.match(ln) and len(ln.split()) == len(lines[i + 1].split()):
            stats = {_BEING[h]: v for h, v in zip(ln.split(), lines[i + 1].split()) if h in _BEING}
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
    attrs = {"category": slug(b.tags) or "vehicles", **{cols[h]: _value(cols[h], v) for h, v in band.items() if h in cols}}
    name = b.name.title() if b.name[:1].islower() else b.name
    keep = [ln for ln in b.text.splitlines() if not ln.startswith("|") and not re.fullmatch(r"\*\*[A-Z .]+\*\*", ln.strip())
            and not re.fullmatch(r"[\d/—–\-+*.,()¥A-Z ]+", ln.strip())]
    cat.add("vehicles", name, page, attrs, (), "\n".join(keep).strip())
    return True


# --- the book ------------------------------------------------------------------------------------------------------

def extract(regrouped, ctx=None):
    cat = _Catalog(ID, "swc", "the Shadowrun Sixth World Companion")
    chapter, group, stack, ranges, dev = None, "", [], [], []
    bs = list(blocks(regrouped))
    cat.index = search.Index(bs, PAGE_OFFSET, _tables, shapes.RENAME)
    kinds, found = sections.Reader(), []
    for b in bs:
        ch, page, sec = norm(b.chapter), max(1, b.page - PAGE_OFFSET), norm(b.section)
        found += kinds.feed(b, page)  # the kinds the book prints as sections (sections.py)
        if b.chapter != chapter:
            chapter, group, stack = b.chapter, "", []
        if b.level <= 4:
            group = norm(b.name)
        text = _text(b)
        done = False
        if ch == METAVARIANTS[0]:  # the development tables: a row of its own, a block's band or a table in its text
            tables = ([(b.header, [[b.row.get(h, "") for h in b.header]])] if b.row is not None and b.header else [])                 + [(list(x), [list(x.values())]) for x in b.stats] + _tables(b.text)
            dev += [(h, r, page) for h, rs in tables if norm(h[0]) == "metavariant" and any("PRIORITY" in x.upper() for x in h)
                    for r in rs]  # (they stay rules too)
        if ch == LIFE[0] and sec == LIFE[1] and b.type == "item":
            if any(norm(b.name).startswith(o) for o in OPENING):
                _lifemodule(cat, "opening", b.name, text, page)
                done = True
            elif group in ADULT_GROUPS and b.level == 5:
                for n, t in _split_hidden(b.name, text):
                    _lifemodule(cat, "adult", n, t, page)
                done = True
            elif norm(b.name) in ADULT_GROUPS and "Event" in b.labels:  # the first event, its heading read as a label
                _lifemodule(cat, "adult", f"Event: {b.labels['Event']}", b.text, page)
                done = True
        elif ch == METAVARIANTS[0] and sec.startswith(METAVARIANTS[1]) and "variant attribute ranges" in norm(b.name):
            ranges.append((page, "\n".join(x for x in (_md(b), text) if x)))
            done = True
        elif ch in QUALITY_CHAPTERS and b.type == "item" and "new critter powers" in group and b.level == 5:
            done = _critterpower(cat, b.name, text, page)
        elif ch in QUALITY_CHAPTERS and b.type == "item":
            done = _qualities(cat, b.name, text, page, b)
        elif ch == CONTACTS and b.type == "item":
            done = _contact(cat, b.name, text, page, _md(b))
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
                    "\n\n".join(x for x in (_md(b), text) if x), parent=parent)
        stack.append((level, e["id"]))
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
