"""The CRB's core tables -> the rules engine's core files (custom/imported/core/<name>.xml, ids unscoped).

Read from the book: every number, most names, pages and the amp types an effect applies to. Kept here as the
app's own vocabulary: ids (the engine and the other recipes name entries by them), the effect categories and
parameters, a few display labels, and the values the book doesn't state (DEFAULTS below, each with its reason).
Entries a book other than the CRB adds (the CG's Tasking and Emerged, DHSA's implant grades) come from those
books' recipes. Descriptions (weapon examples, armor, lifestyle rules) go to the texts, never the core files.

A table the reader can't find or read raises Unreadable: that file is left out and the import report says so
(kind="core-unread"), so a data pack or the AI review can fill it; the other files are still written.
Printed page = PDF page - 2 (crb.PAGE_OFFSET). Pages 50-86 carry the GAME CONCEPTS margin tab.
"""
import re
from xml.sax.saxutils import escape, quoteattr

from importer.recipes import crb
from importer.recipes.common import join_lines, strip_tab
from importer.recipes.dhsa import parts, slug

CONCEPTS = "GAMECONPTS"  # the GAME CONCEPTS margin tab's letters
DECOR = re.compile(r"^\*\*(?:\d+|SHADOWRUN|ANARCHY)\*\*$")  # page numbers and running heads
ATTR_LETTER = {"S": "str", "A": "agi", "W": "wil", "L": "log", "C": "cha"}

# ids the app uses where the book's name would slug differently (the engine, the other recipes and saved runners use these)
IDS = {"vehicles": {"all-terrain-motorbike": "allterrain-motorbike", "suv-pick-up": "suv", "bus-trailer": "bus"},
       "weapons": {"advanced-close-quarter-weapon": "advanced-close-quarter"},
       "armor": {"armored-clothing-with-heavy-coat": "armored-clothes-coat"}}
# the app's weapon groups (the book's table has none; they follow the Ranged Weapons specializations, p.56)
WEAPON_GROUPS = {"Close combat": ("short-weapon", "long-weapon", "advanced-close-quarter"),
                 "Throwing": ("throwing-weapon", "grenade", "gas-grenade"), "Archery": ("bow", "crossbow"),
                 "Pistols": ("taser", "hold-out-pistol", "light-pistol", "machine-pistol", "heavy-pistol"),
                 "Submachine guns": ("submachine-gun",), "Rifles": ("assault-rifle", "shotgun", "sniper-rifle"),
                 "Grenade launchers": ("grenade-launcher",), "Heavy weapons": ("machine-gun", "rocket-launcher")}
# the weapons table's first row: unarmed attacks aren't an item a runner buys
SKIP_WEAPONS = {"unarmed"}
# values the book doesn't state, and why
DEFAULTS = {
    "complexForm": "spell",          # CRB has no technomancers: a stand-in until the CG's import sets its own price (<prices>)
    "refundEffectRemoval": "false",  # pre-0.5.5 ledgers only; the app prices a removal as p.84's replacement with nothing
}

