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
import functools
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from importer import core_dir, core_file, custom_dir, mechanics_roots
from importer.recipes import Result

ID, NAME, PUBLISHER, CANON = "DHSA", "Shadow Amps Expanded List v3.4b", "Daegann (Holostreets)", False

SKILLS = {
    "athletics": "athletics", "close combat": "close-combat", "conjuring": "conjuring",
    "cracking": "cracking", "electronics": "electronics", "engineering": "engineering",
    "influence": "influence", "network": "network", "perception": "perception",
    "piloting": "piloting", "ranged weapons": "ranged-weapons", "sorcery": "sorcery",
    "stealth": "stealth", "survival": "survival", "tasking": "tasking",
}
ATTRS = {"strength": "str", "agility": "agi", "willpower": "wil", "logic": "log", "charisma": "cha"}
SPEC_ALIASES = {
    ("ranged-weapons", "pistol"): "pistols", ("ranged-weapons", "smg"): "submachine-guns",
    ("ranged-weapons", "smgs"): "submachine-guns", ("ranged-weapons", "rifle"): "rifles",
    ("ranged-weapons", "assault rifles"): "rifles", ("ranged-weapons", "assault rifle"): "rifles",
    ("ranged-weapons", "sniper rifles"): "rifles", ("ranged-weapons", "gr. launchers"): "grenade-launchers",
    ("ranged-weapons", "grenade- launcher"): "grenade-launchers", ("ranged-weapons", "heavy weapon"): "heavy-weapons",
    ("stealth", "physical"): "physical-sneaking", ("stealth", "astral"): "astral-sneaking",
    ("stealth", "matrix"): "matrix-sneaking", ("perception", "visual"): "physical",
    ("perception", "audio"): "physical", ("athletics", "ranged defence"): "ranged-defense",
    ("close-combat", "unarmed combat"): "unarmed", ("close-combat", "blade"): "blades",
    ("close-combat", "lames"): "blades", ("cracking", "brute-force"): "brute-force",
    ("electronics", "matrix searches"): "matrix-search", ("tasking", "complex form"): "complex-forms",
}

SECTION_TYPE = {
    "QUALITIES": "quality", "MAGIC – MENTOR SPIRITS": "quality", "MAGIC – ADEPT WAYS": "quality", "MAGIC – LOAS": "quality",
    "MAGIC – ADEPT POWERS": "adept", "AUGMENTATIONS – CYBERWARE": "cyberware",
    "AUGMENTATIONS – BIOWARE": "bioware", "RIGGERS – VEHICLES": "vehicle", "RIGGERS – DRONES": "vehicle",
}
EQUIPMENT_SECTIONS = {"ARMORY – WEAPONS", "ARMORY – ARMORS", "VARIOUS EQUIPMENTS", "EVERYDAY LIFE",
                      "MATRIX – DECKS, MODS & PROGRAMS", "MEDTECH – DRUGS", "MEDTECH – EQUIPMENT & SERVICES",
                      "MAGIC – MAGICAL EQUIPMENT", "RIGGERS – RCC", "RESONANCE – DATA STRUCTURES"}
# "Amp +N" rows: add-ons applied to an existing amp of this type
MOD_TARGET = {"ARMORY – AMMUNITIONS": "equipment", "ARMORY – ACCESSORIES": "equipment",
              "RIGGERS – VEHICLE MODS": "vehicle", "MATRIX – DECKS, MODS & PROGRAMS": "cyberdeck",
              "AUGMENTATIONS – CYBERWARE": "cyberware", "AUGMENTATIONS – BIOWARE": "bioware"}
VEHICLE_MOD_NAMES = [("safety", "safety-override"), ("fixed", "fixed"), ("flying", "flying"), ("mount", "weapon-mount"),
                     ("identical additional drone", "extra-drone"), ("medkit", "auto-medkit"), ("pilot", "pilot-plus"),
                     ("speed", "speed-plus"), ("handling", "handling-plus"), ("armor", "vehicle-armor")]
