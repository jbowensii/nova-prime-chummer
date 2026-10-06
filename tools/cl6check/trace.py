"""Trace every Commlink6 value to where it sits in our corpus (phase 1 of the parity work).

For each Commlink6 record of a kind we model: its object in the corpus (corpus.entries, lineage.observe; when its own
book doesn't print the name, the names match.py's staged matching finds there), the winner of each field (the value
published last, lineage.winner), and Commlink6 compared with the winners (fields.compare). Each field that differs is
searched for and given the first family that holds Commlink6's value, with its markup location, in this order:

- own row: the winning reading itself once the words around the value are set aside ('500 each', '(I) 6', a dash
  for Commlink6's not-for-sale number), or another reading of the object in the winning book (its stat block, a row);
- per-rating or variant row: Commlink6 keeps the Rating 1 value of a per-rating price; its per-rating values or its
  rating range are the object's rows printed one per rating; another entry or row of the object with a qualifier;
- errata sentence: an errata statement's value;
- section default: a general statement above the object (a section's intro, a table footnote) gives it;
- conversion error: a page verdict found Commlink6's number printed in our item's cell (we read it wrong);
- older printing or superseded: an earlier printing of the same book, or an earlier source the winner replaced;
- another book: a different book's row, card or NPC line (context: an NPC line or quick-start material), or a
  class-price row in any book ('<Kind>, <class>' for an item of that class);
- Commlink6 misread: the same column of the table row just above or below the object's (two fields from that row, or
  one distinctive value: a price of 100 or more, an attack rating, an ammo count), or a value with two adjacent digits
  swapped;
- heading: a heading naming the object, or one under it, prints it;
- description sentence: prose about the object prints it with its field's word (the section under a heading naming
  it, the intro of the section above, the sentence around a mention, a run-in title's paragraph);
- another column: another column of the object's own row in the winning book;
- not found.

A misread is not counted against our accuracy. Weak links (another column, a one-field misread, one digit off) are settled by the
owner's page verdicts (apply_verdicts); one with no verdict goes to not found. `run(corpus, cl6)` returns (rows, counts); `write()` writes the CSV
(owner only: names and values), `markdown()` the owner's section."""
import csv
import os
import re
from collections import Counter

from tools.cl6check import corpus as K
from tools.cl6check import fields, lineage, match, ours

FAMILIES = ("own row", "older printing or superseded", "errata sentence", "section default", "conversion error",
            "Commlink6 misread", "another book", "description sentence", "per-rating or variant row", "heading",
            "another column", "not found")
ATTR = {"legality": "avail", "spell type": "type", "drain": "dv", "spell category": "category", "pp cost": "cost",
        "per level": "perLevel", "power type": "type", "positive": "kind", "attribute": "attr"}
CUE = {"cost": r"¥|nuyen|\bcost", "avail": r"avail", "legality": r"avail|legal|illegal|restricted|forbidden",
       "rating": r"rating", "essence": r"essence", "capacity": r"capacity|\[", "karma": r"karma", "dv": r"\bDV\b|damage",
       "ar": r"attack|\bAR\b|/", "modes": r"mode|\b(?:SS|SA|BF|FA)\b", "ammo": r"ammo|\(c\)|\(m\)|\(d\)|\(b\)|magazine|clip|hold|load",
       "range": r"range", "duration": r"duration", "action": r"action", "power type": r"type", "spell type": r"type",
       "drain": r"drain", "fade": r"fade", "threshold": r"threshold", "activation": r"activation|action",
       "pp cost": r"\bpp\b|power points?", "defense": r"defense|\bDR\b", "seats": r"seat"}
ENUM = {"LINE_OF_SIGHT": r"line of sight|\bLOS\b", "LINE_OF_SIGHT_AREA": r"\bLOS\s*\(A\)", "TOUCH": r"\btouch\b|\bT\b",
        "SELF": r"\bself\b", "INSTANTANEOUS": r"\binstant", "SUSTAINED": r"\bsustained\b", "PERMANENT": r"\bpermanent\b",
        "ALWAYS": r"\balways\b", "AUTO": r"\bauto(?:matic)?\b", "MAJOR": r"\bmajor\b", "MINOR": r"\bminor\b",
        "MANA": r"\bmana\b", "PHYSICAL": r"\bphysical\b"}


def _num(s):
    return re.sub(r"(?<=\d),(?=\d{3})", "", str(s))


