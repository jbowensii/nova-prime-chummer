"""Modifier patterns: Commlink6's modifications as path-and-value modifiers, aligned with the sentences of our own
descriptions that state them, and the phrase templates that recur (the phase 6 effects grammar's raw material).

A modifier is (path, operator, value, condition). The path starts at the character (or the item, or the item's host)
and narrows: character/attribute/strength, character/roll/skill:perception, character/initiative/dice-physical,
item/attack-rating, item/slot/top. A Commlink6 modification is aligned with a sentence of our description of the
matched item when the sentence names its target (the game's own words for it) and prints its value (the number, or
"Rating"/"level" for a per-rating value). The aligned window, with the target, number and rating replaced by slots,
is a template; each template is scored by how often it fires on our descriptions and finds a real modifier (precision)
and how many of its family's modifiers it reproduces (recall). Vocabulary only, never item names."""

import functools
import json
import os
import re
from collections import Counter, defaultdict

from importer.sr6.effects.words import ATTRIBUTES, SKILLS, TEST_TYPES
from tools.cl6check.canon import _mods as canon_mods, effect_key as canon_effect_key
from tools.cl6effects import evaluate, xlate

PRIMARY = {
    "BODY",
    "AGILITY",
    "REACTION",
    "STRENGTH",
    "WILLPOWER",
    "LOGIC",
    "INTUITION",
    "CHARISMA",
    "EDGE",
    "MAGIC",
    "RESONANCE",
    "ESSENCE",
}
DERIVED = (
    ("INITIATIVE", "initiative"),
    ("MONITOR", "condition-monitor"),
    ("DEFENSE_RATING", "defense-rating"),
    ("DEFENSE_POOL", "roll"),
    ("RESIST", "roll"),
    ("DAMAGE_REDUCTION", "damage-reduction"),
    ("ATTACK_RATING", "attack-rating"),
    ("MINOR_ACTION", "actions"),
    ("MOVEMENT", "movement"),
    ("ESSENCE", "essence"),
    ("COMPOSURE", "roll"),
    ("JUDGE_INTENTIONS", "roll"),
    ("MEMORY", "roll"),
    ("LIFT", "roll"),
    ("DAMAGE_OVERFLOW", "condition-monitor"),
    ("POWER_POINTS", "points"),
)
OPS = {"MAX": "max", "MIN": "min", "NATURAL": "+natural", "AUGMENTED": "+", "ARTIFICIAL": "artificial"}
CHECK_OPS = {"DICE": "+dice", "HIT": "+hits", "EDGE": "+edge", "EDGE_BOOST": "edge-cost"}
# the game's words for a target where its id isn't them (a vocabulary, the same in every book)
SYNONYMS = {
    "damage": ("damage", "dv"),
    "dice": ("dice", "die"),
    "monitor": ("monitor", "box", "boxes"),
    "close_combat": ("close combat",),
    "pool": ("pool", "test"),
    "attack_rating": ("attack rating", "ar"),
}
STRUCTURE = {"item/slot", "item/includes"}  # the slots and includes families: structure, not stated effects
HEADS = {
    "test",
    "tests",
    "attribute",
    "skill",
    "dice",
    "die",
    "pool",
    "rating",
    "bonus",
    "modifier",
    "boxes",
    "box",
    "edge",
    "hits",
    "points",
    "initiative",
    "level",
    "levels",
}
GRAMMAR = HEADS | {
    "to",
    "on",
    "for",
    "all",
    "any",
    "by",
    "of",
    "the",
    "a",
    "an",
    "your",
    "their",
    "its",
    "with",
    "in",
    "and",
    "or",
    "per",
    "each",
    "plus",
    "+",
    "gain",
    "gains",
    "receive",
    "receives",
    "increase",
    "increases",
    "increased",
    "add",
    "adds",
    "grant",
    "grants",
    "provide",
    "provides",
    "situational",
    "attributes",
    "skills",
    "threshold",
    "reduce",
    "reduces",
    "as",
    "follows",
    "quality",
    "power",
    "critter",
    "physical",
    "stun",
    "condition",
    "monitor",
    "defense",
    "damage",
    "armor",
    "limit",
    "minus",
    "penalty",
    "up",
    "maximum",
    "max",
    "when",
    "against",
    "resist",
    "resistance",
    "made",
}
NUMBER_WORDS = {w: str(i) for i, w in enumerate(("zero", "one", "two", "three", "four", "five", "six"))}
UNSTATED = {"embed", "decision", "relevancemod"}  # pre-installed gear, its answers, UI tags: not modifiers of play


