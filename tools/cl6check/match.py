"""Match Commlink6's canonical records to our entries of the same book, in stages: exact normalised name → loose
(plural, punctuation, rating words) → without parentheticals → alias (Commlink6's group/maker and variant forms, our
<alias>) → one of the names a row of ours prints together → same words in any order → a maker shortened to its
initials → one name's words inside the other's on a nearby page → fuzzy. Kind decides the pool; page proximity breaks
ties. One record may match several entries (a parent and its variant rows). No hand map."""

import difflib
import re

STOP = {"the", "of", "an", "and", "with", "for", "in"}


def n0(s):
    """The lower-case alphanumeric-only form of a name."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").casefold())


ROMAN = {"I": "1", "II": "2", "III": "3", "IV": "4", "V": "5", "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10"}


def words(s):
    """A name as its list of normalised words."""
    # (a numeral printed in capitals after a first word, `Guizhen I`, `Predator VI`: its digit; `Hold-out` is `Holdout`,
    # `SMG` the `submachine gun`: Commlink6 and the books spell them either way)
    s = re.sub(r"(?<=\S )\b(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\b", lambda m: ROMAN[m.group()], s or "")
    s = re.sub(r"(?i)\bhold[\s-]+out\b", "holdout", s)
    s = re.sub(r"\bSMGs?\b", "submachine gun", s)
    s = s.casefold().replace("’", "'").replace("&", " and ")
    # (a rating's parenthetical, `(R 1-6)`, not one whose word starts with r: `(Razorwire)` names a variant)
    s = re.sub(r"\((?:rating|force|level|r\b)[^)]*\)|\brating\s*\d*\b|\[[^\]]*\]", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(
        r"\bammo\b", "ammunition", s
    )  # (Commlink6's `Ammo Shotgun Masterkey`: the book's `Masterkey Ammunition`)
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in s.split()]


SIMILAR = 0.90  # names this alike (difflib ratio of n1) are one item (owner, 2026-10-13)


def digits(s):
    """The digit runs in a string."""
    return re.findall(r"\d+", s)


def n1(s):
    """A name's words joined without spaces."""
    return "".join(words(s))


def n2(s):
    """n1 without parentheticals."""
    return n1(re.sub(r"\([^)]*\)", " ", s or ""))


def toks(s):
    """A name's words as a set, minus the stop words."""
    return frozenset(w for w in words(s) if w not in STOP)


def contained(a, b):
    """Whether one word set sits inside the other on a real (long, non-numeric) word."""
    if not a or not b or a == b:
        return a == b and bool(a)
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    return small <= big and any(len(w) >= 4 and not w.isdigit() for w in small)


def near(p, q, d=1):
    """Whether two page numbers are within d of each other."""
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


def _words_sep(s):
    """words() keeping each separate, '/' and ',' as spaces (the order matters)."""
    return words(re.sub(r"\([^)]*\)", " ", s or ""))


def abbreviated(name):
    """A pattern for a name with abbreviated words (a word ending in a full stop: `L.`, `Mach.`), each standing for any
    word it starts, or None."""
    raw = re.sub(r"\([^)]*\)", " ", name or "")
    if not re.search(r"[A-Za-z]\.(?=[\s/A-Za-z]|$)", raw):
        return None
    parts = []
    for tok in re.findall(r"[A-Za-z0-9']+\.?", raw):
        w = words(tok.rstrip("."))
        if not w:
            continue
        parts.append(re.escape(w[0]) + (r"[a-z0-9]*" if tok.endswith(".") else ""))
    return re.compile(r" ".join(parts)) if parts else None


def _names(o):
    return [o["name"], *o["aliases"]]


def _like(w, u):
    return w == u or len(w) >= 4 and len(u) >= 4 and (w.startswith(u) or u.startswith(w))


