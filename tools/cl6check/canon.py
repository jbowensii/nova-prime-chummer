"""A Commlink6 record as a canonical record in our vocabulary: kind, names, page, the compared fields evaluated at each
rating (price, availability and essence formulas, per-rating tables) and the structured field families.

The same shape comes out of ours.py for our catalog entries, so fields.py compares like with like. Nothing here
names an item: the maps are Commlink6's record types and item types onto our catalog kinds."""

import re

# our catalog kinds each Commlink6 record type may match (the first is the kind it is reported under)
ITEM_KINDS = ("weapons", "armor", "augmentations", "electronics", "programs", "gear", "vehicles", "grades")
TAG_KINDS = {
    "item": ITEM_KINDS,
    "itemenhancement": ITEM_KINDS,
    "focus": ITEM_KINDS,
    "spell": ("spells",),
    "ritual": ("rituals",),
    "power": ("adeptpowers",),
    "complexform": ("complexforms",),
    "quality": ("qualities",),
    "metatype": ("metatypes", "critters"),
    "draketype": ("metatypes", "critters", "qualities"),
    "critterpower": ("critterpowers",),
    "metaecho": ("metamagics", "echoes", "critterpowers"),
    "martialart": ("martialarts",),
    "technique": ("martialtechniques",),
    "lifestyle": ("lifestyles",),
    "tradition": ("traditions",),
    "lifemod": ("lifemodules",),
    "skill": ("skills",),
    "npc": ("npcs", "critters", "spirits", "sprites", "contacts"),
}
# record types (and item types) that were the gap plan's K1 kinds, each now a catalog kind of ours (read from the books'
# sections and tables, displayed as printed); a type missing here is unmodelled
SECTION_KINDS = {
    "action": "actions",
    "ammotype": "ammotypes",
    "mentorspirit": "mentorspirits",
    "contacttype": "contacttypes",
    "qpath": "qualitypaths",
    "licensetype": "licencetypes",
    "set": "qualitysets",
    "datastructure": "datastructures",
    "trueelement": "trueelements",
    "feature": "spellfeatures",
    "sense": "senses",
    "interpretation": "ruleoptions",
    "magicreson": "magictypes",
    "designmod": "vehicledesign",
    "designopt": "vehicledesign",
    "chassistype": "vehicledesign",
    "powertrain": "vehicledesign",
    "consoletype": "vehicledesign",
    "qualityfactor": "vehicledesign",
}
# Commlink6's book folder → our source id; the core rulebook's city chapters are files ending _seattle / _berlin
BOOK_SOURCE = {
    "core": "crb",
    "astral_ways": "aw",
    "bestial_nature": "bn",
    "body_shop": "bs",
    "collapsing_now": "cln",
    "companion": "swc",
    "deadly_arts": "da",
    "dealers_of_death": "dod",
    "deus_ex_arcana": "dea",
    "double_clutch": "dc",
    "emerald": "emc",
    "firing_squad": "fs",
    "hack_slash": "hs",
    "kechibi": "tkc",
    "krime": "kk",
    "lofwyr": "ll",
    "no_future": "nf",
    "power_plays": "pwp",
    "shadow_cast": "shc",
    "sif_new_orleans": "sif-no",
    "slip_streams": "sls",
    "smooth_operations": "so",
    "street_wyrd": "sw",
    "tarnished_star": "ts",
}
CITY = {"_seattle": "crb-sea", "_berlin": "crb-ber"}
AUGMENT_TYPES = {"CYBERWARE", "BIOWARE", "GENEWARE", "NANOWARE"}
FAMILIES = (
    "class",
    "skill/spec",
    "social",
    "size/ammo",
    "variants",
    "slots",
    "effects",
    "choices",
    "requires",
    "relevance",
    "flags",
    "modonly",
)
RATING_REFS = {"RATING", "LEVEL", "FORCE"}
NONE = re.compile(r"^\s*[—–-]?\s*$")


