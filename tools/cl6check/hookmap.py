"""Commlink6's hook graph, item by item: the hooks each item OFFERS (with capacity), the usages it DECLARES (hook, mode,
cost) and its grouped requirements, plus a census against what our importer emits (fit plan Stage 0,
docs/analysis/sr6-fit-stage0-findings.md):

  python -m tools.cl6check.hookmap [--jar JAR] [--ours <runs dir>]

Commlink6 gets hooks from the data (`itemmod/valmod type=HOOK`, `itemhookmod`, `remove="true"`) AND from code. The
code rules below were read from the 1.14.0 jar by decompiling (CFR, 2026-10-29); they are written here as rules in our
own words, no Commlink6 code or data is in the repo. Read-only: no override table, no report file."""

import sys
from collections import Counter

from tools.cl6check import canon

UNBOUNDED = 99.0  # (Commlink6's "no limit": a capacity of 99 or more is never checked)
# Rule S (standard hooks by class): every weapon of these types gets its external carry hook, unbounded
STANDARD_BY_TYPE = {
    "WEAPON_FIREARMS": "FIREARMS_EXTERNAL",
    "WEAPON_SPECIAL": "FIREARMS_EXTERNAL",  # (not MELEE_EXTERNAL, as the bytecode-strings reading had guessed)
    "WEAPON_CLOSE_COMBAT": "MELEE_EXTERNAL",
    "WEAPON_RANGED": "RANGED_EXTERNAL",
}
TIRE_SUBTYPES = {"BIKES", "ATVS", "CARS", "TRUCKS", "VANS", "BUS"}  # (type VEHICLES only: tyres capacity 1)
# matrix devices: get ELECTRONIC_ACCESSORY and SOFTWARE, both unbounded (any type with one of these subtypes)
MATRIX_SUBTYPES = {"CYBERDECK", "COMMLINK", "DATATERM", "CYBERTERM", "COMMNODE", "RIGGER_CONSOLE", "TAC_NET"}

VEHICLE_TYPES = {"VEHICLES", "DRONE_MICRO", "DRONE_MINI", "DRONE_SMALL", "DRONE_MEDIUM", "DRONE_LARGE"}
FASHION_SUBTYPES = {"ARMOR_BODY", "ARMOR_CLOTHES", "ARMOR_SOCIAL"}

