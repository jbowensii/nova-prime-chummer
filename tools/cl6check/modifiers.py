"""Modifier patterns: Commlink6's modifications as path-and-value modifiers, aligned with the sentences of our own
descriptions that state them, and the phrase templates that recur (the phase 6 effects grammar's raw material).

A modifier is (path, operator, value, condition). The path starts at the character (or the item, or the item's host)
and narrows: character/attribute/strength, character/roll/skill:perception, character/initiative/dice-physical,
item/attack-rating, item/slot/top. A Commlink6 modification is aligned with a sentence of our description of the
matched item when the sentence names its target (the game's own words for it) and prints its value (the number, or
"Rating"/"level" for a per-rating value). The aligned window, with the target, number and rating replaced by slots,
is a template; each template is scored by how often it fires on our descriptions and finds a real modifier (precision)
and how many of its family's modifiers it reproduces (recall). Vocabulary only, never item names."""
import re
from collections import Counter, defaultdict

PRIMARY = {"BODY", "AGILITY", "REACTION", "STRENGTH", "WILLPOWER", "LOGIC", "INTUITION", "CHARISMA", "EDGE", "MAGIC",
           "RESONANCE", "ESSENCE"}
DERIVED = (("INITIATIVE", "initiative"), ("MONITOR", "condition-monitor"), ("DEFENSE_RATING", "defense-rating"),
           ("DEFENSE_POOL", "roll"), ("RESIST", "roll"), ("DAMAGE_REDUCTION", "damage-reduction"),
           ("ATTACK_RATING", "attack-rating"), ("MINOR_ACTION", "actions"), ("MOVEMENT", "movement"),
           ("ESSENCE", "essence"), ("COMPOSURE", "roll"), ("JUDGE_INTENTIONS", "roll"), ("MEMORY", "roll"),
           ("LIFT", "roll"), ("DAMAGE_OVERFLOW", "condition-monitor"), ("POWER_POINTS", "points"))
OPS = {"MAX": "max", "MIN": "min", "NATURAL": "+natural", "AUGMENTED": "+", "ARTIFICIAL": "artificial"}
CHECK_OPS = {"DICE": "+dice", "HIT": "+hits", "EDGE": "+edge", "EDGE_BOOST": "edge-cost"}
# the game's words for a target where its id isn't them (a vocabulary, the same in every book)
SYNONYMS = {"damage": ("damage", "dv"), "dice": ("dice", "die"), "monitor": ("monitor", "box", "boxes"),
            "close_combat": ("close combat",), "pool": ("pool", "test"), "attack_rating": ("attack rating", "ar")}
STRUCTURE = {"item/slot", "item/includes"}  # the slots and includes families: structure, not stated effects
HEADS = {"test", "tests", "attribute", "skill", "dice", "die", "pool", "rating", "bonus", "modifier", "boxes", "box",
         "edge", "hits", "points", "initiative", "level", "levels"}
GRAMMAR = HEADS | {"to", "on", "for", "all", "any", "by", "of", "the", "a", "an", "your", "their", "its", "with", "in",
                   "and", "or", "per", "each", "plus", "+", "gain", "gains", "receive", "receives", "increase",
                   "increases", "increased", "add", "adds", "grant", "grants", "provide", "provides", "situational",
                   "attributes", "skills", "threshold", "reduce", "reduces", "as", "follows", "quality", "power",
                   "critter", "physical", "stun", "condition", "monitor", "defense", "damage", "armor", "limit",
                   "minus", "penalty", "up", "maximum", "max", "when", "against", "resist", "resistance", "made"}
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
                c = [x for x in (cond, "choice" if _in_selmod(ms, m) else "",
                                 "situational" if m.get("cond") else "",
                                 f"mode:{m.get('mode').lower()}" if m.get("mode") else "") if x]
                v = m.get("value") or ""
                out.append({"path": "/".join(x for x in path(m) if x), "op": op(m), "value": v,
                            "rated": bool(re.search(r"\$(RATING|LEVEL|FORCE)", v)), "cond": c, "ref": m.get("ref") or "",
                            "type": m.get("type") or ""})
    return out


def _in_selmod(ms, m):
    return any(m in list(s.iter()) for s in ms.iter("selmod"))


# ---------- alignment ----------
def tokens(s):
    s = (s or "").casefold().replace("−", "-").replace("–", "-").replace("’", "'")
    toks = re.findall(r"[a-z][a-z']*|[+-]?\d+(?:[.,]\d+)?|[+×]", s)
    return [NUMBER_WORDS.get(t, t) for t in toks]


def sentences(text):
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
            if all(toks[i + k].startswith(a[k][:max(4, len(a[k]) - 1)]) for k in range(len(a))):
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
        x = slot.get(k) or ("{#}" if re.fullmatch(r"[+-]?\d+(?:[.,]\d+)?", toks[k]) else
                            toks[k] if toks[k] in GRAMMAR else "*")
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
    return " ".join(re.escape(g[0].split()[0][:max(4, len(g[0].split()[0]) - 1)]) + r"\S*" for g in groups)


def _regex(template, terms):
    """The template as a regex over joined tokens: {T} is any target term of the family's vocabulary (the grammar
    looks targets up, it never guesses them), {N} a number, {R} the rating, * up to three other words."""
    alt = "|".join(sorted(terms, key=len, reverse=True)) or r"(?!)"
    parts, seen = [], set()
    for t in template.split():
        if t in ("{T}", "{N}") and t not in seen:
            seen.add(t)
            parts.append(r"(?P<t>%s)" % alt if t == "{T}" else r"[+-]?(?P<n>\d+(?:[.,]\d+)?)")
        elif t == "{T}":
            parts.append(r"(?:%s)" % alt)
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
    tfam = {}
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
                got = {(i, j) for j, m in enumerate(mods) if family(m["path"]) == fam and keywords(m)
                       and all(_find(cap, g)[0] >= 0 for g in keywords(m)) and (n is None or _number(m["value"]) == n)}
                tp += bool(got)
                repro |= got
        scored.append({"family": fam, "template": t, "seeds": len(seeds), "fires": fires,
                       "precision": round(tp / fires, 3) if fires else 0.0,
                       "recall": round(len(repro) / fam_total[fam], 3) if fam_total[fam] else 0.0, "_repro": repro})
    scored.sort(key=lambda x: (-len(x["_repro"]), -x["precision"], x["template"]))
    matched_total = sum(fam_total.values())
    cover = {}
    for k in top:
        got = set().union(*(x["_repro"] for x in scored[:k])) if scored else set()
        cover[f"top{k}"] = {"reproduced": len(got), "of_matched": matched_total, "pct_matched": _pct(len(got), matched_total),
                            "of_all": total_all, "pct_all": _pct(len(got), total_all)}
    return {"modifiers_total": total_all, "on_matched_with_text": matched_total,
            "aligned": sum(fam_aligned.values()), "aligned_pct": _pct(sum(fam_aligned.values()), matched_total),
            "by_family": {f: {"modifiers": n, "aligned": fam_aligned[f], "pct": _pct(fam_aligned[f], n)}
                          for f, n in fam_total.most_common()},
            "templates": [{k: v for k, v in x.items() if k != "_repro"} | {"reproduced": len(x["_repro"])}
                          for x in scored[:60]],
            "coverage": cover,
            "vocabulary": {p: {"n": sum(c.values()), "specific": dict(c.most_common(12))}
                           for p, c in sorted(vocab.items(), key=lambda x: -sum(x[1].values()))}}


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