def _slug(s):
    return re.sub(r"[^a-z0-9:]+", "-", (s or "").casefold()).strip("-")


def path(m):
    """The path of one modification element: (root, part, specific)."""
    t, ref = (m.get("type") or "").upper(), m.get("ref") or ""
    apply = (m.get("apply") or "").upper()
    if m.tag == "checkmod":
        return "character", "roll", f"{_slug(t)}:{_slug(ref)}"
    if m.tag == "allowmod":
        return "character", "allow", f"{_slug(t)}:{_slug(ref)}"
    if t == "ATTRIBUTE":
        if ref.upper() in PRIMARY or ref.upper() == "CHOICE":
            return "character", "attribute", _slug(ref)
        part = next((p for k, p in DERIVED if k in ref.upper()), "attribute")
        return "character", part, _slug(ref)
    if t in ("ITEM_ATTRIBUTE", "HOOK", "GEAR", "GEARMOD") or m.tag == "itemhookmod":
        root = "host" if apply == "PARENT" else "item"
        part = {"HOOK": "slot", "GEAR": "includes", "GEARMOD": "includes"}.get(t, _slug(ref))
        return root, part, _slug(ref) if part != _slug(ref) else ""
    if t == "SKILL":
        return "character", "skill", _slug(ref)
    if m.tag == "itemmod":
        return "character", _slug(t) or "grant", _slug(ref)
    return "character", _slug(t) or m.tag, _slug(ref)


def op(m):
    """The operation a Commlink6 modifier performs, as the app names it."""
    if m.tag == "checkmod":
        return CHECK_OPS.get(m.get("what") or "DICE", _slug(m.get("what")))
    if m.tag == "itemmod":
        return "remove" if m.get("remove") == "true" else "grant"
    if m.tag == "allowmod":
        return "deny" if m.get("neg") == "true" else "allow"
    return OPS.get((m.get("set") or "").upper(), "+")


def modifiers(el):
    """Every modifier of a record: its own modifications, its modes' (condition mode:<id>), its variants'
    (variant:<id>) and a mentor spirit's role blocks (role:magician); a selmod's choices carry condition choice."""
    blocks = [(el, "")] + [(x, f"{x.tag}:{x.get('id') or ''}") for x in el if x.tag in ("mode", "variant")]
    blocks += [(x, f"role:{x.tag}") for x in el if x.tag in ("magician", "adept")]
    out = []
    for b, cond in blocks:
        for ms in b.findall("modifications"):
            for m in ms.iter():
                if m.tag in UNSTATED or m.tag in ("modifications", "selmod"):
                    continue
                c = [
                    x
                    for x in (
                        cond,
                        "choice" if _in_selmod(ms, m) else "",
                        "situational" if m.get("cond") else "",
                        f"mode:{m.get('mode').lower()}" if m.get("mode") else "",
                    )
                    if x
                ]
                v = m.get("value") or ""
                out.append(
                    {
                        "path": "/".join(x for x in path(m) if x),
                        "op": op(m),
                        "value": v,
                        "rated": bool(re.search(r"\$(RATING|LEVEL|FORCE)", v)),
                        "cond": c,
                        "ref": m.get("ref") or "",
                        "type": m.get("type") or "",
                    }
                )
    return out


def _in_selmod(ms, m):
    return any(m in list(s.iter()) for s in ms.iter("selmod"))


# ---------- alignment ----------
def tokens(s):
    """The lower-cased words and numbers of `s`, number words as digits."""
    s = (s or "").casefold().replace("−", "-").replace("–", "-").replace("’", "'")
    toks = re.findall(r"[a-z][a-z']*|[+-]?\d+(?:[.,]\d+)?|[+×]", s)
    return [NUMBER_WORDS.get(t, t) for t in toks]