GRADE_NAMES = {"delta grade": "grade-delta", "omega grade": "grade-omega", "cultivated bioware": "grade-cultivated"}
CONTACT_NAMES = ["Contact: part of your network", "Contact: reliable in one domain", "Contact: several domains",
                 "Contact: influential and reliable", "Contact: extremely influential", "Contact: knows everyone",
                 "Contact: knows everyone, strong in one field"]

# the base weapon type a weapon's name or sub-list names: its DV and ranges are the core weapons file's (weapons.xml)
WEAPON_KEYS = [
    (("hold-out", "streetline", "palm pistol", "tiffani"), "hold-out-pistol"),
    (("machine pistol", "crusader", "black scorpion", "steyr tmp", "super squirt"), "machine-pistol"),
    (("light pistol", "light fire", "beretta", "colt america", "fichetti", "puzzler"), "light-pistol"),
    (("heavy pistol", "predator", "warhawk", "manhunter", "ultra power", "slivergun"), "heavy-pistol"),
    (("taser", "super shock", "pulsar"), "taser"),
    (("smg", "submachine", "cobra", "uzi", "praetor", "hk 227", "ingram smartgun"), "submachine-gun"),
    (("shotgun", "t-250", "mossberg", "spas", "roomsweeper"), "shotgun"),
    (("sniper", "anti-materiel", "anti-material", "barrett", "desert strike", "sm-6", "gauss", "panther"), "sniper-rifle"),
    (("assault rifle", "ak-97", "alpha", "colt m23", "fn har", "dart", "sport rifle", "remington 750", "ruger 100"), "assault-rifle"),
    (("machine gun", "minigun", "valiant", "m202"), "machine-gun"),
    (("grenade launcher", "antioch", "mgl"), "grenade-launcher"),
    (("missile", "rocket", "striker", "interceptor", "m79", "great dragon", "ballista"), "rocket-launcher"),
    (("grenade",), "grenade"),
    (("crossbow",), "crossbow"),
    (("bow",), "bow"),
    (("throwing", "shuriken"), "throwing-weapon"),
    (("whip", "stun baton", "stun glove", "shock hand"), "advanced-close-quarter"),
    (("katana", "sword", "bat", "long weapon", "cane"), "long-weapon"),
    (("knife", "short weapon", "claw", "razor", "spur"), "short-weapon"),
]


@functools.cache
def _core(where):
    """Amp effect ratings, amp type base ratings, vehicle chassis (body, handling, speed) and weapon types (dv, ranges)
    from the core files (and what imported books add to effects and types): the rules the recipes price amps with."""
    ratings = {e.get("id"): int(float(e.get("rating"))) for r in mechanics_roots("ampeffects.xml") for e in r if e.tag == "effect"}
    base = {t.get("id"): int(t.get("base")) for r in mechanics_roots("amptypes.xml") for t in r if t.tag == "amptype"}
    root = lambda n: ET.parse(core_file(n)).getroot()  # noqa: E731
    chassis = {v.get("id"): (int(v.get("body")), int(v.get("handling")), int(v.get("speed"))) for v in root("vehicles.xml") if v.tag == "vehicle"}
    pilot = {v.get("id"): int(v.get("pilot")) for v in root("vehicles.xml") if v.tag == "vehicle"}
    weapons = {w.get("id"): (w.get("dv", "").replace("STR+", "S+"), w.get("ranges")) for w in root("weapons.xml") if w.tag == "item"}
    price = next(p for p in root("pricing.xml") if p.tag == "pricing")
    return {"ratings": ratings, "base": base, "chassis": chassis, "pilot": pilot, "weapons": weapons,
            "ampPoint": int(price.get("ampPoint")), "specialist": int(price.get("weaponSpecialist"))}


def specialist(cost, rating):
    """A weapon amp whose price, less its rating in amp points, is a specialist weapon's."""
    c = core()
    return (cost or 0) - rating * c["ampPoint"] >= c["specialist"]