# Shadow Amp effects (pp.58-63): id, category, the book row (regex on its text), app attributes.
# "once": at most one per Amp though the row prints no max (an on/off ability); "label": the app's display name
# where it differs from the row. Rows with app="..." aren't table rows: their values are the app's (reason given).
EFFECTS = [
    ("rr-spec", "risk", r"^Risk Reduction 1 for a specialization", {"param": "spec"}),
    ("rr-skill", "risk", r"^Risk Reduction 1 for a Skill", {"param": "skill"}),
    ("rr-attr", "risk", r"^Risk Reduction 1 for an Attribute", {"param": "attribute"}),
    ("init-1", "initiative", r"^\+1 Edge per action scene, unlimited", {"once": True, "prefix": "Initiative: "}),
    ("init-2", "initiative", r"^\+1 action per narration", {"once": True, "prefix": "Initiative: "}),
    ("init-3", "initiative", r"^\+1 Edge per action scene \(previous", {"once": True, "prefix": "Initiative: "}),
    # the initiative rows' notes (p.61): an Amp limited to one of the N realms listed, a rating reduction per level
    ("init-realm", "initiative", None, {"derive": "realm", "requires": "init-1", "param": "realm",
                                        "label": "Initiative limited to one realm (per level)"}),
    ("dv-plus", "physical", r"^Damage value \+1", {}),
    ("range-improve", "physical", r"^Range improvement", {"param": "text", "label": "Range improvement"}),
    ("armor-plus", "physical", r"^Armor \+1 \(max \+1\)", {}),
    ("wound-light", "physical", r"^Additional light wound box", {}),
    ("wound-serious", "physical", r"^Additional serious wound box", {}),
    ("sustain-spell", "magical", r"^Additional sustained spell", {}),
    ("summon-spirit", "magical", r"^Additional summoned spirit", {}),
    ("weapon-focus", "magical", r"^Weapon focus", {}),  # no max printed, none set (owner, 2026-10-10)
    ("vr-cold", "vr", r"^Cold-sim virtual reality", {"once": True}),
    ("vr-hot", "vr", r"^Hot-sim virtual reality", {"once": True}),
    ("firewall-plus", "matrix", r"^Firewall \+1", {}),
    ("attack-plus", "matrix", r"^Attack \+1", {}),
    ("rcc", "rigging", r"^Rigger command console", {}),
    ("vcr", "rigging", r"^Vehicle control rig", {"once": True}),
    ("pilot-plus", "vehicle", r"^Pilot \+1", {}),
    ("speed-plus", "vehicle", r"^Speed \+1", {}),
    ("handling-plus", "vehicle", r"^Handling \+1", {}),
    ("vehicle-armor", "vehicle", r"^Armor \+1 \(max \+Body\)", {"label": "Armor +1 (max = Body)"}),
    ("fixed", "vehicle", r"^Fixed", {"once": True}),
    ("flying", "vehicle", r"^Flying", {"once": True}),
    ("weapon-mount", "vehicle", r"^Enhanced weapon mount", {"param": "text"}),
    ("safety-override", "vehicle", r"^Pilot safety override", {"once": True}),
    ("extra-drone", "vehicle", r"^Identical additional drone", {}),
    ("auto-medkit", "vehicle", r"^Autonomous medkit", {"once": True, "label": "Autonomous medkit"}),
    ("narrative", "misc", r"^Additional narrative effect", {"param": "text"}),
    ("negative", "misc", r"^Negative effect", {"param": "value", "gmApproval": "true"}),  # "at the game master's discretion" (p.61)
    # armor against spells, astral and biofeedback damage: not a table row, so not a general effect (owner, 2026-10-10).
    # Only what the book prints carries it: the Astral Armor adept power (p.190, priced as it prints it: its rating less
    # the adept base, Armor +1's max) and a cyberdeck's Biofeedback filter (p.211)
    ("mental-armor", "physical", None, {"derive": "mental", "types": "adept cyberdeck",
                                        "label": "Mental armor +1: Astral Armor (adept power) or Biofeedback filter (cyberdeck)"}),
    # the Awakened amp's options (p.58)
    ("awk-astral-perception", "awakened", r"^Astral perception$", {"once": True, "excludes": "awk-astral-projection"}),
    ("awk-astral-projection", "awakened", r"^Astral perception and projection$", {"once": True, "excludes": "awk-astral-perception"}),
    ("awk-sorcery", "awakened", r"^Sorcery$", {"once": True}),
    ("awk-conjuring", "awakened", r"^Conjuring$", {"once": True}),
    ("awk-adept", "awakened", r"^Adept$", {"once": True}),
    # "A shamanic mask is considered a negative effect and reduces the rating of the Awakened Amp by 1" (p.169): a fixed
    # option of the Awakened amp, not one the GM sets (DHSA p.3 lists it so, -5,000¥). Only where the book prints it.
    ("awk-shamanic-mask", "awakened", None, {"derive": "mask", "once": True, "label": "Shamanic mask"}),
]
# "Adept … powers": a wrapped Type cell can have the Reference column's text between its two words
TYPE_WORDS = re.compile(r"All but Awakened|\bAll\b|Qualities|Cyber/Bioware|Cyberware|Adept\b[^,]*?\bpowers|Equipment|Cyberdecks|"
                        r"Vehicles? and\s+drones|\bDrones\b|\bVehicles\b")
TYPE_IDS = {"qualities": ["quality"], "cyber/bioware": ["cyberware", "bioware"], "cyberware": ["cyberware"], "adept": ["adept"],
            "equipment": ["equipment"], "cyberdecks": ["cyberdeck"], "drones": ["vehicle"], "vehicles": ["vehicle"]}


# printed pages of each table: an unread table's report row names its book.md pages (the AI reads only those)
PAGES = {"attributes": (52, 52), "metatypes": (50, 52), "skills": (53, 57), "amptypes": (58, 60), "ampeffects": (58, 63),
         "vehicles": (60, 60), "pricing": (83, 83), "levels": (84, 85), "packages": (86, 86), "weapons": (142, 142), "armor": (148, 148),
         "lifestyles": (165, 166)}


class Unreadable(Exception):
    pass


def _pages(md):
    parts = re.split(r"<!-- page (\d+) -->", md)
    return {int(parts[i]) - crb.PAGE_OFFSET: parts[i + 1] for i in range(1, len(parts), 2)}


def _lines(pages, a, b, tab=CONCEPTS):
    """[(printed page, line)] of pages a..b without the margin tab, page numbers and running heads."""
    return [(p, l) for p in range(a, b + 1) for l in strip_tab(pages.get(p, "").splitlines(), tab) if not DECOR.match(l)]


def _box(md, title):
    box = next(((p, body) for p, t, body in crb.boxes(md) if t.startswith(title)), None)
    if box is None:
        raise Unreadable(f'no "{title}" box')
    return box


def _num(s):
    return int(re.sub(r"[^\d-]", "", s))


def _cap(s):
    return s[:1].upper() + s[1:]


def _text(s):
    return re.sub(r"\s+", " ", s.replace("�", ".").replace("’", "'")).strip()


def _need(rows, what):
    if not rows:
        raise Unreadable(f"no {what} found")
    return rows


# ---------------------------------------------------------------- the tables

def attributes(pages):
    """Attribute descriptions, p.52: "Strength (STR/S) is …"."""
    return _need([{"id": m[2].lower(), "abbr": m[2], "name": m[1], "page": p}
                  for p, l in _lines(pages, 52, 52) if (m := re.match(r"([A-Z][a-z]+) \(([A-Z]{3})/[A-Z]\)", l))], "attributes")


