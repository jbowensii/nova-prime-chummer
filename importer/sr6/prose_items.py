"""The prose-priced items pass of the SR6 catalog reader: items, add-ons and prices the books state in running text
rather than in a table row (sentence_items, run_in_items, dv_settings, add_ons, stated_items). importer/sr6/catalog.py
read() calls each in turn on the regrouped blocks and the Catalog being built.
"""

import re

from importer.sr6 import ROW_KINDS, categories, effects
from importer.sr6.ids import slug
from importer.sr6.regroup import md_tables, norm

# an ammunition priced in a sentence as a multiple of the weapon's normal ammunition (`Small caliber railgun ammo is 3x
# the normal cost for the weapon type`): an ammunition type, its cost the multiplier
_AMMO_MULTIPLE = re.compile(
    r"(?:^|[.!?]\s+)([A-Z][\w-]*(?:\s+[\w-]+){0,4}?\s+(?:ammo|ammunition|rounds))\s+(?:is|are|costs?)\s+"
    r"(\d+(?:\.\d+)?)\s*(?:x|×|times)\s+(?:the\s+)?(?:normal|base|regular|listed)\s+(?:cost|price)"
)
# an item priced in a sentence as another book's item (`The Foundation focus is a spell focus for purposes of cost,
# availability, and bonding cost (p. 168, SR6)`): its price fields that item's, at its own rating
_PRICED_AS = re.compile(
    r"\bThe\s+([A-Z][\w-]*(?:\s+[\w-]+){0,3}?)\s+is\s+an?\s+([\w-]+(?:\s+[\w-]+){0,3}?)\s+"
    r"for\s+(?:the\s+)?purposes?\s+of\s+(cost[^()]*?)\s*\(p\.\s*\d+,\s*SR6\)"
)
_CORE = "crb"  # `SR6` in a cross-reference: the core rulebook
# a heading naming an item with the class it is one of: `Unique Qi Focus: Raptor Skull`
_CLASS_HEADING = re.compile(r"(?:(?:Unique|New)\s+)?((?:[A-Z][a-z]+\s+){0,2}Focus):\s*([A-Z].+)")


# an item a heading prices in one line of its text: `Availability 6, Cost 5,000¥`
_PRICE_LINE = re.compile(r"^\s*Avail(?:ability)?:?\s*(\d+\s*(?:\([A-Z]\))?)\s*,\s*Cost:?\s*([\d,]+)\s*¥\s*$", re.M)


# (owner, 2026-10-08) a replacement a section's prose prices, in figures or words: `a replacement instrument costs one
# thousand nuyen`
_NUMWORD = (
    r"(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty"
    r"|hundred|thousand)"
)
_REPLACEMENT_COSTS = re.compile(
    rf"\ba\s+replacement\s+([a-z]+(?:\s+[a-z]+)?)\s+costs\s+"
    rf"([\d,]+|{_NUMWORD}(?:[\s-]+(?:and\s+)?{_NUMWORD})*)\s*(?:¥|nuyen)\b",
    re.I,
)
_UNITS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
}


# an item a note prices in a sentence, with its availability: `Shadowmarket solvent spray in a 10-dose aerosol can be
# purchased for 150¥ and has an availability of 6(I)` (not a price by a rule: `500 nuyen x the critter's Body`)
_PURCHASED = re.compile(
    r"(?:^|[.!?:]\s+)([A-Z][\w-]*(?:\s+[a-z][\w-]*){0,3}?)\s+(?:in\s+an?\s+[\w-]+(?:\s+[\w-]+){0,2}\s+)?"
    r"can\s+be\s+(?:purchased|bought)\s+for\s+([\d,]+)\s*(?:¥|nuyen)(?!\s*x\b)"
    r"(?:\s+and\s+has\s+an?\s+availability\s+of\s+(\d+\s*(?:\(\s*[LI]\s*\)|[LI])?))?"
)


def number_words(s):
    """`one thousand` -> 1000, `two hundred fifty` -> 250, `1,500` -> 1500; None when it isn't a number."""
    s = s.strip().lower()
    if re.fullmatch(r"[\d,]+", s):
        return int(s.replace(",", ""))
    total, cur = 0, 0
    for w in re.split(r"[\s-]+", s):
        if w == "and":
            continue
        if w in _UNITS:
            cur += _UNITS[w]
        elif w == "hundred":
            cur = max(cur, 1) * 100
        elif w == "thousand":
            total, cur = total + max(cur, 1) * 1000, 0
        else:
            return None
    return total + cur


