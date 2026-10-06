"""Patterns: which general features of our entries predict Commlink6's UI tags (relevance topics, item flags,
modonly), so a later phase can derive them for every entry of ours, including those Commlink6 lacks.

Over the matched records, each candidate rule "feature → tag" is scored against Commlink6's own tagging: precision
(of the entries with the feature, how many carry the tag), recall (of the entries with the tag, how many have the
feature) and F1. The features are general, never item names: kind, category (the printed table or section), type,
a bracketed capacity (an add-on's cost), which columns the row prints, words of the name, the category and the
description, the skills the description names, and Commlink6's subtype (ours once the subtype family lands). A
greedy union of precise rules then gives a small rule set per tag."""
import math
import re
from collections import Counter, defaultdict

from tools.cl6check import canon
from tools.cl6check.match import words

STOP = {"the", "and", "for", "with", "that", "this", "from", "your", "their", "they", "them", "have", "has", "are",
        "was", "were", "can", "will", "into", "its", "it's", "also", "any", "one", "two", "who", "which", "when",
        "than", "then", "there", "these", "those", "such", "more", "most", "other", "only", "each", "some", "but",
        "not", "all", "his", "her", "what", "while", "been", "being", "you", "use", "used", "using", "may", "make"}
COLUMNS = ("rating", "essence", "capacity", "mount", "programs", "array", "slots", "per", "karma", "dv", "ar", "ammo",
           "defense", "handling", "fade", "drain", "activation")
NONE = re.compile(r"^\s*[—–-]?\s*$")
MAX_RULES = 4
MIN_PRECISION = 0.75


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").casefold()).strip("-")


def features(o, text="", skills=(), cl6_subtype=None):
    """The general features of one entry of ours (a set of 'name=value' / 'name~word' strings)."""
    a = o["attrs"]
    f = {f"kind={o['kind']}"}
    for k in ("category", "type"):
        if a.get(k):
            f.add(f"{k}={_slug(a[k])}")
            f |= {f"{k}~{w}" for w in words(a[k]) if len(w) >= 3}
    cap = (a.get("capacity") or "").strip()
    if cap.startswith("["):
        f.add("capacity=[bracketed]")
    elif cap[:1].isdigit():
        f.add("capacity=offered")
    f |= {f"prints:{c}" for c in COLUMNS if a.get(c) and not NONE.match(a[c])}
    f |= {f"name~{w}" for w in words(o["name"]) if len(w) >= 3 and w not in STOP}
    low = (text or "").casefold()
    f |= {f"text~{w}" for w in set(words(text)) if len(w) >= 4 and w not in STOP}
    f |= {f"skill~{s}" for s in skills if re.search(rf"\b{re.escape(s)}\b", low)}
    if cl6_subtype:
        f.add(f"cl6 subtype={cl6_subtype}")
    return f


def _score(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(p, 3), "recall": round(r, 3),
            "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0}


def analyse(pairs, extras=(), min_positives=3, top=5):
    """{tag: {positives, records, top: [rule…], set: {rules, …score, tags_extras}}} from pairs of (tags, features)
    for the matched records; extras: the feature sets of our entries Commlink6 lacks (counted, not scored)."""
    n = len(pairs)
    pos = Counter(t for tags, _ in pairs for t in tags)
    has = defaultdict(set)  # feature → record indexes
    for i, (_, fs) in enumerate(pairs):
        for x in fs:
            has[x].add(i)
    singles, out = list(has.items()), {}
    for tag, p in sorted(pos.items(), key=lambda x: -x[1]):
        if p < min_positives:
            continue
        positive = {i for i, (tags, _) in enumerate(pairs) if tag in tags}
        floor = max(2, math.ceil(0.1 * p))
        cands = []
        for x, idx in singles:
            tp = len(idx & positive)
            if tp >= floor:
                cands.append({"rule": x, **_score(tp, len(idx) - tp, p - tp)})
        # two features together ("kind=qualities AND text~magic"): pairs of the singles that reach most of the tag
        # ponytail: pairs of the top 25 only; a deeper search if the singles and pairs plateau below the targets
        wide = sorted(cands, key=lambda c: (-c["recall"], c["rule"]))[:25]
        for i, x in enumerate(wide):
            for y in wide[i + 1:]:
                idx = has[x["rule"]] & has[y["rule"]]
                tp = len(idx & positive)
                if tp >= floor and len(idx) < min(len(has[x["rule"]]), len(has[y["rule"]])):
                    rule = f"{x['rule']} AND {y['rule']}"
                    has[rule] = idx
                    cands.append({"rule": rule, **_score(tp, len(idx) - tp, p - tp)})
        cands.sort(key=lambda c: (-c["f1"], -c["precision"], c["rule"]))
        chosen, covered, best = [], set(), 0.0
        precise = [c for c in cands if c["precision"] >= MIN_PRECISION]
        while len(chosen) < MAX_RULES:
            step = max(precise, default=None, key=lambda c: _f1(covered | has[c["rule"]], positive))
            if step is None or _f1(covered | has[step["rule"]], positive) <= best:
                break
            chosen.append(step["rule"])
            covered |= has[step["rule"]]
            best = _f1(covered, positive)
            precise.remove(step)
        rule_set = {"rules": chosen, **_score(len(covered & positive), len(covered - positive), p - len(covered & positive))}
        rule_set["tags_extras"] = sum(1 for fs in extras if any(fires(r, fs) for r in chosen))
        out[tag] = {"positives": p, "records": n, "top": cands[:top], "set": rule_set}
    return out


def fires(rule, fs):
    """Whether a rule ('a' or 'a AND b') holds for a feature set."""
    return all(x in fs for x in rule.split(" AND "))


def _f1(covered, positive):
    tp = len(covered & positive)
    return _score(tp, len(covered) - tp, len(positive) - tp)["f1"]


def addon(c):
    """{'addon'} when Commlink6 fits the item into a host's slot and never implants it: the "bought only as an add-on"
    sense of modonly, which Commlink6's own modonly flag (mostly internal building blocks) does not carry."""
    fits = any(k == "fits" for k, _ in c["families"].get("slots", ()))
    return {"addon (fits a slot, not implanted)"} if fits and "essence" not in c["fields"] else set()


def run(pairs, extras, sources):
    """Patterns over the compare step's matched (record, entry) pairs and our unmatched entries."""
    skills = sorted({e["name"].casefold() for s in sources.values() for e in s.entries if e["kind"] == "skills"
                     and len(e["name"]) >= 3})

    def text(o):
        s = sources.get(o["src"])
        return s.texts.get(o["id"], "") if s else ""
    data = [(canon.labels(c["families"]) | addon(c), features(o, text(o), skills, (c["families"].get("subtype") or [None])[0]))
            for c, o in pairs]
    return analyse(data, [features(o, text(o), skills) for o in extras])
