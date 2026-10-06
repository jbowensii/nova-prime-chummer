"""Match Commlink6's canonical records to our entries of the same book, in stages: exact normalised name → loose
(plural, punctuation, rating words) → without parentheticals → alias (Commlink6's group/maker and variant forms, our
<alias>) → one of the names a row of ours prints together → same words in any order → one name's words inside the
other's on a nearby page → fuzzy. Kind decides the pool; page proximity breaks ties. One record may match several
entries (a parent and its variant rows). No hand map."""
import difflib
import re

STOP = {"the", "of", "an", "and", "with", "for", "in"}


def n0(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").casefold())


def words(s):
    s = (s or "").casefold().replace("’", "'").replace("&", " and ")
    s = re.sub(r"\((?:rating|force|level|r)[^)]*\)|\brating\s*\d*\b|\[[^\]]*\]", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in s.split()]


def n1(s):
    return "".join(words(s))


def n2(s):
    """n1 without parentheticals."""
    return n1(re.sub(r"\([^)]*\)", " ", s or ""))


def toks(s):
    return frozenset(w for w in words(s) if w not in STOP)


def contained(a, b):
    if not a or not b or a == b:
        return a == b and bool(a)
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    return small <= big and any(len(w) >= 4 and not w.isdigit() for w in small)


def near(p, q, d=1):
    try:
        return abs(int(p) - int(q)) <= d
    except (TypeError, ValueError):
        return False


def split_names(name):
    """The names one row prints together: 'A; B', 'A / B', 'A, B' (both multi-word), 'A/B noun' → 'A noun', 'B noun'."""
    out = {name, *re.split(r"\s*;\s*|\s+/\s+", name)}
    parts = [p for p in re.split(r",\s*", name) if p]
    if len(parts) > 1 and all(len(p.split()) >= 2 for p in parts):
        out.update(parts)
    m = re.match(r"^(.*?)(\S+)/(\S+)(.*)$", name)
    if m and not re.search(r"\d/\d", name):
        pre, a, b, post = m.groups()
        out.update({f"{pre}{a}{post}", f"{pre}{b}{post}", f"{pre}{a}", f"{b}{post}"})
    return out


def _names(o):
    return [o["name"], *o["aliases"]]


def match(cl6, ours):
    """[(record, [entries], stage)] for every Commlink6 record of one book; entries is [] when nothing matches."""
    by_kind = {}
    for o in ours:
        by_kind.setdefault(o["kind"], []).append(o)
    pool = [[o for k in c["pool"] for o in by_kind.get(k, [])] for c in cl6]
    found = [None] * len(cl6)

    def stage(name, key_c, key_o, keep=lambda c, o: True):
        for i, c in enumerate(cl6):
            if found[i] is None and pool[i]:
                keys = {k for n in key_c(c) for k in [n] if k}
                hits = [o for o in pool[i] if keys & {k for k in key_o(o) if k} and keep(c, o)]
                if hits:
                    found[i] = (hits, name)

    stage("exact", lambda c: [n0(c["name"])], lambda o: [n0(n) for n in _names(o)])
    stage("loose", lambda c: [n1(c["name"])], lambda o: [n1(n) for n in _names(o)])
    stage("no-parenthetical", lambda c: [n2(c["name"])], lambda o: [n2(n) for n in _names(o)])
    stage("alias", lambda c: [n2(a) for a in c["aliases"]], lambda o: [n2(n) for n in _names(o)])
    stage("split", lambda c: [n2(c["name"])], lambda o: [n2(p) for n in _names(o) for p in split_names(n)])
    stage("word-order", lambda c: [toks(c["name"])], lambda o: [toks(n) for n in _names(o)])
    used = {id(o) for f in found if f for o in f[0]}
    for i, c in enumerate(cl6):  # one name's words inside the other's, on a nearby page
        if found[i] or not c["page"]:
            continue
        key = toks(c["name"])
        hits = [o for o in pool[i] if id(o) not in used and near(o["page"], c["page"], 8) and any(
                contained(key, toks(n)) and (near(o["page"], c["page"], 1) or (min(len(key), len(toks(n))) >= 2 and
                                                                             near(o["page"], c["page"], 3))
                                             or (len(key) >= 2 and key <= toks(n))) for n in _names(o))]
        if hits and len({n2(o["name"]) for o in hits}) <= 6:
            found[i] = (hits, "contained")
            used.update(id(o) for o in hits)
    for i, c in enumerate(cl6):
        if found[i] or not pool[i]:
            continue
        key = n1(c["name"])
        best = sorted(((difflib.SequenceMatcher(None, key, n1(o["name"])).ratio(), o) for o in pool[i]
                       if id(o) not in used), key=lambda x: -x[0])[:2]
        if not best:
            continue
        r0, o0 = best[0]
        if (len(best) == 1 or r0 - best[1][0] > 0.03) and (r0 >= 0.86 or (r0 >= 0.72 and near(o0["page"], c["page"]))):
            found[i] = ([o0], f"fuzzy {r0:.2f}")
            used.add(id(o0))
    out = []
    for c, f in zip(cl6, found):
        hits, how = f or ([], "")

        def dist(o):
            try:
                return abs(int(o["page"]) - int(c["page"]))
            except (TypeError, ValueError):
                return 0
        out.append((c, sorted(hits, key=lambda o: (o["kind"] != c["kind"], dist(o) > 2, dist(o))), how))
    return out