def sentences(text):
    """The sentences of an entry's text."""
    return [s for s in re.split(r"(?<=[.!?:])\s+|\n+", text or "") if s.strip()]


def keywords(mod):
    """Groups of alternative words the sentence must contain, one group per word of the target ('' when the target
    can't be named: a choice)."""
    ref = mod["ref"]
    if not ref or ref.upper() == "CHOICE":
        return None
    if ":" in mod["path"].split("/")[-1] and "/" not in ref:
        ref = ref.split("/")[-1]  # skill/spec: the spec's words
    ws = [w for w in ref.casefold().replace("/", "_").split("_") if w and w not in ("physical",)]
    if ref.casefold() in SYNONYMS:
        return [SYNONYMS[ref.casefold()]]
    return [SYNONYMS.get(w, (w,)) for w in ws]


def _find(toks, alts):
    """Token index where any alternative (one or more words) starts, else -1."""
    for alt in alts:
        a = alt.split()
        for i in range(len(toks) - len(a) + 1):
            if all(toks[i + k].startswith(a[k][: max(4, len(a[k]) - 1)]) for k in range(len(a))):
                return i, len(a)
    return -1, 0


def _number(v):
    m = re.search(r"-?\d+(?:\.\d+)?", (v or "").replace("$RATING", "").replace("$LEVEL", ""))
    return m.group(0).lstrip("-+") if m else None


def align(mod, toks):
    """(template, slot spans) when the token list states this modifier, else None."""
    groups = keywords(mod)
    if not groups:
        return None
    spans = []
    for g in groups:
        i, n = _find(toks, g)
        if i < 0:
            return None
        spans.append((i, i + n, "{T}"))
    num = _number(mod["value"])
    if num:
        hit = [i for i, t in enumerate(toks) if t.lstrip("+-") == num]
        if not hit:
            return None
        spans.append((hit[0], hit[0] + 1, "{N}"))
    if mod["rated"]:
        hit = [i for i, t in enumerate(toks) if t in ("rating", "level", "force")]
        if not hit:
            return None
        spans.append((hit[0], hit[0] + 1, "{R}"))
    if not num and not mod["rated"] and mod["op"] not in ("grant", "allow", "deny", "remove"):
        return None  # a number to state, but none to look for
    lo, hi = min(s[0] for s in spans), max(s[1] for s in spans)
    if hi - lo > 8:
        return None  # target and value too far apart to be one statement
    if all(sp[2] == "{T}" for sp in spans):
        lo, hi = max(0, lo - 2), min(len(toks), hi + 1)  # a grant: its verb and noun ("gain the {T} quality")
    elif hi < len(toks) and toks[hi] in HEADS:
        hi += 1  # the noun the value attaches to ("… {T} tests")
    slot = {}
    for a, b, name in spans:
        for k in range(a, b):
            slot[k] = name
    # the skeleton: slots and grammar words kept; a content word next to the target joins it, any other becomes *
    out = []
    for k in range(lo, hi):
        x = slot.get(k) or (
            "{#}" if re.fullmatch(r"[+-]?\d+(?:[.,]\d+)?", toks[k]) else toks[k] if toks[k] in GRAMMAR else "*"
        )
        if x == "*" and (slot.get(k - 1) == "{T}" or slot.get(k + 1) == "{T}"):
            x = "{T}"
        if not (x in ("{T}", "*") and out and out[-1] == x):
            out.append(x)
    while out and out[0] == "*":
        out.pop(0)
    while out and out[-1] == "*":
        out.pop()
    return " ".join(out)


def _term(groups):
    """A target's words as a regex fragment (each word by its stem, as _find matches it)."""
    return " ".join(re.escape(g[0].split()[0][: max(4, len(g[0].split()[0]) - 1)]) + r"\S*" for g in groups)


