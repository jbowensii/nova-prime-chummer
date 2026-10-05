"""The priorities a book's sample runner (importer/sr6/archetypes.py) was most likely built with: of the 120 ways to give
the letters A-E to the five columns, the one that overspends least for the build the stat block prints. Magic (or
Resonance) above the magic priority's rating and Edge go on adjustment points, what's left of those on the metatype's
raised attributes; the core attributes on attribute points; skill ranks (and a specialization each) on skill points.
Whatever a pool can't hold is bought with karma, the cheapest ranks first, and nuyen past the resources with karma
turned into nuyen. Overspent is then karma past the starting karma (and power points past the magic rating); ties go
to the nuyen left nearest the printed starting nuyen. The numbers are the creation settings the app ships
(public/data/sr6/creation-defaults.xml) and the catalog's priority rows; nothing is read from the book's text."""
import itertools
import math
import os
import re
import xml.etree.ElementTree as ET

from importer import DATA_DIR

COLUMNS = ("metatype", "attributes", "magic", "skills", "resources")
CORE = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha")
_LEGAL = re.compile(r"\s*(?:\(([LIF])\)|([LIF]))\s*$")


def settings(path=None):
    """The shipped standard creation settings: key -> number (or text); {} when the file isn't there."""
    path = path or os.path.join(DATA_DIR, "sr6", "creation-defaults.xml")
    out = {}
    for s in ET.parse(path).getroot() if os.path.exists(path) else []:
        v = s.get("value", "")
        out[s.get("key")] = float(v) if re.fullmatch(r"-?\d+(?:\.\d+)?", v) else v
    return out


def value(v, rating=1):
    """A catalog value at `rating`, read as src/sr6/engine/values.ts rated() reads it; None when it can't be."""
    if v is None or re.fullmatch(r"\s*[—–-]?\s*", v):
        return None
    s = re.sub(r"\b(?:rating|capacity|force|level)\b", " R ", re.sub(r"[×x*]", " * ", _LEGAL.sub("", v).strip().lstrip("+")),
               flags=re.I)
    toks = re.findall(r"\d+(?:\.\d+)?|\.\d+|R|[+*/^()]|\S", s)
    if "/" in toks and "R" not in toks:
        return None  # `300/350`: two prices
    pos = [0]

    def take():
        pos[0] += 1
        return toks[pos[0] - 1] if pos[0] <= len(toks) else None

    def factor():
        t = take()
        if t == "R":
            return rating
        if t == "(":
            v = expr()
            return v if take() == ")" else math.nan
        return float(t) if t and re.fullmatch(r"\d+(?:\.\d+)?|\.\d+", t) else math.nan

    def power():
        v = factor()
        while pos[0] < len(toks) and toks[pos[0]] == "^":
            pos[0] += 1
            v **= factor()
        return v

    def term():
        v = power()
        while pos[0] < len(toks) and toks[pos[0]] in "*/":
            v = v * power() if take() == "*" else math.ceil(v / power())
        return v

    def expr():
        v = term()
        while pos[0] < len(toks) and toks[pos[0]] == "+":
            pos[0] += 1
            v += term()
        return v

    try:
        n = expr()
    except (ZeroDivisionError, TypeError, ValueError):
        return None
    return n if pos[0] == len(toks) and math.isfinite(n) else None


def _karma(top, ranks, per):
    """Karma for the top `ranks` ranks of something rated `top`: each rank its rating times `per` (CRB p.68)."""
    return sum((top - i) * per for i in range(ranks))


def _cheapest(tops, floors, extra):
    """`extra` ranks taken off the tops, the lowest rating first, none below its floor: the ranks taken from each."""
    took = [0] * len(tops)
    for _ in range(extra):
        open_ = [i for i in range(len(tops)) if tops[i] - took[i] > floors[i]]
        if not open_:
            break
        i = min(open_, key=lambda j: tops[j] - took[j])
        took[i] += 1
    return took


