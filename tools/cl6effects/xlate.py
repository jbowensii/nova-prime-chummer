"""CL6 modification <-> our <effect> into one comparable vocabulary ("atoms"), for evaluate.py."""

import re

SKILLS = "astral athletics biotech close-combat con conjuring cracking electronics enchanting engineering exotic-weapons firearms influence outdoors perception piloting sorcery stealth tasking".split()
ABBR = {
    "BODY": "bod",
    "AGILITY": "agi",
    "REACTION": "rea",
    "STRENGTH": "str",
    "WILLPOWER": "wil",
    "LOGIC": "log",
    "INTUITION": "int",
    "CHARISMA": "cha",
    "EDGE": "edg",
    "MAGIC": "mag",
    "RESONANCE": "res",
    "ESSENCE": "ess",
}
SKILL_ATTR = {
    "astral": "int",
    "athletics": "agi",
    "biotech": "log",
    "close-combat": "agi",
    "con": "cha",
    "conjuring": "mag",
    "cracking": "log",
    "electronics": "log",
    "enchanting": "mag",
    "engineering": "log",
    "exotic-weapons": "agi",
    "firearms": "agi",
    "influence": "cha",
    "outdoors": "int",
    "perception": "int",
    "piloting": "rea",
    "sorcery": "mag",
    "stealth": "agi",
    "tasking": "res",
}


def skills_of(attrs):
    return {"skill:" + k for k, a in SKILL_ATTR.items() if a in attrs}


GROUPS = {
    "social": ["con", "influence"],
    "matrix": ["cracking", "electronics"],
    "magic": ["astral", "conjuring", "enchanting", "sorcery"],
    "resonance": ["tasking"],
    "combat": ["close-combat", "exotic-weapons", "firearms"],
    "vehicle": ["piloting"],
    "all": SKILLS,
}
ATTR_REF = {
    "DEFENSE_RATING_PHYSICAL": "derived:defense",
    "DEFENSE_RATING_ASTRAL": "derived:defense-astral",
    "DEFENSE_RATING_SOCIAL": "derived:social",
    "DEFENSE_RATING_MATRIX": "derived:defense-matrix",
    "PHYSICAL_MONITOR": "derived:physical-monitor",
    "STUN_MONITOR": "derived:stun-monitor",
    "DAMAGE_OVERFLOW": "derived:overflow",
    "MONITOR_MATRIX": "derived:matrix-monitor",
    "INITIATIVE_DICE_PHYSICAL": "derived:initiative-dice",
    "INITIATIVE_PHYSICAL": "derived:initiative",
    "INITIATIVE_DICE_ASTRAL": "derived:astral-initiative-dice",
    "INITIATIVE_ASTRAL": "derived:astral-initiative",
    "INITIATIVE_DICE_MATRIX": "derived:matrix-initiative-dice",
    "INITIATIVE_DICE_MATRIX_VR_COLD": "derived:matrix-initiative-dice",
    "INITIATIVE_DICE_MATRIX_VR_HOT": "derived:matrix-initiative-dice",
    "INITIATIVE_MATRIX": "derived:matrix-initiative",
    "INITIATIVE_MATRIX_VR_COLD": "derived:matrix-initiative",
    "INITIATIVE_MATRIX_VR_HOT": "derived:matrix-initiative",
    "COMPOSURE": "derived:composure",
    "JUDGE_INTENTIONS": "derived:judge-intentions",
    "MEMORY": "derived:memory",
    "LIFT_CARRY": "derived:lift",
    "MOVEMENT": "derived:movement",
    "MINOR_ACTION_PHYSICAL": "derived:minor-actions",
    "POWER_POINTS": "derived:power-points",
    "MONTHLY_COST": "derived:monthly-cost",
    "DAMAGE_REDUCTION_PHYSICAL": "derived:damage-reduction",
    "ESSENCE_HOLE": "derived:essence-hole",
    "DRAKE_EDGE": "derived:drake-edge",
    "ATTACK_RATING_PHYSICAL": "derived:unarmed-ar",
    "ATTACK_RATING_MATRIX": "derived:attack-rating-matrix",
    "RESIST_DAMAGE": "test:damage-resistance",
    "RESIST_DAMAGE_ASTRAL": "test:damage-resistance",
    "RESIST_TOXIN": "test:toxin-resistance",
    "RESIST_DRAIN": "test:drain-resistance",
    "DEFENSE_POOL_PHYSICAL": "test:defense",
    "DEFENSE_POOL_ASTRAL": "test:defense",
    "DEFENSE_POOL_MATRIX": "test:defense",
    "DEFENSE_POOL_COMBAT_DIRECT": "test:magic-resistance",
    "DEFENSE_POOL_COMBAT_INDIRECT": "test:magic-resistance",
}
ITEM_REF = {
    "ATTACK_RATING": "item:ar",
    "DAMAGE": "item:dv",
    "HANDLING": "item:handling",
    "ACCELERATION": "item:acceleration",
    "SPEED_INTERVAL": "item:speed-interval",
    "TOPSPEED": "item:top-speed",
    "BODY": "item:body",
    "ARMOR": "item:armor",
    "PILOT": "item:pilot",
    "SENSORS": "item:sensor",
    "SEATS": "item:seats",
    "SIZE": "item:size",
    "CONCEALABILITY": "item:concealability",
    "CARGO": "item:cargo",
    "AMMUNITION": "item:ammo",
    "ATTACK": "matrix:attack",
    "SLEAZE": "matrix:sleaze",
    "DATA_PROCESSING": "matrix:data-processing",
    "FIREWALL": "matrix:firewall",
}
CHECK_KIND = {
    "DICE": "add",
    "EDGE": "edge",
    "EDGE_ONLY_TEST": "edge",
    "EDGE_BOOST": "edge-cost",
    "EDGE_COST_MALUS": "edge-cost",
    "NOT_SPEND_EDGE": "no-edge",
    "NOT_EARN_EDGE": "no-edge-gain",
    "REPLACE_WITH_WILD": "wild-die",
    "ADD_WILD": "wild-die",
    "HIT": "hits",
    "REDUCE_THRESHOLD": "threshold",
    "EDGE_CHASE": "edge",
    "OTHER": "other",
    "USAGE": "other",
    "": "other",
}


