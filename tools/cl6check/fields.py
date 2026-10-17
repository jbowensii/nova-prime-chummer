"""Per-field comparators: a canonical Commlink6 record against one of our entries.

Numbers compare at every rating of the item (Commlink6's range, else ours), so "Rating × 250" settles against a
per-rating table; a cell printing several values ("100/month or 1,000/year", "2,000 + Commlink") compares as the set of
its numbers against Commlink6's base and variant prices. Legality compares apart from the availability number. A
field is compared only when Commlink6 has it and our entry is of the kind that prints it."""
import re

from tools.cl6check import ours as O

FIELDS = ("cost", "avail", "legality", "rating", "essence", "capacity", "dv", "ar", "modes", "ammo", "defense",
          "handling", "accel", "interval", "topSpeed", "body", "armor", "pilot", "sensor", "seats", "range",
          "spell type", "duration", "drain", "spell category", "pp cost", "per level", "activation", "fade", "karma",
          "positive", "threshold", "power type", "action", "attribute")
PRICED = {"weapons", "armor", "augmentations", "electronics", "programs", "gear", "vehicles", "grades", "lifestyles", "packs"}
SPELL_RANGE = {"LINE_OF_SIGHT": "LOS", "LINE_OF_SIGHT_AREA": "LOS(A)", "TOUCH": "T", "SELF": "S", "SELF_AREA": "S(A)"}
SKIP = "skip"  # Commlink6 has no value: not compared
VEHICLE = ("handling", "accel", "interval", "topSpeed", "body", "armor", "pilot", "sensor", "seats")


def fmt(v):
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else f"{v:g}"
    if isinstance(v, tuple):
        return f"{v[0]}{v[1]}"
    return "" if v is None else str(v)


def show(d):
    """A per-rating dict as one string: '500' or 'R1 500, R2 1000, …'."""
    vals = list(d.values())
    if len(set(map(fmt, vals))) == 1:
        return fmt(vals[0])
    return ", ".join(f"R{r} {fmt(v)}" for r, v in d.items())


def close(a, b):
    return a is not None and b is not None and abs(a - b) <= 1e-6 * max(1.0, abs(a), abs(b))


def ratings(c, a):
    """The ratings to evaluate at: Commlink6's range, else ours, else just rating 1."""
    rr = c["fields"].get("rating") or O.rating_range(a.get("rating"))
    return list(range(rr[0], rr[1] + 1)) if rr else [None]


REF = {}  # "kind:id" -> our entry's attrs (trace.run fills it): a derived item's ref() to the item it is priced from


def _ref(target, field, rating, depth=0):
    """The value our entry `target` ("augmentations:bs.corrosive-spit") gives `field` at `rating`: its formula's, else its
    plain printed number; None when unknown."""
    from importer.sr6 import formula as F
    a = REF.get(target)
    if a is None or depth > 3:
        return None
    raw = a.get(f"formula:{field}")
    if raw:
        try:
            return F.evaluate(raw.split("|")[0], R=rating or 1, ref=lambda t, f, r: _ref(t, f, r, depth + 1))
        except F.FormulaError:
            return None
    return F.plain(a.get(field) or "", field)


def formula_values(a, field, rs):
    """{rating: {values}} our stored formula (the importer's <formula field>, ours.py's `formula:<field>`) gives at
    each rating: at the top of its qty range (Commlink6 flattens a per-unit price there), or the rating as the count and every choice of its options; None when the entry has none or it needs something unknown (B, ref)."""
    from importer.sr6 import formula as F
    raw = a.get(f"formula:{field}")
    if not raw:
        return None
    expr, *kv = raw.split("|")
    kv = dict(x.split("=", 1) for x in kv)
    lo, _, hi = (kv.get("count") or "").partition("-")  # (ours.py: the count range its row prints)
    opts = [o for o in (kv.get("opts") or "").split(",") if o]
    out = {}
    for r in rs:
        # Commlink6 counts a per-unit price as the rating (R1, R2 …), or prices a count range at its top
        qs = [r] if r is not None else [int(hi or lo)] if lo else [1]
        vals = set()
        for q in qs:
            for bits in range(2 ** len(opts)):
                try:
                    v = F.evaluate(expr, R=1 if r is None else r, Q=q, opt={o: bits >> i & 1 for i, o in enumerate(opts)},
                                   round=kv.get("round", "up"), ref=_ref)
                except F.FormulaError:
                    return None
                if v is not None:
                    vals.add(v)
        out[r] = vals
    return out if any(out.values()) else None