_RUNIN_NAME = re.compile(r"^\W{0,3}\*\*([A-Z][^*:]{1,40}?):\*\*")


_DV_RANGE = re.compile(r"^\s*\(\s*(\d+)\s*[–-]\s*(\d+)\s*\)\s*([PS])\s*[*†‡]*\s*$")
_SETTINGS = re.compile(r"\b([a-z]+)\s*\(\s*(\d+)\s*([PS])\s*\)\s*or\s*([a-z]+)\s*\(\s*(\d+)\s*([PS])\s*\)")


def dv_settings(bs, cat, offset):
    """(owner, 2026-10-08) A weapon whose DV prints a range (`(5–10)S†`) where its page's text names two settings in
    that range (`the setting of the device—low (5S) or high (10S)`): its DV the first setting's (the default), each
    setting a configuration of it (`Handheld (low)`, `Handheld (high)`: configOf, not priced apart)."""
    texts = {}
    for b in bs:
        texts.setdefault(max(1, b.page - offset), []).append(
            re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join((b.text or "").replace("**", "").split()))
        )
    for e in list(cat.entries["weapons"]):
        m = _DV_RANGE.match(e["attrs"].get("dv") or "")
        if not m or e["attrs"].get("configOf"):
            continue
        lo, hi, kind = int(m.group(1)), int(m.group(2)), m.group(3)
        near = " ".join(t for p in (e["page"] - 1, e["page"], e["page"] + 1) for t in texts.get(p, ()))
        hit = next(
            (
                x
                for x in _SETTINGS.finditer(near)
                if x.group(3) == x.group(6) == kind and lo <= int(x.group(2)) <= hi and lo <= int(x.group(5)) <= hi
            ),
            None,
        )
        if not hit:
            continue
        e["attrs"]["dv"] = f"{hit.group(2)}{kind}"
        e["children"] = [c for c in e["children"] if c[1].get("field") != "dv"]
        for word, n in ((hit.group(1), hit.group(2)), (hit.group(4), hit.group(5))):
            attrs = {k: v for k, v in e["attrs"].items() if k not in ("cost", "avail")}
            attrs.update(dv=f"{n}{kind}", configOf=e["id"], avail="—", cost="—")
            cat.add("weapons", f"{e['name']} ({word})", e["page"], attrs, (), "")


def run_in_items(bs, cat, _offset):
    """(owner, 2026-10-08) A bold run-in printed between two run-ins that name rows of one group (`**Increased
    Myelination:**` between `**Hyper-Glucagon:**` and `**Myostatin Inhibitor:**`, the rows `Genotype Enhancement
    (Hyper-Glucagon)`, `… (Myostatin Inhibitor)`) is an item of that group the table leaves out: `Genotype Enhancement
    (Increased Myelination)`, its neighbours' kind and category, its values missing (issues)."""
    parts = {}  # norm(part) -> (kind, entry) for grouped rows `Group (Part)`
    for kind in ROW_KINDS:
        for e in cat.entries[kind]:
            if m := re.fullmatch(r"(.+?)\s+\((.+)\)", e["name"]):
                # (a part with its own parenthetical, `Fear Response Dampener (basic)`, under its bare name too)
                for part in dict.fromkeys([m.group(2), re.sub(r"\s*\([^()]*\)\s*$", "", m.group(2))]):
                    parts.setdefault(norm(part), (kind, e, m.group(1)))
    have = {norm(e["name"]) for k in ROW_KINDS for e in cat.entries[k]}
    # (every name the book's rows go by: their own, their search names, their parts; a run-in naming one, or heading
    # several (`Pathogen Resistance` over its `(general)` and `(specific)` rows), is no left-out item)
    known = have | set(parts) | {norm(a) for k in ROW_KINDS for e in cat.entries[k] for a in e.get("aliases", ())}
    for b in bs:
        names = [m.group(1).strip() for ln in (b.text or "").splitlines() if (m := _RUNIN_NAME.match(ln))]
        for i in range(1, len(names) - 1):
            a, x, c = parts.get(norm(names[i - 1])), names[i], parts.get(norm(names[i + 1]))
            g = norm(f"{a[2]} {x}") if a else ""
            if (
                not a
                or not c
                or a[2] != c[2]
                or a[0] != c[0]
                or norm(x) in known
                or any(k.startswith(norm(x) + " ") or k.startswith(g + " ") for k in known)
                or x.isupper()
                and any(len(k) == len(norm(x)) and sum(p != q for p, q in zip(k, norm(x))) == 1 for k in parts)
            ):
                continue  # (a part's typo, `NDE` for the row `NDI`: the corpus pass makes it the row's search name)
            kind, e, group = a
            name = f"{group} ({x})"
            if norm(name) in have:
                continue
            have.add(norm(name))
            attrs = {k: v for k, v in e["attrs"].items() if k in ("type", "category", "group")}
            kids = [
                (
                    "issue",
                    {"field": f, "code": "missing", "page": e["page"]},
                    f"no {f} printed: the table leaves it out",
                )
                for f in ("essence", "avail", "cost")
                if f in e["attrs"] or f == "cost"
            ]
            cat.add(kind, name, e["page"], attrs, kids, "")