def racial_effects(quality):
    """<effect>s of a Racial Quality (importer/effects.py): Low-light or Thermographic vision negate the dark's
    Disadvantage (CRB p.59)."""
    from importer.recipes.dhsa import Mapper, fx_xml
    return fx_xml(Mapper({}).rules(quality))


def metatypes(pages, attrs):
    """The attribute table, p.52 (ranges and Edge per metatype), and each metatype's Racial Quality, pp.50-51."""
    quality, heading = {}, None
    for _, l in _lines(pages, 50, 51):
        if re.fullmatch(r"[A-Z]{3,}S", l):  # HUMANS, ELVES …
            heading = l
        elif (m := re.match(r"\*\*Racial Quality:\*\* (.+)", l)) and heading:
            quality[heading] = m[1].strip()
    ids, head, out = {a["name"].upper(): a["id"] for a in attrs}, None, []
    for p, l in _lines(pages, 52, 52):
        cells = re.findall(r"[A-Za-z]+|\d+-\d+|\d+", l.replace("*", ""))
        if "EDGE" in cells and all(c in ids or c == "EDGE" for c in cells):
            head = [ids.get(c) for c in cells]
        elif head and len(cells) == len(head) + 1 and cells[0].isalpha() and all(re.fullmatch(r"\d+-\d+", c) for c in cells[1:-1]):
            name = cells[0]
            q = next((q for h, q in quality.items() if h.startswith(name.upper()[:-1])), "")
            ranges = [(a, *c.split("-")) for a, c in zip(head, cells[1:]) if a]
            out.append({"id": name.lower(), "name": name, "edge": cells[-1], "page": p, "ranges": ranges,
                        "quality": "" if q.lower() == "none" else _cap(q)})
    return _need(out, "metatype rows")


def skills(md, pages, attrs):
    """Names, specializations and their attributes from the SKILLS, SPECIALIZATIONS, AND RELATED ATTRIBUTES box (p.54);
    linked attributes, page and who can use it from each Skill's description (pp.53-57)."""
    _, body = _box(md, "SKILLS, SPECIALIZATIONS")
    sheet = [(n, re.findall(r"\s*([^,()]+?) \(\+([SAWLC])", rest)) for n, _, rest in crb.entries(join_lines(body))]
    by_name = {a["name"]: a["id"] for a in attrs}
    lines = _lines(pages, 53, 57)
    heads = sorted((i, n) for i, (_, l) in enumerate(lines) for n, _ in sheet if l == n.upper())
    out = []
    for k, (i, name) in enumerate(heads):
        section = lines[i + 1:heads[k + 1][0] if k + 1 < len(heads) else len(lines)]
        text = " ".join(l for _, l in section)
        j = next((j for j, (_, l) in enumerate(section) if l.startswith("**Linked Attribute:**")), None)
        if j is None:
            raise Unreadable(f"no linked attribute for {name}")
        linked = section[j][1][len("**Linked Attribute:**"):].strip() or section[j - 1][1]  # printed before its label once
        linked = [by_name[w] for w in re.findall(r"[A-Z][a-z]+", linked) if w in by_name]
        req = re.search(r"Only (?:characters with an? )?(\w+)(?: characters)? can use this Skill", text)
        specs = dict(sheet)[name]
        sid = slug(name)
        out.append({"id": sid, "name": name, "attr": linked[0], "alt": linked[-1] if len(linked) > 1 else None,
                    "requires": req[1].lower() if req else None, "page": lines[i][0],
                    "specs": [(f"{sid}.{slug(s.replace('&', ''))}", ATTR_LETTER[a], _cap(s.strip())) for s, a in specs]})
    if len(out) != len(sheet):
        raise Unreadable(f"found {len(out)} of the {len(sheet)} Skills the box lists")
    return _need(out, "skills")


def amptypes(pages):
    """AMP TYPES, pp.58-60: a heading in capitals, then "**Base rating N[ then M][, Essence -x]**"."""
    lines, out = _lines(pages, 58, 60), []
    heads = [(i, l, m) for i, (_, l) in enumerate(lines[:-1]) if re.fullmatch(r"[A-Z][A-Z ]+", l)
             and (m := re.fullmatch(r"\*\*Base rating (\d+)(?: then (\d+))?(?:, Essence -([\d.]+))?\*\*", lines[i + 1][1]))]
    for k, (i, head, m) in enumerate(heads):
        text = join_lines(l for _, l in lines[i + 2:heads[k + 1][0] if k + 1 < len(heads) else len(lines)])
        req = re.search(r"requires the Awakened Amp with the (\w+) option", text)
        out.append({"id": head.split()[0].lower(), "name": _cap(head.lower()), "base": m[1], "after": m[2], "essence": m[3] or "0",
                    "requires": f"awk-{req[1].lower()}" if req else None, "page": lines[i][0]})
    return _need(out, "amp types")


