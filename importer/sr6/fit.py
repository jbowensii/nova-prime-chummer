"""The priorities a book's sample runner (importer/sr6/archetypes.py) was most likely built with: of the 120 ways to give
the letters A-E to the five columns, the one that overspends least for the build the stat block prints; when even that
one overspends, Sum-to-Ten's assignments too (SWC p.28: any letters whose values add up to at most sumToTenTarget),
taken when one overspends less. Magic (or Resonance) above the magic priority's rating and Edge go on adjustment
points, what's left of those on the metatype's raised attributes; the core attributes on attribute points; skill ranks
on skill points, a specialization on the points still left. Whatever a pool can't hold is bought with karma, the
cheapest ranks first, and nuyen past the resources with karma turned into nuyen. Assignments are compared on, in
order: power points past the Magic rating (an adept's), Karma past the starting Karma, the count of leftovers past the
carry-over limits (5 Karma, 5,000¥: CRB Hong Kong pp. 66, 68), the nuyen left's distance from the printed starting
nuyen (karma turned into nuyen past what the gear needs, while karma is left), then the least past the limits; a
full tie keeps the first in letter order. The numbers are the creation settings the app ships
(public/data/sr6/creation-defaults.xml), resolved as the app applies them (resolve: nested rules, levels of play), and
the catalog's priority rows; nothing is read from the book's text."""
import itertools
import math
import os
import re
import xml.etree.ElementTree as ET

from importer import DATA_DIR
from importer.sr6.regroup import norm

COLUMNS = ("metatype", "attributes", "magic", "skills", "resources")
CORE = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha")
_LEGAL = re.compile(r"\s*(?:\(([LIF])\)|([LIF]))\s*$")
_EACH = re.compile(r"\s+each\s*$", re.I)  # a unit price's word: `1500 each` is the price of one


def settings(path=None):
    """The shipped standard creation settings: key -> number (or text); {} when the file isn't there."""
    path = path or os.path.join(DATA_DIR, "sr6", "creation-defaults.xml")
    out = {}
    for s in ET.parse(path).getroot() if os.path.exists(path) else []:
        v = s.get("value", "")
        out[s.get("key")] = float(v) if re.fullmatch(r"-?\d+(?:\.\d+)?", v) else v
    return out


# src/sr6/engine/creation.ts's RULE_DEPS (requires, conflicts), LEVELS and SETS, as resolve() needs them
# (tests/sr6/fit-parity.test.ts keeps them the same)
_AWAKENED = ("full", "aspected", "mystic-adept", "adept", "technomancer")
REQUIRES = {
    **{f"swcStreet.{s}": ["levelSwcStreet"] for s in ("sumToTen", "pointBuy", "modules", "letters")},
    **{f"swcElite.{s}": ["levelSwcElite"] for s in ("sumToTen", "pointBuy", "modules", "letters")},
    "swcStreet.karmaBuild": ["levelSwcStreet", "karmaBuildMethod"], "swcElite.karmaBuild": ["levelSwcElite", "karmaBuildMethod"],
    **{k: ["expandedContacts"] for k in ("contactKarma", "contactPairPerCha", "contactRatingMax")},
    "twentyQuestionsKarma": ["twentyQuestions"], "stackingAdvantage": ["arDrEdgeGap"],
    "strengthDamageStep1": ["highStrengthDamage"], "strengthDamageStep2": ["highStrengthDamage"],
    "advance.karmaToNuyenRate": ["workingForTheMan"], "advance.nuyenToKarmaRate": ["workingForThePeople"],
    **{k: [parent] for parent, kids in (
        ("ownCarryOver", ("carryOver.karma", "carryOver.nuyen")), ("karmaToNuyenCap", ("karmaToNuyenMax",)),
        ("positiveQualityMultiplier", ("positiveQualityFactor",)), ("buyPowerPoints", ("advance.powerPoint",)),
        ("karmaBuildMethod", ("karmaBuild.start", "karmaBuild.startRating", "karmaBuild.freeSpellsPerMagic",
                              "karmaBuild.freeFormsPerResonance", *(f"magicKarma:{k}" for k in _AWAKENED))),
        ("dataStructureCaps", ("dataStructure.maxCount", "dataStructure.maxRating")),
        ("gradeCapAtCreation", ("gradeCap.initiation", "gradeCap.submersion")),
        ("restrictMethods", tuple(f"methodAllowed.{m}" for m in ("priority", "sumtoten", "pointbuy", "karma", "lifepath")))) for k in kids},
    "eliteSumToThirteen": ["levelSwcElite"],
}
LEVEL_KEYS = ("levelStreet", "levelPrime", "levelSwcStreet", "levelSwcElite")  # one at a time: the first listed wins
LEVELS = [
    ["levelSwcStreet", [["sumToTenTarget", "swcStreet.sumToTen"], ["pointBuy.total", "swcStreet.pointBuy"],
                        ["lifepath.moduleCount", "swcStreet.modules"], ["priorityLetters", "swcStreet.letters"],
                        ["karmaBuild.start", "swcStreet.karmaBuild"]]],
    ["levelSwcElite", [["sumToTenTarget", "swcElite.sumToTen"], ["pointBuy.total", "swcElite.pointBuy"],
                       ["lifepath.moduleCount", "swcElite.modules"], ["priorityLetters", "swcElite.letters"],
                       ["karmaBuild.start", "swcElite.karmaBuild"]]],
    ["ownCarryOver", [["maxKarmaLeft", "carryOver.karma"], ["maxNuyenLeft", "carryOver.nuyen"]]],
]
SETS = [["eliteSumToThirteen", "sumToTenTarget", 13], ["availabilitySeven", "maxAvailability", 7],
        ["pointBuyErrataNuyen", "pointBuy.max.nuyen", 450000]]