def grouped(name, o):
    """A Commlink6 name made of our row's own words and its category's or maker's (`Implanted Shotgun`: `Shotgun` in
    the `Cyber implant weapon` category): every word of our row's name in it, every word of it ours."""
    own = toks(re.sub(r"\([^)]*\)", " ", o["name"]))
    a = o.get("attrs", {})
    pool = own | toks(a.get("category", "")) | toks(a.get("maker", ""))
    key = toks(re.sub(r"\([^)]*\)", " ", name))
    return (
        bool(own)
        and len(key) > len(own)
        and all(any(_like(w, u) for w in key) for u in own)
        and all(any(_like(w, u) for u in pool) for w in key)
    )


def bundled(name, o):
    """A Commlink6 name made only of a product's words (its category and maker), not of the row's own (`Cougar Polearm
    (Small)` over the `Armsman Collapsible Polearm` rows `Knife`, `Spear`): a listing Commlink6 composed."""
    a = o.get("attrs", {})
    pool = toks(a.get("category", "")) | toks(a.get("maker", ""))
    key = toks(re.sub(r"\([^)]*\)", " ", name))
    own = toks(re.sub(r"\([^)]*\)", " ", o["name"]))
    return (
        bool(a.get("maker"))
        and len(key) >= 2
        and all(any(_like(w, u) for u in pool) for w in key)
        and not any(_like(w, u) for w in key for u in own)
    )


def unbranded(name, o):
    """True when our row's name and Commlink6's are the same words once the words of the row's maker and group (attrs)
    are taken out of both: at least a word of four letters is left, and something was taken out."""
    a = o.get("attrs", {})
    brand = toks(a.get("maker", "")) | toks(a.get("group", ""))
    key = toks(re.sub(r"\([^)]*\)", " ", name)) - brand
    own = toks(re.sub(r"\([^)]*\)", " ", o["name"])) - brand
    return (
        bool(brand)
        and key == own
        and any(len(w) >= 4 and not w.isdigit() for w in key)
        and toks(name) != toks(o["name"])
    )