def vehicles(pages):
    """The base vehicle and drone types, p.60: "• **Name:** Pilot P, Body B, Handling H, Speed S (flying F), Armor A, mount"."""
    lines = [l for _, l in _lines(pages, 60, 60) if not l.startswith("|")]
    text = join_lines(lines)
    default = re.search(r"weapon mount for (\w+) weapon", text)
    out = []
    for m in re.finditer(r"•\s*\*\*([^*]+?):\*\*\s*Pilot (\d+), Body (\d+), Handling (\d+), Speed (\d+)(?: \(flying (\d+)\))?, "
                         r"Armor (\d+)([^•]*)", text):
        rest = re.split(r"\.(?:\s|$)", m[8].strip(" ,"))[0].strip(" ,.")
        rest = re.sub(r"Advantage on \w+ \(([^()]+)\) Tests", r"Advantage on \1", rest)  # the short form the mount note uses
        mount = (f"none ({rest[len('no weapon mount'):].strip(' ,')})" if rest.startswith("no weapon mount") else rest) or default[1]
        vid = slug(m[1])
        out.append({"id": IDS["vehicles"].get(vid, vid), "name": m[1], "pilot": m[2], "body": m[3], "handling": m[4], "speed": m[5],
                    "flying": m[6], "armor": m[7], "mount": mount.replace("none ()", "none"), "page": 60})
    return _need(out, "vehicles")


def _effect_rows(pages):
    """[(page, row text, rating, types text)] from the SHADOW AMP EFFECTS table (pp.61-63). Rows come as pipe rows, as
    "name +N" lines, or, where the table's columns came apart, as the section's names and then its "+N types" lines in
    the same order. A section's types (a header cell or its first line) apply to rows that print none."""
    lines = _lines(pages, 61, 63)
    start = next(i for i, (_, l) in enumerate(lines) if l.startswith("| SHADOW AMP EFFECTS"))
    rows, sec = [], None

    def close():
        if sec and sec["groups"]:
            if len(sec["names"]) != len(sec["groups"]):
                raise Unreadable(f"{len(sec['names'])} effects but {len(sec['groups'])} ratings in {sec['title']}")
            rows.extend((p, n, g[0], g[1] or sec["types"]) for (p, n), g in zip(sec["names"], sec["groups"]))
        elif sec:
            rows.extend((p, n, r, t or sec["types"]) for p, n, r, t in sec["rows"])

    notes, last = False, None

    def reference(ref):  # a column's "Title (p. N)" reference, not an effect; a section's first line also gives its types
        if not sec["names"] and not sec["rows"]:
            sec["types"] = sec["types"] or ref
    for p, l in lines[start:]:
        if l.startswith("|---") or "**EFFECT**" in l or "AMP EFFECTS" in l.upper():
            continue
        cells = [c.replace("<br>", " ").strip() for c in l.strip().strip("|").split("|")] if l.startswith("|") else None
        head = re.fullmatch(r"\*\*([^*]+)\*\*", cells[0] if cells else l)
        kind = "other"
        if head:
            close()
            sec = {"title": head[1], "types": cells[2] if cells and len(cells) > 2 else "", "names": [], "groups": [], "rows": []}
            notes = False
        elif sec is None:
            continue
        elif "Notes:" in (cells[0] if cells else l):
            notes = True
        elif cells:
            notes = False
            sec["rows"].append((p, cells[0].replace("↳", "").strip(), cells[1], cells[2] if len(cells) > 2 else ""))
        elif notes:
            continue
        elif l.startswith("(p."):  # the rest of a reference: the line before was its title
            if last == "name":
                reference(sec["names"].pop()[1])
        elif m := re.match(r"^([+-]\d+)\b\s*(.*)", l):
            sec["groups"].append([m[1], m[2]])
        elif sec["groups"]:
            sec["groups"][-1][1] += " " + l  # a rating's types, wrapped
        elif (m := re.fullmatch(r"(.*\S) ([+-]\d+)", l)) and "(" not in l[-4:]:
            sec["rows"].append((p, m[1], m[2], ""))
        elif sec["names"] and sec["names"][-1][1].count("(") > sec["names"][-1][1].count(")"):
            sec["names"][-1] = (sec["names"][-1][0], sec["names"][-1][1] + " " + l)
        else:
            sec["names"].append((p, l))
            kind = "name"
        if sec and sec["names"] and re.search(r"\(p\. \d+\)", sec["names"][-1][1]):
            reference(sec["names"].pop()[1])
        last = kind
    close()
    return rows


def _types(text, all_types):
    out = []
    for w in TYPE_WORDS.findall(text):
        w = "adept" if w.startswith("Adept") else re.sub(r"\s+", " ", w).lower()
        ids = ([t for t in all_types if t != "awakened"] if w == "all but awakened" else all_types if w == "all"
               else ["vehicle"] if w.endswith("and drones") else TYPE_IDS[w])
        out += [t for t in ids if t not in out]
    return out