def _on(cs, k):
    return k in cs and cs[k] != "false"  # (creation.ts isOn: set, and not false)


def resolve(cs, own=()):
    """The settings as the app applies them (creation.ts runnerRules: levelRules(applyDeps(...))): of the levels of play
    on, one (a runner's `own` rule first, else the first in LEVEL_KEYS); a nested rule whose parent is off left out; a
    level's own values in place of the settings it replaces, then a house rule of SETS that is on sets its number."""
    out = {k: v for k, v in cs.items() if v != ""}  # (an empty value isn't a setting: rulesFrom skips it)
    on = sorted((k for k in LEVEL_KEYS if _on(out, k)), key=lambda k: (k not in own, LEVEL_KEYS.index(k)))
    for k in on[1:]:
        del out[k]
    changed = True
    while changed:
        changed = False
        for k in [k for k in out if any(not _on(out, p) for p in REQUIRES.get(k, ()))]:
            del out[k]
            changed = True
    res = dict(out)
    for lv, pairs in LEVELS:
        if out.get(lv) == "true":
            res.update({key: out[frm] for key, frm in pairs if frm in out})
    res.update({key: float(v) for k, key, v in SETS if out.get(k) == "true"})
    return res


# budgets.ts metatypeSize's words (a test keeps the two lists the same)
TROLL_SIZED = ("troll", "trolls", "cyclops", "fomori", "fomorian", "giant", "minotaur")
DWARF_SIZED = ("dwarf", "dwarfs", "dwarves", "gnome", "hanuman", "koborokuru", "menehune")


def metatype_size(name):
    """'troll' or 'dwarf' when the metatype's name has a troll- or dwarf-sized word (metatypeSizePricing), else None."""
    words = norm(name or "").split()
    return "troll" if any(w in TROLL_SIZED for w in words) else "dwarf" if any(w in DWARF_SIZED for w in words) else None