def source_of(book, file):
    """Our source id for a Commlink6 record (its book, or the core rulebook's city edition its file names)."""
    if book == "core":
        return next((s for suffix, s in CITY.items() if file.endswith(suffix)), "crb")
    return BOOK_SOURCE.get(book, book)


def kind_of(tag, attrs):
    """(kind, modelled): the kind a record is reported under, and whether we have a catalog kind for it."""
    if tag in SECTION_KINDS:
        return SECTION_KINDS[tag], True
    if tag == "item":
        t = attrs.get("type", "")
        if t == "PACK":
            return "packs", True
        if t.startswith("WEAPON") or t == "AMMUNITION":
            return "weapons", True
        if t == "ARMOR":
            return "armor", True
        if t in AUGMENT_TYPES:
            return "augmentations", True
        if t == "VEHICLES" or t.startswith("DRONE"):
            return "vehicles", True
        if t in ("SOFTWARE", "CODEMODS"):
            return "programs", True
        if t in ("ELECTRONICS", "CYBERDECK"):
            return "electronics", True
        return "gear", True
    if tag == "npc":
        return {"SPIRIT": "spirits", "SPRITE": "sprites", "CRITTER_AWAKENED": "critters", "CONTACT": "contacts"}.get(
            attrs.get("type"), "npcs"
        ), True
    if tag == "metaecho":
        return ("echoes" if attrs.get("type") == "ECHO" else "metamagics"), True
    if tag in ("itemenhancement", "focus"):
        return "gear", True
    if tag in TAG_KINDS:
        return TAG_KINDS[tag][0], True
    return tag, False


# ---------- formulas ----------
def _parse(tokens, r):
    """expr over tokens (numbers, R, + - * / ( )) at rating r; None when it doesn't read."""
    i = 0

    def factor():
        nonlocal i
        if i >= len(tokens):
            raise ValueError
        t = tokens[i]
        i += 1
        if t == "-":
            return -factor()
        if t == "R":
            if r is None:
                raise ValueError
            return r
        if t == "(":
            v = expr()
            if i >= len(tokens) or tokens[i] != ")":
                raise ValueError
            i += 1
            return v
        return float(t)

    def term():
        nonlocal i
        v = factor()
        while i < len(tokens) and tokens[i] in "*/":
            op = tokens[i]
            i += 1
            v = v * factor() if op == "*" else v / factor()
        return v

    def expr():
        nonlocal i
        v = term()
        while i < len(tokens) and tokens[i] in "+-":
            op = tokens[i]
            i += 1
            v = v + term() if op == "+" else v - term()
        return v

    try:
        v = expr()
    except (ValueError, ZeroDivisionError, IndexError):
        return None
    return v if i == len(tokens) else None


def cl6_value(expr, rating=None, table=None):
    """A Commlink6 value at a rating: a number, $RATING/$LEVEL/$FORCE arithmetic, or `table` (1-based by the value);
    a table entry may be an availability ("3L"), returned as a string. None: no value, a parent ($$X) or character
    (&X) reference, or anything else that doesn't evaluate."""
    if expr is None or NONE.match(str(expr)):
        return None
    s = str(expr).strip()
    if "$$" in s or "&" in s:
        return None
    s = re.sub(r"\$(RATING|LEVEL|FORCE)\b", "R", s)
    if "$" in s:
        return None
    tokens = re.findall(r"\d+(?:\.\d+)?|\.\d+|[R()+\-*/]", s)
    if "".join(tokens) != re.sub(r"\s", "", s):
        return None
    v = _parse(tokens, rating)
    if v is not None and table:
        entries = [x.strip() for x in table.split(",")]
        k = int(round(v))
        if not 1 <= k <= len(entries):
            return None
        e = entries[k - 1]
        return float(e) if re.fullmatch(r"-?\d+(?:\.\d+)?", e) else e
    return v