def core():
    """_core for the core files in use now (importer.core_dir and the custom folder)."""
    return _core((core_dir(), custom_dir()))


def effect_rating(ref):
    return core()["ratings"].get(ref, 0)


# specializations DHSA adds to the core skills: (skill, spec slug, attr, page, name)
DHSA_SPECS = [("athletics", "jumping", "str", 47, "Jumping"), ("close-combat", "firearms", "agi", 6, "Firearms"),
              ("influence", "animals", "cha", 5, "Animals"), ("influence", "seduction", "cha", 6, "Seduction"),
              ("piloting", "risky-maneuver", "agi", 6, "Risky maneuver"), ("sorcery", "enchanting", "wil", 33, "Enchanting")]

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
            cols = ["name"] + [("type" if h in ("TYPE", "RATING") else "pre" if h in ("RANGE", "ARMOR") else "cost")
                               for h in head[1:-1]] + ["effects"]
            sub = _head(_cells(line)[0])
        elif cols and not line.startswith("|---"):
            cells = dict.fromkeys(("type", "cost"), "")
            pre, effects, first = [], [], None
            for role, c in zip(cols, _cells(line)):
                parts = [p for p in c.split("<br>") if p.strip()]
                if role == "name":
                    for p in parts:
                        if re.match(r"(•\s*)?\*\*(?!\*)", p):
                            cur = {"page": page, "section": section, "subsection": sub, "name": _unbold(p),
                                   "type": "", "cost": "", "effects": [], "added": None}
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


def weapon_base(name, sub):
    t = (name + " " + sub).lower()
    weapons = core()["weapons"]
    for keys, wid in WEAPON_KEYS:
        if any(k in t for k in keys):
            return weapons.get(wid, (None, None))
    return None, None


def dv_num(dv):
    m = re.match(r"S\+(\d+)", dv or "")
    if m:
        return ("S", int(m.group(1)))
    m = re.match(r"(\d+)", dv or "")
    return ("N", int(m.group(1))) if m else None


def load_skills(path=None, dhsa_specs=True):
    """{skill id: (name, attr)} and {(skill id, lowercase spec name): spec id}: the core skills (`path`, else the core
    files plus what imported books add) and DHSA's specs."""
    roots = [ET.parse(path).getroot()] if path else mechanics_roots("skills.xml")
    skills, specs = {}, {}
    for root in roots:
        for s in root.iter("skill"):
            skills.setdefault(s.get("id"), (s.findtext("name"), s.get("attr")))
        specs.update({(sp.get("id").split(".")[0], sp.text.strip().lower()): sp.get("id") for sp in root.iter("spec")})
    if dhsa_specs:
        specs.update({(sk, name.lower()): f"{sk}.{s}" for sk, s, _, _, name in DHSA_SPECS})
    return skills, specs


def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("é", "e").replace("è", "e").replace("à", "a")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


# "of your choice" and the like: the player picks the spec when buying the Amp
WILDCARD = re.compile(r"choice|choose|chosen|of your|to be determined|depending|any specialization", re.I)


