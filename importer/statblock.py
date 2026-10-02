"""Runner stat blocks in the converter's Markdown -> sample characters, plus every number the block prints.

parse_statblock(page) reads one stat page of the pregen booklet: section anchors (KEYWORDS, SKILLS, WEAPONS,
ARMOR, WOUNDS, DISPOSITIONS, CUES, SPELLS, COMPLEX FORMS, SHADOW AMPS, EQUIPMENT), bold skill rows
"Name R ATT DP [RR]" (R "-" = unrated) with "(Spec +2) ATT DP [RR]" rows under them ("+2" = an owned
specialization; without it, a pool of the skill with another attribute or an RR condition), bold weapon, armor
and amp names. crb_statblock(page) reads the core rulebook's layout into the same shape, plus the printed
attributes and knowledge skills.

to_character(block, rules, ...) builds the runner (the .ca2.json shape; character_xml() writes it as our
character XML) and the report rows. Rules, applied the same way to every block:
  - Attributes: the printed row (the core rulebook); where none is printed (the booklet), each is the most
    common value implied by the printed pools (DP - rating, -2 for a specialization), the unarmed DV (STR) and
    the bare "No armor" and "Mental" rows (STR, WIL); on a tie the armor row wins.
  - Amps as printed (the owner's rule: a sample is what the book prints, its problems shown, never corrected in the
    file): the printed type, the effects the lines map to (DHSA's Mapper plus the booklet's shorthands; one the amp
    type can't take is kept, and Review flags it), a line no effect reads kept word for word as the amp's text. Nothing
    is added, dropped or retyped to meet the printed rating: the printed rating is kept on the amp's snapshot
    (printedRating), and where the rules give another, Review says so (and the report row has status "mismatch").
  - Items as printed: every printed armor, weapon and gear entry (the free starting gear is the app's own, added when
    the runner loads); no overrides, no markers.
  - Every printed pool, threshold, Essence and amp rating is a report row with a status: "ok" (the rules
    give the same number), "attribute" (rolled with an attribute the rules don't use for that pool),
    "contradicts" (disagrees with the attributes the rest of the sheet gives, or with the rules' armor).
"""
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter

from importer import core_file, mechanics_roots
from importer.recipes.dhsa import DHSA_SPECS, Mapper

ATTRS = ("str", "agi", "wil", "log", "cha")
ANCHORS = ("KEYWORDS", "SKILLS", "WEAPONS", "ARMOR", "WOUNDS", "DISPOSITIONS", "CUES", "SPELLS", "COMPLEX FORMS",
           "SHADOW AMPS", "EQUIPMENT")
A = r"(STR|AGI|WIL|LOG|CHA)"
SKILL_ROW = re.compile(rf"^\*\*(.+?) (\d+|-) {A} (\d+)(?: (\(?\d\)?))?\*\*$")
SPEC_ROW = re.compile(rf"^\(([^)]*?)(\s*\+2)?\)?\s+{A}\s+(\d+)(?:\s+(\(?\d\)?))?$")
WEAPON_ROW = re.compile(r"^(?:(\d+)x )?\*\*(.+?)\*\*\*?(?: \((.+?)\))? (\S+) (?:\[(.+)\]|\S+)$")
ARMOR_ROW = re.compile(r"^\*\*(.+?)\*\*\s+(\d+) (\d+) (\d+)$")
AMP_ROW = re.compile(r"^(?:(\d+)x )?\*\*(.+?)\*\* \((.+?)\) \*\*(?:(-?[\d.]+) )?(\d+)\*\*$")
BOLD_NAME = re.compile(r"^\*\*(.+?)\*\**(?:\s+(.*))?$")
METATYPES = ("human", "elf", "dwarf", "ork", "troll")

# printed amp type -> our amp type (vehicles and metatype traits are recognized by pattern)
AMP_TYPES = {"quality": "quality", "awakened": "awakened", "adept power": "adept", "cyberware": "cyberware",
             "bioware": "bioware", "equipment": "equipment", "weapon": "equipment", "armor": "equipment",
             "cyberdeck": "cyberdeck", "contact": "contact", "emerged": "emerged"}
VEHICLE = re.compile(r"vehicle|drone", re.I)
# weapon type as printed -> shipped weapon type (weapons.xml ids)
WEAPON_ALIASES = {"smg": "submachine-gun", "hand taser": "taser", "stun gloves": "advanced-close-quarter",
                  "mounted assault rifles": "assault-rifle", "blades": "long-weapon", "club": "long-weapon", "knife": "short-weapon",
                  "whip": "advanced-close-quarter"}  # a monofilament whip (CRB p.144)
# a weapon row printed without a type: an implant or a hand-to-hand weapon named for what it is (short weapons, CRB
# p.142: knives, knuckles, implanted claws and blades)
SHORT_WEAPON = re.compile(r"\b(knuckles?|spurs?|claws?|razors?)\b", re.I)
# a mount the chassis doesn't come with: the effect table's "additional mount, concealed, turret, etc." (CRB p.62)
ENHANCED_MOUNT = re.compile(r"\b(additional|second|concealed|hidden|turret|retractable)\b", re.I)
# a line that limits an effect: a catalog amp's rules price above the printed one by a Negative effect
LIMITED = re.compile(r"\bonly\b|first interaction|disadvantage|wears? off|must take", re.I)
# words too common to tie an Equipment amp to an item by name
LINK_STOP = {"with", "from", "high", "their", "into", "kit", "and", "the"}
# spec names the booklet uses for a shipped specialization (DHSA's aliases also apply)
SPEC_NAMES = {("engineering", "explosives"): "engineering.demolitions", ("piloting", "aerial drones"): "piloting.flying-drones"}
# a vehicle's printed stats (the CRB puts its kind first: "Sedan: Pilot N, …")
VSTATS = re.compile(r"\bPilot (\d+),? Body (\d+),? Handling (\d+),? Speed (\d+)(?: \(Flying \d+\))?,? Armor (\d+)")


def _slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()  # "Capitán" -> "capitan"
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")


