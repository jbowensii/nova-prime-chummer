"""Daegann's Holostreets Shadow Amps Expanded List (DHSA) -> amps, spells, complex forms, gear, skill specs.

rows() reads the converter's Markdown: "#" section headings, one pipe table per sub-list (first header
cell = subsection, small caps split as "Q UALITIES"), bold names; a cell's lines are <br>-separated or
continue in rows whose name cell is empty. Each amp row is then broken into effects from ampeffects.xml;
lines we can't map become narrative text. The computed rating is reconciled with the printed one:
  - printed > computed: the gap becomes "Additional narrative effect"s, at the core data's rating,
    tagged note="balances printed rating";
  - printed < computed and the text lists a drawback: the gap becomes a book-sanctioned
    "Negative effect", tagged note="book drawback";
  - anything else is a report row (kind="rating-mismatch").
Every entry cites DHSA and its DHSA page, including the core-book amps the list reprints (they are
DHSA's text and numbers; the CRB recipe imports the canon ones). Descriptions go to the texts result.
"""

import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, unescape

from importer import core_file
from importer.recipes import Result
from importer.recipes.amps import (
    Mapper,
    attr,
    core,
    cost_value,
    dv_num,
    effect_rating,
    fx_xml,
    item_effects,
    load_skills,
    non_caster,
    one_init,
    read_amp,
    reconcile,
    slug,
    specialist,
    stated,
    unpriced_rows,
    weapon_base,
)

ID, NAME, PUBLISHER, CANON = "DHSA", "Shadow Amps Expanded List v3.4b", "Daegann (Holostreets)", False


SECTION_TYPE = {
    "QUALITIES": "quality",
    "MAGIC – MENTOR SPIRITS": "quality",
    "MAGIC – ADEPT WAYS": "quality",
    "MAGIC – LOAS": "quality",
    "MAGIC – ADEPT POWERS": "adept",
    "AUGMENTATIONS – CYBERWARE": "cyberware",
    "AUGMENTATIONS – BIOWARE": "bioware",
    "RIGGERS – VEHICLES": "vehicle",
    "RIGGERS – DRONES": "vehicle",
}
EQUIPMENT_SECTIONS = {
    "ARMORY – WEAPONS",
    "ARMORY – ARMORS",
    "VARIOUS EQUIPMENTS",
    "EVERYDAY LIFE",
    "MATRIX – DECKS, MODS & PROGRAMS",
    "MEDTECH – DRUGS",
    "MEDTECH – EQUIPMENT & SERVICES",
    "MAGIC – MAGICAL EQUIPMENT",
    "RIGGERS – RCC",
    "RESONANCE – DATA STRUCTURES",
}
# "Amp +N" rows: add-ons applied to an existing amp of this type
MOD_TARGET = {
    "ARMORY – AMMUNITIONS": "equipment",
    "ARMORY – ACCESSORIES": "equipment",
    "EVERYDAY LIFE": "equipment",
    "RIGGERS – VEHICLE MODS": "vehicle",
    "MATRIX – DECKS, MODS & PROGRAMS": "cyberdeck",
    "AUGMENTATIONS – CYBERWARE": "cyberware",
    "AUGMENTATIONS – BIOWARE": "bioware",
}
VEHICLE_MOD_NAMES = [
    ("safety", "safety-override"),
    ("fixed", "fixed"),
    ("flying", "flying"),
    ("mount", "weapon-mount"),
    ("identical additional drone", "extra-drone"),
    ("medkit", "auto-medkit"),
    ("pilot", "pilot-plus"),
    ("speed", "speed-plus"),
    ("handling", "handling-plus"),
    ("armor", "vehicle-armor"),
]
# a vehicle mod whose name doesn't say what it improves, by its first line ("Improves speed, max +3.")
VEHICLE_MOD_TEXT = [
    (r"improves?\s+(?:the\s+)?pilot\b", "pilot-plus"),
    (r"improves?\s+speed\b", "speed-plus"),
    (r"improves?\s+handling\b", "handling-plus"),
    (r"improves?\s+(?:vehicle\s+)?armor\b", "vehicle-armor"),
]
GRADE_NAMES = {"delta grade": "grade-delta", "omega grade": "grade-omega", "cultivated bioware": "grade-cultivated"}
CONTACT_NAMES = [
    "Contact: part of your network",
    "Contact: reliable in one domain",
    "Contact: several domains",
    "Contact: influential and reliable",
    "Contact: extremely influential",
    "Contact: knows everyone",
    "Contact: knows everyone, strong in one field",
]


