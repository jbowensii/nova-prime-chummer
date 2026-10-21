"""The JSON the model fills for one chunk of a book, mirroring amps.xsd and items.xsd.
Structured outputs need every object closed (additionalProperties false) with every property
required, so optional values are nullable instead of absent."""


def _obj(**props):
    return {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}


def _list(item):
    return {"type": "array", "items": item}


STR, INT, PAGE = {"type": "string"}, {"type": "integer"}, {"type": "integer"}
NSTR, NINT = {"type": ["string", "null"]}, {"type": ["integer", "null"]}

SCHEMA = _obj(
    amps=_list(
        _obj(
            name=STR,
            type=STR,
            printedRating=NINT,
            page=PAGE,
            effects=_list(_obj(ref=STR, param=NSTR, value=NINT, note=NSTR)),
        )
    ),
    items=_list(
        _obj(
            name=STR,
            kind={"type": "string", "enum": ["gear", "weapon", "armor"]},
            category=NSTR,
            page=PAGE,
            dv=NSTR,
            armor=NINT,
            ranges=NSTR,
        )
    ),
    spells=_list(_obj(name=STR, category=STR, page=PAGE)),
    complexForms=_list(_obj(name=STR, category=STR, page=PAGE)),
)

# The core tables a recipe couldn't read (propose --core), one key per core file, each row mirroring its schema's entry:
# the property names are the XML attribute names (propose.core_entry writes only these, in this order). Weapons and armor
# rows come as `items`, as above.
NUM, NNUM, NBOOL = {"type": "number"}, {"type": ["number", "null"]}, {"type": ["boolean", "null"]}
PRICES = (
    "attrPoint",
    "attrLastPoint",
    "skillLow",
    "skillLowMax",
    "skillHigh",
    "spec",
    "knowledge",
    "ampPoint",
    "equipment",
    "weaponStandard",
    "weaponSpecialist",
    "armorPoint",
    "spell",
)


def _row(**props):
    return _obj(id=STR, name=STR, page=PAGE, **props)


CORE = {
    "levels": _row(nuyen=INT, attrAtMax=INT, skillCap=INT, rrAttr=INT, rrSkill=INT, rrSpec=INT),
    "metatypes": _row(edge=INT, racialQuality=STR, ranges=_list(_obj(attr=STR, min=INT, max=INT))),
    "attributes": _row(abbr=STR),
    "skills": _row(attr=STR, alt=NSTR, requires=NSTR, specs=_list(_obj(id=STR, attr=STR, name=STR))),
    "pricing": _obj(page=PAGE, complexForm=NINT, **{k: INT for k in PRICES}),
    "amptypes": _row(base=INT, baseAfterFirst=NINT, essence=NUM, requires=NSTR),
    "ampeffects": _row(
        category=STR,
        rating=INT,
        types=STR,
        max=NINT,
        requires=NSTR,
        excludes=NSTR,
        param=NSTR,
        gmApproval=NBOOL,
        essence=NNUM,
    ),
    "packages": _row(
        level=STR,
        archetype=STR,
        attrPoints=INT,
        attrAtMax=INT,
        skillPoints=INT,
        skillsAtSix=INT,
        ampPoints=INT,
        armor=INT,
        standardWeapons=INT,
        specialistWeapons=INT,
        equipment=INT,
        spells=INT,
    ),
    "vehicles": _row(pilot=INT, body=INT, handling=INT, speed=INT, flyingSpeed=NINT, armor=INT, mount=STR),
    "lifestyles": _row(perRun=INT),
}


def core_schema(tables):
    """The JSON for a chunk of the core tables `tables` (file stems): `items` for weapons/armor, else one list per table."""
    props = {t: _list(CORE[t]) for t in sorted(tables) if t in CORE}
    if {"weapons", "armor"} & set(tables):
        props["items"] = SCHEMA["properties"]["items"]
    return _obj(**props)