def _regex(template, terms):
    """The template as a regex over joined tokens: {T} is any target term of the family's vocabulary (the grammar
    looks targets up, it never guesses them), {N} a number, {R} the rating, * up to three other words."""
    alt = "|".join(sorted(terms, key=len, reverse=True)) or r"(?!)"
    parts, seen = [], set()
    for t in template.split():
        if t in ("{T}", "{N}") and t not in seen:
            seen.add(t)
            parts.append(rf"(?P<t>{alt})" if t == "{T}" else r"[+-]?(?P<n>\d+(?:[.,]\d+)?)")
        elif t == "{T}":
            parts.append(rf"(?:{alt})")
        elif t in ("{N}", "{#}"):
            parts.append(r"[+-]?\d+(?:[.,]\d+)?")
        elif t == "{R}":
            parts.append(r"(?:rating|level|force)")
        elif t == "*":
            parts.append(r"(?:\S+ ){0,2}?\S+")
        else:
            parts.append(re.escape(t))
    return re.compile(r"(?:^| )" + " ".join(parts) + r"(?= |$)")


def family(p):
    """The first two path parts of a modifier's path, its family."""
    return "/".join(p.split("/")[:2])


def analyse(pairs, all_mods, top=(20, 50)):
    """pairs: [(modifiers of a matched record, our description)]; all_mods: every record's modifiers (the vocabulary).
    Returns the metrics dict."""
    vocab = defaultdict(Counter)
    for mods in all_mods:
        for m in mods:
            root, *rest = m["path"].split("/")
            vocab[f"{root}/{rest[0] if rest else ''}"][rest[1] if len(rest) > 1 else ""] += 1
    total_all = sum(len(x) for x in all_mods)
    fam_total, fam_aligned = Counter(), Counter()
    found = defaultdict(set)  # template → {(pair index, mod index)}
    texted = [(mods, " ".join(tokens(t))) for mods, t in pairs]
    sent_toks = [[tokens(s) for s in sentences(t)] for _, t in pairs]
    for i, (mods, _) in enumerate(pairs):
        for j, m in enumerate(mods):
            fam_total[family(m["path"])] += 1
            for st in sent_toks[i]:
                t = align(m, st)
                if t:
                    fam_aligned[family(m["path"])] += 1
                    key = (family(m["path"]), t)
                    found[key].add((i, j))
                    break
    # every template's reach: where it fires in our descriptions with a target from the family's vocabulary, and
    # the modifiers of that item it reproduces (same target; same number when it prints one)
    terms = defaultdict(set)
    for mods in all_mods:
        for m in mods:
            g = keywords(m)
            if g:
                terms[family(m["path"])].add(_term(g))
    scored = []
    for (fam, t), seeds in found.items():
        if len(seeds) < 2:
            continue
        rx = _regex(t, terms[fam])
        fires = tp = 0
        repro = set()
        for i, (mods, joined) in enumerate(texted):
            for hit in rx.finditer(joined):
                fires += 1
                cap = hit.group("t").split() if "t" in rx.groupindex else []
                n = hit.group("n") if "n" in rx.groupindex else None
                got = {
                    (i, j)
                    for j, m in enumerate(mods)
                    if family(m["path"]) == fam
                    and keywords(m)
                    and all(_find(cap, g)[0] >= 0 for g in keywords(m))
                    and (n is None or _number(m["value"]) == n)
                }
                tp += bool(got)
                repro |= got
        scored.append(
            {
                "family": fam,
                "template": t,
                "seeds": len(seeds),
                "fires": fires,
                "precision": round(tp / fires, 3) if fires else 0.0,
                "recall": round(len(repro) / fam_total[fam], 3) if fam_total[fam] else 0.0,
                "_repro": repro,
            }
        )
    scored.sort(key=lambda x: (-len(x["_repro"]), -x["precision"], x["template"]))
    matched_total = sum(fam_total.values())
    cover = {}
    for k in top:
        got = set().union(*(x["_repro"] for x in scored[:k])) if scored else set()
        cover[f"top{k}"] = {
            "reproduced": len(got),
            "of_matched": matched_total,
            "pct_matched": _pct(len(got), matched_total),
            "of_all": total_all,
            "pct_all": _pct(len(got), total_all),
        }
    return {
        "modifiers_total": total_all,
        "on_matched_with_text": matched_total,
        "aligned": sum(fam_aligned.values()),
        "aligned_pct": _pct(sum(fam_aligned.values()), matched_total),
        "by_family": {
            f: {"modifiers": n, "aligned": fam_aligned[f], "pct": _pct(fam_aligned[f], n)}
            for f, n in fam_total.most_common()
        },
        "templates": [
            {k: v for k, v in x.items() if k != "_repro"} | {"reproduced": len(x["_repro"])} for x in scored[:60]
        ],
        "coverage": cover,
        "vocabulary": {
            p: {"n": sum(c.values()), "specific": dict(c.most_common(12))}
            for p, c in sorted(vocab.items(), key=lambda x: -sum(x[1].values()))
        },
    }


