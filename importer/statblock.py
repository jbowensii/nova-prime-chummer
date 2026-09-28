"""Runner stat blocks in the converter's Markdown -> sample characters, plus every number the block prints.

parse_statblock(page) reads one stat page: section anchors (KEYWORDS, SKILLS, WEAPONS, ARMOR, WOUNDS,
DISPOSITIONS, CUES, SPELLS, COMPLEX FORMS, SHADOW AMPS, EQUIPMENT), bold skill rows "Name R ATT DP [RR]"
(R "-" = unrated) with "(Spec +2) ATT DP [RR]" rows under them ("+2" = an owned specialization; without it,
a pool of the skill with another attribute or an RR condition), bold weapon, armor and amp names.

to_character(block, rules, ...) builds the runner (the .ca2.json shape; character_xml() writes it as our
character XML) and the report rows. Rules, applied the same way to every block:
  - Attributes: no attribute row is printed, so each is the most common value implied by the printed
    pools (DP - rating, -2 for a specialization), the unarmed DV (STR) and the bare "No armor" and "Mental"
    rows (STR, WIL); on a tie the armor row wins.
  - Amp effects come from the effect lines (DHSA's Mapper plus the booklet's shorthands); an effect the
    amp type can't take is dropped. Then the computed rating meets the printed one:
      printed higher: unmapped lines become narrative effects (+1 each), as many as the gap;
      printed lower and a line limits the effect ("only", "first interaction"): a Negative effect;
      "Astral perception & projection" on an Awakened amp priced one lower: perception only;
      a "(Quality)" priced as Equipment (foci): built as Equipment;
      anything else keeps the rules' rating and is reported (status "mismatch").
  - Every printed pool, threshold, Essence and amp rating is a report row with a status: "ok" (the rules
    give the same number), "attribute" (rolled with an attribute the rules don't use for that pool),
    "contradicts" (disagrees with the attributes the rest of the sheet gives, or with the rules' armor).
"""
import os
import re
import xml.etree.ElementTree as ET
from collections import Counter
from xml.sax.saxutils import escape, quoteattr

from importer.recipes.dhsa import DHSA_SPECS, Mapper

DATA = os.path.join(os.path.dirname(__file__), "..", "public", "data")
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
                  "mounted assault rifles": "assault-rifle"}
# spec names the booklet uses for a shipped specialization (DHSA's aliases also apply)
SPEC_NAMES = {("engineering", "explosives"): "engineering.demolitions", ("piloting", "aerial drones"): "piloting.flying-drones"}
# a line that limits an effect: the rules' price is above the printed one by a Negative effect
LIMITED = re.compile(r"\bonly\b|first interaction|disadvantage|wears? off", re.I)


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("’", "").replace("'", "")).strip("-")


def load_rules(data=DATA):
    """Shipped mechanics the recipe needs: skills (+ DHSA's specs), amp types and effects, chassis, armor and
    weapon types. Never a book catalog."""
    def root(f):
        return ET.parse(os.path.join(data, f)).getroot()
    skills, specs = {}, {}
    for s in root("skills.xml").iter("skill"):
        skills[s.get("id")] = {"name": s.findtext("name"), "attr": s.get("attr"), "alt": s.get("alt"),
                               "specs": {sp.get("id"): sp.get("attr") for sp in s.iter("spec")}}
        specs.update({(s.get("id"), sp.text.strip().lower()): sp.get("id") for sp in s.iter("spec")})
    for sk, sp, attr, _, name in DHSA_SPECS:  # the DHSA import adds these; the booklet uses them
        skills[sk]["specs"].setdefault(f"{sk}.{sp}", attr)
        specs[(sk, name.lower())] = f"{sk}.{sp}"
    effects = {e.get("id"): {"rating": float(e.get("rating")), "types": e.get("types", "").split(),
                             "essence": float(e.get("essence") or 0)} for e in root("ampeffects.xml")}
    types = {t.get("id"): {"base": int(t.get("base")), "after": int(t.get("baseAfterFirst") or t.get("base")),
                           "essence": float(t.get("essence"))} for t in root("amptypes.xml")}
    chassis = {v.get("id"): (int(v.get("body")), int(v.get("handling")), int(v.get("speed"))) for v in root("vehicles.xml")}
    armor = {}
    for i in root("armor.xml"):
        armor.setdefault(int(i.get("armor")), i.get("id"))
    weapons = {i.findtext("name").lower(): i.get("id") for i in root("weapons.xml")}
    weapons.update({i.get("id").replace("-", " "): i.get("id") for i in root("weapons.xml")})
    return {"skills": skills, "specs": specs, "effects": effects, "types": types, "chassis": chassis,
            "armor": armor, "weapons": weapons, "names": {v["name"].lower(): k for k, v in skills.items()}}


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