# Rule Z (size): a firearm or special weapon without WEAPON_SIZE gets one by subtype
SIZE_BY_SUBTYPE = {
    **dict.fromkeys(("TASERS", "HOLDOUTS", "PISTOLS_LIGHT"), "TINY"),
    **dict.fromkeys(("MACHINE_PISTOLS", "PISTOLS_HEAVY", "DMSO", "DART"), "SMALL"),
    "SUBMACHINE_GUNS": "MEDIUM",
    **dict.fromkeys(("SHOTGUNS", "RIFLE_ASSAULT"), "LARGE"),
    **dict.fromkeys(
        ("LAUNCHERS", "RIFLE_HUNTING", "RIFLE_SNIPER", "LMG", "MMG", "HMG", "ASSAULT_CANNON", "THROWERS", "BALLISTAS"),
        "BIG",
    ),
    "CANNON": "BIG",
    "VEHICLE_MILITARY": "MILITARY",
}
# Rule W (vehicle weapon mounts): the mount hooks a weapon of a size goes into; BUILDING none
_SML = ("VEHICLE_WEAPON_SMALL", "VEHICLE_WEAPON", "VEHICLE_WEAPON_LARGE")
MOUNTS_BY_SIZE = {
    "TINY": _SML,
    "SMALL": _SML,
    "MEDIUM": _SML,
    "LARGE": ("VEHICLE_WEAPON", "VEHICLE_WEAPON_LARGE"),
    "BIG": ("VEHICLE_WEAPON_LARGE",),
    "MILITARY": ("VEHICLE_WEAPON_MILITARY",),
    "BUILDING": (),
}
# ... and, for a weapon with no size (melee, bows, or a firearm the size rule missed), by subtype
MOUNTS_BY_SUBTYPE = {
    **dict.fromkeys(
        ("BLADES", "WHIPS", "CLUBS", "BOWS", "CROSSBOWS", "LAUNCHERS", "RIFLE_HUNTING", "RIFLE_SNIPER", "LMG", "MMG")
        + ("HMG", "THROWERS"),
        ("VEHICLE_WEAPON_LARGE",),
    ),
    **dict.fromkeys(("SHOTGUNS", "RIFLE_ASSAULT"), ("VEHICLE_WEAPON", "VEHICLE_WEAPON_LARGE")),
    **dict.fromkeys(
        ("TASERS", "HOLDOUTS", "PISTOLS_LIGHT", "MACHINE_PISTOLS", "PISTOLS_HEAVY", "SUBMACHINE_GUNS"), _SML
    ),
}
# Rule I (implant weapons): a firearm or special weapon can go into a cyber-implant hook by subtype
IMPLANT_BY_SUBTYPE = {
    **dict.fromkeys(("BLADES", "WHIPS", "CLUBS"), "IMPLANT_MELEE"),
    **dict.fromkeys(("BOWS", "CROSSBOWS"), "IMPLANT_RANGED"),
    **dict.fromkeys(("TASERS", "HOLDOUTS"), "IMPLANT_HOLDOUT"),
    "PISTOLS_LIGHT": "IMPLANT_PISTOL_LIGHT",
    "MACHINE_PISTOLS": "IMPLANT_PISTOL_MACHINE",
    "PISTOLS_HEAVY": "IMPLANT_PISTOL_HEAVY",
    "SUBMACHINE_GUNS": "IMPLANT_SMG",
    "SHOTGUNS": "IMPLANT_SHOTGUN",
    **dict.fromkeys(
        ("LAUNCHERS", "RIFLE_ASSAULT", "RIFLE_HUNTING", "RIFLE_SNIPER", "LMG", "MMG", "HMG", "ASSAULT_CANNON")
        + ("THROWERS",),
        "IMPLANT_HEAVY",
    ),
}
IMPLANT_BY_SIZE = {  # (subtype OTHER_SPECIAL only)
    "TINY": "IMPLANT_PISTOL_LIGHT",
    "SMALL": "IMPLANT_PISTOL_HEAVY",
    "MEDIUM": "IMPLANT_SMG",
    "LARGE": "IMPLANT_SHOTGUN",
}


def _int(s):
    """The leading whole number of a stat (`10`, `4+2`), else 0."""
    digits = ""
    for ch in (s or "").strip():
        if not ch.isdigit():
            break
        digits += ch
    return int(digits) if digits else 0


def _round(x):
    """Java's Math.round: half away from zero for positives (Python's round is banker's)."""
    return int(x + 0.5)


def standard_hooks(typ, sub):
    """{hook: capacity} the code adds to any item of class typ/sub that does not already offer the hook (Rule S)."""
    out = {}
    if typ in STANDARD_BY_TYPE:
        out[STANDARD_BY_TYPE[typ]] = UNBOUNDED
    if typ == "VEHICLES" and sub in TIRE_SUBTYPES:
        out["VEHICLE_TIRES"] = 1.0
    if sub in MATRIX_SUBTYPES:
        out["SOFTWARE"] = UNBOUNDED
        if typ == "ELECTRONICS":
            out["ELECTRONIC_ACCESSORY"] = UNBOUNDED
    return out