def initials(o):
    """Our entry's names as Commlink6 shortens a maker of two words or more to its initials: `VI Ace of Clubs` for
    `Vashon Island (Ace of Clubs)`, `VI Steampunk` for `Steampunk` grouped under `Vashon Island`."""
    pairs = [(m.group(1), m.group(2)) for n in _names(o) if (m := re.fullmatch(r"(.+?)\s*\(([^()]+)\)", n))]
    pairs += [(g, o["name"]) for k in ("group", "maker") if (g := o.get("attrs", {}).get(k))]
    return [f"{''.join(w[0] for w in head.split()).upper()} {rest}" for head, rest in pairs if len(head.split()) > 1]


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
    # (a brand Commlink6 puts after the name, `Tonfa (Zoé Heritage)`, that our name prints first: `Zoé Heritage Tonfa`;
    # before the stage below, which would take the generic `Tonfa`)
    stage(
        "parenthetical first",
        lambda c: [
            n1(f"{m.group(2)} {m.group(1)}") for m in [re.fullmatch(r"(.+?)\s*\(([^()]+)\)", c["name"] or "")] if m
        ],
        lambda o: [n1(n) for n in _names(o)],
    )
    stage("no-parenthetical", lambda c: [n2(c["name"])], lambda o: [n2(n) for n in _names(o)])

    # (our nanite rows are two items, `<name> Colony` and `<name> Nanites` (owner 2026-10-14): Commlink6's one record is
    # both)
    # (`Fizz Swarm Colony` is `Fizz Swarm`; `Therapeutic Nanites (Anti-Rad) Colony` is `Anti-Rad`)
    def nanite(s):
        return (
            n1(m.group(2) or m.group(1))
            if (m := re.fullmatch(r"(.+?)(?:\s*\(([^()]+)\))?\s+(?:colony|nanites)", s or "", re.I))
            else ""
        )

    stage(
        "nanite colony and nanites",
        lambda c: [n2(c["name"])],
        lambda o: [nanite(n) for n in _names(o)],
        lambda c, o: "nanite" in (o.get("attrs", {}).get("category") or "").lower(),
    )  # (only the nanite rows: not `Mars Colony`)
    stage("alias", lambda c: [n2(a) for a in c["aliases"]], lambda o: [n2(n) for n in _names(o)])
    # (a one-word name only near its page: `Increasing` is p. 132's `Increasing a Form`, not p. 128's
    # `Increasing/Reducing Cargo Space`)
    stage(
        "split",
        lambda c: [n2(c["name"])],
        lambda o: [n2(p) for n in _names(o) for p in split_names(n)],
        lambda c, o: len(toks(c["name"])) > 1 or not c["page"] or near(o["page"], c["page"], 2),
    )
    stage("word-order", lambda c: [toks(c["name"])], lambda o: [toks(n) for n in _names(o)])
    # (a part of a row printing several names, its words in another order: `Rocket Smoke` in `Smoke/Thermal Smoke
    # Rocket`)
    stage(
        "split word-order",
        lambda c: [toks(c["name"])],
        lambda o: [toks(p) for n in _names(o) for p in split_names(n) if len(toks(p)) > 1],
    )
    stage(
        "initials",
        lambda c: [n2(c["name"])] if re.match(r"[A-Z]{2,3}\s", c["name"]) else [],
        lambda o: [n2(x) for x in initials(o)],
    )
    for i, c in enumerate(cl6):  # Commlink6 abbreviating words (`Holdout/L.Pistol/Mach. Pistol`): each a prefix
        if found[i] is None and pool[i] and (rx := abbreviated(c["name"])):
            if hits := [o for o in pool[i] if any(rx.fullmatch(" ".join(_words_sep(n))) for n in _names(o))]:
                found[i] = (hits, "abbreviated")
    used = {id(o) for f in found if f for o in f[0]}
    for i, c in enumerate(cl6):  # one name's words inside the other's, on a nearby page
        if found[i] or not c["page"]:
            continue
        key = toks(c["name"])
        # (a record's own aliases too: `Grenade, Party` → `Party`, in `Krime Party (Frag)`)
        keys_c = [key] + [k for a in c["aliases"] if len(k := toks(a)) >= 1 and k != key]
        # (not a row whose group the record names: `DocWagon Contract` is the group head stage's, its rows the levels')
        hits = [
            o
            for o in pool[i]
            if id(o) not in used
            and near(o["page"], c["page"], 8)
            and n1(o.get("attrs", {}).get("group") or "") != n1(c["name"])
            and any(
                contained(k, toks(n))
                and (
                    near(o["page"], c["page"], 1)
                    or (min(len(k), len(toks(n))) >= 2 and near(o["page"], c["page"], 3))
                    or (len(k) >= 2 and k <= toks(n))
                )
                for k in keys_c
                for n in _names(o)
            )
        ]
        # (the rows sharing the most words)
        share = {id(o): max(len(k & toks(n)) for k in keys_c for n in _names(o)) for o in hits}
        hits = [o for o in hits if share[id(o)] == max(share.values())]  # (`Ritual Spellcasting`, not `Spellcasting`)
        # (the rows on the record's own page when some are: `Assault Cannon HEX` is p. 140's row, not p. 147's)
        hits = [o for o in hits if near(o["page"], c["page"])] or hits
        # (a record named with a rating: the rows printing that rating when some do, words() leaving it out)
        if rt := re.search(r"(?i)\brating\s*(\d+)", c["name"]):
            hits = [o for o in hits if re.search(rf"(?i)\brating\s*{rt.group(1)}\b", o["name"])] or hits
        if hits and len({n2(o["name"]) for o in hits}) <= 6:
            found[i] = (hits, "contained")
            used.update(id(o) for o in hits)
    for i, c in enumerate(cl6):
        # a record whose words are all in one of several rows another record took loosely (`Smuggling Compartment`
        # took both rows by its name without a parenthetical): that row is this record's (`Smuggling Compartment -
        # Shielding` = `Smuggling Compartment (General shielding)`)
        key = toks(c["name"])
        if found[i] or not c["page"] or len(key) < 2:
            continue
        for j, f in enumerate(found):
            if not f or f[1] not in ("loose", "no-parenthetical", "alias") or len(f[0]) < 2:
                continue
            hits = [o for o in f[0] if near(o["page"], c["page"]) and key <= toks(o["name"])]
            if len(hits) == 1:
                found[i] = (hits, "contained")
                found[j] = ([o for o in f[0] if o is not hits[0]], f[1])
                break
    for i, c in enumerate(
        cl6
    ):  # the words of our row's maker or group left out of both names (`Krime Party` = `Party`)
        if found[i] is None and pool[i]:
            hits = [o for o in pool[i] if unbranded(c["name"], o)]
            if hits:
                found[i] = (hits, "unbranded")
    for i, c in enumerate(cl6):  # our row named within its category (group): `Implanted Shotgun` is `Shotgun` there
        if found[i] is None and pool[i] and (hits := [o for o in pool[i] if grouped(c["name"], o)]):
            found[i] = (hits, "group")
    for i, c in enumerate(cl6):  # the name of a group of our rows (`DocWagon Contract`: the rows grouped under it)
        if (
            found[i] is None
            and pool[i]
            and (
                hits := [
                    o for o in pool[i] if o.get("attrs", {}).get("group") and n1(o["attrs"]["group"]) == n1(c["name"])
                ]
            )
        ):
            found[i] = (hits, "group head")
    for i, c in enumerate(cl6):  # the owner's rule: names 90% alike are one (same book; the same numbers in both)
        if found[i] or not c["pool"]:
            continue
        key = n1(c["name"])
        best = sorted(
            (
                (difflib.SequenceMatcher(None, key, n1(o["name"])).ratio(), o)
                for o in pool[i]
                if digits(key) == digits(n1(o["name"]))
            ),
            key=lambda x: -x[0],
        )
        if best and best[0][0] >= SIMILAR:
            found[i] = ([o for r, o in best if r == best[0][0]], f"similar {best[0][0]:.2f}")
        elif c["kind"] != "ruleoptions" and (
            hits := [o for o in ours if n1(o["name"]) == key]
        ):  # (the same name in another kind: only that exact;
            # not a rule option's: Commlink6's interpretation `Standard` is no credstick)
            found[i] = (hits, "another kind")
    for i, c in enumerate(cl6):
        if found[i] or not pool[i]:
            continue
        key = n1(c["name"])
        best = sorted(
            (
                (difflib.SequenceMatcher(None, key, n1(o["name"])).ratio(), o)
                for o in pool[i]
                if id(o) not in used and digits(key) == digits(n1(o["name"]))
            ),
            key=lambda x: -x[0],
        )[:2]
        if not best:
            continue
        r0, o0 = best[0]
        if (
            (len(best) == 1 or r0 - best[1][0] > 0.03)
            and (r0 >= 0.86 or (r0 >= 0.72 and near(o0["page"], c["page"])))
            and not (
                c.get("fields")
                and stat_agreement(c, o0)[1]
                and by_stats(c, [o for o in pool[i] if id(o) not in used and o is not o0])[0] == "strong"
            )
        ):
            # (a name only like ours, its stats unlike, loses to an entry of ours whose stats are the record's)
            found[i] = ([o0], f"fuzzy {r0:.2f}")
            used.add(id(o0))
    out = []
    for c, f in zip(cl6, found):
        hits, how = f or ([], "")

        def dist(o, c=c):
            try:
                return abs(int(o["page"]) - int(c["page"]))
            except (TypeError, ValueError):
                return 0

        out.append((c, sorted(hits, key=lambda o, c=c, dist=dist: (o["kind"] != c["kind"], dist(o) > 2, dist(o))), how))
    return out