class Mapper:
    def __init__(self, specs):
        self.specs = specs
        self.unresolved = []

    def spec(self, skill, text):
        t = re.sub(r"\s*tests?$", "", text.lower().strip().rstrip("."))
        t = t.replace("sprits", "spirits").replace("heatlh", "health")  # typos in the source list
        if (skill, t) in self.specs:
            return self.specs[(skill, t)]
        if (skill, t) in SPEC_ALIASES:
            return f"{skill}.{SPEC_ALIASES[(skill, t)]}"
        for (sk, name), sid in self.specs.items():
            if sk == skill and (name.startswith(t) or t.startswith(name)):
                return sid
        return None

    def effects(self, line):
        """(ref, param, value, note) tuples for one effect line, or None if it can't be mapped."""
        l = re.sub(r"Ranged W\.?(?=\s|\()", "Ranged Weapons", line.strip())
        l = l.replace("(Pist.)", "(pistols)").replace("Dés", "Dis")
        low = l.lower()
        m = re.search(r"RR\s*(\d)\s*(?:on )?(?:tests )?associated with a specialization|RR\s*(\d)\s*\(chosen [a-z ]*skill\)|RR\s*(\d)\s*on skill tests \(skill chosen", l, re.I)
        if m:
            n = int(next(g for g in m.groups() if g))
            return [("rr-spec" if "specialization" in low else "rr-skill", "", None, "chosen when buying the Amp")] * n
        m = re.search(r"RR\s*(\d)\s*(?:to |on )?(?:one |an |a )?attribute", l, re.I)
        if m:
            return [("rr-attr", "", None, "attribute of your choice")] * int(m.group(1))
        if re.search(r"(\+1|one) additional (summoned spirit|compiled sprite)", low):
            return [("summon-spirit", None, None, None)]
        if re.search(r"adds? (1|one) light wound box", low):
            return [("wound-light", None, None, None)]
        if re.search(r"adds? (1|one) serious wound box", low):
            return [("wound-serious", None, None, None)]
        out = []
        for m in re.finditer(r"RR\s*(\d)\s*(?:on\s+)?([A-Za-z .]+?)\s*(?:\(([^)]*)\))?(?=$|[.,;:]|\s+(?:tests?|when|to|with|against|during|while|if|for|in|on|rr|duration|performed|associated|chosen)\b)", l, re.I):
            n, target, spec = int(m.group(1)), m.group(2).strip().lower().rstrip("."), m.group(3)
            if target in ATTRS:
                out += [("rr-attr", ATTRS[target], None, None)] * n
                continue
            skill = SKILLS.get(target)
            if not skill:
                return None
            if spec is None:
                out += [("rr-skill", skill, None, None)] * n
                continue
            sid = self.spec(skill, spec.replace("*", ""))
            if sid is None and not WILDCARD.search(spec):
                # a condition, not a named spec ("At night between midnight and 7am"): a custom spec with that text
                c = spec.replace("*", "").strip()
                sid = "custom:" + c[:1].upper() + c[1:]
            if sid is None:
                self.unresolved.append(f"{target} ({spec})")
            out += [("rr-spec", sid or "", None, None if sid else f"{target} ({spec})")] * n
        if out:
            return out
        if re.search(r"cold-?sim and hot-?sim|coldsim and hot-sim", low):
            return [("vr-cold", None, None, None), ("vr-hot", None, None, None)]
        if re.fullmatch(r"cold-?sim vr\.?", low):
            return [("vr-cold", None, None, None)]
        if "light wound box" in low or re.search(r"^\+?1 light wound", low):
            return [("wound-light", None, None, None)]
        if "serious wound box" in low or re.match(r"^\+1 serious wound", low):
            return [("wound-serious", None, None, None)]
        m = re.search(r"(?:^|\b)(?:unarmed )?dv \+(\d)|^\+(\d) (?:unarmed )?dv|^dv to unarmed attack \+(\d)", low)
        if m:
            return [("dv-plus", None, None, None)] * int(m.group(1) or m.group(2) or m.group(3))
        # mental protection (CRB p.190, 211): spells, astral, biofeedback
        mental = re.search(r"armor against (spells|biofeedback|astral|magic)|biofeedback filter|armor against astral", low)
        both = re.search(r"against all damage|astral and physical|physical and (magical|astral)", low)
        if both and "armor" in low:
            return [("armor-plus", None, None, None), ("mental-armor", None, None, None)]
        if mental:
            return [("mental-armor", None, None, None)]
        if re.search(r"^(armor \+1|\+1 (physical )?armor)", low):
            return [("armor-plus", None, None, None)]
        m = re.search(r"^\+(\d) (attack|firewall)", low)
        if m:
            return [("attack-plus" if m.group(2) == "attack" else "firewall-plus", None, None, None)] * int(m.group(1))
        m = re.fullmatch(r"(firewall|attack) (\d)", low.strip(". "))
        if m:  # a deck's printed stats: base Firewall 1 is free, Attack starts at 0
            n = int(m.group(2))
            return [("firewall-plus", None, None, None)] * (n - 1) if m.group(1) == "firewall" else [("attack-plus", None, None, None)] * n
        if re.search(r"(maintain|sustain) (one|an|1) (additional|more|extra) (spell|complex form)", low):
            return [("sustain-spell", None, None, None)]
        if re.search(r"control (up to )?two spirits", low):
            return [("summon-spirit", None, None, None)]
        m = re.search(r"control of (\d) drones", low)
        if m:
            return [("rcc", None, int(m.group(1)), None)]
        if re.search(r"jump into (a vehicle|vehicles)", low):
            return [("vcr", None, None, None)]
        realm = [("init-realm", "astral" if "astral" in low else "vr", None, None)] if re.search(r"\bvr\b|astral|jump", low) else []
        if re.search(r"^\+1 edge (point )?per (action |cracking )?scene", low) and "+2" not in low:
            return [("init-1", None, None, None)] + realm
        if re.search(r"^\+1 action (in astral or vr |in astral |in vr )?per narration", low):
            return [("init-2", None, None, None)] + realm
        if re.search(r"^\+2 edges? (points? )?per action scene", low):
            return [("init-3", None, None, None)]
        return None