def sentence_items(bs, offset):
    """[(kind, name, page, attrs, children, text)] of the items a book prices only in a sentence of another block's
    text (_AMMO_MULTIPLE, _PRICED_AS), each once (a description printed twice: its first)."""
    heads = {norm(b.name): b.name for b in bs}
    out, seen = [], set()
    for b in bs:
        text = " ".join(" ".join([b.text, *b.labels.values()]).split())
        page = max(1, b.page - offset)
        for m in _AMMO_MULTIPLE.finditer(text):
            name = m.group(1)[:1].upper() + m.group(1)[1:]
            if norm(name) not in seen:
                seen.add(norm(name))
                out.append(
                    (
                        "ammotypes",
                        name,
                        page,
                        {"category": "Ammo type", "cost": f"x{m.group(2)}"},
                        (),
                        m.group(0).strip(". "),
                    )
                )
        if b.row is None and (m := _PRICE_LINE.search(b.text or "")):  # `Availability 6, Cost 5,000¥` under a heading
            words = b.name.split()
            name = " ".join(words[:-1] + [categories.singular(words[-1])]) if b.name[:1].islower() else b.name
            name = name[:1].upper() + name[1:]
            if norm(name) not in seen and norm(name) not in {norm(x.name) for x in bs if x.row is not None}:
                seen.add(norm(name))
                out.append(
                    (
                        "gear",
                        name,
                        page,
                        {
                            "category": b.section or b.chapter or "Gear",  # (its section's)
                            "avail": " ".join(m.group(1).split()),
                            "cost": m.group(2).replace(",", ""),
                        },
                        (),
                        b.text,
                    )
                )
        for m in _PURCHASED.finditer(re.sub(r"\*\*", "", text)):
            name = m.group(1)[:1].upper() + m.group(1)[1:]
            if norm(name) not in seen:
                seen.add(norm(name))
                attrs = {"category": b.section or "Gear", "cost": m.group(2).replace(",", "")}
                kids = ()
                if m.group(3):
                    attrs["avail"] = " ".join(m.group(3).split())
                else:
                    kids = (
                        (
                            "issue",
                            {"field": "avail", "code": "missing", "page": page},
                            "not printed: a sentence prices it",
                        ),
                    )
                out.append(("gear", name, page, attrs, kids, m.group(0).strip(" .")))
        for m in _REPLACEMENT_COSTS.finditer(text):
            name, price = f"Replacement {m.group(1).lower()}", number_words(m.group(2))
            if price is not None and norm(name) not in seen:
                seen.add(norm(name))
                out.append(
                    (
                        "gear",
                        name,
                        page,
                        {"category": "Supply", "cost": str(price)},
                        (
                            (
                                "issue",
                                {"field": "avail", "code": "missing", "page": page},
                                "not printed: a sentence prices it",
                            ),
                        ),
                        m.group(0).strip(". "),
                    )
                )
        if (m := _CLASS_HEADING.fullmatch(b.name.strip())) and norm(m.group(2)) not in seen:
            # (owner, 2026-10-08) `Unique Qi Focus: Raptor Skull`: an item of a class the core rulebook prices, priced
            # as
            # that class at its own Force; the bonding Karma its text prints (`(Force x 3) Karma`) its own
            name, base = m.group(2).strip(), m.group(1).strip()
            seen.add(norm(name))
            ref = f"gear:{_CORE}.{slug(base)}"
            kids = [("formula", {"field": f}, f"ref({ref}, {f}, R)") for f in ("cost", "avail")]
            attrs = {"category": "Foci", "cost": f"As {base.lower()}", "avail": f"As {base.lower()}"}
            if k := re.search(r"(?i)\bbond\b[^.]*?\(\s*Force\s*x\s*(\d+)\s*\)\s*Karma", text):
                attrs["karma"] = f"Force x {k.group(1)}"
                kids.append(("formula", {"field": "karma"}, f"R*{k.group(1)}"))
            out.append(("gear", name, page, attrs, tuple(kids), b.text))
        for m in _PRICED_AS.finditer(text):
            name, base, fields = heads.get(norm(m.group(1)), m.group(1)), m.group(2), m.group(3)
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            flds = [f for f, w in (("cost", "cost"), ("avail", "availability"), ("karma", "bonding")) if w in fields]
            ref = f"gear:{_CORE}.{slug(base)}"
            kids = tuple(("formula", {"field": f}, f"ref({ref}, {f}, R)") for f in flds)
            attrs = {"category": "Foci" if base.lower().endswith("focus") else "", **{f: f"As {base}" for f in flds}}
            out.append(("gear", name, page, {k: v for k, v in attrs.items() if v}, kids, m.group(0).strip(". ")))
    return out


