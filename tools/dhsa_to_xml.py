"""Turn DHSA rows (tools/dhsa_rows.py output) into amps.xml, gear.xml, spells.xml and complexforms.xml.

Each amp row is broken into effects from ampeffects.xml; lines we can't map become
narrative text. The computed rating is reconciled with the printed one:
  - printed > computed: the gap becomes "Additional narrative effect" (+1, CRB p.63),
    tagged note="balances printed rating";
  - printed < computed and the text lists a drawback: the gap becomes a book-sanctioned
    "Negative effect", tagged note="book drawback";
  - anything else goes to the mismatch report (docs/book-discrepancies.md).
Entries printed in black are core-book (CRB) content: their page is looked up in the core
book markdown. Rust entries are Daegann's (DHSA) and cite the DHSA page.

Usage: python tools/dhsa_to_xml.py <dhsa rows.json> <public/data> <report.md> <CRB .md>
"""
import json
import re
import sys
from xml.sax.saxutils import escape

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

EFFECT_RATING = {"rr-spec": 2, "rr-skill": 5, "rr-attr": 10, "init-1": 2, "init-2": 3, "init-3": 2,
                 "init-realm": -1, "dv-plus": 1, "range-improve": 2, "armor-plus": 1, "mental-armor": 1,
                 "wound-light": 3, "wound-serious": 6, "sustain-spell": 2, "summon-spirit": 3, "vr-cold": 1,
                 "vr-hot": 2, "firewall-plus": 1, "attack-plus": 1, "rcc": 1, "vcr": 2, "narrative": 1,
                 "pilot-plus": 1, "speed-plus": 1, "handling-plus": 1, "vehicle-armor": 1, "flying": 1,
                 "fixed": -1, "weapon-mount": 1, "safety-override": 3, "extra-drone": 2, "auto-medkit": 1,
                 "weapon-focus": 1, "grade-delta": 1, "grade-omega": -1, "grade-cultivated": 1}
BASE = {"quality": 0, "adept": 1, "cyberware": 1, "bioware": 2, "equipment": 0, "cyberdeck": 1, "vehicle": 1, "contact": 0}
WEAPON_TYPES = [  # (keywords, dv, ranges) from CRB p.142
    (("hold-out", "streetline", "palm pistol", "tiffani"), "3", "OK/OK/Dis/-"),
    (("machine pistol", "crusader", "black scorpion", "steyr tmp", "super squirt"), "4", "OK/OK/Dis/-"),
    (("light pistol", "light fire", "beretta", "colt america", "fichetti", "puzzler"), "4", "OK/OK/Dis/-"),
    (("heavy pistol", "predator", "warhawk", "manhunter", "ultra power", "slivergun"), "5", "OK/OK/Dis/-"),
    (("taser", "super shock", "pulsar"), "5", "OK/OK/-/-"),
    (("smg", "submachine", "cobra", "uzi", "praetor", "hk 227", "ingram smartgun"), "5", "Dis/OK/OK/-"),
    (("shotgun", "t-250", "mossberg", "spas", "roomsweeper"), "8", "Dis/OK/Dis/-"),
    (("sniper", "anti-materiel", "anti-material", "barrett", "desert strike", "sm-6", "gauss", "panther"), "10", "-/Dis/Dis/OK"),
    (("sport rifle", "remington 750", "ruger 100"), "7", "-/Dis/OK/OK"),
    (("assault rifle", "ak-97", "alpha", "colt m23", "fn har", "dart"), "7", "Dis/OK/OK/Dis"),
    (("machine gun", "minigun", "valiant", "m202"), "9", "-/OK/OK/OK"),
    (("grenade launcher", "antioch", "mgl"), "7", "-/Dis/OK/OK"),
    (("missile", "rocket", "striker", "interceptor", "m79", "great dragon", "ballista"), "12", "-/-/Dis/OK"),
    (("grenade",), "7", "OK/OK/Dis/-"),
    (("crossbow",), "4", "OK/OK/OK/-"),
    (("bow",), "S+1", "OK/OK/OK/-"),
    (("throwing", "shuriken"), "S+1", "OK/OK/Dis/-"),
    (("whip", "stun baton", "stun glove", "shock hand"), "5", "OK/-/-/-"),
    (("katana", "sword", "bat", "long weapon", "cane"), "S+2", "OK/-/-/-"),
    (("knife", "short weapon", "claw", "razor", "spur"), "S+1", "OK/-/-/-"),
]
CHASSIS = {  # id: (body, handling, speed)
    "microdrone": (0, 10, 0), "small-drone": (1, 9, 2), "medium-drone": (2, 7, 3), "large-drone": (4, 4, 4),
    "race-motorbike": (4, 2, 6), "allterrain-motorbike": (4, 3, 5), "chopper": (5, 2, 5),
    "sports-car": (5, 2, 5), "sedan": (6, 2, 4), "suv": (7, 1, 4), "van": (8, 1, 3), "bus": (10, 0, 2),
}