def load_rules(data=None):
    """Core mechanics the recipe needs: skills (+ DHSA's specs), amp types and effects, chassis, armor and weapon
    types, from `data` or the core files (importer.core_dir) plus what imported books add to skills, amp types and
    effects. Never a book catalog."""
    def root(f):
        return ET.parse(os.path.join(data, f) if data else core_file(f)).getroot()

    def roots(f):
        return [root(f)] if data else mechanics_roots(f)
    skills, specs = {}, {}
    for s in (s for r in roots("skills.xml") for s in r.iter("skill")):
        sid = s.get("id")
        skills.setdefault(sid, {"name": s.findtext("name"), "attr": s.get("attr"), "alt": s.get("alt"), "specs": {}})
        skills[sid]["specs"].update({sp.get("id"): sp.get("attr") for sp in s.iter("spec")})
        specs.update({(sid, sp.text.strip().lower()): sp.get("id") for sp in s.iter("spec")})
    for sk, sp, attr, _, name in DHSA_SPECS:  # the DHSA import adds these; the booklet uses them
        if sk not in skills:
            continue
        skills[sk]["specs"].setdefault(f"{sk}.{sp}", attr)
        specs[(sk, name.lower())] = f"{sk}.{sp}"
    effects = {e.get("id"): {"rating": float(e.get("rating")), "types": e.get("types", "").split(),
                             "essence": float(e.get("essence") or 0)} for r in roots("ampeffects.xml") for e in r}
    types = {t.get("id"): {"base": int(t.get("base")), "after": int(t.get("baseAfterFirst") or t.get("base")),
                           "essence": float(t.get("essence"))} for r in roots("amptypes.xml") for t in r}
    chassis = {v.get("id"): (int(v.get("body")), int(v.get("handling")), int(v.get("speed"))) for v in root("vehicles.xml")}
    pilot = {v.get("id"): int(v.get("pilot")) for v in root("vehicles.xml")}
    mounts = {v.get("id"): _weapon_size(v.get("mount") or "any") for v in root("vehicles.xml")}
    armor = {}
    for i in root("armor.xml"):
        armor.setdefault(int(i.get("armor")), i.get("id"))
    weapons = {i.findtext("name").lower(): i.get("id") for i in root("weapons.xml")}
    weapons.update({i.get("id").replace("-", " "): i.get("id") for i in root("weapons.xml")})
    specialist = {i.get("id") for i in root("weapons.xml") if i.get("specialist") == "true"}
    return {"skills": skills, "specs": specs, "effects": effects, "types": types, "chassis": chassis, "pilot": pilot, "mounts": mounts,
            "armor": armor, "weapons": weapons, "specialist": specialist, "names": {v["name"].lower(): k for k, v in skills.items()}}


# ---------------------------------------------------------------- parsing

def _bullets(lines):
    out = []
    for t in lines:
        if t.startswith("•"):
            out.append(t.lstrip("• ").strip())
        elif out:
            out[-1] += " " + t
    return out


def _join_wrapped(lines):
    """Effect lines: one that starts lowercase continues the line before."""
    out = []
    for t in lines:
        (out.__setitem__(-1, out[-1] + " " + t) if out and t[:1].islower() else out.append(t))
    return out


def _split_top(s):
    """"a, b (c, d), e" -> ["a", "b (c, d)", "e"]"""
    out, depth, cur = [], 0, ""
    for ch in s:
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [p.strip().rstrip(".") for p in out + [cur] if p.strip()]


def parse_statblock(md_page):
    """One stat page -> {keywords, skills, weapons, armor, dispositions, cues, spells, forms, amps, equipment}."""
    sec, parts = None, {k: [] for k in ANCHORS}
    for t in (ln.strip() for ln in md_page.splitlines()):
        head = next((a for a in ANCHORS if t.startswith(a) and t == t.upper()), None)
        if head:
            sec = head
        elif sec and t:
            parts[sec].append(t)

    skills = []
    for t in parts["SKILLS"]:
        m = SKILL_ROW.match(t)
        if m:
            name, r, attr, dp, rr = m.groups()
            skills.append({"name": name, "rating": None if r == "-" else int(r), "attr": attr.lower(), "dp": int(dp), "rr": rr, "specs": []})
            continue
        m = SPEC_ROW.match(t)
        if m and skills and t.startswith("("):  # a line that doesn't open a row continues a wrapped condition
            name, plus2, attr, dp, rr = m.groups()
            skills[-1]["specs"].append({"name": name.strip(), "plus2": bool(plus2), "attr": attr.lower(), "dp": int(dp), "rr": rr})

    weapons = []
    for t in parts["WEAPONS"]:
        m = WEAPON_ROW.match(t)
        if m:
            n, name, kind, dv, ranges = m.groups()
            weapons.append({"name": name, "kind": kind, "dv": dv, "ranges": ranges, "count": int(n or 1), "notes": []})
        elif weapons:
            weapons[-1]["notes"].append(t)

    armor = []
    for t in parts["ARMOR"]:
        m = ARMOR_ROW.match(t)
        if m:
            name, l, s, inc = m.groups()
            k = re.match(r"(.*?)\s*\(([+\d]+)\)$", name)
            armor.append({"name": k.group(1) if k else name, "armor": k.group(2) if k else None, "l": int(l)})

    amps = []
    for t in parts["SHADOW AMPS"]:
        m = AMP_ROW.match(t)
        if m:
            n, name, atype, ess, rating = m.groups()
            amps.append({"name": name, "type": atype, "ess": abs(float(ess)) if ess else None, "rating": int(rating),
                         "count": int(n or 1), "lines": []})
        elif amps:
            amps[-1]["lines"].append(t)
    for a in amps:
        a["lines"] = _join_wrapped(a["lines"])

    def names(lines):
        return [m.group(1).rstrip("*") for m in map(BOLD_NAME.match, lines) if m]

    equipment, buf = [], ""
    for t in parts["EQUIPMENT"]:  # comma lists wrap after a comma; a lowercase line continues an item
        if buf.endswith(",") or (buf and t[:1].islower()):
            buf += " " + t
        else:
            equipment += _split_top(buf)
            buf = t
    equipment += _split_top(buf)

    return {"keywords": _bullets(parts["KEYWORDS"]), "skills": skills, "weapons": weapons, "armor": armor,
            "dispositions": _bullets(parts["DISPOSITIONS"]),
            "cues": [c.strip("“”\" ") for c in _bullets(parts["CUES"])],
            "spells": names(parts["SPELLS"]), "forms": names(parts["COMPLEX FORMS"]), "amps": amps, "equipment": equipment}