# specializations DHSA adds to the core skills: (skill, spec slug, attr, page, name)
DHSA_SPECS = [
    ("athletics", "jumping", "str", 47, "Jumping"),
    ("close-combat", "firearms", "agi", 6, "Firearms"),
    ("influence", "animals", "cha", 5, "Animals"),
    ("influence", "seduction", "cha", 6, "Seduction"),
    ("piloting", "risky-maneuver", "agi", 6, "Risky maneuver"),
    ("sorcery", "enchanting", "wil", 33, "Enchanting"),
]


def dhsa_skills():
    """load_skills plus DHSA's own specs: the reading for the DHSA recipe only (a canon book's import never has them)."""
    skills, specs = load_skills()
    specs.update({(sk, name.lower()): f"{sk}.{s}" for sk, s, _, _, name in DHSA_SPECS})
    return skills, specs


BOLD = re.compile(r"(?<![\w*])\*\*(\S(?:.*?\S)?)\*\*")  # a bold run; "choice**" (footnote mark on a word) is not one
# a wrapped effect line starts lowercase or follows a line ending mid-sentence
CONTINUES = re.compile(r"(?:[,(]|\b(?:and|or|the|a|of))$")


def _unbold(s):
    return BOLD.sub(r"\1", s).strip()


def _cells(line):
    return [c.strip() for c in line.strip()[1:-1].split("|")]


def _head(s):
    """Small caps come out as a capital and the rest: "C LOSE CONTACT" -> "CLOSE CONTACT"."""
    return re.sub(r"\s+\.", ".", re.sub(r"\b([A-Z]) (?=[A-Z])", r"\1", s)).strip()


def rows(md):
    """Table rows as {page, section, subsection, name, type, cost, effects[], added}. A bold line in the
    name column starts a row, a plain one continues its name. Columns: name, type, cost (+ DV and
    threshold columns, joined), range/armor (lead the effects, as the PDF reader had them), effects.
    `added` (printed in rust) isn't in the Markdown: None."""
    out, page, section, cur, cols, lines = [], 0, "", None, None, md.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"<!-- page (\d+) -->", line)
        if m:
            page = int(m.group(1))
        elif line.startswith("# "):
            section = line[2:].strip()
        elif not line.startswith("|"):
            cols = None
        # every table (so every page a list runs onto) repeats the header row; column roles come from it
        elif i + 1 < len(lines) and lines[i + 1].startswith("|---"):  # header row
            head = [_head(c).replace(" ", "").upper() for c in _cells(line)]
            cols = (
                ["name"]
                + [
                    ("type" if h in ("TYPE", "RATING") else "pre" if h in ("RANGE", "ARMOR") else "cost")
                    for h in head[1:-1]
                ]
                + ["effects"]
            )
            sub = _head(_cells(line)[0])
        elif cols and not line.startswith("|---"):
            cells = dict.fromkeys(("type", "cost"), "")
            pre, effects, first = [], [], None
            for role, c in zip(cols, _cells(line)):
                parts = [p for p in c.split("<br>") if p.strip()]
                if role == "name":
                    for p in parts:
                        if re.match(r"(•\s*)?\*\*(?!\*)", p):
                            cur = {
                                "page": page,
                                "section": section,
                                "subsection": sub,
                                "name": _unbold(p),
                                "type": "",
                                "cost": "",
                                "effects": [],
                                "added": None,
                            }
                            out.append(cur)
                            first = first or cur
                        elif cur:
                            cur["name"] += " " + _unbold(p)
                elif role in ("type", "cost"):
                    cells[role] = " ".join(filter(None, [cells[role], *map(_unbold, parts)]))
                else:
                    (pre if role == "pre" else effects).extend(_unbold(p) for p in parts)
            r = first or cur
            if r is None:
                continue
            for k in ("type", "cost"):
                r[k] = " ".join(filter(None, [r[k], cells[k]]))
            for t in pre + effects:
                if r["effects"] and (t[:1].islower() or CONTINUES.search(r["effects"][-1])):
                    r["effects"][-1] += " " + t
                else:
                    r["effects"].append(t)
    return out


def match(meta, md_head):
    return 0.9 if re.search(r"daegann", md_head, re.I) and re.search(r"shadow amps base", md_head, re.I) else 0.0