class CoreBook:
    """Printed page lookup in the core-book markdown: a page's number is the **N** footer after it."""

    def __init__(self, path):
        lines = open(path, encoding="utf8").read().split("\n")
        self.low = [l.lower() for l in lines]
        self.page, nxt = [None] * len(lines), None
        for i in range(len(lines) - 1, -1, -1):
            m = re.fullmatch(r"\*\*(\d{1,3})\*\*", lines[i].strip())
            if m:
                nxt = int(m.group(1))
            self.page[i] = nxt

    def find(self, name, start=5180, end=None):
        key = re.sub(r"\s*\(.*$", "", name).replace("’", "'").lower().strip(" *")
        if len(key) < 4:
            return None
        end = end or len(self.low)
        hits = [i for i in range(start, end) if key in self.low[i].replace("’", "'")]
        # the book's own catalog entries read "**Name:** (Rating N ... Amp" or "**Name** (..." or a table row "|**Name**"
        entry = [i for i in hits if re.search(r"\*\*" + re.escape(key) + r"[:*]", self.low[i].replace("’", "'"))]
        best = ([i for i in entry if "rating" in self.low[i]] or [i for i in entry if self.low[i].startswith("|")] or entry
                or [i for i in hits if "rating" in self.low[i]] or [i for i in hits if self.low[i].startswith("|")])
        if not best and len(key) >= 8:
            best = hits
        return self.page[best[0]] if best else None


def weapon_base(name, sub):
    t = (name + " " + sub).lower()
    for keys, dv, rng in WEAPON_TYPES:
        if any(k in t for k in keys):
            return dv, rng
    return None, None


def dv_num(dv):
    m = re.match(r"S\+(\d+)", dv or "")
    if m:
        return ("S", int(m.group(1)))
    m = re.match(r"(\d+)", dv or "")
    return ("N", int(m.group(1))) if m else None


def load_specs(data_dir):
    xml = open(f"{data_dir}/skills.xml", encoding="utf8").read()
    return {(sid.split(".")[0], name.replace("&amp;", "&").lower()): sid
            for sid, name in re.findall(r'<spec id="([^"]+)"[^>]*>([^<]+)</spec>', xml)}


def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("é", "e").replace("è", "e").replace("à", "a")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


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
        m = re.search(r"(?:^|\b)(?:unarmed )?dv \+(\d)|^\+(\d) dv|^dv to unarmed attack \+(\d)", low)
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
        m = re.fullmatch(r"firewall (\d)", low.strip(". "))
        if m:
            return [("firewall-plus", None, None, None)] * (int(m.group(1)) - 1)  # base Firewall 1 is free
        if re.search(r"(maintain|sustain) (one|an|1) (additional|more|extra) (spell|complex form)", low):
            return [("sustain-spell", None, None, None)]
        if re.search(r"control two spirits", low):
            return [("summon-spirit", None, None, None)]
        m = re.search(r"control of (\d) drones", low)
        if m:
            return [("rcc", None, int(m.group(1)), None)]
        if "jump into a vehicle" in low:
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