def rating_range(el):
    """(lo, hi) of a record's rating choice (options or max), else None."""
    for ch in (c for cs in _own(el, "choices") for c in cs if c.tag == "choice"):
        if ch.get("ref", "").upper() in RATING_REFS and ch.get("type") in ("ITEM_ATTRIBUTE", None):
            nums = [int(x) for x in re.findall(r"\d+", ch.get("options") or "")]
            if nums:
                return min(nums), max(nums)
            if (ch.get("max") or "").isdigit():
                return 1, int(ch.get("max"))
    return None


def _own(el, tag):
    """`tag` children of the record itself and of its direct stat children, not of variants or nested definitions."""
    return [c for c in el if c.tag == tag]


def associations(el):
    """{("slot", id) | ("fits", id)} Commlink6 gives a record: a host's HOOK modifications (`slot`) and an accessory's
    EMBEDDED usages (`fits`), those of its variants too (the `cybereye` variant of Image link adds CYBEREYE_IMPLANT: one
    item per variant is OUR entry's name for it, the association is the item's). Host and accessory stay apart."""
    out = set()
    inner = {id(x) for g in el.iter("geardef") for x in g.iter()}  # (a <geardef> defines another item: not this one's)
    for x in el.iter():
        if id(x) in inner:
            continue
        if x.tag in ("valmod", "itemmod") and x.get("type") == "HOOK" and x.get("ref") and x.get("remove") != "true":
            out.add(("slot", _norm(x.get("ref"))))  # (a removed hook is one the record takes away, not offers)
        elif x.tag == "usage" and x.get("mode") == "EMBEDDED" and x.get("slot"):
            out.add(("fits", _norm(x.get("slot"))))
    return out


def _mods(el):
    out = []
    for m in _own(el, "modifications"):
        out.extend(m.iter())
    return [m for m in out if m.tag != "modifications"]


def attrdef(el, ident):
    """(value, table) of the attrdef `ident` of `el`, else (None, None)."""
    a = next((c for c in _own(el, "attrdef") if c.get("id") == ident), None)
    return (a.get("value"), a.get("table")) if a is not None else (None, None)


def per_rating(expr, table, ratings):
    """{rating: value} at each rating (one None key for an unrated item); {} when it doesn't evaluate."""
    if expr is None:
        return {}
    out = {r: cl6_value(expr, r, table) for r in ratings}
    return out if all(v is not None for v in out.values()) else {}


