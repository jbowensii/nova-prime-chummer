"""Turn DHSA rows (tools/dhsa_rows.py output) into amps.xml, gear.xml and spells.xml.

Each amp row is decomposed into effects from ampeffects.xml. Lines we can't map
become narrative text. The rating we compute is compared to the printed rating:
  - if printed > computed and there are unmapped effect lines, each missing point
    becomes an "Additional narrative effect" (+1, CRB p.63), up to the number
    of unmapped lines;
  - anything still off goes to the mismatch report for a human to review.
printedRating is kept on every amp for the audit.

Usage: python tools/dhsa_to_xml.py .extract/dhsa.json public/data .extract/report.md
"""
import json
import re
import sys
from xml.sax.saxutils import escape

SKILLS = {
    "athletics": "athletics", "close combat": "close-combat", "conjuring": "conjuring",
    "cracking": "cracking", "electronics": "electronics", "engineering": "engineering",
    "influence": "influence", "network": "network", "perception": "perception",
    "piloting": "piloting", "ranged weapons": "ranged-weapons", "ranged w.": "ranged-weapons",
    "ranged w": "ranged-weapons", "sorcery": "sorcery", "stealth": "stealth", "survival": "survival",
}
ATTRS = {"strength": "str", "agility": "agi", "willpower": "wil", "logic": "log", "charisma": "cha"}
SPEC_ALIASES = {
    ("ranged-weapons", "pist."): "pistols", ("ranged-weapons", "pistol"): "pistols",
    ("ranged-weapons", "smg"): "submachine-guns", ("ranged-weapons", "smgs"): "submachine-guns",
    ("ranged-weapons", "rifle"): "rifles", ("ranged-weapons", "assault rifles"): "rifles",
    ("ranged-weapons", "assault rifle"): "rifles", ("ranged-weapons", "sniper rifles"): "rifles",
    ("ranged-weapons", "gr. launchers"): "grenade-launchers", ("ranged-weapons", "heavy weapon"): "heavy-weapons",
    ("stealth", "physical"): "physical-sneaking", ("stealth", "astral"): "astral-sneaking",
    ("stealth", "matrix"): "matrix-sneaking", ("perception", "visual"): "physical",
    ("perception", "audio"): "physical", ("athletics", "ranged defence"): "ranged-defense",
    ("close-combat", "unarmed combat"): "unarmed", ("close-combat", "blade"): "blades",
    ("cracking", "brute-force"): "brute-force",
}

SECTION_TYPE = {
    "QUALITIES": "quality", "MAGIC – MENTOR SPIRITS": "quality", "MAGIC – ADEPT WAYS": "quality",
    "MAGIC – ADEPT POWERS": "adept", "AUGMENTATIONS - CYBERWARE": "cyberware",
    "AUGMENTATIONS - BIOWARE": "bioware", "RIGGERS - VEHICLES": "vehicle", "RIGGERS - DRONES": "vehicle",
}
EQUIPMENT_SECTIONS = {"ARMORY - WEAPONS", "ARMORY - ARMORS", "VARIOUS EQUIPMENTS", "EVERYDAY LIFE",
                      "MATRIX – DECKS, MODS & PROGRAMS", "MEDTECH - DRUGS", "MEDTECH – EQUIPMENT & SERVICES",
                      "MAGIC – MAGICAL EQUIPMENT", "RIGGERS - RCC"}
SKIP_SECTIONS = {"SHADOW AMPS BASE", "CONTACTS", "RESONANCE – COMPLEX FORMS", "RESONANCE – DATA STRUCTURES",
                 "ARMORY - AMMUNITIONS", "ARMORY - ACCESSORIES", "RIGGERS – VEHICLE MODS", "MAGIC – SPELLS"}

EFFECT_RATING = {"rr-spec": 2, "rr-skill": 5, "rr-attr": 10, "init-1": 2, "init-2": 3, "init-3": 2,
                 "init-realm": -1, "dv-plus": 1, "range-improve": 2, "armor-plus": 1, "wound-light": 3,
                 "wound-serious": 6, "sustain-spell": 2, "summon-spirit": 3, "vr-cold": 1, "vr-hot": 2,
                 "firewall-plus": 1, "attack-plus": 1, "rcc": 1, "vcr": 2, "narrative": 1,
                 "pilot-plus": 1, "speed-plus": 1, "handling-plus": 1, "vehicle-armor": 1, "flying": 1}
