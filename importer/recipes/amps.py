"""The Anarchy amp/effect engine the book recipes share: breaking an amp's, spell's or form's text into effects from
ampeffects.xml (Mapper, item_effects, read_amp), pricing them against the core data (core, reconcile), and the
skill/spec tables and id slugs those readings use.

Used by the CRB (crb, crb_core, crb_npcs), the Anarchy 2.0 Conversion Guide recipe (cg) and the DHSA fan supplement (dhsa),
and by importer.statblock for the stat-block readers. A canon book's import never includes DHSA content
(owner ruling, 2026-10-21), so load_skills here returns only the core skills and specs and what imported books add.
Imports no recipe and not importer.statblock (statblock imports this module).
"""

import functools
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from importer import core_dir, core_file, custom_dir, effects as rules_fx, mechanics_roots

SKILLS = {
    "athletics": "athletics",
    "close combat": "close-combat",
    "conjuring": "conjuring",
    "cracking": "cracking",
    "electronics": "electronics",
    "engineering": "engineering",
    "influence": "influence",
    "network": "network",
    "perception": "perception",
    "piloting": "piloting",
    "ranged weapons": "ranged-weapons",
    "sorcery": "sorcery",
    "stealth": "stealth",
    "survival": "survival",
    "tasking": "tasking",
}
ATTRS = {"strength": "str", "agility": "agi", "willpower": "wil", "logic": "log", "charisma": "cha"}
SPEC_ALIASES = {
    ("ranged-weapons", "pistol"): "pistols",
    ("ranged-weapons", "smg"): "submachine-guns",
    ("ranged-weapons", "smgs"): "submachine-guns",
    ("ranged-weapons", "rifle"): "rifles",
    ("ranged-weapons", "assault rifles"): "rifles",
    ("ranged-weapons", "assault rifle"): "rifles",
    ("ranged-weapons", "sniper rifles"): "rifles",
    ("ranged-weapons", "gr. launchers"): "grenade-launchers",
    ("ranged-weapons", "grenade- launcher"): "grenade-launchers",
    ("ranged-weapons", "heavy weapon"): "heavy-weapons",
    ("stealth", "physical"): "physical-sneaking",
    ("stealth", "astral"): "astral-sneaking",
    ("stealth", "matrix"): "matrix-sneaking",
    ("perception", "visual"): "physical",
    ("perception", "audio"): "physical",
    ("athletics", "ranged defence"): "ranged-defense",
    ("close-combat", "unarmed combat"): "unarmed",
    ("close-combat", "blade"): "blades",
    ("close-combat", "lames"): "blades",
    ("cracking", "brute-force"): "brute-force",
    ("electronics", "matrix searches"): "matrix-search",
    ("tasking", "complex form"): "complex-forms",
}