def reconcile(fx, narrative, base, rating, negative_ok=False):
    """Fill the gap between computed and printed rating (see module docstring). Returns computed rating."""
    computed = base + sum((-f[2] if f[0] == "negative" else EFFECT_RATING.get(f[0], 0) * (f[2] if f[0] == "rcc" and f[2] else 1)) for f in fx)
    unmapped = [l for l in narrative if l.strip() not in ("", "-") and not l.lower().startswith(("choose", "duration", "- rr"))]
    residual = rating - computed
    drawback = any(re.search(r"disadvantage|wound|must take|once the effects|cannot|can't|increase|forgets|addict|visible|only", l, re.I) for l in unmapped)
    if residual > 0:
        fx += [("narrative", "", None, "balances printed rating")] * residual
        return rating
    if residual < 0 and (drawback or negative_ok):
        left = -residual
        while left:
            fx.append(("negative", "", min(5, left), "book drawback"))
            left -= min(5, left)
        return rating
    return computed


def build(rows, data_dir, report_path, crb_path):
    for r in rows:  # DHSA v3.2 mixes '-' and '–' in headings; v3.4 uses '–'
        r["section"] = r["section"].replace(" - ", " – ")
    book = CoreBook(crb_path)
    mapper = Mapper(load_specs(data_dir))
    amps, gear, spells, forms, report, ids = [], [], [], [], [], set()

    def uid(base):
        i, s = 1, base
        while s in ids:
            i += 1
            s = f"{base}-{i}"
        ids.add(s)
        return s

    def cite(r, name, start=5180, end=None):
        """CRB page for core-book entries, else the DHSA page."""
        if not r["added"]:
            m = re.match(r"(\w+) Mentor Spirit", name)  # the book lists mentors under a bare heading ("###### CAT")
            if m:
                i = next((i for i in range(7890, 8000) if book.low[i].strip() == f"###### {m.group(1).lower()}"), None)
                if i is not None:
                    return "CRB", book.page[i]
            p = book.find(name, start, end)
            if p:
                return "CRB", p
        return "DHSA", r["page"]

    def amp_xml(aid, atype, rating, src, page, name, item, fx, narrative, vehicle=None, mod=False):
        fx_xml = "".join(f'<effect ref="{f[0]}"{attr("param", f[1])}{attr("value", f[2])}{attr("note", f[3])}/>' for f in fx)
        amps.append(f'  <amp id="{aid}" type="{atype}" printedRating="{rating}"{attr("vehicle", vehicle)}{" mod=\"true\"" if mod else ""} source="{src}" page="{page}">'
                    f'<name>{escape(name)}</name>{item}{fx_xml}<narrative>{escape(" ".join(narrative).strip())}</narrative></amp>')

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
    for r in rows:
        if r["section"] != "MAGIC – SPELLS":
            continue
        m = re.match(r"(.+?)\s+Manip\.?\s*\(([^)]+)\)", r["name"])
        if m and not r["type"]:  # manipulation spells carry their type inside the name column
            r = {**r, "name": m.group(1), "type": f"Manipulation ({m.group(2)})"}
        if r["type"][:1].isupper():
            prev = dict(r)
            spell_rows.append(prev)
        elif prev and not r["type"] and len(r["name"]) < 40:
            prev["effects"] = prev["effects"] + r["effects"]
            spell_rows.append({**r, "type": prev["type"], "cost": prev["cost"], "shared": prev})
    for r in spell_rows:
        base = r.get("shared", r)
        name = clean_name(r["name"])
        src, page = cite(r, name, 8093, 8420)
        text = f'{base["type"]}. Threshold/target: {base["cost"]}. ' + " ".join(base["effects"])
        spells.append(f'  <item id="{uid("spell-" + slug(name))}" kind="spell" category="{escape(base["type"].split()[0].lower())}" source="{src}" page="{page}">'
                      f'<name>{escape(name)}</name><text>{escape(text[:300])}</text></item>')

    # ---- complex forms (technomancers; DHSA, following the Conversion Guide's rules)
    for r in rows:
        if r["section"] != "RESONANCE – COMPLEX FORMS":
            continue
        m = re.match(r"(.+?)\s+(I/S|S|I|P)$", clean_name(r["name"]))
        if not m:
            continue
        name, dur = m.group(1), m.group(2)
        thr_m = re.match(r"(\d\+?|\d to \d|Firewall(?:\+\d)?|Area-based|Variable)\s*(.*)", r["cost"])
        threshold = r["type"] or (thr_m.group(1) if thr_m else "")
        text = " ".join(([thr_m.group(2)] if thr_m and thr_m.group(2) else [] if thr_m else [r["cost"]]) + r["effects"]).strip()
        forms.append(f'  <item id="{uid("cf-" + slug(name))}" kind="complex-form" category="{"sustained" if "S" in dur else "instant"}" source="DHSA" page="{r["page"]}">'
                     f'<name>{escape(name)}</name><text>{escape(f"{dur}. Threshold: {threshold}. {text}"[:300])}</text></item>')

    # ---- contacts: rated templates (CONTACTS section)
    contact_rows = [r for r in rows if r["section"] == "CONTACTS" and re.search(r"Amp\s*\d", r["name"])]
    for i, r in enumerate(contact_rows):
        rating = int(re.search(r"Amp\s*(\d)", r["name"]).group(1))
        text = re.sub(r"^[\d ]+¥\s*", "", r["cost"]).replace("**", "")
        fx = []
        for m in re.finditer(r"RR\s*\d\s*Network(?:\s*\([^)]*\))?", text):
            fx += mapper.effects(m.group(0)) or []
        narrative = [re.split(r"\s*RR\s*\d", text)[0]]
        reconcile(fx, [], BASE["contact"], rating)
        amp_xml(uid(slug(CONTACT_NAMES[i] if i < len(CONTACT_NAMES) else f"contact-{rating}")), "contact", rating, "DHSA", r["page"],
                CONTACT_NAMES[i] if i < len(CONTACT_NAMES) else f"Contact (rating {rating})", "", fx, narrative)

    for r in merge_wrapped(rows):
        sec = r["section"]
        name = clean_name(r["name"])
        if sec in ("MAGIC – SPELLS", "RESONANCE – COMPLEX FORMS", "CONTACTS", "SHADOW AMPS BASE"):
            continue
        rating = printed(r["type"])
        effects_lines = list(r["effects"])
        src, page = cite(r, name)

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
            elif sec == "RIGGERS – VEHICLE MODS":
                ref = next((v for k, v in VEHICLE_MOD_NAMES if k in low), None)
                fx, narrative = ([(ref, None, None, None)] * (rating if ref in ("pilot-plus", "speed-plus", "handling-plus", "vehicle-armor") else 1), effects_lines) if ref else map_lines(effects_lines)
            else:
                fx, narrative = map_lines(effects_lines)
            computed = reconcile(fx, narrative, 0, rating, negative_ok=rating < 0)
            aid = uid("mod-" + slug(name))
            if computed != rating:
                report.append(f"| {aid} | {src} p.{page} | mod ({target}) | {rating} | {computed} | {' // '.join(r['effects'])[:160].replace('|', '/')} |")
            amp_xml(aid, target, rating, src, page, name, "", fx, narrative, mod=True)
            continue

        if sec not in SECTION_TYPE and sec not in EQUIPMENT_SECTIONS:
            continue
        cost = cost_value(r["cost"])
        if rating is None:  # plain equipment, not an amp
            if sec in EQUIPMENT_SECTIONS and r["type"].startswith("Equipment") and sec not in ("ARMORY – WEAPONS", "ARMORY – ARMORS"):
                gear.append(f'  <item id="{uid("gear-" + slug(name))}" kind="gear" category="{escape(r["subsection"].title())}" source="{src}" page="{page}">'
                            f'<name>{escape(name)}</name><text>{escape(" ".join(effects_lines)[:240])}</text></item>')
            continue

        atype = SECTION_TYPE.get(sec, "equipment")
        deck = next((m for e in effects_lines for m in [re.search(r"Firewall (\d)\s*-\s*Attack (\d)", e)] if m), None)
        if sec == "MATRIX – DECKS, MODS & PROGRAMS" and deck:
            atype = "cyberdeck"
            effects_lines = [e for e in effects_lines if not re.search(r"Firewall \d\s*-\s*Attack \d", e)]
        item, vehicle, vfx = "", None, []
        if atype == "equipment":
            base_price = (cost or 0) - rating * 5000
            if sec == "ARMORY – WEAPONS":
                parts = r["cost"].split("¥", 1)
                dv = parts[1].strip() if len(parts) > 1 else ""
                rng = effects_lines.pop(0) if effects_lines and re.match(r"^[-–A-Za-zé ]+/", effects_lines[0]) else ""
                rng = rng.replace(" ", "").replace("–", "-").replace("Dés", "Dis")
                item = f'<item kind="weapon"{attr("specialist", "true" if base_price >= 5000 else "")}{attr("dv", dv)}{attr("ranges", rng)}/>'
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
                vehicle = min(CHASSIS, key=lambda c: abs(CHASSIS[c][0] - b) * 3 + abs(CHASSIS[c][1] - h) + abs(CHASSIS[c][2] - ground))
                cb, ch, cs = CHASSIS[vehicle]
                vfx = [("pilot-plus", None, None, None)] * max(0, p - 6) + [("vehicle-armor", None, None, None)] * a
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
        computed = reconcile(fx, narrative, BASE[atype], rating)
        aid = uid(slug(name))
        if computed != rating:
            report.append(f"| {aid} | {src} p.{page} | {atype} | {rating} | {computed} | {' // '.join(r['effects'])[:160].replace('|', '/')} |")
        amp_xml(aid, atype, rating, src, page, name, item, fx, narrative, vehicle)

    head = '<?xml version="1.0" encoding="UTF-8"?>\n'

    def write(file, kind, comment, entries):
        with open(f"{data_dir}/{file}", "w", encoding="utf8", newline="\n") as f:
            f.write(f'{head}<!-- {comment} Generated by tools/dhsa_to_xml.py from Daegann\'s Holostreets Shadow Amps Expanded List. -->\n'
                    f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n' + "\n".join(entries) + "\n</ca2:data>\n")
    write("amps.xml", "amps", "Prebuilt Shadow Amps and add-on mods (mod=\"true\"). source CRB = core-book page; DHSA = Daegann addition, DHSA page.", amps)
    write("spells.xml", "spells", "Spells. source CRB = core-book page; DHSA = Daegann addition.", spells)
    write("complexforms.xml", "complexforms", "Technomancer complex forms, 5,000 nuyen each (rules: CGL Conversion Guide p.9).", forms)
    write("gear.xml", "gear", "Plain equipment (not Amps), 2,500 nuyen each unless the GM says otherwise.", gear)
    with open(report_path, "w", encoding="utf8") as f:
        f.write(f"amps {len(amps)}, spells {len(spells)}, complex forms {len(forms)}, gear {len(gear)}, mismatches {len(report)}\n\n")
        f.write("| amp | source | type | printed | computed | effects |\n|---|---|---|---|---|---|\n" + "\n".join(report) + "\n\n")
        f.write("unresolved specs:\n" + "\n".join(sorted(set(mapper.unresolved))) + "\n")
    print(f"amps {len(amps)} (mods {sum(' mod=' in a for a in amps)}), spells {len(spells)}, complex forms {len(forms)}, gear {len(gear)}, "
          f"CRB-cited {sum('source=\"CRB\"' in a for a in amps)}, mismatches {len(report)}, unresolved specs {len(set(mapper.unresolved))}")


if __name__ == "__main__":
    build(json.load(open(sys.argv[1], encoding="utf8")), sys.argv[2], sys.argv[3], sys.argv[4])