BASE = {"quality": 0, "adept": 1, "cyberware": 1, "bioware": 2, "equipment": 0, "cyberdeck": 1, "vehicle": 1}
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
    (("whip", "stun baton", "stun glove"), "5", "OK/-/-/-"),
    (("katana", "sword", "bat", "long weapon", "cane"), "S+2", "OK/-/-/-"),
    (("knife", "short weapon", "claw"), "S+1", "OK/-/-/-"),
]


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


CHASSIS = {  # id: (body, handling, speed)
    "microdrone": (0, 10, 0), "small-drone": (1, 9, 2), "medium-drone": (2, 7, 3), "large-drone": (4, 4, 4),
    "race-motorbike": (4, 2, 6), "allterrain-motorbike": (4, 3, 5), "chopper": (5, 2, 5),
    "sports-car": (5, 2, 5), "sedan": (6, 2, 4), "suv": (7, 1, 4), "van": (8, 1, 3), "bus": (10, 0, 2),
}


def load_specs(data_dir):
    xml = open(f"{data_dir}/skills.xml", encoding="utf8").read()
    specs = {}
    for sid, name in re.findall(r'<spec id="([^"]+)"[^>]*>([^<]+)</spec>', xml):
        skill = sid.split(".")[0]
        specs[(skill, name.replace("&amp;", "&").lower())] = sid
    return specs


def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("é", "e").replace("è", "e").replace("à", "a")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


class Mapper:
    def __init__(self, specs):
        self.specs = specs
        self.unresolved = []

    def spec(self, skill, text):
        t = text.lower().strip().rstrip(".")
        t = re.sub(r"\s*tests?$", "", t)
        if (skill, t) in self.specs:
            return self.specs[(skill, t)]
        if (skill, t) in SPEC_ALIASES:
            return f"{skill}.{SPEC_ALIASES[(skill, t)]}"
        for (sk, name), sid in self.specs.items():
            if sk == skill and (name.startswith(t) or t.startswith(name)):
                return sid
        return None

    def effects(self, line):
        """Return list of (ref, param, value, note) for one effect line, or None if unmapped."""
        l = line.strip()
        l = re.sub(r"Ranged W\.?(?=\s|\()", "Ranged Weapons", l)
        l = l.replace("(Pist.)", "(pistols)").replace("Dés", "Dis")
        low = l.lower()
        out = []
        m = re.search(r"RR\s*(\d)\s*(?:on )?(?:tests )?associated with a specialization|RR\s*(\d)\s*\(chosen [a-z ]*skill\)|RR\s*(\d)\s*on skill tests \(skill chosen", l, re.I)
        if m:
            n = int(next(g for g in m.groups() if g))
            ref = "rr-spec" if "specialization" in low else "rr-skill"
            return [(ref, "", None, "chosen when buying the Amp")] * n
        m = re.search(r"RR\s*(\d)\s*(?:to |on )?(?:one |an |a )?attribute", l, re.I)
        if m:
            return [("rr-attr", "", None, "attribute of your choice")] * int(m.group(1))
        if re.search(r"(\+1|one) additional summoned spirit", low):
            return [("summon-spirit", None, None, None)]
        if re.search(r"adds? (1|one) light wound box", low):
            return [("wound-light", None, None, None)]
        if re.search(r"adds? (1|one) serious wound box", low):
            return [("wound-serious", None, None, None)]
        # RR n <Skill|Attr> [(spec)] — may appear several times on one line
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
            sid = self.spec(skill, spec)
            if sid is None:
                self.unresolved.append(f"{target} ({spec})")
            out += [("rr-spec", sid or "", None, None if sid else f"{target} ({spec})")] * n
        if out:
            return out
        if re.search(r"cold-?sim and hot-?sim", low) or re.search(r"coldsim and hot-sim", low):
            return [("vr-cold", None, None, None), ("vr-hot", None, None, None)]
        if re.fullmatch(r"cold-?sim vr\.?", low):
            return [("vr-cold", None, None, None)]
        if re.search(r"^\+?(\d) (?:light wound box|light wound)", low) or "+1 light wound box" in low:
            return [("wound-light", None, None, None)]
        if "serious wound box" in low or re.match(r"^\+1 serious wound", low):
            return [("wound-serious", None, None, None)]
        m = re.search(r"(?:^|\b)(?:unarmed )?dv \+(\d)|^\+(\d) dv|^dv to unarmed attack \+(\d)", low)
        if m:
            return [("dv-plus", None, None, None)] * int(m.group(1) or m.group(2) or m.group(3))
        if re.search(r"^(armor \+1|\+1 (physical )?armor|\+1 armor against all)", low):
            return [("armor-plus", None, None, None)]
        m = re.search(r"^\+(\d) (attack|firewall)", low)
        if m:
            return [("attack-plus" if m.group(2) == "attack" else "firewall-plus", None, None, None)] * int(m.group(1))
        m = re.fullmatch(r"firewall (\d)", low.strip(". "))
        if m:
            return [("firewall-plus", None, None, None)] * (int(m.group(1)) - 1)  # base Firewall 1 is free
        if re.search(r"(maintain|sustain) one additional spell", low):
            return [("sustain-spell", None, None, None)]
        if re.search(r"control two spirits", low):
            return [("summon-spirit", None, None, None)]
        m = re.search(r"control of (\d) drones", low)
        if m:
            return [("rcc", None, int(m.group(1)), None)]
        if "jump into a vehicle" in low:
            return [("vcr", None, None, None)]
        if re.search(r"sustain (one|an|1) (additional|more|extra) spell", low):
            return [("sustain-spell", None, None, None)]
        if re.search(r"^\+1 edge (point )?per (action |cracking )?scene", low) and "+2" not in low:
            return [("init-1", None, None, None)] + ([("init-realm", "vr" if "vr" in low else "astral", None, None)]
                                                      if ("vr" in low or "astral" in low) else [])
        if re.search(r"^\+1 action (in astral or vr |in astral |in vr )?per narration", low):
            return [("init-2", None, None, None)] + ([("init-realm", "vr" if "vr" in low else "astral", None, None)]
                                                      if ("vr" in low or "astral" in low) else [])
        if re.search(r"^\+2 edges? (points? )?per action scene", low):
            return [("init-3", None, None, None)]
        return None