# the base weapon type a weapon's name or sub-list names: its DV and ranges are the core weapons file's (weapons.xml)
WEAPON_KEYS = [
    (("hold-out", "streetline", "palm pistol", "tiffani"), "hold-out-pistol"),
    (("machine pistol", "crusader", "black scorpion", "steyr tmp", "super squirt"), "machine-pistol"),
    (("light pistol", "light fire", "beretta", "colt america", "fichetti", "puzzler"), "light-pistol"),
    (("heavy pistol", "predator", "warhawk", "manhunter", "ultra power", "slivergun"), "heavy-pistol"),
    (("taser", "super shock", "pulsar"), "taser"),
    (("smg", "submachine", "cobra", "uzi", "praetor", "hk 227", "ingram smartgun"), "submachine-gun"),
    (("shotgun", "t-250", "mossberg", "spas", "roomsweeper"), "shotgun"),
    (
        ("sniper", "anti-materiel", "anti-material", "barrett", "desert strike", "sm-6", "gauss", "panther"),
        "sniper-rifle",
    ),
    (
        ("assault rifle", "ak-97", "alpha", "colt m23", "fn har", "dart", "sport rifle", "remington 750", "ruger 100"),
        "assault-rifle",
    ),
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
    ratings = {
        e.get("id"): int(float(e.get("rating")))
        for r in mechanics_roots("ampeffects.xml")
        for e in r
        if e.tag == "effect"
    }
    maxes = {
        e.get("id"): int(e.get("max"))
        for r in mechanics_roots("ampeffects.xml")
        for e in r
        if e.tag == "effect" and e.get("max")
    }
    base = {t.get("id"): int(t.get("base")) for r in mechanics_roots("amptypes.xml") for t in r if t.tag == "amptype"}
    root = lambda n: ET.parse(core_file(n)).getroot()  # noqa: E731
    chassis = {
        v.get("id"): (int(v.get("body")), int(v.get("handling")), int(v.get("speed")))
        for v in root("vehicles.xml")
        if v.tag == "vehicle"
    }
    pilot = {v.get("id"): int(v.get("pilot")) for v in root("vehicles.xml") if v.tag == "vehicle"}
    weapons = {
        w.get("id"): (w.get("dv", "").replace("STR+", "S+"), w.get("ranges"))
        for w in root("weapons.xml")
        if w.tag == "item"
    }
    price = next(p for p in root("pricing.xml") if p.tag == "pricing")
    return {
        "ratings": ratings,
        "maxes": maxes,
        "base": base,
        "chassis": chassis,
        "pilot": pilot,
        "weapons": weapons,
        "ampPoint": int(price.get("ampPoint")),
        "specialist": int(price.get("weaponSpecialist")),
    }


def specialist(cost, rating):
    """A weapon amp whose price, less its rating in amp points, is a specialist weapon's."""
    c = core()
    return (cost or 0) - rating * c["ampPoint"] >= c["specialist"]


def core():
    """_core for the core files in use now (importer.core_dir and the custom folder)."""
    return _core((core_dir(), custom_dir()))


def effect_rating(ref):
    return core()["ratings"].get(ref, 0)


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


def load_skills(path=None):
    """{skill id: (name, attr)} and {(skill id, lowercase spec name): spec id}: the core skills (`path`, else the core
    files plus what imported books add). Never DHSA's specs (dhsa.dhsa_skills adds those for its own recipe)."""
    roots = [ET.parse(path).getroot()] if path else mechanics_roots("skills.xml")
    skills, specs = {}, {}
    for root in roots:
        for s in root.iter("skill"):
            skills.setdefault(s.get("id"), (s.findtext("name"), s.get("attr")))
        specs.update({(sp.get("id").split(".")[0], sp.text.strip().lower()): sp.get("id") for sp in root.iter("spec")})
    return skills, specs


def slug(s):
    s = (
        s.lower()
        .replace("’", "")
        .replace("'", "")
        .replace("™", "")
        .replace("é", "e")
        .replace("è", "e")
        .replace("à", "a")
    )
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def parts(s):
    """Top-level parts of "A (x), B and C (y and z)": split at ",", " and ", " or " outside parentheses."""
    out, cur, depth, k = [], "", 0, 0
    while k < len(s):
        depth += (s[k] == "(") - (s[k] == ")" and depth > 0)
        sep = re.match(r",?\s+(?:and|or)\s+|,\s*", s[k:]) if depth == 0 else None
        if sep:
            out.append(cur)
            cur, k = "", k + sep.end()
            continue
        cur += s[k]
        k += 1
    return [c.strip() for c in out + [cur] if c.strip()]


# effects that a clause's condition (`when …`) keeps from counting: the rest carry theirs in their param (a custom spec,
# an initiative realm)
WHEN_REFS = {"dv-plus", "armor-plus", "mental-armor", "wound-light", "wound-serious", "firewall-plus", "attack-plus"}


def stated(fx, clause, entry=""):
    """`fx` read from `clause` with how the clause turns them on (importer/effects.py state): a dose's Duration makes them
    activated; a condition holds back the effects that have no param for it (WHEN_REFS)."""
    st = rules_fx.state(clause, entry)
    out = []
    for f in fx:
        if len(f) > 4:
            out.append(f)
            continue
        own = {
            k: v
            for k, v in st.items()
            if k == "switch" and v == "activated" or (k in ("when", "switch") and f[0] in WHEN_REFS and "when" in st)
        }
        out.append((*f, own) if own else f)
    return out


def fx_xml(fx):
    """<effect>s for (ref, param, value, note[, state]) tuples."""
    return "".join(
        f'<effect ref="{f[0]}"{attr("param", f[1])}{attr("value", f[2])}{attr("note", f[3])}'
        + "".join(attr(k, v) for k, v in (f[4] if len(f) > 4 else {}).items())
        + "/>"
        for f in fx
    )


# Tests named by activity or type -> the skills they use (CRB's skill chapter, pp.53-57: what each skill covers), every one
ACTIVITIES = [
    (
        r"social|persua|convinc|negotiat|bluff|lie\b|lying|seduc|intimidat|etiquette|impersonat|charm|interrogat",
        ("influence",),
    ),
    (r"social|contacts?|favou?rs?|connections?|acquir|gather(?:ing)? information|rumou?r", ("network",)),
    (r"matrix|hack|cyber|program|device|electronic|commlink|computer|data\b|files?\b", ("cracking", "electronics")),
    (r"magic|spell|sorcer|ritual|counterspell|mana\b", ("sorcery",)),
    (r"magic|summon|banish|spirit", ("conjuring",)),
    (r"resonance|complex form|sprite|thread", ("tasking",)),
    (r"melee|close combat|hand-to-hand|unarmed|brawl|grappl|blade|fist|punch|kick", ("close-combat",)),
    (r"shoot|shot|firearm|gun|ranged attack|throw|aim", ("ranged-weapons",)),
    (r"combat|attack|fight", ("close-combat", "ranged-weapons")),
    (r"driv|pilot|vehicle|drone|chase|race|steer|speed|outrun|outpace", ("piloting",)),
    (
        r"speed|outrun|outpace|run\b|running|sprint|climb|jump|swim|parkour|acrobat|escap|dodg|balance|bonds",
        ("athletics",),
    ),
    (
        r"sneak|hid(?:e|ing)|stealth|infiltrat|palm|pickpocket|lockpick|maglock|shadow(?:ing)?|tail(?:ing)?",
        ("stealth",),
    ),
    (
        r"perceiv|perception|notic|spot|search|listen|observ|look|see\b|seeing|sens(?:e|ing)|detect|analy[sz]|clue|pattern|read(?:ing)? lips",
        ("perception",),
    ),
    (r"heal|first aid|medic|stabili[sz]|wound|navigat|track|wilderness|surviv|composure|fear|animal", ("survival",)),
    (r"repair|fix|build|craft|engineer|demolition|explosive|mechanic|tinker", ("engineering",)),
]


def activity_skills(words):
    """The skill ids a Test named by what it does uses ("Tests involving speed", "social Tests", "climb a metal
    structure"): every skill whose activities the words name, else []."""
    out = []
    for rx, skills in ACTIVITIES:
        if re.search(rf"\b(?:{rx})", words, re.I):
            out += [s for s in skills if s not in out]
    return out


# spec names too common to name a Test alone ("a social Test" is any social Test, not Perception (social))
GENERIC_SPECS = {"social", "physical", "astral", "matrix", "defense", "animals", "engineering", "magic", "media"}


def _clean_test(s):
    return re.sub(
        r"\s+", " ", re.sub(r"^(?:all|any|every|most|some|the|their|a|an|on)\s+|\s+tests?$", "", s.strip(), flags=re.I)
    ).strip(" .,;:-")


# "of your choice" and the like: the player picks the spec when buying the Amp
WILDCARD = re.compile(r"choice|choose|chosen|of your|to be determined|depending|any specialization", re.I)


class Mapper:
    def __init__(self, specs):
        self.specs = specs
        self.unresolved = []
        # the readings added with the narrative effect kinds (DV+1 unspaced, VR initiative, ranges set…): off for an
        # amp whose printed rating they'd overshoot (read_amp)
        self.extended = True

    def tests(self, phrase):
        """Test ids a phrase names ("Close Combat and Athletics (ranged defense)", "Charisma- and Willpower-based",
        "Survival (first aid) + Logic", "Intimidation"): skill, spec or attribute ids, "" for every Test. A phrase with a
        part that names none of them is one Test of its own words, custom:<phrase> (as an RR spec the skills don't have).
        """
        p = re.sub(r"\s*\+\s*(?:strength|agility|willpower|logic|charisma)\b", "", phrase, flags=re.I)
        p = re.sub(
            r"(strength|agility|willpower|logic|charisma)and\b", r"\1 and", p, flags=re.I
        )  # "Strengthand" (a joined line)
        p = re.sub(r"-\s+and\b", " and", re.sub(r"-?\s*\b(?:based|related)\b", "", p, flags=re.I)).strip()
        out = []
        for part in parts(p):
            m = re.fullmatch(r"(.+?)(?:\s*\((.*)\))?", part)
            name = re.sub(
                r"^(?:(?:all|any|every|most|some|the|their|a|an|on|other)(?:\s+|$))+", "", m.group(1).strip().lower()
            ).strip(" -")
            name = re.sub(r"\s+tests?$", "", name)
            spec = m.group(2)
            if name in ("", "test", "tests", "all", "actions", "all actions", "action"):
                out.append("")
            elif name in ATTRS:
                out.append(ATTRS[name])
            elif name in SKILLS:
                out.append((self.spec(SKILLS[name], spec) if spec else SKILLS[name]) or None)
            else:  # a spec named alone ("Intimidation"), when its name is its own (not "social", "physical")
                own = [v for (sk, n), v in self.specs.items() if n == name]
                out.append(own[0] if len(own) == 1 and name not in GENERIC_SPECS else None)
        if None in out:  # Tests named by what they do: every skill the activity uses (as SR6's test types)
            words = _clean_test(phrase)
            act = activity_skills(words)
            if act:
                return act
            return ["custom:" + words[:1].upper() + words[1:60]] if words else [""]
        return out

    def rules(self, clause, entry=""):
        """The narrative effect kinds `clause` states (importer/effects.py), tests read by tests()."""
        return rules_fx.rules(clause, self.tests, entry)

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
        if self.extended:  # a misprinted doubled parenthesis: "RR 1 Ranged Weapons (Pistols))"
            l = re.sub(r"\){2,}", ")", l)
        if (
            self.extended
        ):  # "RR 1 on all Perception (Social) Tests", "a RR 1 on most of their Influence Tests": the Test named
            l = re.sub(r"\b(RR\s*\d\s+on)\s+(?:all|most\s+of\s+their|any)\s+", r"\1 ", l, flags=re.I)
        l = l.replace("(Pist.)", "(pistols)").replace("Dés", "Dis")
        low = l.lower()
        m = re.search(
            r"RR\s*(\d)\s*(?:on )?(?:tests )?associated with a specialization|RR\s*(\d)\s*\(chosen [a-z ]*skill\)|RR\s*(\d)\s*on skill tests \(skill chosen",
            l,
            re.I,
        )
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
        for m in re.finditer(
            r"RR\s*(\d)\s*(?:on\s+)?([A-Za-z .]+?)\s*(?:\(([^)]*)\))?(?=$|[.,;:]|\s+(?:tests?|when|to|with|against|during|while|if|for|in|on|rr|duration|performed|associated|chosen)\b)",
            l,
            re.I,
        ):
            n, target, spec = int(m.group(1)), m.group(2).strip().lower().rstrip("."), m.group(3)
            if target in ATTRS:
                out += [("rr-attr", ATTRS[target], None, None)] * n
                continue
            skill = SKILLS.get(target)
            if not skill and self.extended and spec and spec.strip().lower() in SKILLS:
                # a misprint (owner's principle): "RR 1 Resonance (tasking)" names its skill in the parenthesis
                skill, spec = SKILLS[spec.strip().lower()], None
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
        mental = re.search(
            r"armor against (spells|biofeedback|astral|magic)|biofeedback filter|armor against astral", low
        )
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
            return (
                [("firewall-plus", None, None, None)] * (n - 1)
                if m.group(1) == "firewall"
                else [("attack-plus", None, None, None)] * n
            )
        if re.search(r"(maintain|sustain) (one|an|1) (additional|more|extra) (spell|complex form)", low):
            return [("sustain-spell", None, None, None)]
        if re.search(r"control (up to )?two spirits", low):
            return [("summon-spirit", None, None, None)]
        m = re.search(r"control of (\d) drones", low)
        if m:
            return [("rcc", None, int(m.group(1)), None)]
        if re.search(r"jump into (a vehicle|vehicles)", low):
            return [("vcr", None, None, None)]
        realm = (
            [("init-realm", "astral" if "astral" in low else "vr", None, None)]
            if re.search(r"\bvr\b|astral|jump", low)
            else []
        )
        if (
            re.search(r"^\+1 edge (point )?per (action |cracking |hacking )?scene", low) and "+2" not in low
        ):  # hacking: cracking
            return [("init-1", None, None, None)] + realm
        if re.search(r"^\+1 action (in astral or vr |in astral |in vr )?per narration", low):
            return [("init-2", None, None, None)] + realm
        if re.search(r"^\+2 edges? (points? )?per action scene", low):
            return [("init-3", None, None, None)]
        return self.more(l, low)

    def more(self, l, low):
        """The rated readings added with the narrative effect kinds (extended), else None."""
        if not self.extended:
            return None
        m = re.search(r"\bdv ?\+ ?(\d)\b", low)
        if m and not re.search(r"\bdv \d", low):
            return [("dv-plus", None, None, None)] * int(m.group(1))
        realm = "astral" if "astral" in low else "vr" if re.search(r"\bvr\b|matrix|jump", low) else None
        m = re.search(r"^\+(\d) edges? (?:points? )?per (?:vr |astral |action |matrix )*scene", low)
        if m:  # a level per printed bonus (CRB p.61), each limited to the realm it names
            lv = (
                3
                if m.group(1) == "2"
                else 2 if re.search(r"\+1 action per (?:vr |astral |action )*narration", low) else 1
            )
            return [(f"init-{k}", None, None, None) for k in range(1, lv + 1)] + [("init-realm", realm, None, None)] * (
                lv if realm else 0
            )
        if re.search(r"^\+1 action per (?:vr |astral |matrix )+narration", low):
            return [("init-2", None, None, None), ("init-realm", realm, None, None)]
        if re.fullmatch(
            r"(?:dni and |direct neural interface,? )?cold-?sim(?: vr)?(?: \(.*\))?\.?", low.strip()
        ):  # VR access alone
            return [("vr-cold", None, None, None)]
        if re.search(r"\b(?:one|1|an) additional light (?:damage|wound) box", low):
            return [("wound-light", None, None, None)]
        if re.search(r"(?:^|\s)\+1 mental armor|\bmental armor \+1", low):
            return [("mental-armor", None, None, None)]
        m = re.search(r"\bvehicle armor by \+(\d)", low)
        if m:
            return [("vehicle-armor", None, None, None)] * int(m.group(1))
        if re.search(r"\branges? of a weapon[^.]*from \W?disadvantage\W? to \W?ok", low):
            return [("range-improve", "a range from Dis to OK (chosen)", None, None)]
        if re.search(r"immune to normal weapons|immunity to normal weapons", low):
            return [("weapon-focus", None, None, None)]
        if re.search(r"\+1 max(?:imum)? sustained spell", low):
            return [("sustain-spell", None, None, None)]
        if re.search(r"compile a second sprite|(?:one|an) additional (?:summoned )?spirit", low):
            return [("summon-spirit", None, None, None)]
        m = re.search(r"\bto\s*\"?\[?\s*((?:ok|dis|-)\s*(?:/\s*(?:ok|dis|-)\s*){3})", low) if "range" in low else None
        if m:  # a range set or increased: the bands as printed
            return [
                ("range-improve", re.sub(r"\s+", "", m.group(1)).replace("ok", "OK").replace("dis", "Dis"), None, None)
            ]
        return None


def one_init(fx):
    """Each initiative level once, and no more realm limits than levels (two lines may print the same level: "+2 Edge
    per VR scene" then "+1 action per VR narration")."""
    seen, out = set(), []
    for f in fx:
        if re.fullmatch(r"init-[123]", f[0]):
            if f[0] in seen:
                continue
            seen.add(f[0])
        out.append(f)
    extra = sum(f[0] == "init-realm" for f in out) - len(seen)
    for _ in range(max(0, extra)):
        out.remove(next(f for f in reversed(out) if f[0] == "init-realm"))
    return out


def read_amp(mapper, read, rating):
    """read() -> (fx, narrative, computed rating), with the Mapper's extended readings. When they price the amp as the book
    does (the narrative effects they replace balanced the printed rating), that reading stands. When they'd overshoot the
    printed rating (canon), or take a drawback the plain reading doesn't, the amp is priced as read without them and what
    they read beyond that is added unpriced: the effects apply, at rating 0 (owner, 2026-10-10; `unpriced_rows` lists
    them for the import report)."""
    out = read()
    mapper.extended = False
    try:
        base = read()
    finally:
        mapper.extended = True
    negatives = lambda fx: sum(f[2] or 1 for f in fx if f[0] == "negative")  # noqa: E731
    if out[2] <= rating and negatives(out[0]) <= negatives(base[0]):
        return out
    left = [f[:3] for f in base[0]]
    extra = []
    for f in out[0]:
        if f[:3] in left:
            left.remove(f[:3])
        elif f[0] not in ("narrative", "negative") and effect_rating(f[0]):
            extra.append((*f[:4], {**(f[4] if len(f) > 4 else {}), "unpriced": "true"}))
    return base[0] + extra, base[1], base[2]


def unpriced_rows(aid, page, fx):
    """Import report rows for an amp's unpriced effects (read_amp)."""
    got = [f[0] + (f":{f[1]}" if f[1] else "") for f in fx if len(f) > 4 and f[4].get("unpriced")]
    return (
        [
            {
                "kind": "effect-unpriced",
                "id": aid,
                "page": page,
                "effects": " ".join(got),
                "problem": "the book states it; its printed rating doesn't pay for it: applied at rating 0",
            }
        ]
        if got
        else []
    )


# an item's armor as a spell grants it: "Increases the Armor Rating applicable to physical / magical / both … attacks"
_ITEM_ARMOR = re.compile(r"\barmor rating applicable to (?:(both) |)(physical|magical)?", re.I)
# "identical to the Initiative Enhancement Amps": the amp effect group it names, every level (the level is by hits)
_INIT_REF = re.compile(
    r"\b(?:identical to|same as)\s+the\s+(?:initiative enhancement|increase initiative)\s+amps\b", re.I
)


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z•–-])|\s+[•–]\s+", text or "") if s.strip()]