# Stat matching (owner, 2026-10-06): Commlink6 renamed some items by hand. A record no name finds is compared by its
# stats with our entries no record matches, in the same book and kind. Categorical fields (a spell's type, a power's
# action) and the quality's sign tell too little to name an item; legality goes with the availability number.
WEAK_FIELDS = {
    "positive",
    "legality",
    "per level",
    "spell type",
    "spell category",
    "duration",
    "power type",
    "action",
    "activation",
    "range",
    "attribute",
}
STRONG_AGREE = 3  # "several stats agree exactly" anywhere in the book; two do on the record's own page (±1)


def stat_agreement(c, o):
    """(agreeing, conflicting) fields of record c against our entry o. A field agrees only where our entry prints a
    value (our dash for Commlink6's 0 tells nothing), and conflicts only where it prints another one."""
    from tools.cl6check import fields as F

    attr = {"spell type": "type", "drain": "dv", "pp cost": "cost", "power type": "type"}
    done, diffs = F.compare(c, o)
    bad = [d["field"] for d in diffs if not d.get("why", "").startswith("ours empty")]
    empty = {d["field"] for d in diffs} - set(bad)
    a = o["attrs"]
    ok = [
        f
        for f in done
        if f not in bad
        and f not in empty
        and f not in WEAK_FIELDS
        and (a.get(attr.get(f, f)) or "").strip() not in ("", "—", "–", "-")
    ]
    return ok, bad