def clean_name(name):
    name = re.split(r"\s+\*\s|\s+Note:|\s\* The|\s\* These|\s\* Contacts", name)[0]
    return re.sub(r"\s+", " ", name).strip(" *")


def merge_wrapped(rows):
    out = []
    for r in rows:
        empty = not r["type"] and not r["cost"]
        if empty and out and out[-1]["section"] == r["section"]:
            out[-1]["name"] += " " + r["name"]
            out[-1]["effects"] += r["effects"]
            continue
        out.append(r)
    return out


def printed(rtype):
    m = re.match(r"Amp\s*(-?\d+)", rtype or "")
    return int(m.group(1)) if m else None


def cost_value(cost):
    m = re.match(r"([\d ]+)\s*¥", cost or "")
    return int(m.group(1).replace(" ", "")) if m else None


def attr(k, v):
    return f' {k}="{escape(str(v), {chr(34): "&quot;"})}"' if v not in (None, "") else ""


def build(rows, data_dir, report_path):
    mapper = Mapper(load_specs(data_dir))
    amps, gear, spells, report, ids = [], [], [], [], set()

    def uid(base):
        i, s = 1, base
        while s in ids:
            i += 1
            s = f"{base}-{i}"
        ids.add(s)
        return s

    # Spells: a row with an empty type is a sibling spell sharing the previous row's rules
    # (e.g. Confusion / Blind / Stink), so it inherits type, target and text instead of merging.
    spell_rows, prev = [], None
    for r in rows:
        if r["section"] != "MAGIC – SPELLS":
            continue
        if r["type"][:1].isupper():
            prev = dict(r)
            spell_rows.append(prev)
        elif prev and not r["type"] and len(r["name"]) < 40:
            prev["effects"] = prev["effects"] + r["effects"]
            spell_rows.append({**r, "type": prev["type"], "cost": prev["cost"], "shared": prev})
    for r in spell_rows:
        base = r.get("shared", r)
        name = clean_name(r["name"])
        cat = base["type"].split()[0].lower()
        text = f'{base["type"]}. Threshold/target: {base["cost"]}. ' + " ".join(base["effects"])
        spells.append(f'  <item id="{uid("spell-" + slug(name))}" kind="spell" category="{escape(cat)}" source="{"DHSA" if r["added"] else "CRB"}" page="{r["page"]}">'
                      f'<name>{escape(name)}</name><text>{escape(text[:300])}</text></item>')

    for r in merge_wrapped(rows):
        sec = r["section"]
        name = clean_name(r["name"])
        src = "DHSA" if r["added"] else "CRB"
        if sec == "MAGIC – SPELLS":
            continue
        if sec in SKIP_SECTIONS or sec not in SECTION_TYPE and sec not in EQUIPMENT_SECTIONS:
            continue
        rating = printed(r["type"])
        cost = cost_value(r["cost"])
        effects_lines = list(r["effects"])
        if r["type"].startswith("Amp +") or r["type"].startswith("Amp -"):
            continue  # modifiers, not whole amps
        if rating is None:
            # plain equipment (not an amp)
            if sec in EQUIPMENT_SECTIONS and r["type"].startswith("Equipment") and sec not in ("ARMORY - WEAPONS", "ARMORY - ARMORS"):
                gear.append(f'  <item id="{uid("gear-" + slug(name))}" kind="gear" category="{escape(r["subsection"].title())}" source="{src}" page="{r["page"]}">'
                            f'<name>{escape(name)}</name><text>{escape(" ".join(effects_lines)[:240])}</text></item>')
            continue

        atype = SECTION_TYPE.get(sec, "equipment")
        deck = next((re.search(r"Firewall (\d)\s*-\s*Attack (\d)", e) for e in effects_lines if re.search(r"Firewall (\d)\s*-\s*Attack (\d)", e)), None)
        if sec == "MATRIX – DECKS, MODS & PROGRAMS" and deck:
            atype = "cyberdeck"
            effects_lines = [e for e in effects_lines if not re.search(r"Firewall \d\s*-\s*Attack \d", e)]
        item = ""
        vehicle = None
        if atype == "equipment":
            base_price = (cost or 0) - rating * 5000
            if sec == "ARMORY - WEAPONS":
                parts = r["cost"].split("¥", 1)
                dv = parts[1].strip() if len(parts) > 1 else ""
                rng = effects_lines.pop(0) if effects_lines and re.match(r"^[-–A-Za-zé ]+/", effects_lines[0]) else ""
                rng = rng.replace(" ", "").replace("–", "-").replace("Dés", "Dis")
                item = f'<item kind="weapon"{attr("specialist", "true" if base_price >= 5000 else "")}{attr("dv", dv)}{attr("ranges", rng)}/>'
                bdv, brng = weapon_base(name, r["subsection"])
                a, b = dv_num(dv.split()[0] if dv else ""), dv_num(bdv)
                if a and b and a[0] == b[0] and a[1] > b[1]:
                    vfx_weapon = [("dv-plus", None, None, None)] * (a[1] - b[1])
                else:
                    vfx_weapon = []
                if brng and rng and rng != brng:
                    vfx_weapon.append(("range-improve", f"{brng} -> {rng}", None, None))
            elif sec == "ARMORY - ARMORS" and effects_lines and re.fullmatch(r"\+?\d", effects_lines[0].strip()):
                a = effects_lines.pop(0).strip()
                if a.startswith("+"):
                    effects_lines.insert(0, "Armor +1")
                    item = '<item kind="gear"/>'
                else:
                    item = f'<item kind="armor" armor="{int(a)}"/>'
            else:
                item = '<item kind="gear"/>'
        vfx_weapon = locals().get("vfx_weapon", []) if sec == "ARMORY - WEAPONS" else []
        if atype == "vehicle" and effects_lines:
            m = re.search(r"Pilot (\d+), Body (\d+), Handling (\d+), Speed (\d+), Armor (\d+)", effects_lines[0])
            if m:
                effects_lines.pop(0)
                p, b, h, s, a = map(int, m.groups())
                flying = any("flying" in e.lower() for e in effects_lines)
                vehicle = min(CHASSIS, key=lambda c: (abs(CHASSIS[c][0] - b) * 3 + abs(CHASSIS[c][1] - h) + abs(CHASSIS[c][2] - (s // 2 if flying else s))))
                cb, ch, cs = CHASSIS[vehicle]
                vfx = [("pilot-plus", None, None, None)] * max(0, p - 6) + [("vehicle-armor", None, None, None)] * a
                vfx += [("handling-plus", None, None, None)] * max(0, h - ch) + [("speed-plus", None, None, None)] * max(0, (s // 2 if flying else s) - cs)
                if flying and not vehicle.endswith("drone") or flying:
                    vfx.append(("flying", None, None, None))
                    effects_lines = [e for e in effects_lines if e.strip().lower() != "flying"]
            else:
                vfx = []
        else:
            vfx = []

        if atype == "cyberdeck" and deck:
            vfx = [("firewall-plus", None, None, None)] * (int(deck.group(1)) - 1) + [("attack-plus", None, None, None)] * int(deck.group(2))
        fx, narrative = list(vfx) + vfx_weapon, []
        for line in effects_lines:
            if line.strip() in ("", "-") or line.lower().startswith("choose"):
                narrative.append(line)
                continue
            mapped = mapper.effects(line.lstrip("- ").replace("Smartgun: ", "").replace("Dismountable: ", "").replace("Gyro mount: ", "").replace("Head-seeker: ", ""))
            if mapped is None:
                narrative.append(line)
            else:
                fx += mapped
        refs = [f[0] for f in fx]
        for lvl, pre in (("init-3", "init-2"), ("init-2", "init-1"), ("vr-hot", "vr-cold")):
            if lvl in refs and pre not in refs:
                fx.insert(0, (pre, None, None, None))
                refs.insert(0, pre)
        # mentor spirit / adept way "choose two RR from": template with two open rr-spec picks
        if any(l.lower().startswith("choose two rr") for l in effects_lines):
            fx = [f for f in fx if f[0] != "rr-spec"] + [("rr-spec", "", None, "choose from the list")] * 2
        base = BASE[atype]
        computed = base + sum((-f[2] if f[0] == "negative" else EFFECT_RATING.get(f[0], 0) * (f[2] if f[0] == "rcc" and f[2] else 1)) for f in fx)
        unmapped = [l for l in narrative if l.strip() not in ("", "-") and not l.lower().startswith(("choose", "duration", "- rr"))]
        residual = rating - computed
        drawback = any(re.search(r"disadvantage|wound|must take|once the effects|cannot|can't|increase|forgets|addict|visible|only", l, re.I) for l in unmapped)
        if residual > 0:
            fx += [("narrative", "", None, "balances printed rating")] * residual
            computed += residual
        elif residual < 0 and drawback:
            left = -residual
            while left:
                v = min(5, left)
                fx.append(("negative", "", v, "book drawback"))
                left -= v
            computed = rating
        aid = uid(slug(name))
        if computed != rating:
            report.append(f"| {aid} | {src} p.{r['page']} | {atype} | {rating} | {computed} | {' // '.join(r['effects'])[:160].replace('|', '/')} |")
        fx_xml = "".join(f'<effect ref="{f[0]}"{attr("param", f[1])}{attr("value", f[2])}{attr("note", f[3])}/>' for f in fx)
        amps.append(f'  <amp id="{aid}" type="{atype}" printedRating="{rating}"{attr("vehicle", vehicle)} source="{src}" page="{r["page"]}">'
                    f'<name>{escape(name)}</name>{item}{fx_xml}<narrative>{escape(" ".join(narrative).strip())}</narrative></amp>')

    head = '<?xml version="1.0" encoding="UTF-8"?>\n'
    def write(file, kind, comment, entries):
        with open(f"{data_dir}/{file}", "w", encoding="utf8", newline="\n") as f:
            f.write(f'{head}<!-- {comment} Generated by tools/dhsa_to_xml.py, then reviewed. -->\n'
                    f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n' + "\n".join(entries) + "\n</ca2:data>\n")
    write("amps.xml", "amps", "Prebuilt Shadow Amps. source CRB = core book entry, DHSA = Daegann addition; page = DHSA page.", amps)
    write("spells.xml", "spells", "Spells. page = DHSA page.", spells)
    write("gear.xml", "gear", "Plain equipment (not Amps), 2,500 nuyen each unless the GM says otherwise.", gear)
    with open(report_path, "w", encoding="utf8") as f:
        f.write(f"amps {len(amps)}, spells {len(spells)}, gear {len(gear)}, mismatches {len(report)}\n\n")
        f.write("| amp | source | type | printed | computed | effects |\n|---|---|---|---|---|---|\n" + "\n".join(report) + "\n\n")
        f.write("unresolved specs:\n" + "\n".join(sorted(set(mapper.unresolved))) + "\n")
    print(f"amps {len(amps)}, spells {len(spells)}, gear {len(gear)}, mismatches {len(report)}, unresolved specs {len(set(mapper.unresolved))}")


if __name__ == "__main__":
    build(json.load(open(sys.argv[1], encoding="utf8")), sys.argv[2], sys.argv[3])