# an effect given by reference: "like an elf", "acts exactly the same way as a mana bolt", "treat this ability as a Detect
# Magic spell" name another entry (or a metatype) whose effects this one has
REFERENCE = re.compile(
    r"\b(?:identical to|(?:exactly )?the same (?:way )?as|as per|(?P<like>like)|treat (?:this|it) (?:ability )?as)\s+"
    r"(?:an?\s+|the\s+)?(?P<name>[A-Za-z][\w' -]{2,40}?)(?=\s*(?:[.,;:(]|$|\s+(?:spell|amp|quality|casted|with)\b))",
    re.I,
)
_EFFECT = re.compile(r"<effect [^>]*/>")
_NO_REF = ("narrative", "negative")


def _key(name):
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"^(?:spell|cf|gear)-", "", name.lower()))


def link_references(lines, texts, source, others=()):
    """Effects given by reference, in place: an entry line of `lines` (an <amp> or <item> of this book) whose text
    (`texts`, by id) names another entry of `lines` or of `others` ([(id, name, effects XML)], the core metatypes) gets
    that entry's effects (their narrative ones aside), each with from="<its id>" (this book's ids scoped by `source`).
    A name that finds nothing, or finds an entry without effects, adds nothing."""
    pre = source.lower() + "."
    index, plain = {}, {_key(name) for _, name, _ in others}  # "like" names a metatype ("like an elf"), never an entry
    for i, line in enumerate(lines):
        m = re.match(r'\s*<(?:amp|item) id="([^"]+)"[^>]*><name>([^<]*)</name>', line)
        if m:
            index.setdefault(_key(m.group(2)), (pre + m.group(1), "".join(_EFFECT.findall(line)), i))
    for oid, name, fx in others:
        index.setdefault(_key(name), (oid, fx, None))
    for i, line in enumerate(lines):
        m = re.match(r'\s*<(?:amp|item) id="([^"]+)"', line)
        text = texts.get(m.group(1), "") if m else ""
        ref = REFERENCE.search(text)
        hit = (
            index.get(_key(ref.group("name")))
            if ref and (not ref.group("like") or _key(ref.group("name")) in plain)
            else None
        )
        if not hit or hit[2] == i:
            continue
        add = "".join(
            e.replace("/>", f' from="{hit[0]}"/>')
            for e in _EFFECT.findall(hit[1])
            if re.search(r'ref="([^"]+)"', e).group(1) not in _NO_REF and " from=" not in e and e not in line
        )
        if add:
            at = line.find("<narrative>") if "<narrative>" in line else line.find("<text>")
            lines[i] = line[:at] + add + line[at:]


def core_metatypes():
    """[(id, name, effects XML)] of the core metatypes in use, for link_references ("like an elf")."""
    try:
        root = ET.parse(core_file("metatypes.xml")).getroot()
    except Exception:  # no core yet
        return []
    return [
        (m.get("id"), m.findtext("name") or "", fx_xml(Mapper({}).rules(m.findtext("racialQuality") or "")))
        for m in root
        if m.tag == "metatype"
    ]


def clean_name(name):
    name = re.split(
        r"\s+\*\s|\s+Note:|\s\* The|\s\* These|\s\* Contacts|\s\* Loas|\s\* Anthropomorphic|\s\* An anthro", name
    )[0]
    return re.sub(r"\s+", " ", name).strip(" *")


def merge_wrapped(rows):
    out = []
    for r in rows:
        if not r["type"] and not r["cost"] and out and out[-1]["section"] == r["section"]:
            out[-1]["name"] += " " + r["name"]
            out[-1]["effects"] += r["effects"]
            continue
        out.append(r)
    return out


def printed(rtype):
    m = re.match(r"Amp\s*([+-]?\d+)", rtype or "")
    return int(m.group(1)) if m else None


# Levels (owner, 2026-10-11: an entry the book prints with several levels is one catalog entry per level, otherwise
# duplicates of one another). The book prints a level range three ways: an add-on "+1 ... max +N" (or, with no number,
# the core effect table's max for its one effect), "can be taken up to level N", and a rating that "can be increased by
# 1 (max +N) for an additional Amp point" (once per such sentence: a threshold and a maglock rating add up).
_MAX_PLUS = re.compile(r"\bmax(?:imum)?(?:\s+improvement)?\s*\+\s*(\d+)", re.I)
_MAX_OPEN = re.compile(r"\bmax(?:imum)?(?:\s+improvement)?\s*\+\s*(?!\d)\w+", re.I)
_UP_TO_LEVEL = re.compile(r"\bup to level (\d+)", re.I)
_PER_POINT = re.compile(r"increased by 1 \(max \+(\d+)\) for an? (?:additional|extra) Amp point", re.I)
# "Improves home-automation host's Firewall by +1 (max rating 5)", its table printing each lifestyle's "Firewall rating is 2"
_MAX_RATING = re.compile(r"\b(\w+) by \+1 \(max rating (\d+)\)", re.I)