# (owner, 2026-10-08) a supply priced in an item's text: `Batteries cost 100¥ each`, `Tank refills are 200¥ each`,
# `Replacement pitons cost 300 per set`
_SUPPLY = re.compile(
    r"(?:^|[.!?:]\s+)(?:The\s+)?([A-Z][a-z]+(?:\s+[a-z]+){0,2}?)\s+(?:costs?|are|is)\s+([\d,]+)\s*"
    r"(?:(?:¥|nuyen)\s+each|(?:¥|nuyen)?\s*per\s+set)\b"
)
# an add-on priced in an item's text: `a proprietary laser sight (additional 50 nuyen)`, `“stabilizing arm-brace” for an
# additional 100 nuyen`
_ADD_ON = re.compile(
    r"\b(?:an?|the)\s+(?:[a-z-]+\s+){0,3}?([a-z][\w-]*(?:\s+[a-z][\w-]*){0,2})\s*\(\s*(?:an\s+)?additional\s+"
    r"([\d,]+)\s*(?:¥|nuyen)\s*\)"
    r"|[“\"]([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})[”\"]\s+for\s+an\s+additional\s+([\d,]+)\s*(?:¥|nuyen)"
)
_PER_SPARE = re.compile(r"\b([a-z]+)\s*\(\s*([\d,]+)\s*(?:¥|nuyen)\s+per\s+spare\s*\)")
_ADDITIONAL = re.compile(r"^\s*(?:an?\s+)?additional\s+([\d,]+)\s*¥?\s*$", re.I)
# a refill or replacement parts priced in an item's text: `can be completely refilled for 50 nuyen`, `replacement
# balloons
# and panels are available as aftermarket accessories for 100 nuyen each`
_REFILL = re.compile(r"\brefill(?:ed)?\s+for\s+([\d,]+)\s*(?:¥|nuyen)")
_REPLACEMENT = re.compile(
    r"\breplacement\s+([a-z]+)(?:\s+and\s+([a-z]+))?\s+(?:are|is)\s+available\b[^.()]*?\bfor\s+"
    r"([\d,]+)\s*(?:¥|nuyen)\s+each"
)
# a price column naming a second thing it prices in parentheses (`COST (RECHARGE)`), and that price (`1,100¥ (200¥)`)
_COST_OF = re.compile(r"^\s*COST\s*\(\s*([A-Za-z][A-Za-z ]*?)\s*\)\s*$", re.I)
_SECOND_THINGS = {"RECHARGE", "REFILL"}  # such a column's second thing, once a recipe has split it off
_SECOND_PRICE = re.compile(r"\(\s*([\d,]+)\s*¥?\s*\)\s*$")
_NOT_MODIFIERS = {
    "a",
    "an",
    "the",
    "its",
    "their",
    "his",
    "her",
    "and",
    "or",
    "of",
    "for",
    "to",
    "with",
    "new",
    "replacement",
}


def _named_before(text, noun, end):
    """A bare noun as the text first named it, with its modifier (`panels` after `balloon and solar panel components`:
    `solar panel`), else the noun."""
    m = re.search(rf"\b([a-z]+)\s+{re.escape(noun)}s?\b", text[:end])
    return f"{m.group(1)} {noun}" if m and m.group(1) not in _NOT_MODIFIERS else noun


def _flat(text):
    return re.sub(r"(?<=[a-z])-\s+(?=[a-z])", "", " ".join((text or "").split()))  # (`sta- bilizing`)