def clean_name(name):
    name = re.split(r"\s+\*\s|\s+Note:|\s\* The|\s\* These|\s\* Contacts|\s\* Loas|\s\* Anthropomorphic|\s\* An anthro", name)[0]
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


def cost_value(cost):
    m = re.match(r"[+-]?([\d ]+)\s*¥", cost or "")
    return int(m.group(1).replace(" ", "")) if m else None


def attr(k, v):
    return f' {k}="{escape(str(v), {chr(34): "&quot;"})}"' if v not in (None, "") else ""


def reconcile(fx, narrative, base, rating, negative_ok=False, ratings=None):
    """Fill the gap between computed and printed rating (see module docstring). Returns computed rating. `ratings`: effect
    ratings this book defines itself (its implant grades), over the core's."""
    rate = lambda ref: (ratings or {}).get(ref, effect_rating(ref))  # noqa: E731
    computed = base + sum((-f[2] if f[0] == "negative" else rate(f[0]) * (f[2] if f[0] == "rcc" and f[2] else 1)) for f in fx)
    unmapped = [l for l in narrative if l.strip() not in ("", "-") and not l.lower().startswith(("choose", "duration", "- rr"))]
    residual = rating - computed
    drawback = any(re.search(r"disadvantage|wound|must take|once the effects|cannot|can't|increase|forgets|addict|visible|only", l, re.I) for l in unmapped)
    if residual > 0:  # whole narrative effects at the core's price; what's left over stays a mismatch
        n = residual // max(1, rate("narrative"))
        fx += [("narrative", "", None, "balances printed rating")] * n
        return computed + n * rate("narrative")
    if residual < 0 and (drawback or negative_ok):
        left = -residual
        while left:
            fx.append(("negative", "", min(5, left), "book drawback"))
            left -= min(5, left)
        return rating
    return computed