def _pct(n, d):
    return round(100.0 * n / d, 2) if d else None


def run(cl6, pairs, sources):
    """Over every canonical record (the vocabulary) and the matched (record, entry) pairs whose entry has a
    description."""

    def text(o):
        s = sources.get(o["src"])
        return s.texts.get(o["id"], "") if s else ""

    data = [([m for m in modifiers(c["el"]) if family(m["path"]) not in STRUCTURE], text(o)) for c, o in pairs]
    out = analyse([d for d in data if d[0] and d[1]], [modifiers(c["el"]) for c in cl6])
    out["on_matched"] = sum(len(d[0]) for d in data)  # with or without a description of ours
    return out


# Per-effect normalisation (metric only): same meaning, different notation counts as a match. The pairs below were read
# off the observed (CommLink6 target, our target) pairs of the baseline import, not guessed.
_CL6_TARGET = {
    "attribute:initiative-dice-physical": "derived:initiative-dice",
    "attribute:initiative-dice-matrix": "derived:matrix-initiative-dice",
    "attribute:defense-rating-physical": "derived:defense",
    "attribute:defense-rating-social": "derived:social",
    "attribute:defense-rating-astral": "derived:defense-astral",
    "attribute:physical-monitor": "derived:physical-monitor",
    "attribute:stun-monitor": "derived:stun-monitor",
    "attribute:minor-action-physical": "derived:minor-actions",
    "attribute:damage-overflow": "derived:overflow",
    "attribute:defense-pool-matrix": "derived:matrix-defense",
    "attribute:movement": "derived:movement",
    "attribute:essence-hole": "derived:essence-hole",
    "attribute:composure": "derived:composure",
    "attribute:resist-damage": "test:damage-resistance",
    "attribute:resist-toxin": "test:toxin-resistance",
    "attribute:resist-drain": "test:drain-resistance",
    "attribute:defense-pool-astral": "test:defense-astral",
    "attribute:defense-pool-combat-direct": "test:defense-spell-direct",
    "attribute:defense-pool-combat-indirect": "test:defense-spell-indirect",
    "attribute:defense-pool-physical": "test:defense",
    "item-attribute:attack-rating": "item:ar",
    "item-attribute:damage": "item:dv",
    "item-attribute:topspeed": "item:top-speed",
    "item-attribute:firewall": "matrix:firewall",
    # (Commlink6 names the VR Matrix initiative per mode, cold and hot; ours is one derived value for both)
    "attribute:initiative-dice-matrix-vr-cold": "derived:matrix-initiative-dice",
    "attribute:initiative-dice-matrix-vr-hot": "derived:matrix-initiative-dice",
    "attribute:initiative-matrix-vr-cold": "derived:matrix-initiative",
    "attribute:initiative-matrix-vr-hot": "derived:matrix-initiative",
    "attribute:initiative-matrix": "derived:matrix-initiative",
    "attribute:drake-edge": "attr:edg",  # (a drake's Edge, set apart for its own maximum)
    "attribute:attack-rating-matrix": "item:ar",  # (a complex form's Matrix attack rating)
}
# (CommLink6 names its attributes in full; ours use the three-letter id, `test:attr-<id>` for a dice bonus on the tests
# of that attribute, which CommLink6 states as the attribute's checkmod)
_SKILLS = sorted((s.replace(" ", "-") for s in SKILLS), key=len, reverse=True)