def add_ons(cat):
    """Supplies and accessories an item's own text prices (owner, 2026-10-08), each linked to the item:
    - `Batteries cost 100¥ each`: gear `<item> battery` (`Battery for <item>`), `supplyOf` the item;
    - `a proprietary laser sight (additional 50 nuyen)`, `“stabilizing arm-brace” for an additional 100 nuyen`: an
      accessory `<item> <add-on>`, `accessoryOf` the item, what the text states it does to the item its effects
      (effects.accessory);
    - a box row priced `additional 100¥` (`Tactical hammer (knife/spike)`) is an accessory of the box's other rows
      (`Tactical hammer (short)`, `(long)`): its own price the addition.
    Their availability the book doesn't print: an issue."""
    hosts = [(k, e) for k in sorted(ROW_KINDS) for e in cat.entries[k] if not e["attrs"].get("supplyOf")]
    for kind, e in hosts:
        m = _ADDITIONAL.match(str(e["attrs"].get("cost") or ""))
        if m and "(" in e["name"]:
            stem = e["name"][: e["name"].index("(")].strip().lower()
            sib = [
                x["id"]
                for x in cat.entries[kind]
                if x is not e
                and x["name"].lower().startswith(stem + " (")
                and re.fullmatch(r"[\d.]+", str(x["attrs"].get("cost") or ""))
            ]
            if sib:
                e["attrs"].update(cost=m.group(1).replace(",", ""), accessoryOf=" ".join(sib))
                e["children"] = [c for c in e["children"] if not (c[0] == "issue" and c[1].get("field") == "cost")]
    seen = {norm(e["name"]) for k in ROW_KINDS for e in cat.entries[k]}
    for kind, e in hosts:
        text = _flat("\n".join([e.get("text") or "", *[str(v) for v in (e.get("row") or {}).values()]]))
        page, label = e["page"], e["name"]
        for m in _SUPPLY.finditer(text):
            one = categories.singular(m.group(1).lower())
            name = f"{label} {one}"
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            cat.add(
                "gear",
                name,
                page,
                {"category": "Supply", "cost": m.group(2).replace(",", ""), "supplyOf": e["id"]},
                [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it")],
                m.group(0).strip(" .:"),
                aliases=[f"{one[:1].upper()}{one[1:]} for {label}"],
            )
        supplies = [("refill", m.group(1), m) for m in _REFILL.finditer(text)]
        for k, v in (e.get("row") or {}).items():  # a `COST (RECHARGE)` column printing `1,100¥ (200¥)`
            if (h := _COST_OF.match(k or "")) and (m := _SECOND_PRICE.search(str(v or ""))):
                supplies.append((h.group(1).lower(), m.group(1), m))
            elif k in _SECOND_THINGS and (m := re.match(r"^\s*([\d,]+)\s*¥\s*$", str(v or ""))):  # (a recipe split it)
                supplies.append((k.lower(), m.group(1), m))
        # (owner, 2026-10-08) `a single specially designed magazine (30¥ per spare)`: its spare magazine
        supplies += [("spare " + m.group(1), m.group(2), m) for m in _PER_SPARE.finditer(text)]
        for m in _REPLACEMENT.finditer(text):
            supplies += [
                ("replacement " + _named_before(text, categories.singular(t), m.start()), m.group(3), m)
                for t in m.groups()[:2]
                if t
            ]
        for thing, price, m in supplies:
            r = re.match(r"^(.*?)\s*(\(rating \d+\))$", label, re.I)
            name = f"{r.group(1)} {thing} {r.group(2)}" if r else f"{label} {thing}"
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            cat.add(
                "gear",
                name,
                page,
                {"category": "Supply", "cost": price.replace(",", ""), "supplyOf": e["id"]},
                [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it")],
                m.group(0).strip(" .:"),
            )
        for m in _ADD_ON.finditer(text):
            thing, price = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
            name = f"{label} {thing}"
            if norm(name) in seen:
                continue
            seen.add(norm(name))
            fx = effects.accessory(text, thing)
            cat.add(
                kind if kind == "weapons" else "gear",
                name,
                page,
                {
                    "category": "Weapon accessory" if kind == "weapons" else "Accessory",
                    "cost": price.replace(",", ""),
                    "accessoryOf": e["id"],
                },
                [
                    ("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it"),
                    *fx,
                ],
                m.group(0).strip(" .:"),
            )


# --- the owner's final decisions (importer v6, 2026-10-08) ------------------------------------------------------------

# (owner, CRB example 5) the magic types: a fixed vocabulary, like the attributes (core rulebook pp. 65-66)
MAGIC_TYPES = (
    ("Full magician", 65),
    ("Aspected magician", 65),
    ("Mundane", 65),
    ("Adept", 66),
    ("Mystic adept", 66),
    ("Technomancer", 66),
)
# (owner, CRB example 6) the licence types Fake License's choice offers: the four its text prints (p. 273) and the
# common
# ones the sample characters' fake SINs carry; any other Licensed (L) item is written in
LICENCE_TYPES = (
    "Hunting license",
    "Firearm license",
    "Concealed carry license",
    "Spellcasting license",
    "Cyberware license",
    "Cyberdeck license",
    "Rigger remote console license",
    "Driver's license",
)
_SPEND = re.compile(r"^Spend an? (Major|Minor) Action to\b")
_CHOOSE_SENSE = re.compile(r"\b(?:select|choose|pick)\s+an?\s+sense\s*\(([^()]+)\)", re.I)
_GAINS = re.compile(
    r"\bgains?\s+the\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)\s*\(([^(),]+),\s*(\d+)\)\s+(positive|negative)\s+quality\b"
)
_LIST_BELOW = re.compile(r"\bselected\s+from\s+the\s+(?:list|table)\s+below\b", re.I)
_RUN_IN = re.compile(r"^\*\*([A-Z][^*]{1,40}?)\.\*\*\s*(.*)$")
_ANY_HOST = re.compile(r"\bAny\s+(?:piece\s+of\s+)?([a-z]+)\s+can\s+have\s+an?\s+[^.]*?\bfor\s+([\d,]+)\s*(?:¥|nuyen)")
_LIST_SPLIT = re.compile(r"\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+")


def _first_sentences(text, n=2):
    return re.split(r"(?<=[.!?])\s+", _flat(re.sub(r"\*\*", "", text or "")))[:n]


def _items(value):
    """A label's list (`Accident, Astral Form, Skill (choose one from A, B, or C …)`) split at its top-level commas."""
    out, depth, cur = [], 0, ""
    for ch in value:
        depth += (ch in "([") - (ch in ")]")
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    return [x for x in out + [cur.strip()] if x]


def _skill_choices(defn):
    """The choices a power's bracketed definition offers: `choose one from Biotech, …, or Piloting and a Specialization
    in the chosen skill as well as an appropriate Knowledge Skill`; `choose any Close Combat skill specialization`."""
    if m := re.search(r"\bchoose\s+any\s+(.+?)\s+skill\s+specialization\b", defn, re.I):
        return [("choice", {"kind": "specialization", "category": m.group(1), "count": "1"}, None)]
    kids = []
    if m := re.search(
        r"\bchoose\s+one\s+(?:from|of)\s+(.+?)(?=\s+and\s+an?\s+specialization\b|\s+as\s+well\s+as\b|$)", defn, re.I
    ):
        opts = [x for x in _LIST_SPLIT.split(m.group(1)) if x]
        kids.append(("choice", {"kind": "skill", "count": "1", "from": "; ".join(opts)}, None))
    if kids and re.search(r"\bspecialization\b", defn, re.I):
        kids.append(("choice", {"kind": "specialization", "count": "1"}, None))
    if re.search(r"\bknowledge\s+skill\b", defn, re.I):
        kids.append(("choice", {"kind": "knowledgeskill", "count": "1"}, None))
    return kids


# a rating-band price table's columns by what they print, under any of the book's headers (a later printing adds an
# AVAILABILITY column to the core rulebook's Explosive Packages: `RATING | AVAILABILITY | COST`)
_BAND_COLUMNS = {"RATING": "rating", "COST": "cost", "AVAILABILITY": "avail", "AVAIL": "avail", "AVAIL.": "avail"}


def _band_tier(rows, header=("RATING", "COST")):
    """A rating-band price table read by its columns (_BAND_COLUMNS; RATING and COST required, any other column not a
    band table's): (`tier(R; 1-3: R*10; …)` of the cost, the availability's tier or None, lowest rating, highest rating,
    the availability's legality letter when every band prints the same one); None when it isn't one. A row naming an
    item instead of a band (`Detonator Cap`) is the item's, not a band."""
    cols = {_BAND_COLUMNS.get(" ".join(h.split()).upper()): i for i, h in enumerate(header)}
    if None in cols or not {"rating", "cost"} <= set(cols):
        return None
    cost, avail, legal = [], [], set()
    for r in rows:

        def cell(k, r=r):
            return (r[cols[k]] or "") if k in cols and cols[k] < len(r) else ""

        b = re.fullmatch(r"\s*(\d+)\s*[–-]\s*(\d+)\s*", cell("rating"))
        if not b:
            continue
        c = re.fullmatch(r"\s*Rating\s*[x×]\s*([\d,]+)\s*¥?\s*", cell("cost"), re.I)
        a = re.fullmatch(r"\s*(\d+)\s*(?:\(([LIF])\)|([LIF]))?\s*", cell("avail"))
        if not c or "avail" in cols and not a:
            return None
        band = f"{b.group(1)}-{b.group(2)}"
        cost.append((int(b.group(1)), int(b.group(2)), f"{band}: R*{c.group(1).replace(',', '')}"))
        if a:
            avail.append(f"{band}: {a.group(1)}")
            legal.add(a.group(2) or a.group(3) or "")
    if not cost:
        return None
    return (
        f"tier(R; {'; '.join(p for _, _, p in cost)})",
        f"tier(R; {'; '.join(avail)})" if avail else None,
        cost[0][0],
        cost[-1][1],
        legal.pop() if len(legal) == 1 else "",
    )


def stated_items(bs, cat, offset, core=False):
    """The items the books state in prose, by the owner's general rules (2026-10-08):
    - an action: a heading whose first or second sentence is `Spend a Major/Minor Action to …` (Augmentation
      Overdrive), kept as a rule too (a section's forms are actions by sections.py);
    - a sense the text lets the player choose (`select a sense (sight, hearing, touch, taste, or smell)`): each sense an
      entry, the choice the item's;
    - a rule saying a character gains `the X (Y, N) negative quality`: X (Y), granted, 0 Karma, its level not capped;
    - a power named in a power list with its definition in brackets (`Skill (choose one from …)`) and no entry of its
      own: a critter power, the brackets its text and its choices;
    - a heading whose text ends `selected from the list below` and the bold run-ins of the box after it: options of
      that kind (true element focus options, category `True Earth sandcasting`), the heading's rule offering one;
    - `Any piece of armor can have a … applied to it for 100 nuyen`: an accessory of that host (category `Armor
      accessory`), its availability an issue;
    - a section's unpriced item headings its rating-band price table prices (`Explosive Packages`): rated, the tier
      formula their cost, their availability an issue (Conventional, Plastic and Foam Explosives);
    - the core rulebook's magic types and licence types (fixed vocabularies), Fake License choosing one."""
    names = {k: {norm(e["name"]) for e in es} for k, es in cat.entries.items()}

    def add(kind, name, page, attrs, kids=(), text="", cid=None, aliases=()):
        if norm(name) in names[kind] and not cid:
            return None
        names[kind].add(norm(name))
        return cat.add(kind, name, page, attrs, list(kids), text, cid=cid, aliases=aliases)

    def entry(kind, name):
        return next((e for e in cat.entries[kind] if norm(e["name"]) == norm(name)), None)

    for i, b in enumerate(bs):
        page = max(1, b.page - offset)
        text = _flat(re.sub(r"\*\*", "", b.text or ""))
        if (
            b.row is None
            and not b.stats
            and (b.level or 0) >= 3
            and (s := next((s for s in _first_sentences(b.text) if _SPEND.match(s)), None))
        ):
            bare = re.sub(r"\s*\((?:I|A)\)\s*$", "", b.name).strip()
            t = re.search(r"\((I|A)\)\s*$", b.name)  # (its timing: `Zanshin (A)`, anytime)
            if not {norm(bare), norm(b.name)} & names["actions"]:
                add(
                    "actions",
                    bare[:1].upper() + bare[1:],
                    page,
                    {
                        "type": _SPEND.match(s).group(1).lower(),
                        "category": b.section or b.chapter,
                        **({"timing": {"I": "initiative", "A": "anytime"}[t.group(1)]} if t else {}),
                    },
                    (),
                    b.text,
                )
        for m in _GAINS.finditer(text):
            add(
                "qualities",
                f"{m.group(1)} ({m.group(2).strip()})",
                page,
                {"kind": m.group(4), "karma": 0, "granted": "true", "category": m.group(1)},
                (),
                m.group(0),
            )
        for label in ("Powers", "Optional Powers"):
            for it in _items(b.labels.get(label, "")):
                if (
                    p := re.fullmatch(r"([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)\s*[(\[]\s*(choose\b.+?)\s*[)\]]", it)
                ) and norm(p.group(1)) not in names["critterpowers"] | names["adeptpowers"]:
                    add("critterpowers", p.group(1), page, {}, _skill_choices(p.group(2)), p.group(2))
        if (
            _LIST_BELOW.search(text)
            and i + 1 < len(bs)
            and (h := re.fullmatch(r"(\w+?)\s+(?:with|in)\s+(True\s+\w+)", b.name.strip()))
        ):
            # (its box printed under it: in its own text after that sentence, else the next block's)
            body = (b.text or "").splitlines()
            body = body[next((k for k, ln in enumerate(body) if re.search(r"\bbelow\.", ln)), len(body)) :]
            if not any(_RUN_IN.match(ln.strip()) for ln in body):
                body = (bs[i + 1].text or "").splitlines()
            starts = [k for k, ln in enumerate(body) if _RUN_IN.match(ln.strip())]
            if len(starts) >= 2:
                category = (
                    f"{h.group(2)} {h.group(1).lower()}"  # (`Sandcasting with True Earth`: True Earth sandcasting)
                )
                for k, end in zip(starts, starts[1:] + [len(body)]):
                    m = _RUN_IN.match(body[k].strip())
                    para = [m.group(2)] + [ln for ln in body[k + 1 : end] if not ln.startswith("<!--")]
                    add(
                        "trueelements",
                        m.group(1),
                        page,
                        {"category": category},
                        (),
                        _flat("\n".join(para)),
                        cid=slug(f"{category} {m.group(1)}"),
                    )
                if e := entry("rules", b.name):
                    e["children"].append(("choice", {"kind": "trueelement", "category": category, "count": "1"}, None))
        if b.type == "item" and b.row is None and (m := _ANY_HOST.search(text)):
            free = re.search(r"\bdoes\s+not\s+use\s+any\s+capacity\b", text)
            add(
                "armor" if m.group(1) == "armor" else "gear",
                b.name,
                page,
                {
                    "category": f"{m.group(1).capitalize()} accessory",
                    "cost": m.group(2).replace(",", ""),
                    **({"capacity": "0"} if free else {}),
                },
                [("issue", {"field": "avail", "code": "missing", "page": page}, "not printed: a sentence prices it")],
                b.text,
            )
        if b.type == "section" and b.level == 3 and b.name.split() and b.name.split()[-1][:1].isupper():
            sec = [d for d in bs[i + 1 : i + 40] if d.section == b.section and d.chapter == b.chapter]
            # (the band table: its rows printed as one-row boxes, or as a table in the text)
            band = next(
                (
                    (d, t)
                    for d in sec
                    for h, rows in ([(list(d.stats[0]), [list(x.values()) for x in d.stats])] if d.stats else [])
                    + md_tables(d.text)
                    if (t := _band_tier(rows, h))
                ),
                None,
            )
            if band:
                (tb, (tier, avail, lo, hi, legal)), noun = band, b.name.split()[-1]
                stem = noun.lower().rstrip("s")
                for d in sec:
                    if d is tb or d.row is not None or d.stats or d.type != "item":
                        continue
                    first = _first_sentences(d.text, 1)
                    subject = re.split(r"\s(?:is|are)\s", first[0])[0] if first else ""
                    if stem not in subject.lower() and stem not in d.name.lower():
                        continue  # (a detonator cap is used with them, it is none of them)
                    name = d.name if stem in d.name.lower() else f"{d.name} {noun}"
                    dp = max(1, d.page - offset)
                    priced = {"avail": f"By rating ({tb.name})" + (f"({legal})" if legal else "")} if avail else {}
                    add(
                        "weapons",
                        name,
                        dp,
                        {
                            "category": categories.singular(tb.name) or "Explosive",
                            "rating": f"{lo}–{hi}",
                            "cost": f"By rating ({tb.name})",
                            **priced,
                        },
                        [
                            ("formula", {"field": "cost"}, tier),
                            *(
                                [("formula", {"field": "avail"}, avail)]
                                if avail
                                else [
                                    (
                                        "issue",
                                        {"field": "avail", "code": "missing", "page": dp},
                                        "not printed: the packages table prices it",
                                    )
                                ]
                            ),
                        ],
                        d.text,
                        aliases=[d.name] if name != d.name else (),
                    )
        for m in _CHOOSE_SENSE.finditer(text):
            for s in _LIST_SPLIT.split(m.group(1)):
                if s.strip():
                    add("senses", s.strip()[:1].upper() + s.strip()[1:], page, {}, (), m.group(0))
            owner = next(
                (e for k in cat.entries if k != "rules" for e in cat.entries[k] if norm(e["name"]) == norm(b.name)),
                None,
            )
            if owner is not None:
                owner["children"].append(("choice", {"kind": "sense", "count": "1"}, None))
    if core and any(es for k, es in cat.entries.items() if k not in ("magictypes", "licencetypes")):
        for n, p in MAGIC_TYPES:
            add("magictypes", n, p, {})
        for n in LICENCE_TYPES:
            add("licencetypes", n, 273, {})
        if fake := entry("gear", "Fake license"):
            fake["children"].append(("choice", {"kind": "licencetype", "count": "1", "free": "other (L) item"}, None))
