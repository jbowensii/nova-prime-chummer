"""The effects reader's book tables: a table's modifier columns, an accessory's text."""
import re

from .words import _CONDITION, _norm, sentences
from .values import _BANDS, _fx, number


# ---------- tables: a table's modifier columns ----------
COLUMNS = {"bod": "bod", "agi": "agi", "rea": "rea", "str": "str", "wil": "wil", "log": "log", "int": "int", "cha": "cha",
           "edg": "edg", "mag": "mag", "res": "res"}
STAT_COLUMNS = {"ar": "item:ar", "attack rating": "item:ar", "attack ratings": "item:ar", "dv": "item:dv",
                "defense rating": "derived:defense", "defense": "derived:defense", "unarmed dv": "derived:unarmed-dv", "unarmed ar": "derived:unarmed-ar",
                "matrix init bonus": "derived:matrix-initiative", "init bonus": "derived:initiative",
                "initiative bonus": "derived:initiative", "dr": "derived:defense", "defense rating bonus": "derived:defense"}


def _init_column(c):
    """An initiative bonus column by its words, under any printing's header (`MATRIX INIT BONUS`, a later printing's
    `VR MATRIX INIT DICE BONUS`): `derived:[matrix-]initiative[-dice]`; None for another column."""
    w = c.split()
    if "bonus" not in w or not any(x in ("init", "initiative") for x in w):
        return None
    return f"derived:{'matrix-' if 'matrix' in w else ''}initiative{'-dice' if 'dice' in w or 'die' in w else ''}"
def _stat_mod(v):
    """An AR or DV cell's modifier as printed (`–1S(e)`, `–2 to all`, `+1`): the signed number; else the cell."""
    v = _norm(v)
    m = re.match(r"\s*([+-]\d+)(?:[PS]\b|\(e\)|\s+(?:to all(?: attack ratings)?|dv|ar)|\s*$)", v, re.I)
    return m.group(1) if m else v


def table(header, row, kind):
    """Effects of one table row: an attribute table of six or more attribute columns printing an infected type's (a
    quality's) maxima (`set`); a column naming a target whose cell is signed (`+2`, `–1`: a modifier, an ammo type's AR
    and DV) or a bonus column (`MATRIX INIT BONUS`)."""
    out = []
    h = [re.sub(r"\s+", " ", x.strip().casefold()) for x in header]
    cells = dict(zip(h, row))
    attrs = [c for c in h if c in COLUMNS]
    if len(attrs) >= 6 and kind == "qualities":
        for c in attrs:
            if v := number(_norm(cells.get(c, ""))):
                out.append(_fx(f"attr-max:{COLUMNS[c]}", "set", v))
        return out
    for c, v in cells.items():
        t = STAT_COLUMNS.get(c) or _init_column(c)
        cond = None
        if t in ("item:ar", "item:dv") and (cm := re.search(r"\(([^)]*\bonly\b[^)]*)\)", v or "", re.I)):
            cond, v = cm.group(1).strip().casefold(), (v or "").replace(cm.group(0), "")  # (`+2 (BF/FA Modes Only)`: the modes it is for)
        v = _stat_mod(v or "") if t in ("item:ar", "item:dv") else _norm(v or "")
        if c == "body" and "unarmed dv" in h and re.fullmatch(r"\+\d+", v):
            # (a table of unarmed values, the bone lacing table, CRB Hong Kong p. 286: its BODY is extra Body when resisting
            # physical damage, as its text says)
            out.append(_fx("test:damage-resistance", "add", v.lstrip("+"), "conditional", "when resisting physical damage"))
            continue
        if t == "derived:unarmed-dv" and (dm := re.fullmatch(r"(\d+)\s*[PS]", v)):
            out.append(_fx(t, "set", dm.group(1)))  # (`3P`: the unarmed Damage Value it gives, HK p. 286; `+1`: added)
            continue
        if not t or not v or v in ("-", "—") or (kind == "armor" and t == "derived:defense"):
            continue  # (an armor's own Defense Rating is its defense field, not an effect)
        if t == "item:ar" and "/" in v and re.fullmatch(r"(?:[+-]\d+|0|-)(?:/(?:[+-]\d+|0|-)){4}", v):
            out.append(_fx(t, "add", ",".join("0" if x == "-" else x.lstrip("+") for x in v.split("/"))))
        elif re.fullmatch(r"[+-]\d+", v) or (c.endswith("bonus") and re.fullmatch(r"\+?\d+", v)):
            out.append(_fx(t, "add", ",".join([v.lstrip("+")] * 5) if t == "item:ar" else v.lstrip("+"), "conditional" if cond else None, cond))
    return out


_AR = re.compile(r"\b(?:increase|raise|boost|improve)s?\s+(?:the\s+)?((?:(?:close|near|medium|far|extreme)(?:,\s*|\s+and\s+|\s+))+)"
                 r"attack\s+ratings?\s+by\s+(\d+)\b", re.I)


def accessory(text, thing):
    """[(tag, attrs, None)]: what a sentence of `text` naming the accessory (its last word: `arm-brace`) says it does to
    the item it fits: `increases the Near and Medium Attack Ratings by 1` -> <effect target="item:ar" op="add"
    value="0,1,1,0,0">, one value a range band; low confidence when the sentence sets a condition."""
    word = (thing.split() or [""])[-1].lower()
    out = []
    for s in sentences(text):
        if not word or word not in s.lower():
            continue
        for m in _AR.finditer(s):
            named = {b for b in _BANDS if re.search(rf"\b{b}\b", m.group(1), re.I)}
            value = ",".join(m.group(2) if b in named else "0" for b in _BANDS)
            x = ("effect", {"target": "item:ar", "op": "add", "value": value,
                            **({"confidence": "low"} if _CONDITION.search(s) else {})}, None)
            if x not in out:  # (a note printed twice: in the text and as a label)
                out.append(x)
    return out


def less_accessory(text, thing):
    """`text` less the sentences accessory() reads for the add-on `thing` (`Arm-brace add-on increases the Near and Medium Attack Ratings
    by 1`): they are the add-on's effects, not the item's own."""
    word = (thing.split() or [""])[-1].lower()
    if not word:
        return text
    keep = [x for x in re.split(r"(?<=[.!?])\s+", text or "") if not (word in x.lower() and _AR.search(x))]
    return " ".join(keep) if len(keep) != len(re.split(r"(?<=[.!?])\s+", text or "")) else text