def _named_words(c, o):
    """True when two of record c's name words are in our entry o's name, or all the words after the section a
    Commlink6 PACK's name opens with (`Upgrades-Gunports`); two adjacent words of ours count as their compound
    (`Gun Ports`)."""
    ws = words(o["name"])
    mine = set(toks(o["name"])) | {a + b for a, b in zip(ws, ws[1:])}
    tail = toks(c["name"].split("-", 1)[1]) if "-" in c["name"] else frozenset()
    return len(toks(c["name"]) & mine) >= 2 or bool(tail) and tail <= mine and any(len(w) >= 4 for w in tail)


def strong(c, o, ok):
    """Whether the agreeing fields ok (and the page) make c and o a strong match."""
    # (a record whose only stat is its price, a PACK: that price on its own page and its name's words, _named_words)
    return (
        len(ok) >= STRONG_AGREE
        or len(ok) == 2
        and near(o["page"], c["page"])
        or ok == ["cost"]
        and near(o["page"], c["page"])
        and _named_words(c, o)
    )


def by_stats(c, cands, matched=()):
    """('strong', entry, agree) when exactly one of our items agrees with record c on several stats and none conflicts:
    one of cands (our entries no record matches, of c's book and kinds), and none of `matched` (the book's entries
    other records match) as well. Variant rows of one item (`Widget (small)`, `Widget (large)`) that agree alike are
    one item. Else ('weak', None, [(entry, agree, conflict)]): the candidates that agree with no conflict on a price or
    on two stats, best first, at most five."""

    def agreeing(pool):
        best = {}
        for o in pool:
            ok, bad = stat_agreement(c, o)
            if ok and not bad:
                k = n1(o["name"])
                if k not in best or len(ok) > len(best[k][1]):
                    best[k] = (o, ok, bad)
        return list(best.values())

    mine = agreeing(cands)
    hits = [v for v in mine if strong(c, v[0], v[1])]
    if (
        hits
        and len({n2(v[0]["name"]) for v in hits}) == 1
        and not any(strong(c, o, ok) for o, ok, _ in agreeing(matched))
    ):
        return "strong", hits[0][0], hits[0][1]
    listed = [v for v in mine if len(v[1]) >= 2 or "cost" in v[1]]
    return "weak", None, sorted(listed, key=lambda v: -len(v[1]))[:5]