def _fmt(v):
    v = float(v)
    s = str(int(v)) if v.is_integer() else f"{v:g}"
    return s, (f"{int(v):,}" if v.is_integer() else s)


def token_re(c, f):
    """A pattern for Commlink6's value of field f as running text prints it, or None."""
    fl = c["fields"]
    if f == "rating" and fl.get("rating"):
        lo, hi = fl["rating"]
        return (rf"\b{lo}\s*(?:–|-|to|and)\s*{hi}\b|maximum rating (?:is |of )?{hi}\b|ratings? up to {hi}\b"
                rf"|max(?:imum)? rating[^.]{{0,20}}\b{hi}\b")
    if f in ("cost", "essence") and fl.get(f):
        v = next(iter(fl[f].values()))
        if isinstance(v, float) and v:
            a, b = _fmt(v)
            return rf"(?<![\d.,])(?:{re.escape(a)}|{re.escape(b)})(?![\d]|,\d)"
    if f in ("avail", "legality") and fl.get("avail"):
        n, letter = next(iter(fl["avail"].values()))
        return rf"(?<![\d.,]){n}\s*\(?{letter}\)?(?![\d])" if letter else rf"(?<![\d.,]){n}(?![\d(])"
    raw = fl.get(f)
    if raw in (None, "") or isinstance(raw, (dict, tuple)):
        return None
    raw = str(raw)
    if raw in ENUM:
        return ENUM[raw]
    if re.fullmatch(r"[A-Z_]+", raw):
        return r"\b" + raw.replace("_", r"\s+") + r"\b"
    if f == "ammo":
        m = re.fullmatch(r"(\d+)\s*\((\w+)\)", raw)
        if m:
            n = int(m.group(1))
            word = WORDS[n] if n < len(WORDS) else str(n)
            return (rf"(?<![\w]){re.escape(raw)}(?![\w])|\b(?:{n}|{word})\s+(?:\w+\s+)?"
                    rf"(?:bolts?|rounds?|shots?|missiles?|rockets?|grenades?|arrows?|darts?|shells?)\b")
    if f == "ar":
        parts = [p for p in raw.split(",")]
        while parts and not parts[-1]:
            parts.pop()
        return r"[/\s]*".join(re.escape(p) if p else r"[—–-]" for p in parts)
    return r"(?<![\w])" + re.escape(raw).replace(r"\ ", r"\s*") + r"(?![\w])"


WORDS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve")
NUMERIC = {"cost", "avail", "essence", "capacity", "karma", "pp cost", "defense", "threshold"}


def _strict(c, kind, attr, value, f, rating):
    a = {attr: value}
    if rating and attr != "rating":
        a["rating"] = rating
    done, diffs = fields.compare(c, {"attrs": a, "kind": kind})
    return f in done and not any(d["field"] == f for d in diffs)


