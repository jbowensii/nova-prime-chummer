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
    amps=_list(_obj(name=STR, type=STR, printedRating=NINT, page=PAGE,
                    effects=_list(_obj(ref=STR, param=NSTR, value=NINT, note=NSTR)))),
    items=_list(_obj(name=STR, kind={"type": "string", "enum": ["gear", "weapon", "armor"]}, category=NSTR,
                     page=PAGE, dv=NSTR, armor=NINT, ranges=NSTR)),
    spells=_list(_obj(name=STR, category=STR, page=PAGE)),
    complexForms=_list(_obj(name=STR, category=STR, page=PAGE)),
)