# ---------------------------------------------------------------- the core rulebook's layout

CRB_HEADS = ("SKILLS RATING", "KNOWLEDGE SKILLS", "SHADOW AMPS", "WEAPONS", "EQUIPMENT WOUNDS", "KEYWORDS", "DISPOSITIONS",
             "CUES", "RISK LEVEL")
CRB_LABELS = ("edge", "cha", "log", "wil", "agi", "str")  # the attribute labels top to bottom
CRB_AMP = re.compile(r"^\*\*(?:(\d+) (?:[×x] )?)?(.+?)(?: \(([^()]+)\))?\*\*(?: ([\d.]+))? (\d+)$")
CRB_WEAPON = re.compile(r"^\*\*(?:(\d+) [×x] )?(.+?)\*\*(?: \(([^()]+)\))? DV (\S+) \[([^\]]*)\]")
CRB_WOUND = re.compile(r"(No armor|Main armor|Secondary armor|Mental|Matrix)\s*(?:\(([^()]*?) (\d+)\))?\s*(\d+) (\d+) (\d+)"
                       r"(?:\s*\(([^()]*?) (\d+)\))?")


def _plain(s):
    """Small-caps text as the converter reads it ("grumPy OLd mAn"): lower case, then sentence case."""
    s = re.sub(r"\bi\b", "I", s.lower())
    return re.sub(r"(^|[.!?…] )(\w)", lambda m: m.group(1) + m.group(2).upper(), s)


def _crb_amp_lines(lines):
    """The CRB's amp effect lines in the booklet's phrasing, one effect a line: a line ending in "," or a lone
    "Tests" continues the one before; "A; B", "A. B" and "Attack N, Firewall N" are two effects; "Drug: +1 …"
    loses its label; "by narration", "cold- and hot-sim", "Jumping in vehicles", "control up to N vehicles"
    and "RR 1 on Tests for X Tests" (a typo) read as the booklet (and DHSA's Mapper) put them."""
    joined = []
    for t in lines:
        if joined and not t.startswith("**") and (joined[-1].endswith(",") or re.match(r"Tests?\b", t)):
            joined[-1] += " " + t
        else:
            joined.append(t)
    out = []
    for t in joined:
        if t.startswith("**"):
            out.append(t)
            continue
        t = re.sub(r"(Attack \d+), (Firewall \d+)", r"\1; \2", t)
        t = re.sub(r"cold- (?:and|or) hot-sim", "cold-sim and hot-sim", t, flags=re.I)
        t = re.sub(r"\bby narration\b", "per narration", t)
        t = re.sub(r"\bJumping in vehicles\b", "jump into vehicles", t, flags=re.I)
        t = re.sub(r"control up to (\d+) vehicles(?: or drones)?", r"control of \1 drones", t)
        t = re.sub(r"\bRR (\d) on Tests for ", r"RR \1 on ", t)
        for part in re.split(r"[;.] (?=[A-Za-z+])|, (?=\+\d)", t):
            part = re.sub(r"^[A-Z][\w -]*: (?=\+\d)", "", part.strip())
            if part:
                out.append(part[:1].upper() + part[1:])
    return out