# ---------------------------------------------------------------- effects

def _fx(ref, param=None, value=None, note=None, n=1):
    return [(ref, param, value, note)] * n


def _line_effects(line, atype, mapper):
    """Effects for one effect line: [] = consumed with no effect (a weapon profile, a stat line), None = unmapped."""
    low = line.lower().strip(" .")
    if re.search(r"\b(?:vd|dv) \d+ \(", low) or re.match(r"pilot \d", low):
        return []
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
    m = re.match(r"\+1 (action|attack) per narration", low)
    if m:
        return _fx("init-2") + (_fx("init-realm", "vr") if re.search(r"\bvr\b", low) else [])
    fx = mapper.effects(line)
    return None if fx is None else list(fx)


def _awakened(line):
    low = line.lower()
    fx = [r for w, r in (("sorcery", "awk-sorcery"), ("conjuring", "awk-conjuring")) if w in low]
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


def map_amp(amp, rules, mapper, first_quality):
    """-> (type, effects, narrative lines, vehicle, computed rating)."""
    printed = amp["type"].lower()
    lines = [re.sub(r"\bwepaons\b", "weapons", ln) for ln in amp["lines"]]  # a typo in the booklet
    lines = [re.sub(r"\bRanged weapon\b(?!s)", "Ranged Weapons", ln, flags=re.I) for ln in lines]
    atype = AMP_TYPES.get(printed) or ("vehicle" if VEHICLE.search(printed) else None)
    if any(re.search(r"Firewall \d\s*[–-]\s*Attack \d", ln) for ln in lines):
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
                e = _line_effects(seg, atype, mapper)
                if e:  # effects this amp type can't take: the line stays text
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
    if atype == "vehicle" and amp["count"] > 1:
        fx += _fx("extra-drone", n=amp["count"] - 1)

    rate = lambda t, f: amp_rating(rules, t, f, first_quality)
    want = amp["rating"]
    if atype == "awakened" and rate(atype, fx) == want + 1 and "awk-astral-projection" in refs:
        fx = [("awk-astral-perception", None, None, None) if f[0] == "awk-astral-projection" else f for f in fx]
    if atype == "quality" and rate(atype, fx) != want and rate("equipment", fx) == want:
        atype = "equipment"
    gap = want - rate(atype, fx)
    if gap > 0:  # the printed price covers lines the rules can't read: +1 narrative effect each
        take = sorted(loose, key=lambda ln: not re.search(r"[+\d]", ln))[:gap]
        fx += [("narrative", ln, None, None) for ln in take]
        loose = [ln for ln in loose if ln not in take]
    elif gap < 0 and any(LIMITED.search(ln) for ln in lines):
        fx += _fx("negative", value=-gap, note="book drawback")
    vehicle = _chassis(amp, rules) if atype == "vehicle" else None
    return atype, fx, loose, vehicle, rate(atype, fx)


# ---------------------------------------------------------------- the runner

def _num(x):
    return int(x) if float(x).is_integer() else x