def vehicle_hooks(typ, sub, body, seats, pilot, cf_without_seats=False):
    """({hook: capacity}, {hook: maxSizePerItem}) the code computes for a vehicle or drone (Rule V). Zero capacities
    are left out (the code removes a hook it computes as 0). `cf_without_seats`: the table rule, off by default."""
    out, max_size = {}, {}
    if typ in VEHICLE_TYPES:
        out["VEHICLE_CHASSIS"] = out["VEHICLE_ELECTRONICS"] = float(body)
        out["VEHICLE_POWERTRAIN"] = 0.0 if sub == "MOD_TRAILER" else float(body)
        out["VEHICLE_ACCESSORY"] = UNBOUNDED
        if pilot > 0:
            out["SOFTWARE"] = float(_round(pilot / 2))  # (only when the data gives no SOFTWARE hook: see offered())
    if seats:
        cf = _round(
            seats * ((0.25 if cf_without_seats else 1.25) if sub == "BIKES" else (0.5 if cf_without_seats else 1.5))
        )
        out["VEHICLE_CF"] = float(cf + (4 if sub == "TRUCKS" else 0))
    if body:
        if typ in ("VEHICLES", "DRONE_LARGE", "DRONE_MEDIUM"):
            out["VEHICLE_HARDPOINT"] = float(body // 3)
        elif typ == "DRONE_SMALL" and body > 3:
            out["VEHICLE_HARDPOINT"] = 0.5
            max_size["VEHICLE_HARDPOINT"] = 0.5  # (DRONE_MINI never reaches here: the code returns before it)
    return {h: c for h, c in out.items() if c}, max_size


def fashion_hook(typ, sub, social):
    """{FASHION: n} for body armor/clothes/social armor with a Social rating: 1 below 0, 3 above, 2 at 0 (Rule F)."""
    if typ != "ARMOR" or sub not in FASHION_SUBTYPES or social is None:
        return {}
    return {"FASHION": 1.0 if social < 0 else 3.0 if social > 0 else 2.0}


def weapon_size(typ, sub, declared):
    """The weapon's WEAPON_SIZE: as the data gives it, else by subtype for firearms and special weapons (Rule Z)."""
    if declared:
        return declared.upper()
    return SIZE_BY_SUBTYPE.get(sub) if typ in ("WEAPON_FIREARMS", "WEAPON_SPECIAL") else None


def synth_usages(typ, sub, size, embedded):
    """[(hook, rule)] the usages the code adds to a weapon (Rules W and I). `embedded`: the hooks of its own EMBEDDED
    usages (an implant usage is added unless one of them is already an IMPLANT_* hook)."""
    if not typ.startswith("WEAPON_"):
        return []
    if typ in ("WEAPON_FIREARMS", "WEAPON_SPECIAL", "WEAPON_VEHICLE") and size:
        mounts = MOUNTS_BY_SIZE.get(size, ())
    else:
        mounts = MOUNTS_BY_SUBTYPE.get(sub, ())
    out = [(h, "W") for h in mounts]
    if typ in ("WEAPON_FIREARMS", "WEAPON_SPECIAL") and not any(h.startswith("IMPLANT") for h in embedded):
        imp = IMPLANT_BY_SIZE.get(size) if sub == "OTHER_SPECIAL" else IMPLANT_BY_SUBTYPE.get(sub)
        if imp:
            out.append((imp, "I"))
    return out


def _stats(el):
    """(body, seats, pilot, social) the record gives (0/None when it gives none)."""
    v = next(iter(canon._own(el, "vehicle")), None)  # pylint: disable=protected-access
    a = next(iter(canon._own(el, "armor")), None)  # pylint: disable=protected-access
    social = (a.get("social") if a is not None else None) or canon.attrdef(el, "DEFENSE_SOCIAL")[0]
    seats = _int(v.get("sea")) if v is not None else _int(canon.attrdef(el, "SEATS")[0])
    try:
        social = int(social.replace("–", "-")) if social not in (None, "") else None
    except ValueError:
        social = None
    if v is None:
        return 0, seats, 0, social
    return _int(v.get("bod")), seats, _int(v.get("pil")), social


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return s  # (a formula: `$RATING`, a table)


def _scopes(el):
    """[(variant id | None, element)]: the record, then each variant."""
    return [(None, el)] + [(v.get("id"), v) for v in canon._own(el, "variant")]  # pylint: disable=protected-access


def _walk(scope):
    """Every descendant of `scope`, except what sits inside a nested `<variant>` or `<mode>` (their own scopes)."""
    for c in scope:
        if c.tag in ("variant", "mode"):
            continue
        yield c
        yield from _walk(c)


def requirements(el):
    """[{variant, group, negate, apply, tag, type, ref, value}]: each test of the record's (and its variants')
    `<requires>`, outside a `<mode>`. group 0 = the plain tests (all must hold); each `<selreq>` is its own group
    1, 2, … (any one of its tests holds)."""
    out = []
    for var, scope in _scopes(el):
        n = 0
        for rq in canon._own(scope, "requires"):  # pylint: disable=protected-access
            for q in rq:
                if q.tag == "selreq":
                    n += 1
                    tests, g = list(q), n
                else:
                    tests, g = [q], 0
                for t in tests:
                    if t.tag in ("datareq", "valuereq"):
                        out.append(
                            {
                                "variant": var,
                                "group": g,
                                "negate": t.get("negate") == "true",
                                "apply": t.get("apply"),
                                "tag": t.tag,
                                "type": t.get("type"),
                                "ref": t.get("ref"),
                                "value": t.get("value"),
                            }
                        )
    return out


def usages(el):
    """[{hook, mode, cost, variant, source}]: the usages the data declares (source "data"; an item declaring none
    is CARRIED by code, source "C"), then the ones code adds to weapons (source "W"/"I"). cost: the usage `value`
    (capacity in the hook, or Essence when IMPLANTED with no hook), else None."""
    typ, sub = el.get("type") or "", el.get("subtype") or ""
    out = []
    for var, scope in _scopes(el):
        for u in canon._own(scope, "usage"):  # pylint: disable=protected-access
            out.append(
                {
                    "hook": u.get("slot"),
                    "mode": u.get("mode"),
                    "cost": _num(u.get("value")),
                    "variant": var,
                    "source": "data",
                }
            )
    if not any(u["variant"] is None for u in out) and not (el.get("reqVariant") == "true" and out):
        out.append({"hook": None, "mode": "CARRIED", "cost": None, "variant": None, "source": "C"})
    size = weapon_size(typ, sub, canon.attrdef(el, "WEAPON_SIZE")[0])
    embedded = {u["hook"] for u in out if u["mode"] == "EMBEDDED" and u["variant"] is None and u["hook"]}
    for hook, rule in synth_usages(typ, sub, size, embedded):
        out.append({"hook": hook, "mode": "EMBEDDED", "cost": None, "variant": None, "source": rule})
    return out


def offered(el):
    """[{hook, capacity, variant, source, maxSize}]: every hook the item offers, by source. data: an itemmod/valmod
    HOOK (capacity: the valmod value, an adjustment where code computes a base: zodiac VEHICLE_CHASSIS -3);
    hookmod: an `itemhookmod attr=CAPACITY`; remove: an `itemmod remove="true"` (takes a code hook away);
    S/V/F: the code's standard, vehicle and fashion rules, each only where the data offers no such hook."""
    typ, sub = el.get("type") or "", el.get("subtype") or ""
    out = []
    for var, scope in _scopes(el):
        for x in _walk(scope):
            if x.tag in ("valmod", "itemmod") and x.get("type") == "HOOK" and x.get("ref"):
                src = "remove" if x.get("remove") == "true" else "data"
                out.append({"hook": x.get("ref"), "capacity": _num(x.get("value")), "variant": var, "source": src})
            elif x.tag == "itemhookmod" and (x.get("attr") or "").upper() == "CAPACITY":
                out.append(
                    {"hook": x.get("hook"), "capacity": _num(x.get("value")), "variant": var, "source": "hookmod"}
                )
    have = {o["hook"] for o in out if o["source"] != "remove"}
    body, seats, pilot, social = _stats(el)
    vhooks, max_size = vehicle_hooks(typ, sub, body, seats, pilot)
    if "SOFTWARE" in have:
        vhooks.pop("SOFTWARE", None)
    for src, hooks in (("V", vhooks), ("S", standard_hooks(typ, sub)), ("F", fashion_hook(typ, sub, social))):
        for hook, cap in hooks.items():
            if src == "V" or hook not in have:  # (vehicle capacities are SET by code; a data valmod adjusts them)
                out.append(
                    {"hook": hook, "capacity": cap, "variant": None, "source": src, "maxSize": max_size.get(hook)}
                )
                have.add(hook)
    return out


def final_hooks(el):
    """{hook} the item offers once code has run: every hook offered, less the ones a `remove` takes away."""
    rows = offered(el)
    gone = {o["hook"] for o in rows if o["source"] == "remove"}
    return {o["hook"] for o in rows if o["source"] != "remove"} - gone


def norm(h):
    """Our slot id for a Commlink6 hook (`VEHICLE_CF` -> `vehicle-cf`)."""
    return canon._norm(h)  # pylint: disable=protected-access


def census(items):
    """Counter of the Stage 0 numbers over Commlink6 `<item>` elements."""
    c = Counter()
    for el in items:
        typ = el.get("type") or ""
        rows, us, rq = offered(el), usages(el), requirements(el)
        for o in rows:
            c[f"offer.{o['source']}"] += 1
            c[f"offer.{o['source']}.{o['hook']}"] += 1
            if o["source"] == "data" and o["variant"]:
                c["offer.data.variant"] += 1
            if o.get("maxSize"):
                c["offer.maxSize"] += 1
        for u in us:
            c[f"usage.{u['source']}"] += 1
            c[f"usage.mode.{u['mode']}"] += 1
            if u["source"] == "data" and u["cost"] is not None:
                c["usage.cost"] += 1
                c[f"usage.cost.{u['mode']}"] += 1
            if u["source"] in ("W", "I"):
                c[f"usage.{u['source']}.{u['hook']}"] += 1
        c["req"] += len(rq)
        c["req.selreq_groups"] += len({(r["variant"], r["group"]) for r in rq if r["group"]})
        c["req.in_selreq"] += sum(1 for r in rq if r["group"])
        c["req.negate"] += sum(1 for r in rq if r["negate"])
        c["items.with_req"] += bool(rq)
        if typ in ("CYBERWARE", "BIOWARE", "GENEWARE", "NANOWARE"):
            c["aug.vehicle_usage"] += sum(1 for u in us if (u["hook"] or "").startswith("VEHICLE"))
    c["items"] = len(items)
    return c


def compare_ours(pairs, raw):
    """Counter: for each matched (Commlink6 item, our entry) pair, which of Commlink6's offered hooks and usage hooks
    our entry carries, split by the Commlink6 source; plus our slots Commlink6 never offers. raw: {cl6 id: element}."""
    c = Counter()
    for cl, o in pairs:
        el = raw.get(cl["el"].get("id")) if cl.get("tag") == "item" else None
        if el is None:
            continue
        ours = o["families"].get("slots") or frozenset()
        oslot = {i for k, i in ours if k == "slot"}
        ofits = {i for k, i in ours if k == "fits"}
        c["pairs"] += 1
        gone = {r["hook"] for r in offered(el) if r["source"] == "remove"}
        cl6slots = set()
        for r in offered(el):
            if r["source"] == "remove" or r["hook"] in gone:
                continue
            h = norm(r["hook"])
            cl6slots.add(h)
            key = f"{r['source']}{'.variant' if r['variant'] else ''}"
            c[f"offer.{key}"] += 1
            c[f"offer.{key}.ours"] += h in oslot
            if h not in oslot:
                c[f"miss.offer.{r['source']}.{r['hook']}"] += 1
        for h in oslot - cl6slots:
            c[f"extra.slot.{h}"] += 1
        for u in usages(el):
            if u["mode"] != "EMBEDDED" or not u["hook"]:
                continue
            key = f"{u['source']}{'.variant' if u['variant'] else ''}"
            c[f"fits.{key}"] += 1
            c[f"fits.{key}.ours"] += norm(u["hook"]) in ofits
    return c


def main(argv):
    """Print the census (and, with --ours, the comparison with our catalogs)."""
    from tools.cl6check import ours, reader  # pylint: disable=import-outside-toplevel

    jar = reader.find_jar(argv[argv.index("--jar") + 1] if "--jar" in argv else None)
    if not jar:
        print("hookmap: skipped (no Commlink6 jar)")
        return 0
    recs, _ = reader.read(jar)
    raw = {}
    for r in recs:
        if r["tag"] == "item":
            raw.setdefault(r["id"], r["el"])
    for k, v in sorted(census(list(raw.values())).items()):
        print(f"{k}\t{v}")
    if "--ours" in argv:
        from tools.cl6check.__main__ import compare  # pylint: disable=import-outside-toplevel

        pairs = compare([canon.canonical(r) for r in recs], ours.load(argv[argv.index("--ours") + 1]), pdf=False)[2]
        print("--- ours vs Commlink6 ---")
        for k, v in sorted(compare_ours(pairs, raw).items()):
            print(f"{k}\t{v}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