# who a spell's or complex form's sentence is about: the one casting or threading it, or its subject or target(s)
_CASTER = re.compile(
    r"\b(?:the|its)\s+(?:caster|magician|mage|wizard|shaman|technomancer|user)\b|\bcaster['’]s\b", re.I
)
_TARGET = re.compile(
    r"\b(?:the\s+subject|subject['’]s|the\s+target|targets?\b|targeted|target['’]s|any\s+(?:target|character)|victims?|"
    r"the\s+(?:persona|device|vehicle|drone|icon))\b",
    re.I,
)


def affects(sentence):
    """`target` when a spell's sentence names its subject or targets first, else `caster` (it names the caster first, or
    no one: owner decision 2026-10-10, both games)."""
    c, t = _CASTER.search(sentence), _TARGET.search(sentence)
    return "target" if t and (not c or t.start() < c.start()) else "caster"


def item_effects(mapper, text, sustained=False, spell=False):
    """An item's effects (a spell, complex form or plain gear) read from its text sentence by sentence: the rated readings
    (RR, Armor, initiative by reference) and the narrative effect kinds. A sustained spell's or form's are
    switch="sustained"; a value that depends on hits is low confidence. A spell's or complex form's (`spell`) say who they
    affect (affects): the caster counts them while sustained, a target's stay on the spell."""
    fx, last = [], "caster"
    for s in sentences(text):
        st = rules_fx.state(s, text)
        if sustained and "when" not in st:
            st = {**st, "switch": "sustained"}
        # a sentence that starts with a pronoun ("They suffer …") is about whom the one before was
        last = last if re.match(r"(?:they|it|he|she|this|these|the latter)\b", s, re.I) else affects(s)
        who = {"affects": last} if spell else {}
        st = {**st, **who}
        bullet = re.match(
            r"\W*\d+\s+(?:net\s+)?(?:hits?|successes)\s*:\s*", s
        )  # "• 3 hits: +1 Edge per action scene": by hits
        if bullet:
            s, st = s[bullet.end() :], {**st, "confidence": "low"}
        rated = (
            mapper.effects(re.sub(r"\bRR (\d) (?:for|to)\b", r"RR \1 on", s))
            if re.search(r"\bRR \d|^\+\d|cold-?sim|hot-?sim", s, re.I)
            else None
        )
        m = _ITEM_ARMOR.search(s)
        if m:
            rated = [("armor-plus", None, None, None)] * (m.group(1) is not None or m.group(2) != "magical") + [
                ("mental-armor", None, None, None)
            ] * (m.group(1) is not None or m.group(2) == "magical")
        if _INIT_REF.search(s):
            rated = [("init-1", None, None, None), ("init-2", None, None, None), ("init-3", None, None, None)]
            st = {**st, "confidence": "low"}
        fx += [(*f[:4], st) for f in rated or []]
        for f in mapper.rules(s, text):
            fx.append(
                (*f[:4], {**f[4], **({"switch": "sustained"} if sustained and "when" not in f[4] else {}), **who})
            )
    seen, out = set(), []
    for f in fx:
        k = (f[0], f[1] or "", f[2])
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out