def _num_field(field, ours_s, cl, extra=(), formula=None):
    """A diff for a numeric field, None when equal, SKIP when Commlink6 has no number. cl: {rating: number}; extra:
    Commlink6's variant values (a row of ours may print one variant: the colony nanites, the obvious cyberarm);
    formula: formula_values() of our stored formula (equal when it gives Commlink6's value at each rating)."""
    vals = [v for v in cl.values() if isinstance(v, float)]
    if not vals:
        return SKIP
    if formula and all(any(close(x, v) for x in formula.get(r, ())) for r, v in cl.items() if isinstance(v, float)):
        return None
    if ours_s is None or O.NONE.match(ours_s):
        if all(v == 0 for v in vals):
            return None  # our dash for Commlink6's 0
        return {"field": field, "ours": ours_s or "", "cl6": show(cl), "why": "ours empty", "cl6_tok": fmt(vals[0])}
    mine = {r: O.value(ours_s, 1 if r is None else r) for r in cl}
    if all(v is not None for v in mine.values()):
        if all(close(mine[r], v) for r, v in cl.items() if isinstance(v, float)):
            return None
        if len(set(mine.values())) == 1 and any(close(mine[next(iter(mine))], v) for v in extra):
            return None  # one variant's value
        r = next(r for r, v in cl.items() if isinstance(v, float) and not close(mine[r], v))
        return {"field": field, "ours": ours_s, "cl6": show(cl), "why": "differs" if len(cl) == 1 else
                f"differs at rating {r}", "ours_tok": fmt(mine[r]), "cl6_tok": fmt(cl[r])}
    rng = re.fullmatch(r"\s*([\d,.]+)\s*[–-]\s*([\d,.]+)\s*¥?\s*", ours_s)
    lohi = O.numbers(rng.group(1)) | O.numbers(rng.group(2)) if rng else set()
    if lohi and all(min(lohi) <= v <= max(lohi) for v in vals):
        return None  # a printed range holds Commlink6's value
    nums = O.numbers(ours_s)
    if len(nums) > 1 and all(any(close(n, v) for n in nums) for v in vals):
        return None  # a cell printing several values ("+100 / +250", "1,000 + 1 round") prints Commlink6's
    return {"field": field, "ours": ours_s, "cl6": show(cl), "why": "ours unreadable or several values",
            "ours_tok": ours_s, "cl6_tok": fmt(vals[0])}


def _str_field(field, ours_s, cl_s, norm, tokens=True):
    if cl_s in (None, ""):
        return SKIP
    a, b = norm(ours_s), norm(cl_s)
    if a == b:
        return None
    empty = ours_s is None or bool(O.NONE.match(ours_s))
    if empty and O.value(cl_s) == 0:
        return None
    d = {"field": field, "ours": ours_s or "", "cl6": cl_s, "why": "ours empty" if empty else "differs"}
    if tokens:
        d.update(ours_tok=ours_s, cl6_tok=cl_s)
    return d


_FEE = r"(?:\d{1,3}(?:,\d{3})+|\d+)\s*¥"


def licence(avail):
    """(the availability without a licence fee, the fee or None): `15,000¥` alone is a licence fee on a freely available
    item (owner 2026-10-15) -> ("", 15000); `2, 15,000¥` is rating 2 plus the fee -> ("2", 15000); anything else is itself."""
    m = re.fullmatch(rf"\s*(?:(.+?)\s*,\s+)?({_FEE})\s*", avail or "")
    if not m:
        return avail, None
    return (m.group(1) or ""), float(re.sub(r"[^\d]", "", m.group(2)))


def first(n):
    return lambda s: (s or "")[:n].upper()


def first3(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())[:3]