def _canon_target(t):
    """One spelling per meaning for an effect target."""
    kind, _, ref = t.partition(":")
    if kind == "attribute" and ref in ATTRIBUTES:
        return "attr:" + ATTRIBUTES[ref]
    if kind == "test" and ref.startswith("attr-"):
        return "attr:" + ref[5:]
    if kind == "skillspecialization":  # 'perception-tactile' is Perception's specialization: Perception
        return next(("skill:" + k for k in _SKILLS if ref.startswith(k + "-")), t)
    if kind == "item-attribute" and ref in ("handling", "acceleration", "concealability", "body", "seats"):
        return "item:" + ref
    return _CL6_TARGET.get(t, t)


def _expand(effects):
    """Our `test:<type>` group target is every skill the type covers (words.TEST_TYPES, the importer's own copy of
    effects.ts TEST_TYPES): CommLink6 states those skill by skill. The group stays too.
    physical/mental (attribute-linked
    skills) need the skills catalog and stay a group."""
    out = []
    for t, v in effects:
        out.append((t, v))
        kind, _, ref = t.partition(":")
        if kind == "test" and ref in TEST_TYPES and ref not in ("physical", "mental"):
            out += [("skill:" + s, v) for s in TEST_TYPES[ref]]
    return out


def _num(x):
    return f"{float(x):g}"


_ATTR_VAR = {k.casefold(): a for k, a in xlate.ABBR.items()} | {"drake_edge": "edg"}


def _v(s):
    """One spelling per value: $RATING/$LEVEL as r, r*n either way round, numbers without trailing zeros."""
    s = re.sub(r"\$(rating|level|force)", "r", (s or "").casefold()).replace(" ", "").lstrip("+")
    s = re.sub(r"\([a-z]+\)$|/(ground|air|water)$|(?<=/\d)r[du]$", "", s)  # (… and edg/2 rd: our rounding)
    s = re.sub(
        r"\$([a-z_]+)", lambda x: _ATTR_VAR.get(x.group(1), x.group(0)), s
    )  # ($DRAKE_EDGE: our edg)  # (1000(belt): the ammo; 3/6/1/ground: the movement)
    s = re.sub(r"^r-\$\$[a-z-_]+$", "r", s)  # ($RATING-$$PILOT: set to the rating)
    m = re.fullmatch(r"\$\$[a-z_]+\*(\d*\.?\d+)\*r", s)  # ($$TOPSPEED*0.2*$RATING: our r*20%)
    if m:
        return f"r*{_num(float(m.group(1)) * 100)}%"
    parts = [p.lstrip("+") or "0" for p in re.split("[,/]", s)]
    if len(parts) > 1 and all(re.fullmatch(r"-?\d+(?:\.\d+)?", p) for p in parts):
        # (an AR list or a handling on/off-road pair stating one number: 2,2,2,2,2 / 2,0,0,0,0 / +3/+3 / 0/-1)
        nz = {_num(p) for p in parts} - {"0"}
        if len(nz) == 1 and (len(set(parts)) == 1 or parts.count("0") == len(parts) - 1 or "/" in s):
            return nz.pop()
        if "," in s:
            return ",".join(_num(p) for p in parts)
    m = re.fullmatch(r"(-?)(?:r\*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\*r)", s)
    if m:
        n = _num(m.group(2) or m.group(3))
        s = m.group(1) + ("r" if n == "1" else "r*" + n)
    return _num(s) if re.fullmatch(r"-?\d+(?:\.\d+)?", s) else s


def _per_level(v):
    """A number printed once read as our per-level R times it (1 → r, -1 → -r, 5 → r*5)."""
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", v):
        return set()
    sign, n = ("-", v[1:]) if v.startswith("-") else ("", v)
    return {sign + ("r" if n == "1" else "r*" + n)}


# Commlink6 rule names and the effect we write for them (the gate's pairs, tools/cl6effects/evaluate.py)
_RULE_ALIAS = {
    "rule:unarmed-damage-is-physical": {"derived:unarmed-damage"},
    "rule:pain-tolerance-ignore-box": {"derived:wound-threshold"},
    "action:take-aim": {"action-max:take-aim"},  # (raises the maximum dice pool bonus of Take Aim)
}