def nv(v):
    return re.sub(r"\$(RATING|LEVEL|FORCE)", "r", (v or "")).replace("+", "").replace(" ", "").casefold()


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").casefold()).strip("-")


def cl6_atoms(m):
    """CL6 modification -> (set of atoms, kind, qualifier); (None, reason) when it is no variable."""
    t, ty, ref, st, wh = m["_tag"], m.get("type", ""), m.get("ref", ""), m.get("set", ""), m.get("what", "")
    R = ref.upper() if ty in ("ATTRIBUTE", "ITEM_ATTRIBUTE", "RESISTANCE") else ref
    if t == "valmod":
        if ty == "ATTRIBUTE":
            if R in ABBR:
                a = ABBR[R]
                k = "max" if st == "MAX" else "min" if st == "MIN" else "add"
                return (
                    {("attr-max:" if k == "max" else "attr-min:" if k == "min" else "attr:") + a},
                    k,
                    st if k == "add" else "",
                )
            if R == "CHOICE":
                return {"attr-max:choice" if st == "MAX" else "attr:choice"}, "max" if st == "MAX" else "add", ""
            if R in ATTR_REF:
                return {ATTR_REF[R]}, "add", st
            return None, "unmapped attribute " + R
        if ty == "ITEM_ATTRIBUTE":
            if R in ITEM_REF:
                tgt = ITEM_REF[R]
                if m.get("apply") == "UNARMED" and tgt in ("item:ar", "item:dv"):
                    tgt = "derived:unarmed-ar" if tgt == "item:ar" else "derived:unarmed-dv"
                return {tgt}, "max" if st == "MAX" else "add", st
            return None, "unmapped item attr " + R
        if ty == "SKILL":
            pre = "skill-max:" if st == "MAX" else "skill:"
            kk = "set" if st == "ARTIFICIAL" else "max" if st == "MAX" else "add"
            return {pre + ("choice" if ref == "CHOICE" else _slug(ref))}, kk, st
        if ty == "PRICEMOD":
            return {"pricemod:" + _slug(ref)}, "add", ""
        if ty == "CREATION_POINTS":
            return {"resource:" + _slug(ref)}, "add", ""
        return None, "non-variable valmod " + ty
    if t == "checkmod":
        k = CHECK_KIND.get(wh, "other")
        if ty == "SKILL":
            r = _slug(ref)
            if r in GROUPS:
                return set("skill:" + s for s in GROUPS[r]), k, ""
            if r == "any":
                return set("skill:" + s for s in SKILLS), k, "any"
            return {"skill:" + r}, k, ""
        if ty == "SKILLSPECIALIZATION":
            return {"skill-spec:" + _slug(ref)}, k, ""
        if ty == "ATTRIBUTE":
            if R in ABBR:
                return {"test-attr:" + ABBR[R]}, k, ""
            if R in ATTR_REF:
                return {ATTR_REF[R]}, k, ""
            return None, "unmapped check attribute " + R
        if ty == "ACTION":
            return {"action:" + _slug(ref)}, k, ""
        if ty == "COMPLEX_FORM":
            return {"complex-form:" + _slug(ref)}, k, ""
        if ty == "RESISTANCE":
            return {"test:toxin-resistance"}, "threshold" if "THRESH" in R else k, ""
        if ty == "ITEM_ATTRIBUTE":
            return {"test-item:" + _slug(ref)}, k, ""
        return None, "unmapped checkmod " + ty
    return None, "not a variable"


