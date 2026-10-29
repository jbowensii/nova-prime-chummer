"""What an override row may say (the package docstring is the table format): check() refuses a row that writes a
description or sets anything its kind of row may not."""

import re

OPS = ("remove", "rename", "merge", "move_kind", "notext", "split")
SETTABLE = {"class"}  # (what an id row may set)
EFFECT_KEYS = {"target", "op", "value", "switch", "when", "spec", "affects", "from"}
EFFECT_OPS = {
    "add",
    "set",
    "edge",
    "edge-cost",
    "edge-cost-set",
    "no-edge",
    "no-edge-gain",
    "wild-die",
    "hits",
    "threshold",
    "threshold-set",
}  # (docs/sr6-data-format.md)
KID_TAGS = {
    "slot",
    "fits",
    "variant",
    "relevance",
    "flag",
    "modifier",
    "prerequisite",
    "selection",  # (a "gen": "family" row's "kids": Commlink6's item structure)
    "status",  # (an errata row's: a status the item applies, the No Future errata's Molotov Burning 4)
    "power",
}  # (an owner row's: an Infected type's gained power, corrected)
VALUE_ATTRS = {
    "multi",
    "cost",
    "avail",
    "karma",
    "karmaMax",
    "maxLevel",
    "perLevel",
    "essence",
    "capacity",
    "rating",
    "dv",
    "ar",
    "modes",
    "ammo",
    "defense",
    "seats",
    "range",
    "type",
    "duration",
    "category",
    "action",
    "activation",
    "fade",
    "threshold",
    "kind",
    "handling",
    "interval",
    "power",
    "attr",
    "skill",
    "spec",
    "social",
    "modonly",
    "size",
    "ammoClass",
    "accel",
    "speed",
    "body",
    "armor",
    "pilot",
    "sensor",
}  # (a "gen": "value" row)
CLASS_KEY = re.compile(r"[A-Za-z0-9_]+(/[A-Za-z0-9_]+)?")
NO_TEXT = {"description", "desc", "text", "summary"}  # (descriptions come from the owner's PDF, never from here)


def check(rows):
    """Raise ValueError for an override row that is malformed or sets a description field."""
    for r in rows:
        if bad := NO_TEXT & {k.lower() for k in r.get("set", {})}:
            raise ValueError(f"override of {r.get('cl6')} sets a description field ({sorted(bad)})")
        if (
            "id" in r
            and r.get("gen") in ("value", "family", "errata", "owner", "cl6", "book", "max", "slot")
            and not any(k in r for k in OPS)
        ):
            if (
                not (r.get("set") or r.get("kids") or r.get("effects") or r.get("drops"))
                or set(r.get("set", {})) - VALUE_ATTRS
                or set(r.get("formula", {})) - VALUE_ATTRS
            ):
                raise ValueError(f"override of {r.get('id')}: a value row sets {sorted(VALUE_ATTRS)} only")
            if bad := [
                k
                for k in r.get("kids", [])
                if k.get("tag") not in KID_TAGS | ({"link"} if r.get("gen") == "book" else set())
            ]:
                raise ValueError(
                    f"override of {r.get('id')}: kids are {sorted(KID_TAGS)} only (a book row's also a link)"
                )
        elif "id" in r and not any(k in r for k in OPS):
            if (
                not r.get("set")
                or set(r["set"]) - SETTABLE
                or not all(CLASS_KEY.fullmatch(str(v)) for v in r["set"].values())
            ):
                raise ValueError(f"override of {r.get('id')}: an id row sets {sorted(SETTABLE)} only")
        if r.get("gen") in ("cl6", "book") and not (
            isinstance(r.get("why"), str) and r["why"].strip() and chr(10) not in r["why"]
        ):
            raise ValueError(f"override of {r.get('id')}: a Commlink6 or book row says why in one line")
        if r.get("drops") is not None and not (
            r.get("gen") == "book"
            and isinstance(r["drops"], list)
            and all(isinstance(d, dict) and d.get("target") and set(d) <= EFFECT_KEYS for d in r["drops"])
        ):
            raise ValueError(
                f"override of {r.get('id')}: drops are a book row's list of the effects to take out "
                f"(each names its target, {sorted(EFFECT_KEYS)})"
            )
        if "keep" in r and not (r.get("gen") == "book" and isinstance(r["keep"], bool)):
            raise ValueError(f"override of {r.get('id')}: keep is a book row's true or false")
        if not all(isinstance(a, dict) and a.get("target") for a in r.get("effects", [])):
            raise ValueError(
                f"override of {r.get('id')}: each effect names its target "
                "(it replaces the entry's effect of that target)"
            )
        for a in r.get("effects", []):
            if a.get("op") and a["op"] not in EFFECT_OPS:
                raise ValueError(
                    f"override of {r.get('id')}: {a['op']!r} is no effect operation ({sorted(EFFECT_OPS)})"
                )
            if "replaces" in a and not (
                isinstance(a["replaces"], str) and re.fullmatch(r"[a-z-]+:[a-z0-9-]+", a["replaces"])
            ):
                raise ValueError(f"override of {r.get('id')}: replaces names a target (`test:other`)")
        if "rename" in r and not (
            isinstance(r["rename"], str) and 0 < len(r["rename"]) <= 120 and chr(10) not in r["rename"]
        ):
            raise ValueError(f"override of {r.get('id')}: rename is a name")
        for part in r.get("split", []):
            if (
                not (part.get("id") and part.get("name"))
                or set(part.get("set", {})) - VALUE_ATTRS
                or NO_TEXT & {k.lower() for k in part}
            ):
                raise ValueError(
                    f"override of {r.get('id')}: a split part has an id, a name and {sorted(VALUE_ATTRS)} values only"
                )
        if bad := NO_TEXT & {k.lower() for v in (r.get("merge"), r.get("move_kind")) if isinstance(v, dict) for k in v}:
            raise ValueError(f"override of {r.get('id')}: an op names a description field ({sorted(bad)})")
        if a := r.get("add"):
            names = (
                {k.lower() for k in a}
                | {k.lower() for k in a.get("attrs", {})}
                | {k["tag"].lower() for k in a.get("kids", [])}
            )
            if bad := NO_TEXT & names:
                raise ValueError(f"override of {r.get('cl6')} adds a description field ({sorted(bad)})")
            if not (
                isinstance(a.get("text_from", ""), str)
                and len(a.get("text_from", "")) <= 80
                and chr(10) not in a.get("text_from", "")
            ):
                raise ValueError(f"override of {r.get('cl6')}: text_from is a heading name")
            if not isinstance(a.get("page"), int):
                raise ValueError(f"override of {r.get('cl6')} adds an entry with no page")
    return rows