def crb_statblock(md_page):
    """A core rulebook stat page in parse_statblock's shape, plus the printed attributes and knowledge skills.

    The CRB page differs from the booklet: attribute labels stacked with their values detached (the first two
    values sit on the AGILITY and STRENGTH lines, the other four follow: EDGE, CHA, LOG, WIL, AGI, STR in
    order); skill rows "**Skill** R ATT **DP**", some as 4-cell pipe rows, a spec rolled with two attributes as
    "LOG/AGI DP/DP"; amps "**Name (type)** [Essence] Rating"; weapons "**Name** (type) DV n [ranges] Weapon", with
    the spells in the same list ("… Spell"); the equipment list and the threshold rows share lines; keywords,
    dispositions and cues in small caps, one per line (cues wrap: split at sentence ends)."""
    sec, parts, top = None, {h: [] for h in CRB_HEADS}, []
    for t in (ln.strip() for ln in md_page.replace("�", ".").splitlines()):  # the book prints "." as U+FFFD
        head = next((h for h in CRB_HEADS if t.startswith(h)), None)
        if head:
            sec = head
        elif t:
            (parts[sec] if sec else top).append(t)

    attrs = {}
    first = [int(m.group(1)) for m in (re.fullmatch(r"(?:AGILITY|STRENGTH) (\d)", t) for t in top) if m]
    rest = [int(t) for t in top if re.fullmatch(r"\d", t)]
    if len(first) + len(rest) == len(CRB_LABELS):
        attrs = {k: v for k, v in zip(CRB_LABELS, first + rest) if k in ATTRS}

    out = ["SKILLS RATING"]
    for t in parts["SKILLS RATING"]:
        if t.startswith("|---"):
            continue
        cells = [c.strip() for c in t.strip("|").split("|")] if t.startswith("|") else None
        t = " ".join(c for c in cells if c) if cells else t
        t = re.sub(r"^\((\w)", lambda m: "(" + m.group(1).upper(), t.replace("**", ""))  # "(Whips +2)", as the booklet
        m = re.fullmatch(r"(\(.*\)) (\w+)/(\w+) (\d+)/(\d+)", t)
        if m:  # a spec rolled with either of two attributes
            out += [f"{m.group(1)} {m.group(2)} {m.group(4)}", f"{m.group(1)} {m.group(3)} {m.group(5)}"]
        else:
            out.append(t if t.startswith("(") else f"**{t}**")

    out.append("SHADOW AMPS")
    for t in _crb_amp_lines(parts["SHADOW AMPS"]):
        m = CRB_AMP.match(t)
        if m:
            n, name, atype, ess, rating = m.groups()
            atype = atype or name  # "**Awakened** 5": the type is the name, the kind on the next line
            out.append(f"{n + 'x ' if n else ''}**{name}** ({atype}) **{'-' + ess + ' ' if ess else ''}{rating}**")
            w = re.search(r" with an? (.+)$", name)
            if w:  # "Cyberarm with a Heavy pistol": the weapon is part of the Amp
                out.append(f"Integrated {w.group(1).lower()}")
        else:
            out.append(t)

    weapons, spells = ["WEAPONS"], ["SPELLS"]
    for t in parts["WEAPONS"]:
        if t.endswith(" Spell"):  # "**Name** (type…) Spell"; the bold may stop short of the name's end
            name = re.sub(r"\*\* (?=[a-z])", "", t).replace("**", "")  # "**Za** p (…)" -> "Zap (…)"
            spells.append("**" + name.split(" (")[0].strip() + "**")
            continue
        m = CRB_WEAPON.match(t)
        if m and "astral" not in (m.group(3) or ""):  # an astral-only unarmed attack isn't a weapon
            n, name, kind, dv, ranges = m.groups()
            out_kind = f" ({kind})" if kind else ""
            weapons.append(f"{n + 'x ' if n else ''}**{name}**{out_kind} {dv} [{ranges}]")

    wounds = " ".join(parts["EQUIPMENT WOUNDS"]).replace("**Thresholds Light Serious Incap.**", " ")
    armor = ["ARMOR"]
    for m in CRB_WOUND.finditer(wounds):
        label, name, rating, l, s, i, name2, rating2 = m.groups()
        if label in ("Main armor", "Secondary armor"):
            name, rating = (name, rating) if name else (name2, rating2)
            armor.append(f"**{name} ({rating})** {l} {s} {i}")
        else:
            armor.append(f"**{label}** {l} {s} {i}")
    equipment = ["EQUIPMENT", re.sub(r"\s+", " ", CRB_WOUND.sub(" ", wounds)).strip()]

    cues = re.split(r"(?<=[.!?…]) ", _plain(" ".join(parts["CUES"])))
    out += weapons + spells + armor + equipment
    out += ["KEYWORDS"] + [f"• {_plain(t)}" for t in parts["KEYWORDS"]]
    out += ["DISPOSITIONS"] + [f"• {_plain(t)}" for t in parts["DISPOSITIONS"]]
    out += ["CUES"] + [f"• {c}" for c in cues if c]
    block = parse_statblock("\n".join(out))
    block["attributes"] = attrs
    block["knowledge"] = [k.strip() for t in parts["KNOWLEDGE SKILLS"] for k in t.split(",") if k.strip()]
    return block


def pdf_narrative(page):
    """{"dispositions", "cues"} as a core rulebook stat page lays them out (a pdfplumber page), or {} when it has neither
    heading. The Markdown loses where one wraps: a disposition or a cue may take two lines, and a cue two sentences
    ("There's always a way. I just need …"). On the page each item starts a new slot, further below the line above it
    than a wrapped line is; so a line more than 1.15 of its type size below the last starts the next item."""
    chars = sorted((c for c in page.chars if c["x0"] > page.width * 0.62), key=lambda c: c["top"])
    lines = []  # [top, size, chars]: a slightly tilted line's pieces sit a few points apart
    for c in chars:
        if lines and c["top"] - lines[-1][0] < 4.5:
            lines[-1][2].append(c)
        else:
            lines.append([c["top"], c["size"], [c]])
    out, sec, prev = {}, None, None
    for top, size, cs in lines:
        text = re.sub(r"\s+", " ", "".join(c["text"] for c in sorted(cs, key=lambda c: c["x0"]))).strip()
        head = text.replace(" ", "").upper()
        if head in ("DISPOSITIONS", "CUES"):
            sec, prev = head.lower(), None
            out[sec] = []
        elif head.startswith(("RISK", "RR", "KEYWORDS")):
            sec = None
        elif sec and text:
            if prev is not None and top - prev <= 1.15 * size:
                out[sec][-1] += " " + text
            else:
                out[sec].append(text)
            prev = top
    return {k: [_plain(x).strip("“”\" ") for x in v] for k, v in out.items()}


# ---------------------------------------------------------------- effects

def _fx(ref, param=None, value=None, note=None, n=1):
    return [(ref, param, value, note)] * n


def _line_effects(line, atype, mapper):
    """Effects for one effect line: [] = consumed with no effect (a weapon profile, a stat line), None = unmapped."""
    low = line.lower().strip(" .")
    if re.search(r"\b(?:vd|dv) \d+ \(", low):
        return []
    if VSTATS.search(line):  # priced against the chassis in map_amp
        return _fx("flying") if atype == "vehicle" and re.search(r"\bflying\b", low) else []
    if re.fullmatch(r"vr (cold|hot)-?sim", low):
        return _fx("vr-cold" if "cold" in low else "vr-hot")
    m = re.fullmatch(r"attack (\d)", low)
    if m:
        return _fx("attack-plus", n=int(m.group(1)))
    if "delta grade" in low or "omega grade" in low:
        return _fx("grade-delta" if "delta" in low else "grade-omega")
    if re.search(r"\bdv\b.*\bagainst\b", low):  # a situational DV bonus is not DV +1
        return None
    m = re.search(r"\(dv\) \+(\d)", low)
    if m:
        return _fx("dv-plus", n=int(m.group(1)))
    if atype == "vehicle":
        if re.search(r"\bflying\b|rotor|copter|winged", low):
            return _fx("flying")
        if "safety override" in low:
            return _fx("safety-override")
        if re.search(r"\b(integrated|mounted|storage rail)\b", low):
            return _fx("weapon-mount", line)
        m = re.search(r"\+(\d) armor", low)
        if m:
            return _fx("vehicle-armor", n=int(m.group(1)))
    m = re.search(r"sustain up to (\d) additional spells", low)
    if m:
        return _fx("sustain-spell", n=int(m.group(1)))
    m = re.match(r"\+1 (action|attack) per narration", low)
    if m:
        return _fx("init-2") + (_fx("init-realm", "vr") if re.search(r"\bvr\b|jump", low) else [])  # jumped in = VR
    fx = mapper.effects(line)
    return None if fx is None else list(fx)