def _cl6_keys(m):
    """(targets, values, mode) one CommLink6 modification may be written as in ours; mode 'any' ignores the value,
    'abs' compares its size (an Edge-cost malus +1 is our cut -1)."""
    _, t, _ = canon_effect_key(_Elem(m))
    targets = {_canon_target(t)}
    kind, _, ref = t.partition(":")
    atoms = xlate.cl6_atoms(m)[0]
    if atoms and (m.get("set") == "MAX" or m["_tag"] == "checkmod" or kind == "item-attribute"):
        targets |= atoms
    if t == "item-attribute:max-sensor-rating":
        targets.add("item:sensor")
    natural = m.get("apply") in ("UNARMED", "ANIMAL", "DRAKE") or m.get("set") == "NATURAL"
    if natural and t in ("item-attribute:attack-rating", "item-attribute:damage"):  # (a natural weapon: our unarmed)
        targets.add("derived:unarmed-ar" if ref == "attack-rating" else "derived:unarmed-dv")
    if natural and t == "attribute:attack-rating-physical":  # (a natural weapon's Attack Rating: our unarmed)
        targets.add("derived:unarmed-ar")
    v = _v(m.get("value"))
    what = m.get("what") or ""
    values = {v}
    targets.add({"attribute": "derived:", "creation-points": "resource:"}.get(kind, kind + ":") + ref)
    if ref in ("essence", "essence-hole") and re.fullmatch(r"-?\d+", v):  # (Commlink6 counts Essence in thousandths)
        values.add(_num(float(v) / 1000))
    if t == "pricemod:lifestyle-necessities" and re.fullmatch(r"-?\d+", v):  # (points, or percent as a fraction)
        targets |= {"lifestyle:necessities", "pricemod:lifestyle"}
        values.add(_num(float(v) / 100))
    if ref == "choice":
        targets |= {"attr:choice", "test:attr-choice", "attr-max:*"} if kind == "attribute" else {"matrix:choice"}
    if what == "EDGE_CHASE":
        targets.add("pool:chase")
    sense = re.sub("termographic", "thermographic", ref)  # (Commlink6 spells it both ways)
    if kind == "quality" and sense.endswith("-vision") or t == "critter-power:enhanced-sense":
        targets.add("sense:" + sense if kind == "quality" else "sense:*")
    if t == "skill:astral" and m["_tag"] in ("itemmod", "allowmod"):
        targets.add("sense:astral-perception")
    targets |= _RULE_ALIAS.get(t, set()) | ({"derived:adept-drain-attribute"} if kind == "drain-adept" else set())
    if kind == "critter-power":
        targets.add("derived:" + ref)  # (hardened armor)
    if m["_tag"] in ("itemmod", "allowmod") and not v:  # (a grant states no number)
        return targets, values, "any"
    if what in ("NOT_SPEND_EDGE", "NOT_EARN_EDGE"):  # (a rule, no number: ours op=no-edge / no-edge-gain)
        return targets, set(), "op:" + xlate.CHECK_KIND[what]
    mode = "abs" if what in ("EDGE_BOOST", "EDGE_COST_MALUS", "REDUCE_THRESHOLD") else "value"
    return targets, values | set().union(*map(_per_level, values)), mode


def _our_keys(x):
    """(targets, values, op) of one of our effects."""
    _, t, v, *our_op = x
    targets = {_canon_target(t)} | {_canon_target(a) for a, _ in _expand([(t, v)])}
    if t.startswith(("attr-max:", "skill-max:", "test:")):
        targets |= xlate.our_atoms({"target": t})[0]
    plus = re.fullmatch(r"str/2\+(\d+)", v) if t == "derived:unarmed-dv" else None  # (Strength/2 + the bonus)
    values = {_v(v)} | ({plus.group(1)} if plus else set())
    if t.startswith("skill-max:") and v.isdigit() and int(v) > 9:  # (Aptitude: our new maximum 10, Commlink6's +1)
        values.add(str(int(v) - 9))
    return targets, values, (our_op or [""])[0]