def to_character(block, rules, sid, name, role, origin, background, updated):
    """-> (character dict in the .ca2.json shape, report rows)."""
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
                     **({"vehicle": vehicle} if vehicle else {}), "_fx": fx, "_ess": a["ess"]})
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
    attrs = {}
    for k in ATTRS:
        c = Counter(votes[k]).most_common()
        top = [v for v, n in c if n == c[0][1]] if c else [1]
        attrs[k] = tie.get(k) if tie.get(k) in top else top[0]

    # ---- skills
    skills, rows = [], []
    for s in block["skills"]:
        sk = rules["names"].get(s["name"].lower())
        if sk is None:
            report.append({"kind": "unknown-skill", "sample": sid, "name": s["name"]})
            continue
        own = [spec_id(sk, x["name"]) for x in s["specs"] if x["plus2"]]
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
    worn, prev = [], 0
    for r in block["armor"]:
        if r["armor"] is None:
            continue
        v = prev + int(r["armor"][1:]) if r["armor"].startswith("+") else sum(map(int, r["armor"].split("+")))
        prev = v
        worn.append((item("armor", r["name"], armor=v, catalogId=rules["armor"].get(v)), r))
    for w in block["weapons"]:
        if w["kind"] is None or w["name"] in (i["name"] for i in items):  # unarmed, astral, matrix attacks; repeats
            continue
        k = w["kind"].lower()
        cid = rules["weapons"].get(WEAPON_ALIASES.get(k, k).replace("-", " ")) or rules["weapons"].get(k)
        item("weapon", w["name"], catalogId=cid, specialist=None if cid else True)
    for n in block["spells"]:
        item("spell", n)
    for n in block["forms"]:
        item("complex-form", n)
    for n in block["equipment"]:
        if n.lower() not in (i["name"].lower() for i in items):
            item("gear", n)

    def norm(s):
        return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    for a in amps:
        if a["type"] == "equipment":
            hit = next((i for i in items if norm(i["name"]) == norm(a["name"])), None) or \
                next((i for i in items if norm(a["name"]) in norm(i["name"]) or norm(i["name"]) in norm(a["name"])), None)
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
    for (it, r), key in zip(worn, ("physicalMain", "physicalAlt")):
        keyed.append((key, attrs["str"] + it["armor"] + always))
    by_row = {"no armor": "physicalNone", "mental": "mental", "matrix": "matrix"}
    worn_rows = {id(r): k for (_, r), k in zip(worn, ("physicalMain", "physicalAlt"))}
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
    build = {"attributes": attrs, "skills": skills, "knowledge": [], "amps": amps, "items": items}
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


# ---------------------------------------------------------------- character XML (src/engine/charxml.ts)

CHAR_NS = "urn:chummer-anarchy2:character:1"


def _el(name, attrs, children=""):
    a = "".join(f" {k}={quoteattr(str(v).lower() if isinstance(v, bool) else str(v))}" for k, v in attrs.items() if v not in (None, ""))
    return f"<{name}{a}>{children}</{name}>" if children else f"<{name}{a}/>"


def _text(name, s):
    return f"<{name}>{escape(s)}</{name}>" if s else ""


def character_xml(ch):
    """The same XML characterToXml writes (formatVersion 1), for a character without career or snapshots."""
    b = ch["build"]
    fx = lambda e: _el("effect", {k: e.get(k) for k in ("ref", "param", "value", "note")})
    amp = lambda a: _el("amp", {k: a.get(k) for k in ("uid", "type", "name", "catalogId", "linkedItem", "vehicle")},
                        _text("narrative", a.get("narrative")) + "".join(map(fx, a["effects"])))
    item = lambda i: _el("item", {k: i.get(k) for k in ("uid", "kind", "name", "catalogId", "specialist", "armor", "dv", "ranges", "price")})
    body = [_text("background", ch["identity"].get("background")), _text("notes", ch["identity"].get("notes")),
            *(f"<keyword>{escape(k)}</keyword>" for k in ch["narrative"]["keywords"]),
            *(f"<disposition>{escape(k)}</disposition>" for k in ch["narrative"]["dispositions"]),
            *(f"<cue>{escape(k)}</cue>" for k in ch["narrative"]["cues"]),
            _el("build", {"mainArmor": b.get("mainArmor"), "altArmor": b.get("altArmor")},
                _el("attributes", {a: b["attributes"][a] for a in ATTRS})
                + "".join(_el("skill", {"id": s["id"], "rating": s["rating"]}, "".join(f"<spec>{escape(x)}</spec>" for x in s["specs"])) for s in b["skills"])
                + "".join(f"<knowledge>{escape(k)}</knowledge>" for k in b["knowledge"])
                + "".join(map(amp, b["amps"])) + "".join(map(item, b["items"])))]
    idn = ch["identity"]
    root = {"formatVersion": ch["formatVersion"], "id": ch["id"], "streetName": idn.get("streetName"), "name": idn.get("name"),
            "metatype": idn["metatype"], "level": ch["level"], "package": ch["package"], "origin": ch.get("origin"),
            "updatedAt": ch["updatedAt"]}
    a = "".join(f" {k}={quoteattr(str(v))}" for k, v in root.items() if v not in (None, ""))
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:character xmlns:ca2="{CHAR_NS}"{a}>\n  '
            + "\n  ".join(x for x in body if x) + "\n</ca2:character>\n")