def _awakened(line):
    low = line.lower()
    fx = [r for w, r in (("adept", "awk-adept"), ("sorcery", "awk-sorcery"), ("conjuring", "awk-conjuring")) if w in low]
    if "projection" in low:
        fx.append("awk-astral-projection")
    elif "astral perception" in low:
        fx.append("awk-astral-perception")
    return [(r, None, None, None) for r in fx] or None


def amp_rating(rules, atype, fx, first_quality=True):
    t = rules["types"].get(atype, {"base": 0, "after": 0})
    base = t["base"] if atype != "quality" or first_quality else t["after"]
    eff = rules["effects"]
    return base + int(sum(-(f[2] or 1) if f[0] == "negative" else eff[f[0]]["rating"] * (f[2] if f[0] == "rcc" and f[2] else 1)
                          for f in fx if f[0] in eff))


def amp_essence(rules, atype, fx):
    base = rules["types"].get(atype, {}).get("essence", 0)
    return max(0, base + sum(rules["effects"][f[0]]["essence"] for f in fx if f[0] in rules["effects"])) if base else 0


def _weapon_size(text):
    """How big a weapon a text names, or a chassis' mount takes ("up to submachine guns", "none", "any"): 0 none,
    1 pistols, 2 submachine guns, 3 rifles and shotguns, 9 anything bigger or unnamed."""
    low = text.lower()
    for size, pat in ((0, r"^none"), (1, r"pistol|holdout|taser"), (2, r"\bsmgs?\b|submachine"), (3, r"rifle|riffle|shotgun")):
        if re.search(pat, low):
            return size
    return 9


def _chassis(amp, rules):
    words = " ".join([amp["type"]] + amp["lines"]).lower()
    m = re.search(r"vehicle - ([a-z-]+)", amp["type"].lower())
    if m and m.group(1) in rules["chassis"]:
        return m.group(1)
    if re.search(r"\b(mini|micro)drone", words):
        return "microdrone"
    for size in ("small", "medium", "large"):
        if re.search(rf"\b{size}\b.*drone", words):
            return f"{size}-drone"
    m = re.search(r"Body (\d+), Handling (\d+), Speed (\d+)", " ".join(amp["lines"]))
    if not m:
        return None
    b, h, s = map(int, m.groups())
    ground = s // 2 if re.search(r"\bflying\b|rotor|copter|winged", words) else s
    return min(rules["chassis"], key=lambda c: abs(rules["chassis"][c][0] - b) * 3 + abs(rules["chassis"][c][1] - h)
               + abs(rules["chassis"][c][2] - ground))


def map_amp(amp, rules, mapper, first_quality, catalog=False):
    """-> (type, effects, narrative lines, vehicle, computed rating). A runner's amp as printed: no effect added, dropped
    or retyped to meet the printed rating. catalog: a catalog amp the sheets print (crb.sheet_amps) is priced as the
    book prints it, as the DHSA catalog is (docs/book-discrepancies.md): an effect its type can't take stays text, the
    chassis' own mount takes its first weapon, and the rating meets the printed one (_catalog_price)."""
    printed = amp["type"].lower()
    lines = [re.sub(r"\bwepaons\b", "weapons", ln) for ln in amp["lines"]]  # a typo in the booklet
    lines = [re.sub(r"\bRanged weapon\b(?!s)", "Ranged Weapons", ln, flags=re.I) for ln in lines]
    atype = AMP_TYPES.get(printed) or ("vehicle" if VEHICLE.search(printed) else None)
    # a deck's stats on an amp printed as another type (a "Quality"): a deck in the catalog; a runner's amp keeps its printed type
    if (catalog or atype is None) and any(re.search(r"Firewall \d\s*[–-]\s*Attack \d", ln) for ln in lines):
        atype = "cyberdeck"
    fx, loose = [], []
    if atype == "awakened":
        for ln in lines:
            got = _awakened(ln)
            (fx.extend(got) if got else loose.append(ln))
        if not fx and "adept" in amp["name"].lower():
            fx = _fx("awk-adept")
    else:
        for ln in lines:
            got, unmapped = [], []
            for seg in re.split(r"\s+–\s+", ln):  # "DNI – VR cold-sim – VR hot-sim"
                e = _line_effects(seg, atype, mapper)  # on a runner, an effect the type can't take is kept: Review flags it
                if e and catalog:
                    e = [f for f in e if atype in rules["effects"].get(f[0], {}).get("types", [])] or None
                (unmapped.append(seg) if e is None else got.extend(e))
            fx += got
            if unmapped:
                loose.append(ln if not got else " – ".join(unmapped))
    refs = [f[0] for f in fx]
    for lvl, pre in (("init-3", "init-2"), ("init-2", "init-1"), ("vr-hot", "vr-cold")):
        if lvl in refs and pre not in refs:
            fx.insert(0, (pre, None, None, None))
            refs.insert(0, pre)
    vehicle = _chassis(amp, rules) if atype == "vehicle" else None
    if vehicle and catalog:  # the chassis' one front-facing mount (CRB p.60) takes the first weapon that fits
        own = next((f for f in fx if f[0] == "weapon-mount" and not ENHANCED_MOUNT.search(f[1] or "")
                    and _weapon_size(f[1] or "") <= rules["mounts"].get(vehicle, 9)), None)
        if own:
            fx.remove(own)
            loose.append(own[1])
    stats = next((m for m in map(VSTATS.search, lines) if m), None) if vehicle else None
    if stats:  # what the printed stats add to the chassis: Pilot over the chassis's, Armor
        # ponytail: handling/speed over the chassis aren't priced (the booklet's printed speeds don't charge them)
        fx += _fx("pilot-plus", n=max(0, int(stats.group(1)) - rules["pilot"][vehicle])) + _fx("vehicle-armor", n=int(stats.group(5)))
    if atype == "vehicle" and amp["count"] > 1:
        fx += _fx("extra-drone", n=amp["count"] - 1)
    if catalog:
        atype, fx, loose = _catalog_price(amp, rules, atype, fx, loose, first_quality)
    return atype, fx, loose, vehicle, amp_rating(rules, atype, fx, first_quality)