def level_range(text, rating, mod, refs=(), open_top=False, table=""):
    """(low, high): the levels the book prints for an entry, as its rating (an add-on: how many times it is taken), or
    None when it prints one. A range with no top level (a rating "3+" with "each additional rating", an add-on's "max
    +Body") is a str saying so: not split, for the import report. `table`: the text of the entry's table, where an
    add-on raising a rating "(max rating N)" finds the lowest rating it starts from (it goes up to N from there)."""
    text = re.sub(r"\s+", " ", text)
    if mod:
        r = _MAX_RATING.search(text)
        starts = (
            [
                int(n)
                for n in re.findall(rf"\b{re.escape(r.group(1))} rating is (\d+)", re.sub(r"\s+", " ", table), re.I)
            ]
            if r
            else []
        )
        if starts and int(r.group(2)) - min(starts) > 1:
            return (1, int(r.group(2)) - min(starts))
        m = _MAX_PLUS.search(text)
        # "Max 3 identical drones": the core table's max for its one effect (2 more drones)
        bare = not m and len(set(refs)) == 1 and re.search(r"\bmax\b", text, re.I)
        top = int(m.group(1)) if m else core()["maxes"].get(refs[0], 1) if bare else 1
        if top > 1:
            return (1, top)
        return "a maximum that depends on the vehicle" if _MAX_OPEN.search(text) else None
    m = _UP_TO_LEVEL.search(text)
    if m and int(m.group(1)) > rating:
        return (rating, int(m.group(1)))
    extra = sum(int(n) for n in _PER_POINT.findall(text))
    if extra:
        return (rating, rating + extra)
    return "a rating with no top level" if open_top and re.search(r"each additional rating", text, re.I) else None


def level_id(family, level):
    """A new level's id: its family's (the id the entry had before it was split) and the level. The lowest level keeps
    the family id itself (owner, 2026-10-11: edits, runners and links made on the old entry stay on it)."""
    return f"{family}-level-{'minus-' if level < 0 else ''}{abs(level)}"


def alternative_rules(md):
    """[(id, name, page, text)]: the book's alternative rules, the seeds of the app's Table rules (a GM switches them on; off by
    default). One so far: the footnote under the LIFESTYLES table, lifestyle Amps in place of the core rulebook's lifestyle
    rules, with the page it is printed on."""
    out, page, lines = [], 0, md.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"<!-- page (\d+) -->", line)
        if m:
            page = int(m.group(1))
        elif re.match(r"\*?\s*These Amps are an alternative to the core rulebook", line):
            para = []
            for l in lines[i:]:  # the paragraph runs to a blank line or the next table, heading or page
                if not l.strip() or l.startswith(("|", "#", "<!--")):
                    break
                para.append(l.lstrip("* ").strip())
            out.append(
                ("optional-lifestyle-amps", "Lifestyle Amps in place of the core lifestyle rules", page, " ".join(para))
            )
    return out