def ammo_key(s):
    """An ammo cell as Commlink6 writes it: the printed `32(d-2)`, `20 (power cell)`, `20(tanks)`, `1 barrel`, `12 x2(c)`
    all read as `32(d)`, `20(c)`, `20(tank)`, `1(b)`, `12(c)/12(c)`, and `20(c) + Energy` as `20(c)`; spaces and a thousands
    comma dropped. The printed value stays in the data."""
    t = (s or "").lower()
    t = re.sub(r"(?<=\))\s*\+\s*[a-z][a-z ]*$", "", t)
    t = re.sub(r"\(\s*power\s+cell\s*\)", "(c)", t)
    t = re.sub(r"(\d)\s*barrels?\b", r"\1(b)", t)
    t = re.sub(r"\(\s*([a-z]+)\s*-\s*\d+\s*\)", r"(\1)", t)
    t = re.sub(r"\(\s*tanks\s*\)", "(tank)", t)
    t = re.sub(r"(\d+)\s*x\s*(\d+)\s*(\([a-z]+\))", lambda m: "/".join([f"{m.group(1)}{m.group(3)}"] * int(m.group(2))), t)
    return re.sub(r"[\s()]|(?<=\d),(?=\d{3})", "", re.sub(r"\s+or\s+", "/", t))


def printed_word(ours_s):
    """Whether our cell prints a word (`Missiles Only`, `By Size / Class`, `Unlimited`, `*`) where Commlink6 has a number."""
    t = (ours_s or "").strip()
    return bool(t) and not O.NONE.match(t) and not re.search(r"\d", t)