def _catalog_price(amp, rules, atype, fx, loose, first_quality):
    """A catalog amp's rating meets the printed one: printed higher, unread lines become narrative effects (+1 each), as
    many as the gap; printed lower and a line limits the effect ("only", "first interaction"): a Negative "book
    drawback"; "Astral perception & projection" on an Awakened amp priced one lower: perception only; a "(Quality)"
    priced as Equipment (foci): Equipment. Never on a runner's amp."""
    rate = lambda t, f: amp_rating(rules, t, f, first_quality)  # noqa: E731
    want = amp["rating"]
    if atype == "awakened" and rate(atype, fx) == want + 1 and "awk-astral-projection" in (f[0] for f in fx):
        fx = [("awk-astral-perception", None, None, None) if f[0] == "awk-astral-projection" else f for f in fx]
    if atype == "quality" and rate(atype, fx) != want and rate("equipment", fx) == want:
        atype = "equipment"
    gap = want - rate(atype, fx)
    if gap > 0:
        take = sorted(loose, key=lambda ln: not re.search(r"[+\d]", ln))[:gap // max(1, int(rules["effects"]["narrative"]["rating"]))]
        fx = fx + [("narrative", ln, None, None) for ln in take]
        loose = [ln for ln in loose if ln not in take]
    elif gap < 0 and any(LIMITED.search(ln) for ln in amp["lines"]):
        fx = fx + _fx("negative", value=-gap, note="book drawback")
    return atype, fx, loose


# ---------------------------------------------------------------- the runner

def _num(x):
    return int(x) if float(x).is_integer() else x


def _weapon_id(rules, kind):
    k = kind.lower()
    return rules["weapons"].get(WEAPON_ALIASES.get(k, k).replace("-", " ")) or rules["weapons"].get(k)


def _norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def catalog_id(name, ids):
    """The id of the catalog entry `name` names: the same normalized name, or the only entry whose name starts
    with it ("Lightning" -> Lightning bolt). ids: normalized name -> id."""
    n = _norm(name)
    hits = [v for k, v in ids.items() if k.startswith(n + " ")]
    return ids.get(n) or (hits[0] if len(hits) == 1 else None)


def to_character(block, rules, sid, name, role, origin, background, updated, spell_ids=None, page=None):
    """-> (character dict in the .ca2.json shape, report rows). spell_ids (normalized name -> catalog id) links the
    spells to the book's catalog; one that doesn't resolve is reported. Each amp keeps its printed rating on its snapshot
    (source `origin`, `page`): Review compares it with the rules' rating. No overrides: what the book prints against a
    guideline shows on Review as it would for any runner."""
    mapper = Mapper({**rules["specs"], **SPEC_NAMES})

    def spec_id(skill, text):
        return mapper.spec(skill, text) or "custom:" + text

    # ---- amps (first: the unarmed DV vote needs their DV bonuses)
    amps, report = [], []
    traits = [a for a in block["amps"] if a["type"].lower() in METATYPES]
    for a in (a for a in block["amps"] if a not in traits):
        first = not any(x["type"] == "quality" for x in amps)  # the rules price the first Quality from 0
        atype, fx, loose, vehicle, computed = map_amp(a, rules, mapper, first)
        if atype is None:
            report.append({"kind": "amp-type", "sample": sid, "name": a["name"], "printed": a["type"]})
            continue
        uid = f"amp-{len(amps) + 1}"
        amps.append({"uid": uid, "type": atype, "name": a["name"], "narrative": " ".join(loose),
                     "effects": [{k: v for k, v in zip(("ref", "param", "value", "note"), f) if v not in (None, "")} for f in fx],
                     **({"vehicle": vehicle} if vehicle else {}), "_fx": fx, "_ess": a["ess"],
                     "snapshot": {"id": f"{sid}.{uid}", "type": atype, "name": a["name"], "printedRating": a["rating"],
                                  "vehicle": vehicle, "source": origin, "page": page}})
        report.append({"kind": "amp", "sample": sid, "key": uid, "name": a["name"], "printed": a["rating"],
                       "computed": computed, "status": "ok" if computed == a["rating"] else "mismatch"})

    # ---- attributes: the most common value each printed number implies
    votes = {k: [] for k in ATTRS}
    for s in block["skills"]:
        votes[s["attr"]].append(s["dp"] - (s["rating"] or 0))
        for x in s["specs"]:
            votes[x["attr"]].append(x["dp"] - (s["rating"] or 0) - (2 if x["plus2"] else 0))
    unarmed = next((w for w in block["weapons"] if w["name"].lower() == "unarmed"), None)
    dv_plus = sum(f[0] == "dv-plus" for a in amps if a["type"] != "equipment" for f in a["_fx"])
    if unarmed and unarmed["dv"].isdigit():
        votes["str"].append(int(unarmed["dv"]) - dv_plus)
    bare = {r["name"].lower(): r["l"] for r in block["armor"]}
    tie = {"str": bare.get("no armor"), "wil": bare.get("mental")}
    for k, v in tie.items():
        if v is not None:
            votes[k].append(v)
    attrs = dict(block.get("attributes") or {})  # printed (the core rulebook prints them)
    for k in ATTRS:
        c = Counter(votes[k]).most_common()
        top = [v for v, n in c if n == c[0][1]] if c else [1]
        attrs.setdefault(k, tie.get(k) if tie.get(k) in top else top[0])

    # ---- skills
    skills, rows = [], []
    for s in block["skills"]:
        sk = rules["names"].get(s["name"].lower())
        if sk is None:
            report.append({"kind": "unknown-skill", "sample": sid, "name": s["name"]})
            continue
        own = list(dict.fromkeys(spec_id(sk, x["name"]) for x in s["specs"] if x["plus2"]))  # a spec rolled with two attributes prints twice
        if s["rating"]:
            skills.append({"id": sk, "rating": s["rating"], "specs": own})
            rows.append((sk, None, s["attr"], s["dp"], s["rating"]))
            for x in s["specs"]:
                sp = spec_id(sk, x["name"]) if x["plus2"] else None
                rows.append((sk, sp, x["attr"], x["dp"], s["rating"] + (2 if sp else 0)))
    for sk, sp, attr, dp, base in rows:
        info = rules["skills"][sk]
        if sp:
            first = info["specs"].get(sp, info["attr"])
            alt = info["alt"] if info["alt"] and first == info["attr"] and all(v == info["attr"] for v in info["specs"].values()) else None
            ok_attrs = [first] + ([alt] if alt else [])
        else:
            ok_attrs = [info["attr"]] + ([info["alt"]] if info["alt"] else [])
        status = "attribute" if attr not in ok_attrs else "ok" if base + attrs[attr] == dp else "contradicts"
        report.append({"kind": "pool", "sample": sid, "key": f"{sp or sk}@{attr}", "skill": sk, "spec": sp, "attr": attr,
                       "printed": dp, "status": status})

    # ---- items
    items = []

    def item(kind, nm, **kw):
        items.append({"uid": f"it-{len(items) + 1}", "kind": kind, "name": nm, **{k: v for k, v in kw.items() if v is not None}})
        return items[-1]
    worn, prev = [], 0  # (item, printed row, the armor worn)
    for r in block["armor"]:
        if r["armor"] is None:
            continue
        # the row's armor as printed: "(2+1)" is 3, "(+1)" the row above plus 1
        v = (prev if r["armor"].startswith("+") else 0) + sum(int(x) for x in r["armor"].split("+") if x)
        prev = v
        worn.append((item("armor", r["name"], armor=v, catalogId=rules["armor"].get(v)), r, v))
    for w in block["weapons"]:
        # no type printed: a weapon named by its type ("Stun Gloves", "Submachine Gun"), an implant named for what it is
        # ("Implanted knuckles", bought as a weapon on top of its cyberware), else an attack (unarmed, astral)
        kind = w["kind"] or (w["name"] if _weapon_id(rules, w["name"]) else "knife" if SHORT_WEAPON.search(w["name"]) else None)
        # repeats: another configuration of one weapon, or the same weapon's astral row ("Made-up knife in astral")
        if kind is None or w["name"] in (i["name"] for i in items) or re.search(r"\bin astral\b", w["name"], re.I):
            continue
        cid = _weapon_id(rules, kind)
        for _ in range(w["count"]):  # "2x Sword": two items
            item("weapon", w["name"], catalogId=cid, specialist=None if cid and cid not in rules["specialist"] else True)
        if not cid:
            report.append({"kind": "unmatched-item", "sample": sid, "item": "weapon", "name": w["name"], "printed": kind,
                           "status": "unmatched"})
    for n in block["spells"]:
        cid = catalog_id(n, spell_ids) if spell_ids is not None else None
        item("spell", n, catalogId=cid)
        if spell_ids is not None and not cid:
            report.append({"kind": "unmatched-item", "sample": sid, "item": "spell", "name": n, "status": "unmatched"})
    for n in block["forms"]:
        item("complex-form", n)
    # every printed entry, "Fake SIN" and "Commlink" too: the app makes those its free starting gear when it loads the runner
    for n in block["equipment"]:
        if n.lower() not in (i["name"].lower() for i in items):
            item("gear", n)

    # An Equipment amp is on a printed item (CRB p.60): the item of its name (the same name, one name in the other, else
    # the most shared words). None printed: no item is made up, and Review says the amp needs one.
    def words(s):
        return {w.rstrip("s") for w in _norm(s).replace("-", " ").split() if len(w) >= 4 and w not in LINK_STOP}
    for a in (a for a in amps if a["type"] == "equipment"):
        taken = {x.get("linkedItem") for x in amps}
        free = [i for i in items if i["kind"] in ("gear", "weapon", "armor") and i["uid"] not in taken]
        n = _norm(a["name"])
        shared = max(free, key=lambda i: len(words(i["name"]) & words(a["name"])), default=None)
        hit = next((i for i in free if _norm(i["name"]) == n), None) \
            or next((i for i in free if n in _norm(i["name"]) or _norm(i["name"]) in n), None) \
            or (shared if shared and words(shared["name"]) & words(a["name"]) else None)
        if hit:
            a["linkedItem"] = hit["uid"]

    # ---- thresholds and Essence, as the rules give them
    fx_all = [f for a in amps for f in a["_fx"]]
    mental = sum(f[0] == "mental-armor" for f in fx_all)
    always = sum(f[0] == "armor-plus" for a in amps if a["type"] != "equipment" for f in a["_fx"])
    emerged = any(a["type"] == "emerged" for a in amps)
    deck = next((a for a in amps if a["type"] == "cyberdeck"), None)
    firewall = attrs["wil"] if emerged else 1 + sum(f[0] == "firewall-plus" for f in deck["_fx"]) if deck else None
    keyed = [("physicalNone", attrs["str"] + always)]
    for (it, r, v), key in zip(worn, ("physicalMain", "physicalAlt")):
        keyed.append((key, attrs["str"] + v + always))
    by_row = {"no armor": "physicalNone", "mental": "mental", "matrix": "matrix"}
    worn_rows = {id(r): k for (_, r, _), k in zip(worn, ("physicalMain", "physicalAlt"))}
    rules_value = dict(keyed, mental=attrs["wil"] + mental, matrix=firewall)
    for r in block["armor"]:
        key = worn_rows.get(id(r)) or by_row.get(r["name"].lower())
        if key is None:
            report.append({"kind": "threshold", "sample": sid, "name": r["name"], "printed": r["l"], "status": "untested"})
            continue
        report.append({"kind": "threshold", "sample": sid, "key": key, "printed": r["l"],
                       "status": "ok" if rules_value.get(key) == r["l"] else "contradicts"})
    printed_ess = _num(round(6 - sum(a["ess"] or 0 for a in block["amps"]), 2))
    computed_ess = _num(round(6 - sum(amp_essence(rules, a["type"], a["_fx"]) for a in amps), 2))
    report.append({"kind": "essence", "sample": sid, "printed": printed_ess, "computed": computed_ess,
                   "status": "ok" if printed_ess == computed_ess else "mismatch"})

    meta = next((a["type"].lower() for a in traits), None) or next(
        (m for k in block["keywords"] for m in METATYPES if re.search(rf"\b{m}\b", k.lower())), "human")
    for a in amps:
        del a["_fx"], a["_ess"]
    build = {"attributes": attrs, "skills": skills, "knowledge": block.get("knowledge", []), "amps": amps, "items": items}
    if worn:
        build["mainArmor"] = worn[0][0]["uid"]
    if len(worn) > 1:
        build["altArmor"] = worn[1][0]["uid"]
    ch = {"formatVersion": 1, "id": sid,
          "identity": {"name": name, "streetName": name, "metatype": meta, "background": background, "notes": ""},
          "narrative": {"keywords": block["keywords"], "dispositions": block["dispositions"], "cues": block["cues"]},
          "level": "runner", "package": "free", "origin": origin, "build": build, "career": [], "overrides": [],
          "updatedAt": updated}
    return ch, report


def sample(block, rules, src, name, role, page, background, updated, taken, spell_ids=None):
    """One runner -> (samples-list entry, report rows with the page). Its id is "<src>.<name>", or -2, -3… when
    that file is already in `taken` (the entries so far)."""
    base = sid = f"{src.lower()}.{_slug(name) or 'runner'}"
    n = 2
    while any(x["file"] == f"{sid}.xml" for x in taken):
        sid, n = f"{base}-{n}", n + 1
    ch, rows = to_character(block, rules, sid=sid, name=name, role=role, origin=src, background=background,
                            updated=updated, spell_ids=spell_ids, page=page)
    return ({"file": f"{sid}.xml", "xml": character_xml(ch), "name": name, "role": role, "page": page},
            [{**r, "page": page} for r in rows])


# ---------------------------------------------------------------- character XML (src/engine/charxml.ts)

CHAR_NS = "urn:chummer-anarchy2:character:1"


def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _el(name, attrs, children=""):
    a = "".join(f' {k}="{_esc(str(v).lower() if isinstance(v, bool) else v)}"' for k, v in attrs.items() if v not in (None, ""))
    return f"<{name}{a}>{children}</{name}>" if children else f"<{name}{a}/>"


def _text(name, s):
    return f"<{name}>{_esc(s)}</{name}>" if s else ""


def character_xml(ch):
    """Byte for byte what characterToXml writes (formatVersion 1), for a character (or NPC) without career or item snapshots;
    an amp's snapshot is the printed amp: its type, name, printed rating, source and page
    (tests/engine/pregen-sample.test.ts holds both writers to the same file)."""
    b = ch["build"]
    fx = lambda e: _el("effect", {k: e.get(k) for k in ("ref", "param", "value", "note")})
    snap = lambda t: "<snapshot>" + _el("amp", {k: t.get(k) for k in ("id", "type", "printedRating", "vehicle", "source", "page")},
                                        _text("name", t["name"]) + "<narrative></narrative>") + "</snapshot>"
    amp = lambda a: _el("amp", {k: a.get(k) for k in ("uid", "type", "name", "catalogId", "linkedItem", "vehicle")},
                        _text("narrative", a.get("narrative")) + "".join(map(fx, a["effects"])) + (snap(a["snapshot"]) if a.get("snapshot") else ""))
    item = lambda i: _el("item", {k: i.get(k) for k in ("uid", "kind", "name", "catalogId", "specialist", "armor", "dv", "ranges", "price")})
    npc = ch.get("npc")
    body = [*([_el("npc", {k: npc.get(k) for k in ("kind", "tier", "fightingSpirit")})] if npc else []),
            _text("portrait", ch["identity"].get("portrait")) + _text("token", ch["identity"].get("token")), _text("background", ch["identity"].get("background")), _text("notes", ch["identity"].get("notes")),
            *(f"<keyword>{_esc(k)}</keyword>" for k in ch["narrative"]["keywords"]),
            *(f"<disposition>{_esc(k)}</disposition>" for k in ch["narrative"]["dispositions"]),
            *(f"<cue>{_esc(k)}</cue>" for k in ch["narrative"]["cues"]),
            _el("build", {"mainArmor": b.get("mainArmor"), "altArmor": b.get("altArmor")},
                _el("attributes", {a: b["attributes"][a] for a in ATTRS})
                + "".join(_el("skill", {"id": s["id"], "rating": s["rating"]}, "".join(f"<spec>{_esc(x)}</spec>" for x in s["specs"])) for s in b["skills"])
                + "".join(f"<knowledge>{_esc(k)}</knowledge>" for k in b["knowledge"])
                + "".join(map(amp, b["amps"])) + "".join(map(item, b["items"]))),
            ""]  # no career, no overrides
    idn = ch["identity"]
    root = {"formatVersion": ch["formatVersion"], "id": ch["id"], "streetName": idn.get("streetName"), "name": idn.get("name"),
            "metatype": idn["metatype"], "level": ch["level"], "package": ch["package"], "origin": ch.get("origin"),
            "updatedAt": ch["updatedAt"]}
    a = "".join(f' {k}="{_esc(v)}"' for k, v in root.items() if v is not None)  # an empty value is kept, as in characterToXml
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:character xmlns:ca2="{CHAR_NS}"{a}>\n  '
            + "\n  ".join(body) + "\n</ca2:character>\n")