def ampeffects(pages, types):
    all_types = [t["id"] for t in types]
    rows = [(p, _text(n), r, t) for p, n, r, t in _effect_rows(pages)]
    awk = [(p, _text(m[1]), f"+{m[2]}", "") for p, l in _lines(pages, 58, 58) if (m := re.match(r"• \*\*(.+?):\*\* rating \+(\d+)", l))]
    out = []
    for eid, cat, pattern, a in EFFECTS:
        if a.get("derive") == "realm":  # the book limits this effect to one realm, for a rating reduction per level (read from p.61 below)
            notes = pages.get(61, "")
            realms, cut = re.search(r"realms \(([^)]*)\)", notes), re.search(r"rating reduction of (\d+) for each", notes)
            if not realms or not cut:
                raise Unreadable(f"no notes for the effect {eid}")
            section = next(o for o in out if o["category"] == cat)
            out.append({"id": eid, "category": cat, "name": a["label"], "rating": str(-int(cut[1])), "types": section["types"],
                        "max": str(len(parts(realms[1]))), "requires": a["requires"], "param": a["param"], "page": section["page"]})
            continue
        if a.get("derive") == "mental":
            astral = next(((p, m) for p, t in sorted(pages.items()) if (m := re.search(r"\*\*Astral Armor:\*\* \(Rating (\d+) Adept power Amp", t))), None)
            armor, adept = next((o for o in out if o["id"] == "armor-plus"), None), next((t for t in types if t["id"] == "adept"), None)
            if not astral or not armor or not adept:
                raise Unreadable(f"no Astral Armor power for the effect {eid}")
            out.append({"id": eid, "category": cat, "name": a["label"], "rating": str(int(astral[1][1]) - int(adept["base"])),
                        "types": a["types"], "max": armor["max"], "page": str(astral[0])})
            continue
        if a.get("derive") == "mask":
            mask = shamanic_mask(pages)
            if mask:
                out.append({"id": eid, "category": cat, "name": a["label"], "rating": str(-mask[1]), "types": "awakened",
                            "max": "1", "page": str(mask[0])})
            continue
        row = next(((p, n, r, t) for p, n, r, t in (awk if cat == "awakened" else rows) if re.search(pattern, n)), None)
        if row is None:
            raise Unreadable(f"no row for the effect {eid}")
        p, n, r, t = row
        mx = re.search(r"\(max (?:RR )?\+?(\d+)( drones)?", n)  # "(max 3 drones)": the Amp's drone and 2 more
        req = re.search(r"\((.+?) required\)", n)
        requires = None
        if req and req[1] == "previous level":
            requires = next(o["id"] for o in reversed(out) if o["category"] == cat)
        elif req:
            requires = next((o["id"] for o in out if o.get("book", "").lower().startswith(req[1].split()[0].lower())), None)
        name = a.get("label") or a.get("prefix", "") + re.sub(r"\s*\((?:[^()]*\b(?:max|required)\b[^()]*)\)", "", n).strip()
        out.append({"id": eid, "category": cat, "name": name, "book": n, "rating": str(int(r)),
                    "types": "awakened" if cat == "awakened" else " ".join(_types(t, all_types)),
                    "max": str(int(mx[1]) - 1 if mx[2] else int(mx[1])) if mx else "1" if a.get("once") else None,
                    "requires": requires, "excludes": a.get("excludes"), "param": a.get("param"), "gmApproval": a.get("gmApproval"),
                    "page": str(p)})
        if not out[-1]["types"]:
            raise Unreadable(f"no amp types for the effect {eid}")
    return out


def shamanic_mask(pages):
    """(printed page, the rating it takes off) where the book says a shamanic mask is a negative effect on the Awakened
    amp (p.169, in a box: its lines wrapped with <br>, words hyphenated across them), else None.
    ponytail: "without reaching 0" isn't checked; add a Review error if a GM builds a mask onto a bare Awakened amp."""
    for p, t in sorted(pages.items()):
        m = re.search(r"shamanic mask is considered a negative effect and reduces the rating of the Awakened Amp by (\d+)",
                      re.sub(r"\s+", " ", t.replace("-<br>", "").replace("<br>", " ")))
        if m:
            return p, int(m[1])
    return None


def pricing(pages):
    """The CHARACTER COST CHEAT SHEET, p.83: a label, then its cost lines."""
    lines = _lines(pages, 83, 83)
    start = next((i for i, (_, l) in enumerate(lines) if "CHARACTER COST CHEAT SHEET" in l), None)
    if start is None:
        raise Unreadable("no CHARACTER COST CHEAT SHEET")
    rows, cur = {}, None
    for _, l in lines[start + 1:]:
        for c in (c.strip() for cell in l.strip("|").split("|") for c in cell.split("<br>")):
            if not c or c.startswith("---") or c.startswith("**"):
                continue
            if "¥" in c:
                rows.setdefault(cur, []).append(c)
            else:
                cur = c.split()[0]
    try:
        attr, skill = rows["Attribute"], rows["Skill"]
        first = lambda k: str(_num(re.match(r"[\d,]+", rows[k][0])[0]))  # noqa: E731
        return {"page": 83, "attrPoint": first("Attribute"), "attrLastPoint": str(_num(re.match(r"[\d,]+", next(c for c in attr if "for the last" in c))[0])),
                "skillLow": first("Skill"), "skillLowMax": re.search(r"up to rating (\d+)", skill[0])[1],
                "skillHigh": str(_num(re.match(r"[\d,]+", skill[1])[0])), "spec": first("Specialization"), "knowledge": first("Knowledge"),
                "ampPoint": first("Shadow"), "equipment": first("Equipment"), "weaponStandard": first("Weapon"),
                "weaponSpecialist": first("Expert"), "armorPoint": first("Armor"), "spell": first("Spell")}
    except (KeyError, IndexError, TypeError, StopIteration) as e:
        raise Unreadable(f"the cost cheat sheet: {e}")