# "Note: Rating 10 (52,500¥) for characters unable to cast spells" (Psyché, CRB p.150, DHSA p.26): the same entry for
# them, a separate one at that rating, without what only a caster uses (owner, 2026-10-11: "Psyché (non-caster)")
_NON_CASTER = re.compile(r"(?<![A-Za-z])Note:\s*Rating (\d+)\b[^.]*?\bfor characters unable to cast spells", re.I)
CASTER_ONLY = {"sustain-spell"}


def non_caster(text, fx):
    """(rating, effects) of the entry's non-caster version, or None when it prints none."""
    m = _NON_CASTER.search(re.sub(r"\s+", " ", text))
    return (int(m.group(1)), [f for f in fx if f[0] not in CASTER_ONLY]) if m else None


def cost_value(cost):
    m = re.match(r"[+-]?([\d ]+)\s*¥", cost or "")
    return int(m.group(1).replace(" ", "")) if m else None


def attr(k, v):
    return f' {k}="{escape(str(v), {chr(34): "&quot;"})}"' if v not in (None, "") else ""


def reconcile(fx, narrative, base, rating, negative_ok=False, ratings=None):
    """Fill the gap between computed and printed rating (see module docstring). Returns computed rating. `ratings`: effect
    ratings this book defines itself (its implant grades), over the core's."""
    rate = lambda ref: (ratings or {}).get(ref, effect_rating(ref))  # noqa: E731
    computed = base + sum(
        (-f[2] if f[0] == "negative" else rate(f[0]) * (f[2] if f[0] == "rcc" and f[2] else 1)) for f in fx
    )
    unmapped = [
        l for l in narrative if l.strip() not in ("", "-") and not l.lower().startswith(("choose", "duration", "- rr"))
    ]
    residual = rating - computed
    drawback = any(
        re.search(
            r"disadvantage|wound|must take|once the effects|cannot|can't|increase|forgets|addict|visible|only", l, re.I
        )
        for l in unmapped
    )
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