def value(v, rating=1):
    """A catalog value at `rating`, read as src/sr6/engine/values.ts rated() reads it; None when it can't be."""
    if v is None or len(v) > 100 or re.fullmatch(r"\s*[—–-]?\s*", v):  # values.ts MAX_VALUE
        return None
    s = re.sub(r"\b(?:rating|capacity|force|level)\b", " R ", re.sub(r"[×x*]", " * ", _LEGAL.sub("", _EACH.sub("", v)).strip().lstrip("+")),
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
    values; Magic or Resonance as printed, `loss` the points Essence spent took off it), skills ([rank, specializations,
    expertises (optional)]), karma (karma the printed things cost: positive qualities, knowledge past
    Logic), neg (karma negative qualities give), spells, forms, pp (power points), nuyen (what the things cost), debt (In
    Debt: the higher rate), left (the printed starting nuyen, or None), toNuyen (the karma turned into nuyen when the
    block prints it: In Debt's debt; optional)."""
    n = lambda k: cs.get(k) if isinstance(cs.get(k), float) else 0
    # the karma it starts with (providers.ts): twice the customization Karma for a prime runner (CRB Hong Kong p.63),
    # Twenty Questions' karma (SWC p.25)
    start = n("startingKarma") * (2 if cs.get("levelPrime") == "true" else 1) \
        + (n("twentyQuestionsKarma") if cs.get("twentyQuestions") == "true" else 0)
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
    # adjustment points left: the raised maximums, the highest first, a tie in the attributes' order (never the set's
    # order, which changes from run to run)
    for k in sorted(need["raised"], key=lambda x: (-a.get(x, 1), CORE.index(x))):
        build[k][1] = min(adj, a.get(k, 1) - 1)
        adj -= build[k][1]
    want = [a.get(k, 1) - 1 - build[k][1] for k in CORE]
    took = _cheapest([a.get(k, 1) for k in CORE], [a.get(k, 1) - w for k, w in zip(CORE, want)],
                     max(0, sum(want) - att.get("attributes", 0)))
    for k, w, t in zip(CORE, want, took):
        build[k][0], build[k][2] = w - t, t
        karma += _karma(a.get(k, 1), t, n("karmaAttrPerRank"))
    # the ranks take the skill points (the cheapest past them bought with karma); a specialization on a skill with points
    # takes a point still left, else karma, never dearer than a karma rank (budgets.ts skillSpend)
    ranks, specs, pool = [x[0] for x in need["skills"]], [x[1] for x in need["skills"]], skl.get("skills", 0)
    took = _cheapest(ranks, [0] * len(ranks), max(0, sum(ranks) - pool))
    skills = [(r - t, t) for r, t in zip(ranks, took)]
    karma += sum(_karma(r, t, n("karmaSkillPerRank")) for r, t in zip(ranks, took))
    left, cost = pool - sum(p for p, _ in skills), n("skillPointsSpec")
    # an expertise (the specialization made one, CRB p.92) likewise takes skillPointsExpertise points when they're
    # left, else the customization karma at its advancement price (owner, 2026-10-09: CRB p.68)
    ex_cost = cs.get("skillPointsExpertise") if isinstance(cs.get("skillPointsExpertise"), float) else None
    for (p, _), s, ex in zip(skills, specs, [x[2] if len(x) > 2 else 0 for x in need["skills"]]):
        for _ in range(s):
            if p and cost <= left:
                left -= cost
            else:
                karma += n("karmaSpec")
        for _ in range(ex):
            if p and ex_cost is not None and ex_cost <= left:
                left -= ex_cost
            else:
                karma += n("advance.expertise")
    # the free ones: the priority's rating less what Essence took (CRB Hong Kong p.66) and, a mystic adept's, less the
    # power points it bought out of its Magic (whole points, what its powers cost; CRB pp. 65-66): magic.ts freeSpellSlots.
    # The runner says how many it bought.
    bought = math.ceil(need["pp"]) if kind == "mystic-adept" else 0
    per = n("freeFormsPerResonance" if special == "res" else "freeSpellsPerMagic")
    free = max(0, rating - need.get("loss", 0) - bought) * per if special else 0
    # past the free ones: bought with the customization Karma (an optional rule at creation: karmaSpellsAtCreation)
    extra = max(0, need["forms"] - free) + need["spells"] if special == "res" else max(0, need["spells"] - free) + need["forms"]
    if special == "res":
        karma += max(0, need["forms"] - free) * n("karmaForm") + need["spells"] * n("karmaSpell")
    else:
        karma += max(0, need["spells"] - free) * n("karmaSpell") + need["forms"] * n("karmaForm")
    # karma into nuyen: at least what the gear needs past the resources (never nuyen left below 0 while karma could
    # cover it), more while karma is left and the nuyen stays within its carry-over limit: the count that leaves fewest
    # leftovers past the carry-over limits (maxKarmaLeft, maxNuyenLeft, CRB Hong Kong pp. 66, 68), then the nuyen left
    # nearest the printed starting nuyen (the book's own number: no Karma moved that can't clear a limit), then the
    # least past them (nuyen counted in the karma it was, rounded up), then the fewest
    rate = n("karmaToNuyenRateInDebt" if need["debt"] else "karmaToNuyenRate")
    short = need["nuyen"] - res.get("nuyen", 0)
    # the house rule's limit on the karma turned (karmaToNuyenCap on: karmaToNuyenMax; budgets.ts toNuyen counts no more)
    cap = int(cs["karmaToNuyenMax"]) if cs.get("karmaToNuyenCap") == "true" and isinstance(cs.get("karmaToNuyenMax"), float) else None
    low = math.ceil(short / rate) if short > 0 and rate else 0
    low = low if cap is None else min(low, cap)
    room = start + need["neg"] - karma  # karma left before any turns into nuyen
    top = lambda k: cs[k] if isinstance(cs.get(k), float) else math.inf  # noqa: E731

    def leftover(k):
        nuyen = res.get("nuyen", 0) + k * rate - need["nuyen"]
        over_n = nuyen - top("maxNuyenLeft")
        excess = max(0.0, room - k - top("maxKarmaLeft")) + (math.ceil(over_n / rate) if over_n > 0 and rate else 0)
        return ((room - k > top("maxKarmaLeft")) + (over_n > 0), abs(nuyen - need["left"]) if need["left"] is not None else 0,
                excess, k)
    # (more than the gear needs only while the nuyen stays within its limit)
    ks = [k for k in range(low, max(low, math.floor(room) if cap is None else min(math.floor(room), cap)) + 1)
          if k == low or res.get("nuyen", 0) + k * rate - need["nuyen"] <= top("maxNuyenLeft")]
    to_nuyen = min(ks, key=leftover) if rate else 0
    if need.get("toNuyen") is not None:  # printed (In Debt's debt): that many, or what the gear needs when more
        to_nuyen = max(low, need["toNuyen"]) if cap is None else min(max(low, need["toNuyen"]), cap)
    errors, gap, excess, _ = leftover(to_nuyen)
    karma += to_nuyen
    over = max(0.0, karma - start - need["neg"])
    pp_over = max(0.0, need["pp"] - a.get("mag", rating)) if kind == "adept" else 0.0  # one per point of Magic (CRB p.157)
    left = res.get("nuyen", 0) + to_nuyen * rate - need["nuyen"]
    return (pp_over, over, errors, gap, excess), {"letters": {c: rows[c]["letter"] for c in COLUMNS}, "attrs": build,
                                   "skills": skills, "karmaToNuyen": to_nuyen, "nuyenLeft": left, "karmaLeft": room - to_nuyen, "extraMagic": extra,
                                   "powerPointsBought": bought}


def fit(need, priorities, cs):
    """The build of the letter assignment that overspends least (see spend), or None when none holds the runner: the
    priority system's (each letter once) first; when the best of those overspends, Sum-to-Ten's too (SWC p.28: any
    letters whose values add up to at most sumToTenTarget), taken when it overspends less (its build's method
    "sumtoten"). priorities: letter -> {letter, metas (name lower-cased -> adjustment points), attributes, skills, magic
    (kind -> rating), nuyen}."""
    # the letters the runner takes (priorityLetters: a level of play's, street-level's B C C D E), each priced at the row
    # below it at street level (levelStreet, CRB Hong Kong p.63: E stays E), as providers.ts reads them
    want = cs.get("priorityLetters") or "ABCDE"
    row = (lambda L: priorities.get("ABCDE"[min("ABCDE".index(L) + 1, 4)], {})) if cs.get("levelStreet") == "true" \
        else (lambda L: priorities.get(L, {}))

    def best(assignments, method):
        out = None
        for letters in assignments:
            got = spend(need, {c: {**row(L), "letter": L} for c, L in zip(COLUMNS, letters)}, cs)
            if got and (out is None or got[0] < out[0]):
                out = (got[0], {**got[1], "method": method})
        return out
    got = best(sorted(set(itertools.permutations(want))), "priority")
    value, target = {L: cs.get(f"letterValue:{L}") for L in "ABCDE"}, cs.get("sumToTenTarget")
    if (got is None or got[0][:2] > (0, 0)) and isinstance(target, float) and all(isinstance(v, float) for v in value.values()):
        s10 = best((ls for ls in itertools.product(sorted(set(want)), repeat=5) if sum(value[L] for L in ls) <= target), "sumtoten")
        if s10 and (got is None or s10[0][:2] < got[0][:2]):
            got = s10
    return got and {**got[1], "over": got[0][1]}  # (over: the Karma still past the starting Karma)