def levels(pages):
    """LEVELS OF PLAY, p.85 (the scan starts on p.84, where the section heading can fall): a heading per level, then Nuyen / Attributes / Skills / Risk Reduction bullets."""
    lines = _lines(pages, 84, 85)
    i = next((i for i, (_, l) in enumerate(lines) if l == "LEVELS OF PLAY"), None)
    if i is None:
        raise Unreadable("no LEVELS OF PLAY")
    out, cur = [], None
    for p, l in lines[i + 1:]:
        if l == "POINT ALLOCATION":
            break
        if re.fullmatch(r"[A-Z][A-Z ]+", l) and not l.startswith("**"):
            cur = {"id": l.split()[0].lower(), "name": l.title(), "page": p, "text": ""}
            out.append(cur)
        elif cur:
            cur["text"] += " " + l
    for lv in out:
        t = lv["text"]
        rr = {}
        for n, what in re.findall(r"max (\d)(?: for ([A-Za-z ]+?))?(?:,|$| including)", t[t.index("Risk Reduction:"):]):
            keys = ("rrAttr", "rrSkill", "rrSpec") if not what else [k for w, k in (("Attribute", "rrAttr"), ("Skill", "rrSkill"),
                                                                                    ("specialization", "rrSpec")) if w in what]
            rr.update({k: n for k in keys})
        at = re.search(r"\*\*Attributes:\*\* (none|up to (\d+))", t)
        lv.update(nuyen=str(_num(re.search(r"\*\*Nuyen:\*\* ([\d,]+)", t)[1])), attrAtMax=at[2] or "0",
                  skillCap=re.search(r"\*\*Skills:\*\* max rating (\d+)", t)[1], **rr)
    return _need(out, "levels of play")


def packages(pages, lvls):
    """The three CHARACTER CREATION tables, p.86: one per level, rows Balanced / Magician / Fighter."""
    names = {lv["name"].upper(): lv["id"] for lv in lvls}
    out, level, text, page = [], None, "", 0

    def flush():
        for opt, rest in re.findall(r"\*\*(\w+)\*\*([^*]*)", text):
            m = re.match(r"\s*(\d+) \((none|\d+) at max\) (\d+)(?: \((\d+) at rating 6\))? (\d+) (.*)", rest)
            if not m:
                raise Unreadable(f"the {level} {opt} package")
            other = m[6]
            count = lambda w: (re.search(rf"(\d+) {w}", other) or [0, "0"])[1]  # noqa: E731
            out.append({"id": f"{level}-{opt.lower()}", "level": level, "archetype": opt.lower(), "name": opt,
                        "attrPoints": m[1], "attrAtMax": "0" if m[2] == "none" else m[2], "skillPoints": m[3], "skillsAtSix": m[4] or "0",
                        "ampPoints": m[5], "armor": re.search(r"armor \((\d+)\)", other)[1], "standardWeapons": count("standard weapon"),
                        "specialistWeapons": count("specialist weapon"), "equipment": count("equipment"), "spells": count("spell"), "page": page})
    for p, l in _lines(pages, 86, 86):
        cells = [c.strip() for c in l.strip("|").split("|")]
        head = re.match(r"(.+?) LEVEL", " ".join(c for c in cells if c) + " ")
        if l.startswith("|") and "CREATION" in l and head and head[1].strip() in names:
            flush()
            level, text, page = names[head[1].strip()], "", p
        elif level and "**OPTION**" not in l and not l.startswith("|---"):
            text += " " + " ".join(c.replace("<br>", " ") for c in cells)
    flush()
    return _need(out, "packages")


def weapons(md):
    """The WEAPONS box's table, p.142: "**Name**[**] (examples) DV close short medium long"; a row's examples or DV can
    wrap onto the next line. ** marks a specialist weapon, * one that uses toxins."""
    page, body = _box(md, "WEAPONS")
    i = next((i for i, l in enumerate(body) if l.startswith("WEAPONS DV")), None)
    if i is None:
        raise Unreadable("no weapons table")
    rng = r"(?:OK|Dis\.|Dis�|–|-)"
    rows = []
    for l in body[i + 1:]:
        if l.startswith("* ") or l.startswith("Every weapon"):
            break
        m = re.match(rf"\*\*(.+?)\*\*\s*(\**)\s*(.*?)\s*({rng}(?:\s+{rng}){{3}})$", l)
        if m:
            ex, dv = re.fullmatch(r"(.*?)\s*(\(STR\+\d\)|STR|\d+ \(Anti-|\d+|depends on)", m[3]).groups()
            rows.append({"name": m[1], "marks": m[2], "examples": ex, "dv": dv, "ranges": m[4]})
        elif rows and rows[-1]["examples"].count("(") > rows[-1]["examples"].count(")"):  # the examples go on
            rows[-1]["examples"] += " " + l
        elif rows:  # the DV goes on ("12 (Anti-" / "vehicle 16)", "depends on" / "toxins")
            rows[-1]["dv"] += ("" if rows[-1]["dv"].endswith("-") else " ") + l
    out = []
    for r in rows:
        words = r["name"].split()
        name = " ".join(words[:-1] + [re.sub(r"(?<!s)s$", "", words[-1])])
        wid = slug(name)
        wid = IDS["weapons"].get(wid, wid)
        if wid in SKIP_WEAPONS:
            continue
        dv = re.sub(r"^\((STR\+\d)\)$", r"\1", r["dv"].strip())
        dv = "toxin" if dv.startswith("depends on") else re.sub(r"\((Anti)-\s*", lambda m: "(anti-", dv)
        group = next((g for g, ids in WEAPON_GROUPS.items() if wid in ids), "Other")  # a type this list doesn't know yet
        specialist = "**" in r["marks"]
        examples = _text(r["examples"].strip("()")).replace("*", " (toxins)")
        text = " ".join(x for x in ((_cap(examples) + ".") if examples else "", "Specialist weapon." if specialist else "") if x)
        out.append({"id": wid, "name": name, "dv": dv, "ranges": re.sub(r"\s+", "/", r["ranges"]).replace("–", "-").replace("Dis.", "Dis").replace("Dis�", "Dis"),
                    "category": group, "specialist": "true" if specialist else None, "page": page, "text": text})
    return _need(out, "weapons")