def extract(md, ctx=None):
    rs = rows(md)
    for r in rs:  # DHSA v3.2 mixes '-' and '–' in headings; v3.4 uses '–'
        r["section"] = r["section"].replace(" - ", " – ")
    skills, specs = dhsa_skills()
    mapper = Mapper(specs)
    amps, gear, spells, forms, report, ids, grades = [], [], [], [], [], set(), []
    texts = []  # book descriptions: the texts result, never the overlay files

    def private(of, eid, s):
        s = (s or "").strip()
        if s:
            texts.append(f'  <text of="{of}" id="{eid}">{escape(s)}</text>')
        return ""  # the overlay keeps an empty element

    def uid(base):
        i, s = 1, base
        while s in ids:
            i += 1
            s = f"{base}-{i}"
        ids.add(s)
        return s

    def mismatch(aid, page, atype, rating, computed, r):
        report.append(
            {
                "kind": "rating-mismatch",
                "id": aid,
                "page": page,
                "type": atype,
                "printed": rating,
                "computed": computed,
                "effects": " // ".join(r["effects"])[:160],
            }
        )

    def amp_xml(aid, atype, rating, page, name, item, fx, narrative, vehicle=None, mod=False, family=None, level=None):
        amps.append(
            f'  <amp id="{aid}" type="{atype}" printedRating="{rating}"{attr("vehicle", vehicle)}{" mod=\"true\"" if mod else ""}'
            f'{attr("family", family)}{attr("level", level)} source="{ID}" page="{page}">'
            f'<name>{escape(name)}</name>{item}{fx_xml(fx)}<narrative>{private("amps", aid, " ".join(narrative))}</narrative></amp>'
        )

    def emit(aid, atype, rating, page, name, item, fx, narrative, rng, vehicle=None, mod=False):
        """The amp, or one amp per level when the book prints a range (level_range): `<family>-level-<n>`, family = aid,
        named "<Name> <n>" ("<Name> +<n>" for an add-on). A level above the printed rating adds that many "Additional
        narrative effect"s (the book's price for it); an add-on's level is the add-on taken that many times."""
        if isinstance(rng, str):
            report.append(
                {
                    "kind": "levels-open",
                    "id": aid,
                    "page": page,
                    "problem": f"{rng}: one entry, the player sets its level",
                }
            )
        if not isinstance(rng, tuple):
            amp_xml(aid, atype, rating, page, name, item, fx, narrative, vehicle, mod)
            return
        sign = -1 if rating < 0 else 1
        for n in range(rng[0], rng[1] + 1):
            if mod:
                level, fx_n, rating_n, name_n = sign * n, fx * n, rating * n, f"{name} {sign * n:+d}"
            else:
                more = [("narrative", "", None, "balances printed rating")] * (
                    (n - rating) // max(1, effect_rating("narrative"))
                )
                level, fx_n, rating_n, name_n = n, fx + more, n, f"{name} {n}"
            # the lowest level keeps the entry's id (its edits and the runners holding it stay on it), the others are new
            lid = aid if n == rng[0] else uid(level_id(aid, level))
            amp_xml(lid, atype, rating_n, page, name_n, item, fx_n, narrative, vehicle, mod, family=aid, level=level)
        report.append({"kind": "levels", "id": aid, "page": page, "levels": f"{rng[0]}-{rng[1]}"})

    def map_lines(lines):
        """(effects, narrative lines): a line's rated effects (with how it turns them on), else the line stays narrative and
        adds the narrative effect kinds it states (rating 0)."""
        fx, narrative, kinds, entry = [], [], [], " ".join(lines)
        for line in lines:
            if line.strip() in ("", "-") or line.lower().startswith("choose"):
                narrative.append(line)
                continue
            clean = re.sub(r"^(Smartgun|Dismountable|Gyro mount|Head-seeker): ", "", line.lstrip("- "))
            mapped = mapper.effects(clean)
            if mapped is None:
                narrative.append(line)
                kinds += mapper.rules(clean, entry)
            else:
                fx.extend(stated(mapped, clean, entry))
        return fx + kinds, narrative

    # ---- spells: an empty-type row is a sibling spell sharing the previous row's rules (Confusion/Blind/Stink)
    spell_rows, prev = [], None
    for r in rs:
        if r["section"] != "MAGIC – SPELLS":
            continue
        if r["type"].startswith("Manip "):
            r = {**r, "type": "Manipulation " + r["type"][6:]}
        if r["type"][:1].isupper():
            prev = dict(r)
            spell_rows.append(prev)
        elif prev and not r["type"] and len(r["name"]) < 40:
            prev["effects"] = prev["effects"] + r["effects"]
            spell_rows.append({**r, "type": prev["type"], "cost": prev["cost"], "shared": prev})
    for r in spell_rows:
        base = r.get("shared", r)
        name = clean_name(r["name"])
        text = f'{base["type"]}. Threshold/target: {base["cost"]}. ' + " ".join(base["effects"])
        sid = uid("spell-" + slug(name))
        spells.append(
            f'  <item id="{sid}" kind="spell" category="{escape(base["type"].split()[0].lower())}" source="{ID}" page="{r["page"]}">'
            f'<name>{escape(name)}</name>{fx_xml(item_effects(mapper, " ".join(base["effects"]), "S" in base["type"], spell=True))}<text>{private("items", sid, text[:300])}</text></item>'
        )

    # ---- complex forms (technomancers; DHSA, following the Conversion Guide's rules): type = duration, cost = threshold
    for r in rs:
        if r["section"] != "RESONANCE – COMPLEX FORMS" or not re.fullmatch(r"I/S|S|I|P", r["type"]):
            continue
        name, dur = clean_name(r["name"]), r["type"]
        cid = uid("cf-" + slug(name))
        text = f"{dur}. Threshold: {r['cost']}. " + " ".join(r["effects"])
        forms.append(
            f'  <item id="{cid}" kind="complex-form" category="{"sustained" if "S" in dur else "instant"}" source="{ID}" page="{r["page"]}">'
            f'<name>{escape(name)}</name>{fx_xml(item_effects(mapper, " ".join(r["effects"]), "S" in dur, spell=True))}<text>{private("items", cid, text[:300])}</text></item>'
        )

    # ---- contacts: rated templates (CONTACTS section)
    contact_rows = [r for r in rs if r["section"] == "CONTACTS" and printed(r["type"]) is not None]
    for i, r in enumerate(contact_rows):
        rating = printed(r["type"])
        text = " ".join(r["effects"]).replace("**", "")
        fx = []
        for m in re.finditer(r"RR\s*\d\s*Network(?:\s*\([^)]*\))?", text):
            fx += mapper.effects(m.group(0)) or []
        narrative = [re.split(r"\s*RR\s*\d", text)[0]]
        reconcile(fx, [], core()["base"]["contact"], rating)
        cname = CONTACT_NAMES[i] if i < len(CONTACT_NAMES) else f"Contact (rating {rating})"
        amp_xml(uid(slug(cname)), "contact", rating, r["page"], cname, "", fx, narrative)

    for r in merge_wrapped(rs):
        sec = r["section"]
        name = clean_name(r["name"])
        if sec in ("MAGIC – SPELLS", "RESONANCE – COMPLEX FORMS", "CONTACTS", "SHADOW AMPS BASE"):
            continue
        rating = printed(r["type"])
        effects_lines = list(r["effects"])
        page = r["page"]

        # ---- add-on mods ("Amp +N"): applied to an existing amp in the Amp Builder
        if r["type"].startswith(("Amp +", "Amp -")) and rating is not None:
            target = MOD_TARGET.get(sec)
            low = name.lower()
            if sec == "AUGMENTATIONS – CYBERWARE" and "bioware" in low:
                target = "bioware"
            if not target:
                continue
            grade = next((v for k, v in GRADE_NAMES.items() if k in low), None)
            if grade:
                ess = re.search(r"(?:reduced|increases) from ([\d.]+) to ([\d.]+)", " ".join(effects_lines))
                if ess:  # the grade itself, an effect added to the core ones: it changes the amp's Essence cost
                    note = ", social Disadvantage" if "Disadvantage" in " ".join(effects_lines) else ""
                    grades.append(
                        {
                            "id": grade,
                            "rating": rating,
                            "types": target,
                            "page": page,
                            "essence": float(ess[2]) - float(ess[1]),
                            "name": f"{name} (Essence {ess[1]} → {ess[2]}{note})",
                        }
                    )

            def read_mod():
                ref = (
                    (
                        next((v for k, v in VEHICLE_MOD_NAMES if k in low), None)
                        or next(
                            (v for k, v in VEHICLE_MOD_TEXT if effects_lines and re.match(k, effects_lines[0], re.I)),
                            None,
                        )
                    )
                    if sec == "RIGGERS – VEHICLE MODS"
                    else None
                )
                if grade:
                    fx, narrative = [(grade, None, None, None)], effects_lines
                elif ref:
                    fx, narrative = [(ref, None, None, None)] * (
                        rating if ref in ("pilot-plus", "speed-plus", "handling-plus", "vehicle-armor") else 1
                    ), effects_lines
                else:
                    fx, narrative = map_lines(effects_lines)
                    fx = one_init(fx)
                return (
                    fx,
                    narrative,
                    reconcile(
                        fx, narrative, 0, rating, negative_ok=rating < 0, ratings={grade: rating} if grade else None
                    ),
                )

            fx, narrative, computed = read_amp(mapper, read_mod, rating)
            aid = uid("mod-" + slug(name))
            if computed != rating:
                mismatch(aid, page, f"mod ({target})", rating, computed, r)
            table = " ".join(e for x in rs if x["section"] == sec for e in x["effects"])
            emit(
                aid,
                target,
                rating,
                page,
                name,
                "",
                fx,
                narrative,
                level_range(" ".join(r["effects"]), rating, True, [f[0] for f in fx], table=table),
                mod=True,
            )
            report.extend(unpriced_rows(aid, page, fx))
            continue

        if sec not in SECTION_TYPE and sec not in EQUIPMENT_SECTIONS:
            continue
        cost = cost_value(r["cost"])
        if rating is None:  # plain equipment, not an amp
            if (
                sec in EQUIPMENT_SECTIONS
                and r["type"].startswith("Equipment")
                and sec not in ("ARMORY – WEAPONS", "ARMORY – ARMORS")
            ):
                gid = uid("gear-" + slug(name))
                gear.append(
                    f'  <item id="{gid}" kind="gear" category="{escape(r["subsection"].title())}" source="{ID}" page="{page}">'
                    f'<name>{escape(name)}</name>{fx_xml(item_effects(mapper, " ".join(effects_lines)))}<text>{private("items", gid, " ".join(effects_lines)[:240])}</text></item>'
                )
                # gear whose rating "can be increased by 1 (max +N) for an additional Amp point": its levels are Equipment amps
                rng = level_range(" ".join(effects_lines), 0, False)
                if isinstance(rng, tuple):
                    emit(
                        uid(slug(name)),
                        "equipment",
                        0,
                        page,
                        name,
                        '<item kind="gear"/>',
                        [],
                        effects_lines,
                        (1, rng[1]),
                    )
            continue

        atype = SECTION_TYPE.get(sec, "equipment")
        deck = next((m for e in effects_lines for m in [re.search(r"Firewall (\d)\s*-\s*Attack (\d)", e)] if m), None)
        if sec == "MATRIX – DECKS, MODS & PROGRAMS" and deck:
            atype = "cyberdeck"
            effects_lines = [e for e in effects_lines if not re.search(r"Firewall \d\s*-\s*Attack \d", e)]
        item, vehicle, vfx = "", None, []
        if atype == "equipment":
            if sec == "ARMORY – WEAPONS":
                parts = r["cost"].split("¥", 1)
                dv = parts[1].strip() if len(parts) > 1 else ""
                rng = effects_lines.pop(0) if effects_lines and re.match(r"^[-–A-Za-zé ]+/", effects_lines[0]) else ""
                rng = rng.replace(" ", "").replace("–", "-").replace("Dés", "Dis")
                item = f'<item kind="weapon"{attr("specialist", "true" if specialist(cost, rating) else "")}{attr("dv", dv)}{attr("ranges", rng)}/>'
                bdv, brng = weapon_base(name, r["subsection"])
                a, b = dv_num(dv.split()[0] if dv else ""), dv_num(bdv)
                if a and b and a[0] == b[0] and a[1] > b[1]:
                    vfx += [("dv-plus", None, None, None)] * (a[1] - b[1])
                if brng and rng and rng != brng:
                    vfx.append(("range-improve", f"{brng} -> {rng}", None, None))
            elif sec == "ARMORY – ARMORS" and effects_lines and re.fullmatch(r"\+?\d", effects_lines[0].strip()):
                a = effects_lines.pop(0).strip()
                if a.startswith("+"):
                    effects_lines.insert(0, "Armor +1")
                    item = '<item kind="gear"/>'
                else:
                    item = f'<item kind="armor" armor="{int(a)}"/>'
            else:
                item = '<item kind="gear"/>'
        if atype == "vehicle" and effects_lines:
            m = re.search(r"Pilot (\d+), Body (\d+), Handling (\d+), Speed (\d+), Armor (\d+)", effects_lines[0])
            if m:
                effects_lines.pop(0)
                p, b, h, s, a = map(int, m.groups())
                flying = any("flying" in e.lower() for e in effects_lines)
                ground = s // 2 if flying else s
                chassis = core()["chassis"]
                vehicle = min(
                    chassis,
                    key=lambda c: abs(chassis[c][0] - b) * 3 + abs(chassis[c][1] - h) + abs(chassis[c][2] - ground),
                )
                cb, ch, cs = chassis[vehicle]
                vfx = [("pilot-plus", None, None, None)] * max(0, p - core()["pilot"][vehicle]) + [
                    ("vehicle-armor", None, None, None)
                ] * a
                vfx += [("handling-plus", None, None, None)] * max(0, h - ch) + [
                    ("speed-plus", None, None, None)
                ] * max(0, ground - cs)
                if flying:
                    vfx.append(("flying", None, None, None))
                    effects_lines = [e for e in effects_lines if e.strip().lower() != "flying"]
        if atype == "cyberdeck" and deck:
            vfx = [("firewall-plus", None, None, None)] * (int(deck.group(1)) - 1) + [
                ("attack-plus", None, None, None)
            ] * int(deck.group(2))

        def read():
            fx, narrative = map_lines(effects_lines)
            fx = vfx + fx
            refs = [f[0] for f in fx]
            for lvl, pre in (("init-3", "init-2"), ("init-2", "init-1"), ("vr-hot", "vr-cold")):
                if lvl in refs and pre not in refs:
                    fx.insert(0, (pre, None, None, None))
                    refs.insert(0, pre)
            if any(l.lower().startswith("choose two rr") for l in effects_lines):  # mentor spirits / adept ways
                fx = [f for f in fx if f[0] != "rr-spec"] + [("rr-spec", "", None, "choose from the list")] * 2
            fx = one_init(fx)
            return fx, narrative, reconcile(fx, narrative, core()["base"][atype], rating)

        fx, narrative, computed = read_amp(mapper, read, rating)
        aid = uid(slug(name))
        if computed != rating:
            mismatch(aid, page, atype, rating, computed, r)
        emit(
            aid,
            atype,
            rating,
            page,
            name,
            item,
            fx,
            narrative,
            level_range(" ".join(r["effects"]), rating, False, open_top=r["type"].strip().endswith("+")),
            vehicle,
        )
        report.extend(unpriced_rows(aid, page, fx))
        nc = non_caster(" ".join(r["effects"]), fx)
        if nc:
            vfx, vid = list(nc[1]), uid(slug(name) + "-non-caster")
            computed = reconcile(vfx, [], core()["base"][atype], nc[0])
            if computed != nc[0]:
                mismatch(vid, page, atype, nc[0], computed, r)
            amp_xml(vid, atype, nc[0], page, f"{name} (non-caster)", item, vfx, narrative, vehicle)

    text_of = {
        m.group(1): unescape(m.group(2)) for t in texts for m in [re.search(r'id="([^"]+)">(.*)</text>', t)] if m
    }
    entries = amps + spells + forms + gear
    link_references(entries, text_of, ID, core_metatypes())
    amps, spells, forms, gear = (
        entries[: len(amps)],
        entries[len(amps) : len(amps) + len(spells)],
        entries[len(amps) + len(spells) : len(amps) + len(spells) + len(forms)],
        entries[len(amps) + len(spells) + len(forms) :],
    )

    # DHSA's specs, added to the shipped skills (the loader appends an imported skill's specs to the base one)
    added = {}
    for sk, s, a, p, n in DHSA_SPECS:
        added.setdefault(sk, (p, []))[1].append(
            f'<spec id="{sk}.{s}" attr="{a}" source="{ID}" page="{p}">{escape(n)}</spec>'
        )
    skill_xml = [
        f'  <skill id="{sk}" attr="{skills[sk][1]}" source="{ID}" page="{p}"><name>{escape(skills[sk][0])}</name>{"".join(sp)}</skill>'
        for sk, (p, sp) in added.items()
    ]
    report += [{"kind": "unresolved-spec", "spec": s} for s in sorted(set(mapper.unresolved))]
    rules = []
    for oid, rname, rpage, rtext in alternative_rules(md):
        rules.append(
            f'  <rule id="{oid}" sheet="optional" section="Optional rule" source="{ID}" page="{rpage}">'
            f'<title>{escape(rname)}</title><text>{private("rules", oid, rtext)}</text></rule>'
        )

    def data(kind, comment, entries):
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f"<!-- {comment} Generated by the importer (recipe dhsa) from Daegann's Holostreets Shadow Amps Expanded List. -->\n"
            f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n'
            + "\n".join(entries)
            + "\n</ca2:data>\n"
        )

    files = {
        "amps.xml": data(
            "amps", 'Prebuilt Shadow Amps and add-on mods (mod="true"); texts in custom/texts/dhsa.xml.', amps
        ),
        "spells.xml": data("spells", "Spells.", spells),
        "complexforms.xml": data(
            "complexforms",
            "Technomancer complex forms (price: the core pricing, or the Conversion Guide when imported).",
            forms,
        ),
        "gear.xml": data(
            "gear", "Plain equipment (not Amps), at the equipment price unless the GM says otherwise.", gear
        ),
        "skills.xml": data("skills", "Specializations DHSA adds to the core skills.", skill_xml),
    }
    if rules:
        files["rules-optional.xml"] = data(
            "rules", "The book's alternative rules (the app's Table rules); texts in custom/texts/dhsa.xml.", rules
        )
    if grades:  # grades of one amp type are alternatives: each excludes the others
        files["ampeffects.xml"] = data(
            "ampeffects",
            "Implant grades DHSA adds to the core Amp effects.",
            [
                f'  <effect id="{g["id"]}" category="grade" rating="{g["rating"]}" types="{g["types"]}" max="1"'
                + "".join(f' excludes="{o["id"]}"' for o in grades if o["types"] == g["types"] and o is not g)
                + f' essence="{g["essence"]:g}" source="{ID}" page="{g["page"]}"><name>{escape(g["name"])}</name></effect>'
                for g in grades
            ],
        )
    return Result(
        files=files,
        texts=data("texts", "PRIVATE: book text. Do not commit.", texts),
        report=report,
        source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON},
    )
