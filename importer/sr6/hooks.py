"""The hooks Commlink6's CODE gives an item, as rules by class (fit plan Stages 0-2,
docs/analysis/sr6-fit-stage0-findings.md). Read from the 1.14.0 jar by decompiling; written here as rules in our own
words (no Commlink6 code or data). Ids are Commlink6's hook names (`VEHICLE_CF`); `slot_id` gives ours (`vehicle-cf`).
tools/cl6check/hookmap.py measures Commlink6 with these same rules; classes.associations applies them to our entries.

- S, standard hooks by class; V, vehicle capacities from Body/Seats/Pilot; F, fashion on armor with a Social rating;
- Z, a weapon's size by subtype; W, the vehicle-mount usages a weapon gets by size; I, the implant usage by subtype."""

UNBOUNDED = 99.0  # (Commlink6's "no limit": a capacity of 99 or more is never checked)
# the hooks that count capacity (Commlink6's ItemHook hasCapacity); every other hook takes one item
CAPACITY_HOOKS = frozenset(
    (
        "MELEE_EXTERNAL FIREARMS_EXTERNAL RANGED_EXTERNAL ELECTRONIC_ACCESSORY IMAGING OPTICAL AUDIO SENSOR_HOUSING "
        "SENSOR_FUNCTION ARMOR ARMOR_REACTIVE ARMOR_ADDITION ARMOR_MEMS FASHION HELMET_ACCESSORY HEADWARE_IMPLANT "
        "CYBEREYE_IMPLANT CYBEREAR_IMPLANT CYBERLIMB_IMPLANT VEHICLE_HARDPOINT VEHICLE_CHASSIS VEHICLE_CF "
        "VEHICLE_POWERTRAIN VEHICLE_ELECTRONICS VEHICLE_WEAPON VEHICLE_WEAPON_SMALL VEHICLE_WEAPON_LARGE "
        "VEHICLE_WEAPON_MILITARY VEHICLE_ACCESSORY KOMMODORE_MODULE SOFTWARE SKILLJACK INSTRUMENT_SLOT "
        "INSTRUMENT_WEAPON "
        "PROCAM_SLOT CORE_SLOTS CASE_MODS NANITES"
    ).split()
)
# Rule S: every weapon of these types gets its external carry hook, unbounded
STANDARD_BY_TYPE = {
    "WEAPON_FIREARMS": "FIREARMS_EXTERNAL",
    "WEAPON_SPECIAL": "FIREARMS_EXTERNAL",  # (not MELEE_EXTERNAL, as the bytecode-strings reading had guessed)
    "WEAPON_CLOSE_COMBAT": "MELEE_EXTERNAL",
    "WEAPON_RANGED": "RANGED_EXTERNAL",
}
TIRE_SUBTYPES = {"BIKES", "ATVS", "CARS", "TRUCKS", "VANS", "BUS"}  # (type VEHICLES only: one tyre set)
# matrix devices: SOFTWARE (any type) and ELECTRONIC_ACCESSORY (type ELECTRONICS), both unbounded
MATRIX_SUBTYPES = {"CYBERDECK", "COMMLINK", "DATATERM", "CYBERTERM", "COMMNODE", "RIGGER_CONSOLE", "TAC_NET"}
VEHICLE_TYPES = {"VEHICLES", "DRONE_MICRO", "DRONE_MINI", "DRONE_SMALL", "DRONE_MEDIUM", "DRONE_LARGE"}
FASHION_SUBTYPES = {"ARMOR_BODY", "ARMOR_CLOTHES", "ARMOR_SOCIAL"}

# Rule Z: a firearm or special weapon without WEAPON_SIZE gets one by subtype
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
# Rule W: the mount hooks a weapon of a size goes into; BUILDING none
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
# Rule I: a firearm or special weapon can go into a cyber-implant hook by subtype
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


def slot_id(hook):
    """Our slot id for a Commlink6 hook (`VEHICLE_CF` -> `vehicle-cf`)."""
    return hook.strip().lower().replace("_", "-")


def hook_of(slot):
    """The Commlink6 hook of our slot id (`vehicle-cf` -> `VEHICLE_CF`)."""
    return slot.strip().upper().replace("-", "_")


def unit(hook):
    """`capacity` when the hook counts capacity, else `one` (one item per hook)."""
    return "capacity" if hook_of(hook) in CAPACITY_HOOKS else "one"


def _round(x):
    """Java's Math.round for positives: half up (Python's round is banker's)."""
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
    """({hook: capacity}, {hook: maxSizePerItem}) the code computes for a vehicle or drone (Rule V): BASES that the
    data's HOOK values then add to. Zero capacities are left out (the code removes a hook it computes as 0). SOFTWARE
    (autosofts, Pilot / 2) only applies where the data gives no SOFTWARE hook. `cf_without_seats`: a table rule, off
    by default."""
    out, max_size = {}, {}
    if typ in VEHICLE_TYPES:
        out["VEHICLE_CHASSIS"] = out["VEHICLE_ELECTRONICS"] = float(body)
        out["VEHICLE_POWERTRAIN"] = 0.0 if sub == "MOD_TRAILER" else float(body)
        out["VEHICLE_ACCESSORY"] = UNBOUNDED
        if pilot > 0:
            out["SOFTWARE"] = float(_round(pilot / 2))
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