def armor(md):
    """The ARMOR box, p.148: "Name (examples) rating" under the "ARMOR RATING" header; examples can wrap."""
    page, body = _box(md, "ARMOR")
    i = next((i for i, l in enumerate(body) if l == "ARMOR RATING"), None)
    if i is None:
        raise Unreadable("no armor table")
    rows, tab = [], crb.tab_at(page) or ""
    for l in body[i + 1:]:
        if l.startswith("Armor costs"):
            break
        l = re.sub(rf"^[{tab}] (?=[A-Z])", "", l) if tab else l  # a margin letter glued to a row's name ("A Ballistic shield")
        m = re.fullmatch(r"(.+?)\s+\+?(\d+)", l)
        if m:
            rows.append([m[1], m[2]])
        elif rows:
            rows[-1][0] += " " + l
    out = []
    for text, rating in rows:
        m = re.fullmatch(r"([^(]+?)\s*(?:\((.*)\))?", _text(text))
        aid = slug(m[1])
        out.append({"id": IDS["armor"].get(aid, aid), "name": m[1], "armor": rating, "page": page, "text": _cap(m[2] or "")})
    return _need(out, "armor")


def lifestyles(md):
    """The LIFESTYLE box, p.166: "**Name:** description … earns an extra N¥ / N¥ less per run …"."""
    page, body = _box(md, "LIFESTYLE")
    out = []
    for name, _, rest in crb.entries(join_lines(body)):
        m = re.search(r"earns (an extra )?([\d,]+)\s?¥( less)?", rest)
        per = 0 if not m else _num(m[2]) * (-1 if m[3] else 1)
        rules = [s for s in re.split(r"(?<=\.)\s+", _text(rest)) if re.search(r"¥|Advantage|Disadvantage|Edge|default|rules", s)]
        out.append({"id": slug(name), "name": name, "perRun": str(per), "page": page, "text": " ".join(rules)})
    return _need(out, "lifestyles")


# ---------------------------------------------------------------- XML

def _attrs(d):
    return "".join(f" {k}={quoteattr(str(v))}" for k, v in d.items() if v is not None)


def _file(kind, comment, rows):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f"<!-- {comment} Generated by the importer (recipe crb) from the Anarchy 2.0 core rulebook. -->\n"
            f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n' + "\n".join(rows) + "\n</ca2:data>\n")


def _ref(r):
    return {"source": "CRB", "page": r["page"]}