def compare(c, o, sib=()):
    """(compared fields, [diff]) of record c against our entry o. sib: the entries of our source that are levels of the same
    item (one entry per level or tier: the rating range is theirs together)."""
    f, a, k = c["fields"], o["attrs"], o["kind"]
    done, diffs = [], []

    def add(field, d):
        if d == SKIP:
            return
        done.append(field)
        if d:
            diffs.append(d)

    rs = ratings(c, a)
    own = O.rating_range(a.get("rating"))
    if own and own[0] == own[1] and own[0] in rs:
        rs = [own[0]]  # (one item per level: compared at its own level, not at Commlink6's others)
    if "cost" in f and k in PRICED:
        cl = {r: f["cost"].get(r if r in f["cost"] else next(iter(f["cost"]))) for r in rs}
        add("cost", _num_field("cost", a.get("cost"), cl, f.get("cost_variants", ()), formula_values(a, "cost", list(cl))))
    av, fee = licence(a.get("avail"))
    if "avail" in f and k in PRICED and not (fee is not None and not av):  # (a pure licence fee: freely available, nothing to compare)
        cl = {r: f["avail"].get(r if r in f["avail"] else next(iter(f["avail"]))) for r in rs}
        num = _num_field("avail", None if (av or "").startswith("+") else av,
                         {r: float(v[0]) for r, v in cl.items()}, f.get("avail_variants", ()),
                         formula_values({**a, "avail": av}, "avail", list(cl)))
        if num and num != SKIP and re.search(r"\d{3}", av or ""):
            num["why"] = "ours holds a price (columns shifted)"
        add("avail", num if not (av or "").startswith("+") else None)
        letters = {v[1] for v in cl.values()}
        m = O.LEGAL.search(av or "")
        mine = (m.group(1) or m.group(2)) if m else ""
        if (letters != {""} or mine) and O.value(av) is not None:  # an empty avail is the avail's diff
            want = sorted(letters)[-1]
            add("legality", None if mine == want else {"field": "legality", "ours": a.get("avail", ""),
                                                       "cl6": want or "(legal)", "why": "differs",
                                                       "ours_tok": av, "cl6_tok": show(cl)})
    if f.get("rating") and k in PRICED:
        lo, hi = f["rating"]
        mine = O.rating_range(a.get("rating"))
        for x in sib:  # (the tiers of one item, 1-4, 5-8, 9: Commlink6's range is theirs together)
            m = O.rating_range(x["attrs"].get("rating"))
            mine = (min(mine[0], m[0]), max(mine[1], m[1])) if mine and m else mine or m
        q = re.search(r"\|count=(\d+)-(\d+)", a.get("formula:cost") or "")
        if q and int(q.group(2)) == hi:  # a per-unit price's count range: Commlink6 counts it as the rating
            mine = (int(q.group(1)), hi)
        add("rating", None if mine and mine[1] == hi else {
            "field": "rating", "ours": a.get("rating", ""), "cl6": f"{lo}–{hi}", "cl6_tok": f"{lo}-{hi}",
            "ours_tok": a.get("rating") or None,
            "why": "ours empty" + (" (our cost/avail/essence is per rating)" if re.search(
                r"(?i)rating", "".join(a.get(x) or "" for x in ("cost", "avail", "essence"))) else "")
            if not mine else "max differs"})
    if "essence" in f and k == "augmentations":
        add("essence", _num_field("essence", a.get("essence"), {r: f["essence"].get(r if r in f["essence"] else
                                                                                       next(iter(f["essence"]))) for r in rs},
                                  formula=formula_values(a, "essence", rs)))
    cap = a.get("capacity")
    if cap is not None and not O.NONE.match(cap) or "capacity_used" in f and k == "augmentations":
        key = "capacity_used" if (cap or "").strip().startswith("[") or "capacity_offered" not in f else "capacity_offered"
        if key in f:
            add("capacity", _num_field("capacity", (cap or "").strip("[] ") or None,
                                       {r: f[key].get(r if r in f[key] else next(iter(f[key]))) for r in rs},
                                       formula=formula_values(a, "capacity", rs)))
    if k == "weapons":
        nd = lambda s: re.sub(r"[\s()]", "", s or "").upper()
        if f.get("dv") and not f["dv"].startswith("0"):
            add("dv", _str_field("dv", a.get("dv"), f["dv"], nd))
        if f.get("ar"):
            if not (not re.search(r"\d", f["ar"]) and printed_word(a.get("ar"))):  # (Commlink6 has none where the book prints a word)
                add("ar", _str_field("ar", a.get("ar"), f["ar"], bands))
        if f.get("modes"):
            nm = lambda s: frozenset(t for t in re.split(r"[/,\s]+", re.sub(r"\([^)]*\)", "", up_to(s)).upper()) if t)
            add("modes", _str_field("modes", a.get("modes"), f["modes"], nm, tokens=False))
        if f.get("ammo"):
            cl = f["ammo"]
            zero = re.fullmatch(r"0\s*(\(\w+\))?", cl.strip()) and printed_word(a.get("ammo"))  # (0 where the book prints `Unlimited`)
            bare = re.fullmatch(r"\d+", cl.strip()) and re.match(rf"\s*{cl.strip()}\s*\(", a.get("ammo") or "")  # (the count; Commlink6 leaves the unit)
            if not (zero or bare):
                add("ammo", _str_field("ammo", a.get("ammo"), cl, ammo_key))
    if f.get("defense") and k == "armor":
        add("defense", _num_field("defense", (a.get("defense") or "").lstrip("+") or None,
                                  {None: float(re.sub(r"[^\d.]", "", f["defense"]) or 0)}))
    if k == "vehicles":
        ns = lambda s: re.sub(r"[\s*+,]", "", s or "")
        for fld in VEHICLE:
            if f.get(fld) not in (None, ""):
                mine = ns(a.get(fld))
                parts = re.findall(r"\d+", mine)
                fv = formula_values(a, fld, [None])
                if fv and re.fullmatch(r"\d+", ns(f[fld])) and any(close(x, float(ns(f[fld]))) for x in fv[None]):
                    add(fld, None)  # our formula (`2/6` seats: 2 + 6)
                    continue
                if re.fullmatch(r"\d+", ns(f[fld])) and len(parts) > 1 and ns(f[fld]) in parts:
                    add(fld, None)  # two printed values (2/10 seats, 18(24) with an armor kit): Commlink6 keeps one
                    continue
                add(fld, _str_field(fld, a.get(fld), f[fld], ns))
    if k == "spells" and c["tag"] == "spell":
        rng = lambda s: {"TOUCH": "T", "SELF": "S"}.get(re.sub(r"\s", "", s or "").upper(), re.sub(r"\s", "", s or "").upper())
        add("range", _str_field("range", a.get("range"), SPELL_RANGE.get(f.get("range"), f.get("range")), rng, False))
        add("spell type", _str_field("spell type", a.get("type"), f.get("spell type"), first(1), False))
        add("duration", _str_field("duration", a.get("duration"), f.get("duration"), first(1), False))
        num = lambda s: (re.findall(r"-?\d+", s or "") or [""])[0]
        mine = re.findall(r"-?\d+", a.get("dv") or "")  # (a row printing a drain per variant: any of them)
        add("drain", None if num(f.get("drain")) in mine else _str_field("drain", a.get("dv"), f.get("drain"), num, False))
        add("spell category", _str_field("spell category", a.get("category"), f.get("spell category"),
                                         lambda s: (s or "").lower(), False))
    if k == "adeptpowers" and c["tag"] == "power":
        if f.get("pp cost"):
            add("pp cost", _num_field("pp cost", a.get("cost"), {None: float(f["pp cost"])}))
        if f.get("per level"):
            mine = "true" if a.get("perLevel") == "true" else "false"
            add("per level", None if mine == f["per level"] else {"field": "per level", "ours": mine,
                                                                   "cl6": f["per level"], "why": "differs"})
        add("activation", _str_field("activation", a.get("activation"), f.get("activation"), first3, False))
    if k == "complexforms" and c["tag"] == "complexform":
        add("fade", _str_field("fade", a.get("fade"), f.get("fade"), lambda s: re.sub(r"\s", "", s or "").upper(), False))
        add("duration", _str_field("duration", a.get("duration"), f.get("duration"), first(1), False))
    if k == "qualities" and c["tag"] == "quality":
        if f.get("karma"):
            top = (a.get("karmaMax") or "").lstrip("-")  # the highest of the prices it prints (Commlink6 may split them)
            alt = {float(top)} if top else set()
            alt |= {abs(float(x)) for x in (a.get("karmaIf") or "").split()}  # (its price when a flag holds: Awakened)
            add("karma", _num_field("karma", (a.get("karma") or "").lstrip("-") or None,
                                    {None: abs(float(f["karma"]))}, formula={None: alt} if alt else None))
        if f.get("positive"):
            mine = "true" if a.get("kind") == "positive" else "false"
            add("positive", None if mine == f["positive"] else {"field": "positive", "ours": a.get("kind", ""),
                                                                 "cl6": f["positive"], "why": "differs"})
    if k == "rituals" and f.get("threshold"):
        add("threshold", _num_field("threshold", a.get("threshold"), {None: float(f["threshold"])}))
    if k == "critterpowers" and c["tag"] == "critterpower":
        for fld, mine in (("power type", "type"), ("action", "action"), ("range", "range"), ("duration", "duration")):
            norm = first(1) if fld == "power type" else (
                (lambda s: {"lin": "los"}.get(first3(s), first3(s))) if fld == "range" else first3)
            add(fld, _str_field(fld, a.get(mine), f.get(fld), norm, False))
    if k == "skills" and f.get("attribute"):
        add("attribute", _str_field("attribute", a.get("attr"), f["attribute"], first3, False))
    return done, diffs


MODE_LADDER = ("SA", "BF", "FA")


def up_to(s):
    """`up to FA` -> `SA/BF/FA`: every firing mode up to the one printed (the game's mode ladder)."""
    m = re.fullmatch(r"\s*up\s+to\s+(SA|BF|FA)\s*", s or "", re.I)
    return "/".join(MODE_LADDER[:MODE_LADDER.index(m.group(1).upper()) + 1]) if m else (s or "")


def bands(s):
    """Five attack-rating bands: '10,10,8,,' and '10/10/8/—/—' alike; a parenthetical or footnote mark (`*`, `†`)
    dropped."""
    parts = re.split(r"[/,]", re.sub(r"\([^)]*\)", "", s or ""))
    parts = [re.sub(r"[—–\-*†‡\s]", "", x) for x in parts]
    return "/".join((parts + [""] * 5)[:max(5, len(parts))])