def our_atoms(e):
    """our <effect> -> (atoms, kind) with the test groups expanded to skills"""
    tg, op = e.get("target", ""), e.get("op", "")
    kind = {
        "add": "add",
        "set": "set",
        "edge": "edge",
        "edge-cost": "edge-cost",
        "edge-cost-set": "edge-cost",
        "no-edge": "no-edge",
        "no-edge-gain": "no-edge-gain",
        "wild-die": "wild-die",
        "hits": "hits",
        "threshold": "threshold",
    }.get(op, op)
    fam, _, name = tg.partition(":")
    if fam == "test":
        if name in GROUPS:
            return set("skill:" + s for s in GROUPS[name]), kind
        if name.startswith("attr-"):
            return {"test-attr:" + name[5:]} | skills_of({name[5:]}), kind
        if name == "physical":
            return skills_of({"bod", "agi", "rea", "str"}) | {"test:physical"}, kind
        if name == "mental":
            return skills_of({"wil", "log", "int", "cha"}) | {"test:mental"}, kind
        return {"test:" + name}, kind
    if fam == "skill":
        return {"skill:" + name}, kind
    if fam == "attr":
        return {"attr:" + name}, ("add" if kind == "set" else kind)
    if fam == "attr-max":
        return {"attr-max:" + name}, "max"
    if fam == "skill-max":
        return {"skill-max:" + name}, "max"
    return {tg}, kind


def vclass(v):
    v = nv(v)
    if v == "":
        return ("",)
    if re.fullmatch(r"-?\d+(\.\d+)?", v):
        return ("n", float(v))
    if v == "r":
        return ("r", 1.0)
    m = re.fullmatch(r"(-?)r(?:\*(-?\d+(?:\.\d+)?))?", v) or re.fullmatch(r"(-?)(\d+(?:\.\d+)?)\*r", v)
    if m:
        return ("r", (-1 if m.group(1) else 1) * float(m.group(2) or 1))
    if "," in v:
        return ("list", tuple(v.split(",")))
    return ("f", v)


def vsame(a, b, kind=""):
    """True equal, 'blank' when one side leaves the value open, 'formula' when either is a formula, False differ."""
    A, B = vclass(a), vclass(b)
    if kind == "edge-cost" and A[0] == "n" and B[0] == "n" and abs(A[1]) == abs(B[1]):
        return True  # CL6 prints an Edge-cost malus as +1 where ours prints the cut as -1 (same game effect)
    if A == B:
        return True
    if {A[0], B[0]} == {"n", "r"} and {A[1], B[1]} >= {1.0} and (A[1] == B[1]):
        return "formula"  # a flat 1 against a per-rating 1 (the entry's rating 1)
    if {A[0], B[0]} == {"list", "n"}:
        lst = A if A[0] == "list" else B
        num = B if A[0] == "list" else A
        if lst[1] and lst[1][0].lstrip("+") == str(int(num[1])) if float(num[1]).is_integer() else False:
            return "formula"
    if A[0] == "" or B[0] == "":
        return "blank"
    if A[0] == "f" or B[0] == "f":
        return "formula"
    return False