def build(md):
    """(files {name.xml: XML}, texts [(of, id, text)], report rows) for the core files the book lets us read."""
    pages, files, texts, report, got = _pages(md), {}, [], [], {}

    def read(name, fn, *args):
        try:
            got[name] = fn(*args)
        except (Unreadable, AttributeError, IndexError, KeyError, TypeError, ValueError, StopIteration) as e:
            a, b = PAGES[name]
            report.append({"kind": "core-unread", "file": f"{name}.xml", "page": a, "mdPages": f"{a + crb.PAGE_OFFSET}-{b + crb.PAGE_OFFSET}",
                           "problem": f"{type(e).__name__}: {e}"})
        return got.get(name)

    attrs = read("attributes", attributes, pages)
    if attrs:
        read("metatypes", metatypes, pages, attrs)
        read("skills", skills, md, pages, attrs)
    types = read("amptypes", amptypes, pages)
    if types:
        read("ampeffects", ampeffects, pages, types)
    read("vehicles", vehicles, pages)
    read("pricing", pricing, pages)
    lv = read("levels", levels, pages)
    if lv:
        read("packages", packages, pages, lv)
    read("weapons", weapons, md)
    read("armor", armor, md)
    read("lifestyles", lifestyles, md)

    if "attributes" in got:
        files["attributes.xml"] = _file("attributes", "Attributes, CRB p.52.", [
            f'  <attribute{_attrs({"id": a["id"], "abbr": a["abbr"], **_ref(a)})}><name>{escape(a["name"])}</name></attribute>' for a in got["attributes"]])
    if "metatypes" in got:
        files["metatypes.xml"] = _file("metatypes", "Metatype attribute ranges and starting Edge, CRB p.52.", [
            f'  <metatype{_attrs({"id": m["id"], "edge": m["edge"], **_ref(m)})}>\n    <name>{escape(m["name"])}</name>'
            f'<racialQuality>{escape(m["quality"])}</racialQuality>{racial_effects(m["quality"])}\n    '
            + "".join(f'<range{_attrs({"attr": a, "min": lo, "max": hi})}/>' for a, lo, hi in m["ranges"]) + "\n  </metatype>"
            for m in got["metatypes"]])
    if "skills" in got:
        files["skills.xml"] = _file("skills", "Skills, linked Attributes (attr, alt) and specializations, CRB p.53-57.", [
            f'  <skill{_attrs({"id": s["id"], "attr": s["attr"], "alt": s["alt"], "requires": s["requires"], **_ref(s)})}>'
            f'<name>{escape(s["name"])}</name>\n'
            + "".join(f'    <spec{_attrs({"id": i, "attr": a})}>{escape(n)}</spec>\n' for i, a, n in s["specs"]) + "  </skill>"
            for s in got["skills"]])
    if "amptypes" in got:
        files["amptypes.xml"] = _file("amptypes", "Shadow Amp types and base ratings, CRB p.58-60.", [
            f'  <amptype{_attrs({"id": t["id"], "base": t["base"], "baseAfterFirst": t["after"], "essence": t["essence"], "requires": t["requires"], **_ref(t)})}>'
            f'<name>{escape(t["name"])}</name></amptype>' for t in got["amptypes"]])
    if "ampeffects" in got:
        files["ampeffects.xml"] = _file("ampeffects", "Shadow Amp effects, CRB p.58 and p.61-63. max = times one Amp may take it.", [
            f'  <effect{_attrs({k: e.get(k) for k in ("id", "category", "rating", "types", "max", "requires", "excludes", "param", "gmApproval")})}'
            f'{_attrs(_ref(e))}><name>{escape(e["name"])}</name></effect>' for e in got["ampeffects"]])
    if "vehicles" in got:
        files["vehicles.xml"] = _file("vehicles", "Vehicle and drone chassis (base rating 1), CRB p.60.", [
            f'  <vehicle{_attrs({k: v[k] for k in ("id", "pilot", "body", "handling", "speed")})}{_attrs({"flyingSpeed": v["flying"], "armor": v["armor"], "mount": v["mount"], **_ref(v)})}>'
            f'<name>{escape(v["name"])}</name></vehicle>' for v in got["vehicles"]])
    if "pricing" in got:
        p = got["pricing"]
        costs = {k: v for k, v in p.items() if k != "page"}
        costs["complexForm"] = costs[DEFAULTS["complexForm"]]
        costs["refundEffectRemoval"] = DEFAULTS["refundEffectRemoval"]
        files["pricing.xml"] = _file("pricing", "Character cost cheat sheet, CRB p.83; complexForm and refundEffectRemoval are app defaults.",
                                     [f'  <pricing{_attrs({"id": "core", **_ref(p), **costs})}/>'])
    if "levels" in got:
        files["levels.xml"] = _file("levels", "Levels of play, CRB p.85. Caps apply during creation only.", [
            f'  <level{_attrs({k: lv[k] for k in ("id", "nuyen", "attrAtMax", "skillCap", "rrAttr", "rrSkill", "rrSpec")})}{_attrs(_ref(lv))}>'
            f'<name>{escape(lv["name"])}</name></level>' for lv in got["levels"]])
    if "packages" in got:
        keys = ("id", "level", "archetype", "attrPoints", "attrAtMax", "skillPoints", "skillsAtSix", "ampPoints", "armor", "standardWeapons",
                "specialistWeapons", "equipment", "spells")
        files["packages.xml"] = _file("packages", "Creation packages, CRB p.86. Guides only: nuyen may move between categories.", [
            f'  <package{_attrs({k: pk[k] for k in keys})}{_attrs(_ref(pk))}><name>{escape(pk["name"])}</name></package>' for pk in got["packages"]])
    for name, kind, comment in (("weapons", "weapons", "Weapon types, CRB p.142."), ("armor", "armor", "Armor, CRB p.148.")):
        if name in got:
            files[f"{name}.xml"] = _file(kind, comment, [
                f'  <item{_attrs({"id": w["id"], "kind": "weapon" if name == "weapons" else "armor", "specialist": w.get("specialist"), "armor": w.get("armor"), "dv": w.get("dv"), "ranges": w.get("ranges"), "category": w.get("category"), **_ref(w)})}>'
                f'<name>{escape(w["name"])}</name><text></text></item>' for w in got[name]])
            texts += [("items", w["id"], w["text"]) for w in got[name] if w["text"]]
    if "lifestyles" in got:
        files["lifestyles.xml"] = _file("lifestyles", "Lifestyles, CRB p.166. perRun is added to every run's earnings.", [
            f'  <lifestyle{_attrs({"id": s["id"], "perRun": s["perRun"], **_ref(s)})}><name>{escape(s["name"])}</name><text></text></lifestyle>'
            for s in got["lifestyles"]])
        texts += [("lifestyles", s["id"], s["text"]) for s in got["lifestyles"] if s["text"]]
    return files, texts, report