def _take(cl, mine, used, slot=""):
    """Use the first of our effects (and target, in `slot`) still free that states CommLink6's modification `cl`."""
    targets, values, mode = cl
    for j, (ts, vs, our_op) in enumerate(mine):
        wild = tuple(p[:-1] for p in targets if p.endswith("*"))
        for a in sorted(t for t in ts if t in targets or wild and t.startswith(wild)):
            if (j, a, slot) in used:
                continue
            if (
                mode == "any"
                or mode == "op:" + our_op
                or values & vs
                or mode == "abs"
                and {x.lstrip("-") for x in values} & {x.lstrip("-") for x in vs}
            ):
                used.add((j, a, slot))
                return True
    return False


class _Elem(dict):
    """An attribute dict read like an element (canon.effect_key takes one)."""

    @property
    def tag(self):
        """The element name."""
        return self["_tag"]


def _sig(m):
    return evaluate.X_sig(m)


def _cl6_value(m):
    return m.get("value") or ""


@functools.cache
def _bookwins():
    """{(CommLink6 id, signature, CommLink6 value): kind} the book rules on: the gate's bookruled.json and the
    page-checked rows of effects_bookwins.json (owner rule: the latest printing, the book, wins)."""
    rows = evaluate._load("bookruled.json")  # pylint: disable=protected-access
    with open(os.path.join(os.path.dirname(__file__), "effects_bookwins.json"), encoding="utf-8") as f:
        rows += json.load(f)
    return {(r["pair"][1], r["sig"], r["cl6"]): r["pair"][2] for r in rows}


_ELEM_TAG = {"effect": "valmod", "test": "checkmod", "grant": "itemmod", "allow": "allowmod"}


def _cl6_rows(c):
    """CommLink6's modifications of a record as attribute dicts (`_tag` the element): from its element when the pair
    carries it, else rebuilt from its 'effects' family (type and ref upper-cased as Commlink6 writes them)."""
    if c.get("el") is not None:
        return [
            dict(m.attrib, _tag=m.tag)
            for m in canon_mods(c["el"])
            if m.tag in _ELEM_TAG.values() and m.get("type") not in ("HOOK", "GEAR")
        ]
    out = []
    for e, t, v in c["families"].get("effects", ()):
        kind, _, ref = t.partition(":")
        big = kind in ("attribute", "item-attribute", "resistance")
        out.append(
            {
                "_tag": _ELEM_TAG[e],
                "type": kind.upper().replace("-", "_"),
                "ref": ref.upper().replace("-", "_") if big else ref,
                "value": v,
            }
        )
    return out


def per_effect(pairs, misses=False):
    """Informational: of the effects CommLink6 states on matched records, how many of ours reproduce (target, value),
    counted one for one per record. Both sides are read into the release gate's vocabulary (tools/cl6effects/xlate:
    maximums, Edge flags, group targets expanded to skills, derived names) plus the notation aliases below; a number
    printed per level reads as our R times it; a modification the book rules on (bookruled.json, effects_bookwins.json)
    counts as reproduced. The whole-entry 'effects' family stays all-or-nothing."""
    got = total = ruled = exempt = 0
    rows = []  # (misses=True: the modifications not reproduced, for working through them)
    for c, o in pairs:
        own = o["families"].get("effects_own", o["families"].get("effects", ()))
        mine = [_our_keys(x) for x in own]
        used = set()
        for m in _cl6_rows(c):
            total += 1
            # (VR cold and hot initiative are one effect of ours: the hot one may take it again)
            hit = _take(_cl6_keys(m), mine, used, "hot" if "VR_HOT" in m.get("ref", "") else "")
            if not hit and (c.get("id"), _sig(m), _cl6_value(m)) in _bookwins():
                exempt += _bookwins()[(c.get("id"), _sig(m), _cl6_value(m))] == "exempt"
                ruled += 1
                hit = True
            got += bool(hit)
            if not hit:
                rows.append(
                    {"id": c.get("id"), "name": c.get("name"), "sig": _sig(m), "cl6": _cl6_value(m)}
                    | {"ours": "; ".join(f"{x[1]}={x[2]}" for x in own)[:300]}
                )
    if misses:
        return rows
    return {"reproduced": got, "of": total, "pct": _pct(got, total), "bookruled": ruled - exempt, "exempt": exempt}