def extract(md, ctx=None):
    rs = rows(md)
    for r in rs:  # DHSA v3.2 mixes '-' and '–' in headings; v3.4 uses '–'
        r["section"] = r["section"].replace(" - ", " – ")
    skills, specs = load_skills()
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
        report.append({"kind": "rating-mismatch", "id": aid, "page": page, "type": atype, "printed": rating,
                       "computed": computed, "effects": " // ".join(r["effects"])[:160]})

    def amp_xml(aid, atype, rating, page, name, item, fx, narrative, vehicle=None, mod=False):
        fx_xml = "".join(f'<effect ref="{f[0]}"{attr("param", f[1])}{attr("value", f[2])}{attr("note", f[3])}/>' for f in fx)
        amps.append(f'  <amp id="{aid}" type="{atype}" printedRating="{rating}"{attr("vehicle", vehicle)}{" mod=\"true\"" if mod else ""} source="{ID}" page="{page}">'
                    f'<name>{escape(name)}</name>{item}{fx_xml}<narrative>{private("amps", aid, " ".join(narrative))}</narrative></amp>')

    def map_lines(lines):
        fx, narrative = [], []
        for line in lines:
            if line.strip() in ("", "-") or line.lower().startswith("choose"):
                narrative.append(line)
                continue
            mapped = mapper.effects(re.sub(r"^(Smartgun|Dismountable|Gyro mount|Head-seeker): ", "", line.lstrip("- ")))
            (narrative.append(line) if mapped is None else fx.extend(mapped))
        return fx, narrative

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
        spells.append(f'  <item id="{sid}" kind="spell" category="{escape(base["type"].split()[0].lower())}" source="{ID}" page="{r["page"]}">'
                      f'<name>{escape(name)}</name><text>{private("items", sid, text[:300])}</text></item>')

    # ---- complex forms (technomancers; DHSA, following the Conversion Guide's rules): type = duration, cost = threshold
    for r in rs:
        if r["section"] != "RESONANCE – COMPLEX FORMS" or not re.fullmatch(r"I/S|S|I|P", r["type"]):
            continue
        name, dur = clean_name(r["name"]), r["type"]
        cid = uid("cf-" + slug(name))
        text = f"{dur}. Threshold: {r['cost']}. " + " ".join(r["effects"])
        forms.append(f'  <item id="{cid}" kind="complex-form" category="{"sustained" if "S" in dur else "instant"}" source="{ID}" page="{r["page"]}">'
                     f'<name>{escape(name)}</name><text>{private("items", cid, text[:300])}</text></item>')

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
            fx, narrative = [], []
            grade = next((v for k, v in GRADE_NAMES.items() if k in low), None)
            if grade:
                fx, narrative = [(grade, None, None, None)], effects_lines
                ess = re.search(r"(?:reduced|increases) from ([\d.]+) to ([\d.]+)", " ".join(effects_lines))
                if ess:  # the grade itself, an effect added to the core ones: it changes the amp's Essence cost
                    note = ", social Disadvantage" if "Disadvantage" in " ".join(effects_lines) else ""
                    grades.append({"id": grade, "rating": rating, "types": target, "page": page, "essence": float(ess[2]) - float(ess[1]),
                                   "name": f"{name} (Essence {ess[1]} → {ess[2]}{note})"})
            elif sec == "RIGGERS – VEHICLE MODS":
                ref = next((v for k, v in VEHICLE_MOD_NAMES if k in low), None)
                fx, narrative = ([(ref, None, None, None)] * (rating if ref in ("pilot-plus", "speed-plus", "handling-plus", "vehicle-armor") else 1), effects_lines) if ref else map_lines(effects_lines)
            else:
                fx, narrative = map_lines(effects_lines)
            computed = reconcile(fx, narrative, 0, rating, negative_ok=rating < 0, ratings={grade: rating} if grade else None)
            aid = uid("mod-" + slug(name))
            if computed != rating:
                mismatch(aid, page, f"mod ({target})", rating, computed, r)
            amp_xml(aid, target, rating, page, name, "", fx, narrative, mod=True)
            continue

        if sec not in SECTION_TYPE and sec not in EQUIPMENT_SECTIONS:
            continue
        cost = cost_value(r["cost"])
        if rating is None:  # plain equipment, not an amp
            if sec in EQUIPMENT_SECTIONS and r["type"].startswith("Equipment") and sec not in ("ARMORY – WEAPONS", "ARMORY – ARMORS"):
                gid = uid("gear-" + slug(name))
                gear.append(f'  <item id="{gid}" kind="gear" category="{escape(r["subsection"].title())}" source="{ID}" page="{page}">'
                            f'<name>{escape(name)}</name><text>{private("items", gid, " ".join(effects_lines)[:240])}</text></item>')
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
                vehicle = min(chassis, key=lambda c: abs(chassis[c][0] - b) * 3 + abs(chassis[c][1] - h) + abs(chassis[c][2] - ground))
                cb, ch, cs = chassis[vehicle]
                vfx = [("pilot-plus", None, None, None)] * max(0, p - core()["pilot"][vehicle]) + [("vehicle-armor", None, None, None)] * a
                vfx += [("handling-plus", None, None, None)] * max(0, h - ch) + [("speed-plus", None, None, None)] * max(0, ground - cs)
                if flying:
                    vfx.append(("flying", None, None, None))
                    effects_lines = [e for e in effects_lines if e.strip().lower() != "flying"]
        if atype == "cyberdeck" and deck:
            vfx = [("firewall-plus", None, None, None)] * (int(deck.group(1)) - 1) + [("attack-plus", None, None, None)] * int(deck.group(2))
        fx, narrative = map_lines(effects_lines)
        fx = vfx + fx
        refs = [f[0] for f in fx]
        for lvl, pre in (("init-3", "init-2"), ("init-2", "init-1"), ("vr-hot", "vr-cold")):
            if lvl in refs and pre not in refs:
                fx.insert(0, (pre, None, None, None))
                refs.insert(0, pre)
        if any(l.lower().startswith("choose two rr") for l in effects_lines):  # mentor spirits / adept ways
            fx = [f for f in fx if f[0] != "rr-spec"] + [("rr-spec", "", None, "choose from the list")] * 2
        computed = reconcile(fx, narrative, core()["base"][atype], rating)
        aid = uid(slug(name))
        if computed != rating:
            mismatch(aid, page, atype, rating, computed, r)
        amp_xml(aid, atype, rating, page, name, item, fx, narrative, vehicle)

    # DHSA's specs, added to the shipped skills (the loader appends an imported skill's specs to the base one)
    added = {}
    for sk, s, a, p, n in DHSA_SPECS:
        added.setdefault(sk, (p, []))[1].append(f'<spec id="{sk}.{s}" attr="{a}" source="{ID}" page="{p}">{escape(n)}</spec>')
    skill_xml = [f'  <skill id="{sk}" attr="{skills[sk][1]}" source="{ID}" page="{p}"><name>{escape(skills[sk][0])}</name>{"".join(sp)}</skill>'
                 for sk, (p, sp) in added.items()]
    report += [{"kind": "unresolved-spec", "spec": s} for s in sorted(set(mapper.unresolved))]

    def data(kind, comment, entries):
        return ('<?xml version="1.0" encoding="UTF-8"?>\n'
                f"<!-- {comment} Generated by the importer (recipe dhsa) from Daegann's Holostreets Shadow Amps Expanded List. -->\n"
                f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n' + "\n".join(entries) + "\n</ca2:data>\n")
    files = {
        "amps.xml": data("amps", 'Prebuilt Shadow Amps and add-on mods (mod="true"); texts in custom/texts/dhsa.xml.', amps),
        "spells.xml": data("spells", "Spells.", spells),
        "complexforms.xml": data("complexforms", "Technomancer complex forms (price: the core pricing, or the Conversion Guide when imported).", forms),
        "gear.xml": data("gear", "Plain equipment (not Amps), at the equipment price unless the GM says otherwise.", gear),
        "skills.xml": data("skills", "Specializations DHSA adds to the core skills.", skill_xml),
    }
    if grades:  # grades of one amp type are alternatives: each excludes the others
        files["ampeffects.xml"] = data("ampeffects", "Implant grades DHSA adds to the core Amp effects.", [
            f'  <effect id="{g["id"]}" category="grade" rating="{g["rating"]}" types="{g["types"]}" max="1"'
            + "".join(f' excludes="{o["id"]}"' for o in grades if o["types"] == g["types"] and o is not g)
            + f' essence="{g["essence"]:g}" source="{ID}" page="{g["page"]}"><name>{escape(g["name"])}</name></effect>' for g in grades])
    return Result(files=files, texts=data("texts", "PRIVATE: book text. Do not commit.", texts), report=report,
                  source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON})