def _matches(c, kind, attr, value, f, rating=None):
    """'exact' when our value of attribute `attr` equals Commlink6's field f (fields.compare on a one-field entry);
    'with a note' when it does once the words around it are set aside: '500 each', '500 + Widget', 'CF x 500'
    read as Rating x 1000, ammo '10(c-3)' as 10(c); else None."""
    if _strict(c, kind, attr, value, f, rating):
        return "exact"
    v = str(value or "")
    tries = []
    if f in NUMERIC:
        tries.append(re.sub(r"(?i)\b(?:CF|size|level|force|grade)\b", "Rating", v))
        tries.append(re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", v))  # '2.400': a thousands point
        lead = re.match(r"\s*\+?\d[\d,]*(?:\.\d+)?", v)
        if lead and lead.group(0).strip() != v.strip():
            tries.append(lead.group(0))
        only = re.findall(r"\d[\d,]*(?:\.\d+)?", v)
        if len(only) == 1 and only[0] != v.strip():
            tries.append(only[0])  # '(I) 6'
        if re.match(r"(?i)\s*free\b", v):
            tries.append("0")
    if f == "ammo":
        a = re.sub(r"\s+or\s+", "/", re.sub(r"(?<=[a-z])-\d+(?=\))|(?<=tank)s", "", v))
        tries.append(a)
        lead = re.match(r"\s*\d+\s*\([a-z]+\)(?:\s*/\s*\d+\s*\([a-z]+\))*", a)
        if lead:
            tries.append(lead.group(0))
        if re.fullmatch(r"\d+", str(c["fields"].get("ammo") or "")):  # Commlink6 keeps the count without its kind
            tries.append((re.match(r"\s*(\d+)", v) or re.match("", "")).group(0).strip() or v)
    if f == "dv":
        tries.append(v.rstrip("*† "))
        tries.append(v.split("/")[0].strip())  # '4S/4P': two forms of the weapon, the first
    return "with a note" if any(t != v and _strict(c, kind, attr, t, f, rating) for t in tries) else None


def _rating_of(o):
    """The rating an observation is printed for: 'Widget Rating 3', a 'Rating 3' or 'Level 2' row, an entry id ending
    '-3'."""
    for t in (o.label, o.variant):
        m = re.search(r"(?i)\b(?:rating|level|r)\s*(\d+)\b", t or "")
        if m:
            return m
    return re.search(r"id=\S*?-(?:rating-)?(\d+)(?=\s|$)", o.where) if o.kind == "catalog" else None


def _per_rating(c, f, chain, fam=None):
    """The rows or entries printing the object at each rating ('Cyberjack Rating 3', a 'Rating 3' row of its stat
    block) that hold Commlink6's per-rating values: [Obs], or [] unless at least two ratings agree and none differs."""
    cl = c["fields"].get(f) or (c["fields"].get("capacity_offered") or c["fields"].get("capacity_used")
                                 if f == "capacity" else None)
    if not isinstance(cl, dict) or len(cl) < 2:
        return []
    agree, differ = [], 0
    for o in chain:
        m = _rating_of(o)
        if not m or int(m.group(1)) not in cl or (fam and lineage.family(o.book.belongs) != fam):
            continue
        want, got = cl[int(m.group(1))], ours.value(o.value) if f != "avail" else ours.value(re.sub(r"\D*$", "", o.value))
        want = want[0] if isinstance(want, tuple) else want
        if got is not None and fields.close(float(want), got):
            agree.append(o)
        elif got is not None:
            differ += 1
    return agree if len({id(o.book) for o in agree}) >= 1 and len(agree) >= 2 and not differ else []


def _swapped(a, b):
    a, b = _num(a), _num(b)
    if len(a) != len(b) or len(a) < 2 or not a.isdigit() or not b.isdigit():
        return False
    d = [i for i in range(len(a)) if a[i] != b[i]]
    return len(d) == 2 and d[1] == d[0] + 1 and a[d[0]] == b[d[1]] and a[d[1]] == b[d[0]]


def _neighbours(book, ln):
    """The table rows just above and below a row with the same header (stat blocks a few lines apart count)."""
    ls = book.md()
    i = next((k for k, x in enumerate(ls) if x.no == ln.no), None)
    if i is None:
        return []
    out = []
    for step, label in ((-1, "row above"), (1, "row below")):
        j = i + step
        while 0 <= j < len(ls) and abs(j - i) <= 60:
            x = ls[j]
            if x.cells() and x.header == ln.header and not K.SEP.match(x.text):
                out.append((x, label))
                break
            if x.level and step == 1 and x.level <= 3 and ln.header[0].upper() in lineage.NAME_HEADERS:
                break  # a summary table ends at its next section
            j += step
    return out


def classify(corpus, c, kind, chains, d, names, differ=()):
    """(family, location, evidence value) for one differing field d of record c (differ: all its differing fields)."""
    f = d["field"]
    attr = ATTR.get(f, f)
    chain = chains.get(attr, [])
    win = lineage.winner(chain)
    rating = (lineage.winner(chains.get("rating", [])) or lineage.Obs(None, "", "", "")).value or None
    fam = lineage.family(c["src"])
    big = next(iter((c["fields"].get(f) or {None: 0}).values()), 0) if f == "cost" else 0
    if isinstance(big, float) and big >= 999999 and (win is None or ours.NONE.match(win.value or "")):
        return "own row", (f"{win.book.label} {win.where} " if win else "") + "(a dash; Commlink6's not-for-sale number)", \
            win.value if win else ""
    if win is not None and _matches(c, kind, attr, win.value, f, rating):
        return "own row", f"{win.book.label} {win.where} (printed with a note: '{win.value}')", win.value
    one = c["fields"].get(f)
    if win is not None and f in NUMERIC and isinstance(one, dict) and len({str(x) for x in one.values()}) == 1 \
            and re.search(r"(?i)rating", win.value):
        v1 = ours.value(win.value, 1)
        want = next(iter(one.values()))
        want = want[0] if isinstance(want, tuple) else want
        if v1 is not None and fields.close(float(want), v1):
            return "per-rating or variant row", f"{win.book.label} {win.where} (Commlink6 keeps the Rating 1 value)", win.value
    if f == "rating" and c["fields"].get("rating"):
        # rows, entries or stat blocks printed per rating ('Rating 3' headings, 'Cyberjack Rating 6'): the top one is
        # Commlink6's maximum
        seen = {}
        for ch in chains.values():
            for o in ch:
                if lineage.family(o.book.belongs) != fam:
                    continue
                m = _rating_of(o) or (re.search(r"(?i)\brating\s*(\d+)\b", o.line.heading) if o.line is not None else None)
                if m:
                    seen.setdefault(int(m.group(1)), o)
        hi = c["fields"]["rating"][1]
        if seen and max(seen) == hi and len(seen) >= 2:
            o = seen[hi]
            return "per-rating or variant row", f"{o.book.label} {o.where} (ratings {min(seen)}–{hi} printed one by one)", f"Rating {hi}"
    rows = _per_rating(c, f, chain, fam)
    if rows:
        return ("per-rating or variant row", f"{rows[0].book.label} {rows[0].where} and {len(rows) - 1} more rating rows",
                "; ".join(f"{o.label or o.variant}: {o.value}" for o in rows[:3]))
    hits = [o for o in chain if o is not win and _matches(c, kind, attr, o.value, f, rating)]

    def first(pred):
        return next((o for o in hits if pred(o)), None)
    for name, pred in (
            ("errata sentence", lambda o: o.kind == "errata"),
            ("section default", lambda o: o.kind == "section"),
            ("per-rating or variant row", lambda o: win is not None and o.book is win.book and o.kind == "catalog"
             and win.kind == "catalog" and o.where != win.where),  # two entries of one book: two variants
            ("own row", lambda o: win is not None and o.book is win.book and not o.variant and not o.context),
            ("older printing or superseded", lambda o: not o.variant and not o.context and lineage.family(o.book.belongs) == fam),
            ("another book", lambda o: not o.variant)):
        o = first(pred)
        if o:
            ctx = " (context: " + ("NPC line" if o.kind == "bracket" else "quick-start") + ")" if o.context else ""
            note = " (with a note)" if _matches(c, kind, attr, o.value, f, rating) == "with a note" else ""
            return name, f"{o.book.label} {o.where}{ctx}{note}", o.value
    o = first(lambda o: bool(o.variant))
    if o:
        return "per-rating or variant row", f"{o.book.label} {o.where} variant '{o.variant}'", o.value
    # the row above or below the object's row, in each book's tables and stat blocks
    for o in chain:
        if o.line is None or o.kind not in ("row", "block") or o.variant or o.context:
            continue
        for x, label in _neighbours(o.book, o.line):
            if lineage._own(next(iter(x.cells().values()), ""), names):
                continue
            cells = lineage.from_row(o.book, x)
            hit = next((n for n in cells if n.field == attr and _matches(c, kind, attr, n.value, f, rating)), None)
            if hit is None or f == "rating":  # a table's rows share their rating range: no evidence of a misread
                continue
            # one small value matching a neighbour is chance; two differing fields from that row, or one distinctive
            # value, is not
            others = sum(1 for g in differ if g != f and g != "legality" and
                         any(n.field == ATTR.get(g, g) and _matches(c, kind, n.field, n.value, g, rating) for n in cells))
            if others or _distinctive(f, hit.value):
                return "Commlink6 misread", f"{o.book.label} book.md L{x.no} p.{x.page} {label} [{x.heading}]", hit.value
    tok = d.get("cl6_tok") or ""
    for o in chain:
        if not o.variant and tok and _swapped(tok, ours.value(o.value) and fields.fmt(ours.value(o.value)) or ""):
            return "Commlink6 misread", f"digit swap of {o.book.label} {o.where}", o.value
    rx = token_re(c, f)
    if rx:
        pat, cue = re.compile(rx, re.I), re.compile(CUE.get(f, re.escape(f)), re.I)
        books = {id(o.book) for ch in chains.values() for o in ch if not o.context and not o.variant}
        heads, prose = _text(corpus, names, books)
        for b, ln in heads:
            if pat.search(ln.text):
                return "heading", f"{b.label} book.md L{ln.no} p.{ln.page} [{ln.text.strip('# ')[:60]}]", pat.search(ln.text).group(0)
        before = {}
        for b, ln in prose:
            ls = b.md()
            k = next((j for j, x in enumerate(ls) if x.no == ln.no), 0)
            before[(id(b), ln.no)] = ls[k - 1].text if k and not ls[k - 1].level else ""
        for b, ln in prose:
            m = pat.search(ln.text)
            near = before[(id(b), ln.no)] + " " + ln.text  # a sentence wraps: its field word may be on the line above
            if m and cue.search(near):
                return "description sentence", f"{b.label} book.md L{ln.no} p.{ln.page} [{ln.heading[:50]}]", m.group(0)
    for b, ln, word in _class_rows(corpus, chains, kind):
        for n in lineage.from_row(b, ln):
            if n.field == attr and _matches(c, kind, attr, n.value, f, rating):
                return "another book", f"{b.label} book.md L{ln.no} p.{ln.page} class row '{word}' [{ln.heading}]", n.value
    if win is not None:
        rows = {id(x.line) for ch in chains.values() for x in ch
                if x.book is win.book and x.line is not None and x.kind in ("row", "block", "card") and not x.variant}
        for ch in chains.values():
            for x in ch:
                if id(x.line) in rows and x.field != attr and not ours.NONE.match(x.value or "") \
                        and _matches(c, kind, attr, x.value, f, rating):
                    return "another column", f"{win.book.label} {x.where} column {x.field}", x.value
    return "not found", "", ""


TITLE = re.compile(r"^\s*(?:\*\*[^*]{2,60}\*\*|[A-Z][^.!?]{1,50}$)")


def _text(corpus, names, books):
    """(headings, prose lines) about the object in these books: the headings naming it and the headings under them;
    the prose under them, the lines naming it and the paragraph after (to the next heading, at most 25 lines), and the
    intro of the section that holds a heading naming it. NPC lines ('[') are left out."""
    heads, prose, seen = [], [], set()

    def add(b, x):
        if (id(b), x.no) in seen or not x.text.strip() or x.cells() or "[" in x.text:
            return
        seen.add((id(b), x.no))
        (heads if x.level else prose).append((b, x))
    for b, ln in corpus.mentions(names):
        if b.context or id(b) not in books:
            continue
        ls = b.md()
        i = next(k for k, x in enumerate(ls) if x.no == ln.no)
        add(b, ln)
        if ln.level:
            for x in K.section(ls, i):
                add(b, x)
            parent = next((k for k in range(i - 1, -1, -1) if 0 < ls[k].level < ln.level), None)
            if parent is not None:
                for x in ls[parent + 1:i]:
                    if x.level:
                        break
                    add(b, x)
        else:
            for x in ls[max(0, i - 2):i + 3]:  # the sentence around the name, wrapped over lines
                if not x.level:
                    add(b, x)
        if not ln.level and TITLE.match(ln.text):  # a run-in title ('**Name:** …', a line that is the name): its paragraph
            for x in ls[i + 1:i + 26]:
                if x.level or TITLE.match(x.text):
                    break
                add(b, x)
    return heads, prose


def _distinctive(f, v):
    """A value unlikely to match a neighbouring row by chance: a price of three digits or more, an attack rating, an
    ammo count."""
    n = ours.value(v)
    return (f == "cost" and n is not None and n >= 100) or f in ("ar", "ammo")


GENERIC = {"armor", "weapon", "weapons", "gear", "melee", "firearm", "firearms", "clothing", "electronics", "vehicle",
           "vehicles", "drone", "drones", "launcher", "launchers", "exotic", "blades", "clubs", "accessory", "accessories",
           "body armor", "ammo", "ammunition", "tools", "misc", "other"}


CLASS_KINDS = {"programs": r"program|soft"}  # the kinds a book prices by class ('<Kind>, <class>')


def _class_rows(corpus, chains, kind):
    """(book, row, word): table rows (any book) whose short first cell names the object's printed type or category
    ('<Kind>, <class>' for an item of that class): a price set for the whole class."""
    words = {str(o.value).strip().casefold() for o in chains.get("type", []) + chains.get("category", [])
             if o.kind == "catalog" and not o.variant and o.value and len(str(o.value).split()) <= 2}
    words = {w for w in words if len(w) >= 4 and re.fullmatch(r"[a-z][a-z -]+", w) and w not in GENERIC}
    if not words or kind not in CLASS_KINDS:
        return []
    out = []
    for b in corpus.books:
        if b.context:
            continue
        idx = b.index()
        for w in sorted(words):
            ws = match.words(w)
            posting = [set(idx.get(x, ())) for x in ws]
            for i in sorted(set.intersection(*posting)) if posting and all(posting) else ():
                ln = b.md()[i]
                cells = ln.cells()
                c0 = next(iter(cells.values()), "")
                if cells and len(c0.split()) <= 4 and re.search(rf"\b{re.escape(w)}\b", c0, re.I) \
                        and re.search(CLASS_KINDS[kind], c0, re.I):
                    out.append((b, ln, c0))
    return out


def winners_entry(chains, kind):
    return {"attrs": {f: w.value for f, ch in chains.items() if (w := lineage.winner(ch))}, "kind": kind}


def _matched_names(corpus, cl6):
    """{id(record): [our entry names]}: the earlier staged matching (match.py: loose, alias, split, word order,
    contained on a nearby page, fuzzy) of each record against the entries of its own book's printings, for the records
    their names alone don't find."""
    out, by_src = {}, {}
    for c in cl6:
        if c["modelled"]:
            by_src.setdefault(lineage.family(c["src"]), []).append(c)
    for fam, recs in by_src.items():
        ents = [e for b in corpus.books if lineage.family(b.belongs) == fam and not b.errata for e in b.entries]
        for c, hits, how in match.match(recs, ents):
            if hits:
                out[id(c)] = sorted({h["name"] for h in hits})
    return out


def run(corpus, cl6, verdicts=None):
    """(rows, counts): one row per differing field of every Commlink6 record we model, and the tallies. verdicts:
    {'src|id|field': {family, note, crop}} read off the rendered page (the owner's file, see apply_verdicts)."""
    rows, n = [], Counter()
    matched = _matched_names(corpus, cl6)
    for c in cl6:
        n["records"] += 1
        if c.get("cl6only"):
            n["Commlink6-only records"] += 1
            rows.append({"src": c["src"], "id": c["id"], "name": c["name"], "page": c["page"], "kind": c["kind"],
                         "field": "", "family": "Commlink6-only record", "where": ""})
            continue
        if not c["modelled"]:
            n["unmodelled kind"] += 1
            continue
        names = [c["name"], *c["aliases"]]
        home = lineage.family(c["src"])
        if not any(lineage.family(b.belongs) == home for b, _ in corpus.entries(set(c["pool"]) or {c["kind"]}, names, home)):
            names += [x for x in matched.get(id(c), []) if x not in names]  # its own book prints it another way
        kinds = set(c["pool"]) or {c["kind"]}
        ents = corpus.entries(kinds, names, home)
        obs = lineage.observe(corpus, kinds, names, home)
        own = [o for o in obs if not o.context and not o.variant]
        # (an entry of ours under the object's name is the object, even one printing no field: a mentor spirit)
        if not own and not any(e["kind"] in kinds and not b.context for b, e in ents):
            n["object not found"] += 1
            rows.append({"src": c["src"], "id": c["id"], "name": c["name"], "page": c["page"], "kind": c["kind"],
                         "field": "", "family": "object not found",
                         "where": "name printed in text" if corpus.mentions(names) else "name nowhere in text"})
            continue
        n["objects"] += 1
        kind = next((e["kind"] for _, e in ents if e["kind"] in kinds), c["kind"])
        chains = lineage.lineage(obs)
        done, diffs = fields.compare(c, winners_entry(chains, kind))
        n["fields compared"] += len(done)
        n["fields equal"] += len(done) - len(diffs)
        n["records exact"] += not diffs
        differ = {d["field"] for d in diffs}
        for fld in done:
            w = lineage.winner(chains.get(ATTR.get(fld, fld), []))
            if fld not in differ and w is not None:  # where the equal values come from
                src = ("errata" if w.book.errata else "card" if w.kind == "card" else "section default"
                       if w.kind == "section" else
                       "home book" if lineage.family(w.book.belongs) == lineage.family(c["src"]) else "another book")
                n[f"equal via {src}"] += 1
        for d in diffs:
            fam, where, ev = classify(corpus, c, kind, chains, d, names, differ)
            w = lineage.winner(chains.get(ATTR.get(d["field"], d["field"]), []))
            rows.append({"src": c["src"], "id": c["id"], "name": c["name"], "page": c["page"], "kind": kind,
                         "field": d["field"], "cl6": d["cl6"], "winner": w.value if w else "",
                         "winner_where": f"{w.book.label} {w.where}" if w else "", "family": fam, "where": where,
                         "evidence": ev})
    # a misread is stronger when several of a record's fields come from the same neighbouring row
    by = Counter((r["id"], r["src"], r["where"]) for r in rows if r.get("family") == "Commlink6 misread" and "row" in r["where"])
    for r in rows:
        if r.get("family") == "Commlink6 misread":
            k = by.get((r["id"], r["src"], r["where"]), 0)
            r["strength"] = "digit swap" if "digit swap" in r["where"] else f"{k} field{'s' if k > 1 else ''} from that row"
    apply_verdicts(rows, verdicts or {})
    # a field no book prints (no reading of ours holds it, and no text found holds Commlink6's value) is Commlink6's
    # own: out of the fields compared, counted on its own line
    left = Counter()
    for r in rows:
        if r["field"]:
            left[(r["src"], r["id"])] += 1
            if r["family"] == "not found" and not r["winner"] and not r.get("verdict"):
                r["family"] = "Commlink6-only field"
                n["fields compared"] -= 1
                n["Commlink6-only fields"] += 1
                left[(r["src"], r["id"])] -= 1
    n["records exact"] += sum(1 for k, v in left.items() if v == 0)
    return rows, n


WEAK = "weak link, not confirmed on the page"


def weak(r):
    """A link the page must confirm: another column, a misread backed by one field of the neighbouring row, or a
    value one digit off ours."""
    return (r["family"] == "another column" or (r["family"] == "Commlink6 misread" and r.get("strength", "").startswith("1 "))
            or (r["family"] == "not found" and why_not(r) == "one digit off"))


def apply_verdicts(rows, verdicts):
    """The page verdicts (step 3): each row the owner's file names takes its family, with the note and the crop as its
    location; a weak link no verdict confirms goes to not found (a one-digit-off value stays not found)."""
    for r in rows:
        v = verdicts.get(f"{r['src']}|{r['id']}|{r['field']}")
        if v:
            r["family"], r["verdict"] = v["family"], v.get("note", "")
            r["where"] = f"{v.get('note', '')} (page crop {v['crop']})" if v.get("crop") else v.get("note", "")
            r["crop"] = v.get("crop", "")
        elif weak(r) and r["family"] != "not found":
            r["family"], r["verdict"] = "not found", WEAK


ENUM_FIELDS = {"range", "duration", "action", "power type", "spell type", "spell category", "activation", "positive",
               "attribute"}


def why_not(r):
    """A not-found difference's kind, for reading the list: a weak link the page did not confirm, Commlink6's value where
    our text prints none for the field, a Commlink6 term (an enum) the book words otherwise, one digit off, or a value
    printed nowhere."""
    if r.get("verdict"):
        return "checked on the page, not settled" if r["verdict"] != WEAK else WEAK
    if not r["winner"]:
        return "we print no value for this field"
    if r["field"] in ENUM_FIELDS:
        return "Commlink6's term differs from the printed word"
    a, b = _num(re.sub(r"[^\d,]", "", r["cl6"])), _num(re.sub(r"[^\d,]", "", r["winner"]))
    if a and b and len(a) == len(b) and sum(x != y for x, y in zip(a, b)) == 1:
        return "one digit off"
    return "a different value, printed nowhere"


def _cell(v, n=28):
    v = re.sub(r"\s+", " ", str(v or "")).replace("|", "/")
    return v if len(v) <= n else v[:n - 1] + "…"


def markdown(rows, n, corpus):
    """The owner's section of cl6-examples.md: the dates, the counts per family with two examples each, and the full
    not-found list."""
    diffs = [r for r in rows if r["field"] and r["family"] != "Commlink6-only field"]
    fam = Counter(r["family"] for r in diffs)
    mis = fam["Commlink6 misread"]
    out = ["## Phase 1 full run: every Commlink6 object traced", ""]
    out += ["### Book dates (from the PDFs)", "",
            "Each book's date is its PDF's own: the metadata modification date, else its creation date, when it falls in "
            "the year of the book's © line or the year after; else the © year with sources.xml's month; else "
            "sources.xml. Books sort by that date; errata no longer win ties.", "",
            "| date | from | sources.xml | book |", "|---|---|---|---|"]
    out += [f"| {b.date} | {b.how} | {b.src_month or '—'} | {b.label}{' (errata)' if b.errata else ''}"
            f"{' (context only)' if b.context else ''} |" for b in corpus.books]
    dis = corpus.disagreements()
    out += ["", f"**Where the PDF's date and sources.xml disagree ({len(dis)}):** " +
            "; ".join(f"{b.label}: PDF {d}, sources.xml {sm}" for b, d, how, sm in dis), ""]
    out += ["### Counts", "",
            f"- Commlink6 records: {n['records']}"
            f" — of a kind we don't model {n['unmodelled kind']}, object found in the corpus {n['objects']}, "
            f"object not found {n['object not found']}.",
            f"- Fields compared with the latest-published value: {n['fields compared']}; equal {n['fields equal']} "
            f"({100 * n['fields equal'] / max(1, n['fields compared']):.2f}%); with the {mis} Commlink6 misreads not counted "
            f"against us {100 * (n['fields equal'] + mis) / max(1, n['fields compared']):.2f}%.",
            f"- Records with every field equal: {n['records exact']} of {n['objects']}.",
            f"- Commlink6-only, left out of both counts above: {n['Commlink6-only records']} records no book prints as "
            f"an item (rule settings, retired records, option rows priced at zero and not for sale) and "
            f"{n['Commlink6-only fields']} fields no book prints (no reading of ours holds one, and no text holds "
            f"Commlink6's value).",
            "- Where the equal values' winners come from: " + ", ".join(
                f"{k[10:]} {v}" for k, v in sorted(n.items()) if k.startswith("equal via ")) + ".",
            f"- Differences: {len(diffs)}.", "", "| family | differences |", "|---|---:|"]
    out += [f"| {f} | {fam[f]} |" for f in FAMILIES]
    out += ["", "### Two examples per family", ""]
    for f in FAMILIES:
        if f == "not found":
            continue
        ex = [r for r in diffs if r["family"] == f]
        pick, books = [], set()
        good = {"Commlink6 misread": r"2 fields|digit swap", "older printing or superseded": r"printing",
                "another book": r"class row|card", "own row": r"book\.md"}.get(f, r".")
        for r in sorted(ex, key=lambda r: (not re.search(good, r["where"] + r.get("strength", "")),
                                           len(r["cl6"]) + len(r["evidence"]))):
            if r["src"] not in books:
                pick.append(r)
                books.add(r["src"])
            if len(pick) == 2:
                break
        out.append(f"**{f}** ({fam[f]})")
        out += [f"- {r['src']} {r['name']} ({r['field']}): Commlink6 `{_cell(r['cl6'], 20)}`, latest published "
                f"`{_cell(r['winner'], 20)}`; found `{_cell(r['evidence'], 24)}` at {r['where']}" for r in pick]
        out.append("")
    nf = [r for r in diffs if r["family"] == "not found"]
    sub = Counter(why_not(r) for r in nf)
    out += [f"### Not found after the full search: all {len(nf)}", "",
            "By kind: " + "; ".join(f"{k} {v}" for k, v in sub.most_common()) + ".", "",
            "| book | name | field | Commlink6 | latest published (where) | kind |", "|---|---|---|---|---|---|"]
    for r in sorted(nf, key=lambda r: (why_not(r), r["src"], r["field"], r["name"])):
        out.append(f"| {r['src']} | {_cell(r['name'], 36)} | {r['field']} | {_cell(r['cl6'], 24)} | "
                   f"{_cell(r['winner'], 20)} ({_cell(r['winner_where'], 46)}) | {why_not(r)} |")
    on = [r for r in rows if r["family"] == "object not found"]
    out += ["", f"### Objects not found ({len(on)})", "",
            "Commlink6 records of a kind we model for which no book in the corpus has a catalog entry or a row: "
            + "; ".join(f"{k} {v}" for k, v in Counter(r["where"] for r in on).most_common()) + ". By book: "
            + ", ".join(f"{k} {v}" for k, v in Counter(r["src"] for r in on).most_common()) + ".", ""]
    return "\n".join(out)


def write(out_dir, rows, n, corpus):
    os.makedirs(out_dir, exist_ok=True)
    keys = ["src", "id", "name", "page", "kind", "field", "cl6", "winner", "winner_where", "family", "where", "evidence",
            "strength", "verdict", "crop"]
    with open(os.path.join(out_dir, "cl6-trace.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, keys, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return os.path.join(out_dir, "cl6-trace.csv")