def _norm(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").casefold()).strip("-")


def families(el, attrs, variants):
    """{family: frozenset or tuple} for every field family the record carries (absent: Commlink6 has no datum)."""
    out = {}
    if el.tag == "item" and attrs.get("subtype"):
        out["subtype"] = (_norm(attrs["subtype"]),)
    w = next(iter(_own(el, "weapon")), None)
    if w is not None and w.get("skill"):
        out["skill/spec"] = (_norm(w.get("skill")), _norm((w.get("spec") or "").split("/")[-1]))
    ar = next(iter(_own(el, "armor")), None)
    if ar is not None and ar.get("social") not in (None, ""):
        out["social"] = (str(cl6_value(ar.get("social").lstrip("+"))),)
    size, ammo = attrdef(el, "WEAPON_SIZE")[0], attrdef(el, "AMMUNITION_CLASS")[0]
    if size or ammo:
        out["size/ammo"] = (_norm(size), _norm(ammo))
    vs = _own(el, "variant")
    if vs:
        out["variants"] = frozenset(_norm(variants.get(v.get("id"), v.get("id"))) for v in vs)
    mods = _mods(el)
    slots = associations(el)
    if slots:
        out["slots"] = frozenset(slots)
    eff = sorted(
        effect_key(m)
        for m in mods
        if m.tag in ("valmod", "checkmod", "itemmod", "allowmod") and m.get("type") not in ("HOOK", "GEAR")
    )
    if eff:
        out["effects"] = tuple(eff)
    ch = sorted(
        _norm(c.get("type"))
        for cs in _own(el, "choices")
        for c in cs
        if c.tag == "choice" and (c.get("ref") or "").upper() not in RATING_REFS
    )
    if ch:
        out["choices"] = tuple(ch)
    req = sorted(
        (_norm(r.get("type")), _norm(r.get("ref")))
        for rq in _own(el, "requires")
        for r in rq.iter()
        if r.tag in ("datareq", "valuereq")
    )
    if req:
        out["requires"] = tuple(req)
    out.update(
        ui_families(
            [m.get("topic") for m in mods if m.tag == "relevancemod"],
            [f.text for fl in _own(el, "flags") for f in fl],
            attrs.get("modonly") == "true",
        )
    )
    return out


def ui_families(topics, flags, modonly):
    """Commlink6's UI tags as data (decision D5): relevance topics (MAGICAL, SOCIAL, …, or a skill/specialization),
    item flags (AUGMENTATION, MATRIX_DEVICE, …) and modonly (bought only as an add-on)."""
    out = {}
    topics = frozenset(t.strip().casefold() for t in topics if t and t.strip())
    flags = frozenset(f.strip().casefold() for f in flags if f and f.strip())
    if topics:
        out["relevance"] = topics
    if flags:
        out["flags"] = flags
    if modonly:
        out["modonly"] = ("true",)
    return out


def labels(fams):
    """The UI tags of a record as one set of labels: relevance:magical, flag:augmentation, modonly."""
    return (
        {f"relevance:{t}" for t in fams.get("relevance", ())}
        | {f"flag:{f}" for f in fams.get("flags", ())}
        | ({"modonly"} if "modonly" in fams else set())
    )


def effect_key(m):
    """(element, target, value) of a modification: valmod → effect, checkmod → test, itemmod → grant, allowmod →
    allow; the target is type:ref, the value with $RATING/$LEVEL read as R. Our <effect>/<test>/<grant>/<allow> reduce
    to the same key (ours.py)."""
    el = {"valmod": "effect", "checkmod": "test", "itemmod": "grant", "allowmod": "allow"}[m.tag]
    v = re.sub(r"\$(RATING|LEVEL|FORCE)", "R", m.get("value") or "").replace("+", "").casefold()
    return el, f"{_norm(m.get('type'))}:{_norm(m.get('ref'))}", v


def aliases(name, variants):
    """Other names the book may print: 'Grenade, Party' → 'Party Grenade' and 'Party'; each variant joined to the name
    ('Cyberarm' + 'obvious' → 'Cyberarm obvious', 'obvious Cyberarm', 'Cyberarm (obvious)')."""
    out = set()
    m = re.fullmatch(r"([^,()]+),\s*([^,()]+)", name)
    if m and not m.group(2).strip()[:1].isdigit():
        out |= {f"{m.group(2).strip()} {m.group(1).strip()}", m.group(2).strip()}
    for v in variants.values():
        out |= {f"{name} {v}", f"{v} {name}", f"{name} ({v})"}
    return sorted(out - {name})


PSEUDO = re.compile(
    r"(?i)(?:(?:SS|SA|BF|FA)\s*\(\s*\d+(?:\s*[-–]\s*\d+)?\s*\)|(?:Pilot|Sensor)\s+\d+|[\d.,]+\s*km"
    r"|Uses\s+\d+\s+Energy\s+per\s+shot|Crew\s+Served\s*\(\s*\d+\s*\))$"
)


def cl6_only(kind, name, a, tag):
    """A Commlink6 record that is no book's item, left out of both denominators and counted on its own line: its rule
    settings (rule options), an option row it prices at zero and marks not
    for sale (availability 99: a firing mode, a range, a pilot rating) or points elsewhere ('Adapter (see …)')."""
    if kind == "ruleoptions":
        return True
    # a table cell Commlink6 made a record of (`SS(1-2)`, `Pilot 3`, `12 km`, `Uses 2 Energy per shot`, `Crew Served
    # (2)`): guarded by being a gear row it prices at nothing (no price, or 0)
    if tag in ("item", "itemenhancement") and a.get("price") in (None, "", "0") and PSEUDO.match(name.strip()):
        return True
    return (
        tag in ("item", "itemenhancement")
        and a.get("price") == "0"
        and ((a.get("avail") or "").startswith("99") or "(see " in name)
    )


CLASS_KINDS = {
    "weapons",
    "armor",
    "augmentations",
    "electronics",
    "gear",
    "vehicles",
    "programs",
    "spells",
    "ammotypes",
}


# the Commlink6 class types an entry of our kind is classed under (a record of another type matched to it is another
# item's)
KIND_TYPES = {
    "weapons": ("WEAPON_",),
    "armor": ("ARMOR",),
    "augmentations": ("CYBERWARE", "BIOWARE", "GENEWARE", "NANOWARE"),
    "vehicles": ("VEHICLES", "DRONE"),
    "programs": ("SOFTWARE",),
    "electronics": ("ELECTRONICS", "CYBERDECK"),
}


def fits_kind(kind, cls):
    """Whether Commlink6 class `cls` is one of our `kind`'s types (True for a kind with no such list)."""
    return not KIND_TYPES.get(kind) or cls.upper().startswith(KIND_TYPES[kind])


def cl6_class(tag, attrs):
    """Commlink6's own classification of a record, in its keys: TYPE/SUBTYPE, TYPE alone, else the record's tag (a
    spell, an ammunition type). Our `class` attribute carries the same string
    (docs/sr6-data-format/classification.md)."""
    t, s = attrs.get("type") or "", attrs.get("subtype") or ""
    if tag == "itemenhancement":
        return ""  # (an enhancement of an item is no item class: it has no type of its own)
    if tag not in ("item", "focus"):
        return tag  # (a spell's `type` is its spell type, not a class)
    return f"{t}/{s}" if t and s else t or tag


NOT_FOR_SALE = (9999999.0, 999999999.0)  # (Commlink6's price for an item the books do not sell)


def canonical(rec):
    """The canonical record of a reader record."""
    el, a, tag = rec["el"], rec["attrs"], rec["tag"]
    kind, modelled = kind_of(tag, a)
    rr = rating_range(el) if tag in ("item", "itemenhancement", "focus") else None
    ratings = list(range(rr[0], rr[1] + 1)) if rr else [None]
    f = {"rating": rr}
    if tag in ("item", "itemenhancement", "lifestyle", "focus"):
        pe, pt = attrdef(el, "PRICE")
        if pe is None:
            pe = a.get("price") or a.get("cost")
        f["cost"] = {
            r: (None if v in NOT_FOR_SALE else v) for r, v in per_rating(pe, pt, ratings).items()
        }  # (a price that says so compares nothing)
        f["cost_raw"] = pe
        f["cost_variants"] = _variant_values(el, "PRICE")
        f["avail_variants"] = [float(v[0]) for v in map(_avail, _variant_values(el, "AVAILABILITY", raw=True)) if v]
        ae, at = attrdef(el, "AVAILABILITY")
        if ae is not None and (at or "$" in ae):
            av = per_rating(ae, at, ratings)
        else:
            av = {r: ae or a.get("avail") for r in ratings} if (ae or a.get("avail")) not in (None, "", "99") else {}
        f["avail"] = {r: x for r, x in ((r, _avail(x)) for r, x in av.items()) if x}
        ee, et = attrdef(el, "ESSENCECOST")
        if ee is None:
            ee = next(
                (u.get("value") for u in _own(el, "usage") if u.get("mode") == "IMPLANTED" and u.get("value")), None
            )
        f["essence"] = per_rating(ee, et, ratings)
        used = next((u.get("value") for u in _own(el, "usage") if u.get("mode") == "EMBEDDED" and u.get("value")), None)
        f["capacity_used"] = per_rating(used, None, ratings)
        hook = next((m for m in _mods(el) if m.tag == "valmod" and m.get("type") == "HOOK" and m.get("value")), None)
        f["capacity_offered"] = per_rating(hook.get("value"), hook.get("table"), ratings) if hook is not None else {}
    w = next(iter(_own(el, "weapon")), None)
    if w is not None:
        f.update({"dv": w.get("dmg"), "ar": w.get("attack"), "modes": w.get("mode"), "ammo": w.get("ammo")})
    ar = next(iter(_own(el, "armor")), None)
    if ar is not None:
        f["defense"] = ar.get("rating")
    v = next(iter(_own(el, "vehicle")), None)
    if v is not None:
        for ours, cl in (
            ("handling", "han"),
            ("accel", "acc"),
            ("interval", "spdi"),
            ("topSpeed", "tspd"),
            ("body", "bod"),
            ("armor", "arm"),
            ("pilot", "pil"),
            ("sensor", "sen"),
            ("seats", "sea"),
        ):
            f[ours] = v.get(cl)
    if tag == "spell":
        f.update(
            {
                "range": a.get("range"),
                "spell type": a.get("type"),
                "duration": a.get("dur"),
                "drain": a.get("drain"),
                "spell category": a.get("cat"),
            }
        )
    elif tag == "power":
        f.update({"pp cost": a.get("cost"), "per level": a.get("hasLevel"), "activation": a.get("act")})
    elif tag == "complexform":
        f.update({"fade": a.get("fad"), "duration": a.get("dur")})
    elif tag == "quality":
        f.update({"karma": a.get("karma"), "positive": a.get("pos")})
    elif tag == "ritual":
        f["threshold"] = a.get("thr")
    elif tag == "critterpower":
        f.update(
            {"power type": a.get("type"), "action": a.get("action"), "range": a.get("range"), "duration": a.get("dur")}
        )
    elif tag == "skill":
        f["attribute"] = a.get("attr")
    return {
        "book": rec["book"],
        "src": source_of(rec["book"], rec["file"]),
        "file": rec["file"],
        "tag": tag,
        "id": rec["id"],
        "name": rec["name"],
        "page": rec["page"],
        "kind": kind,
        "modelled": modelled,
        "pool": (
            (
                TAG_KINDS.get(tag, ())
                if kind not in SECTION_KINDS.values() and kind != "packs"
                # (an ammunition type, no fields of its own: the book may print it as ammunition sold by count, gear,
                # or as a row of a weapons table, `Ballista Bolt, High Explosive`)
                else ("ammotypes", "gear", "weapons") if kind == "ammotypes" else (kind,)
            )
            if modelled
            else ()
        ),
        "aliases": aliases(rec["name"], rec["variants"]),
        "fields": {k: x for k, x in f.items() if x},
        "families": families(el, a, rec["variants"])
        | (
            {"class": (cl6_class(tag, a).casefold(),)} if kind in CLASS_KINDS and modelled and cl6_class(tag, a) else {}
        ),
        "el": el,
        "cl6_class": cl6_class(tag, a),
        "cl6only": cl6_only(kind, rec["name"], a, tag),
    }


def _variant_values(el, ident, raw=False):
    """Each variant's own value of an attrdef at rating 1 (numbers; raw: as printed)."""
    out = []
    for vv in _own(el, "variant"):
        e, t = attrdef(vv, ident)
        v = e if raw and e and "$" not in e and not t else cl6_value(e, 1, t)
        if v is not None and (raw or isinstance(v, float)):
            out.append(v)
    return out


def _avail(v):
    """(number, legality letter) of an availability: 4, '4L', '6(I)', 3.0 from a table."""
    if isinstance(v, float):
        return int(v), ""
    m = re.fullmatch(r"\+?\s*(\d+)\s*\(?([LRFIB]?)\)?", str(v).strip().upper())
    return (int(m.group(1)), m.group(2)) if m and m.group(1) != "99" else None  # 99: Commlink6's "not for sale"