def spend(need, rows, cs):
    """One letter assignment (`rows`: column -> its priority row) -> (score, build) or None when it can't hold
    the runner (its metatype or magic kind not in that row, a priority Magic above the printed one). need: meta (the
    metatype's name), raised (core attributes whose metatype maximum is above the base), magic (kind), attrs (natural
    values; Magic or Resonance as printed, `loss` the points Essence spent took off it), skills ([rank, specializations]), karma (karma the printed things cost: positive qualities, knowledge past
    Logic), neg (karma negative qualities give), spells, forms, pp (power points), nuyen (what the things cost), debt (In
    Debt: the higher rate), left (the printed starting nuyen, or None)."""
    n = lambda k: cs.get(k) if isinstance(cs.get(k), float) else 0
    meta, att, mag, skl, res = (rows[c] for c in COLUMNS)
    adj = meta.get("metas", {}).get(need["meta"].lower())
    kind, a = need["magic"], need["attrs"]
    if adj is None or (kind != "mundane" and kind not in mag.get("magic", {})):
        return None
    special = "res" if kind == "technomancer" else None if kind == "mundane" else "mag"
    rating = mag.get("magic", {}).get(kind) or 0
    a = {**a, **({special: a.get(special, 0) + need.get("loss", 0)} if special else {})}  # before Essence took its part
    if special and a[special] < rating:
        return None
    build = {k: [0, 0, 0] for k in (*CORE, "edg", "mag", "res")}  # points, adjust, karma
    karma = need["karma"]
    for k, base in ((special, rating), ("edg", 1)):
        if k:
            want = a.get(k, base) - base
            build[k][1] = min(want, adj)
            build[k][2] = want - build[k][1]
            adj -= build[k][1]
            karma += _karma(a.get(k, base), build[k][2], n("karmaAttrPerRank"))
    for k in sorted(need["raised"], key=lambda x: -a.get(x, 1)):  # adjustment points left: the raised maximums
        build[k][1] = min(adj, a.get(k, 1) - 1)
        adj -= build[k][1]
    want = [a.get(k, 1) - 1 - build[k][1] for k in CORE]
    took = _cheapest([a.get(k, 1) for k in CORE], [a.get(k, 1) - w for k, w in zip(CORE, want)],
                     max(0, sum(want) - att.get("attributes", 0)))
    for k, w, t in zip(CORE, want, took):
        build[k][0], build[k][2] = w - t, t
        karma += _karma(a.get(k, 1), t, n("karmaAttrPerRank"))
    # a skill's specialization costs a skill point while it has points, else karma (budgets.ts)
    ranks, specs = [r for r, _ in need["skills"]], [s for _, s in need["skills"]]
    took = [0] * len(ranks)
    used = lambda: sum(r - t + (s * n("skillPointsSpec") if r > t else 0) for r, t, s in zip(ranks, took, specs))
    while used() > skl.get("skills", 0) and any(r > t for r, t in zip(ranks, took)):
        took[min((i for i in range(len(ranks)) if ranks[i] > took[i]), key=lambda i: ranks[i] - took[i])] += 1
    skills = [(r - t, t) for r, t in zip(ranks, took)]
    karma += sum(_karma(r, t, n("karmaSkillPerRank")) + (s * n("karmaSpec") if r == t else 0)
                 for r, t, s in zip(ranks, took, specs))
    free = rating * n("freeFormsPerResonance" if special == "res" else "freeSpellsPerMagic") if special else 0
    if special == "res":
        karma += max(0, need["forms"] - free) * n("karmaForm") + need["spells"] * n("karmaSpell")
    else:
        karma += max(0, need["spells"] - free) * n("karmaSpell") + need["forms"] * n("karmaForm")
    rate = n("karmaToNuyenRateInDebt" if need["debt"] else "karmaToNuyenRate")
    short = need["nuyen"] - res.get("nuyen", 0)
    to_nuyen = math.ceil(short / rate) if short > 0 and rate else 0
    karma += to_nuyen
    over = max(0.0, karma - n("startingKarma") - need["neg"])
    pp_over = max(0.0, need["pp"] - a.get("mag", rating)) if kind == "adept" else 0.0  # one per point of Magic (CRB p.157)
    left = res.get("nuyen", 0) + to_nuyen * rate - need["nuyen"]
    gap = abs(left - need["left"]) if need["left"] is not None else 0
    return (pp_over, over, gap), {"letters": {c: rows[c]["letter"] for c in COLUMNS}, "attrs": build,
                                   "skills": skills, "karmaToNuyen": to_nuyen, "nuyenLeft": left}


def fit(need, priorities, cs):
    """The build of the letter assignment that overspends least (see spend), or None when none holds the runner.
    priorities: letter -> {letter, metas (name lower-cased -> adjustment points), attributes, skills, magic (kind ->
    rating), nuyen}."""
    best = None
    for letters in itertools.permutations("ABCDE"):
        got = spend(need, {c: {**priorities.get(L, {}), "letter": L} for c, L in zip(COLUMNS, letters)}, cs)
        if got and (best is None or got[0] < best[0]):
            best = got
    return best and best[1]
