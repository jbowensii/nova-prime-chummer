"""Field lineage: which book printed which value of an object, and when; the winner is the value published last.

An observation (Obs) is one value of one field that one book prints for the object. The readers:
- `catalog`: a catalog entry's attribute (our import);
- `row`: a table row printing the name, by its header (the core recipe's header map);
- `block`: a table row with no name of its own under a heading naming the object (a book's per-item stat block, a
  per-rating or variant table: its first cell is then the variant);
- `card`: a card's stat lines on the page whose one title names the object (`**DV:** 3P **Mode:** SA`, a vehicle
  card's bold header row and the values under it, a quick-start card's range lines);
- `bracket`: an NPC's stat line `Name [Type, DV 4P, SS, 9/9/6/—/—, 12(c), w/ …]`, context only (a character's
  modified copy);
- `section`: a general statement above the object (a section's intro, a table's footnote: 'all of these …
  Availability N'), its section default;
- `errata`: an errata statement naming the object: `X's Near AR is changed from A to B`, `Change the cost to
  N¥` under a heading naming it, `X: Availability N`. A change to one attack-rating band is a patch on the value
  before it.
`observe()` collects them for one object, `lineage()` orders them by publication date per field (resolving patches)
and `winner()` is the last-published value that is neither context nor another variant's."""
import re
from dataclasses import dataclass

from importer.sr6.recipes import crb, general
from tools.cl6check import corpus as K
from tools.cl6check import match

# a table's header cell -> our field name, over every kind (the core recipe's reading; the first kind naming it wins)
HEADER_FIELD = {}
for _kind in crb.HEADERS.values():
    for _h, _f in _kind.items():
        if _f and _f != "dv+":
            HEADER_FIELD.setdefault(_h, _f)
NAME_HEADERS = {h.upper() for h in crb.NAME_HEADERS | general._NAME_COLUMNS} | {"NAME", "SOFTWARE", "PROGRAM", "SPELL",
                                                                                  "QUALITY", "POWER", "CLASS"}
VARIANT_HEADERS = {"RATING", "GRADE", "LEVEL", "FORCE", "VERSION", "MODEL", "VARIANT", "SIZE"}
SKIP_ATTRS = {"id", "source", "page"}
HEADER_WORDS = [("cost", r"\bCOST\b|\bPRICE\b"), ("avail", r"^AVAIL"), ("essence", r"^ESS"), ("capacity", r"^CAPACITY"),
                ("dv", r"^DV\b"), ("rating", r"^RATING\b")]


def field_of(header):
    """Our field for a table header: the core recipe's map, else the map without a parenthetical ('COST (PER DOSE)'),
    else the field its first word names."""
    h = header.upper().strip()
    if h in HEADER_FIELD:
        return HEADER_FIELD[h]
    bare = re.sub(r"\s*\([^)]*\)", "", h).strip()
    if bare in HEADER_FIELD:
        return HEADER_FIELD[bare]
    return next((f for f, rx in HEADER_WORDS if re.search(rx, bare)), None)
CARD_FIELD = {"DV": "dv", "MODE": "modes", "MODES": "modes", "RATING": "ar", "ATTACK RATINGS": "ar", "AR": "ar",
              "AMMO": "ammo", "AVAILABILITY": "avail", "AVAIL": "avail", "COST": "cost"}
CARD_LABEL = re.compile(r"\*\*([A-Za-z .]+?):\*\*\s*([^*]*?)\s*(?=\*\*|$)")
CARD_HEADS = ["SPD INT", "TOP SPD", "HAND", "ACCEL", "BOD", "ARM", "PILOT", "SENS", "SEAT", "AVAIL", "COST", "HANDLING",
              "BODY", "ARMOR", "SENSOR", "SEATS"]
BANDS = ("close", "near", "medium", "far", "extreme")
AR_RE = r"[\d—–-]+\*?(?:\s*/\s*[\d—–-]+\*?){2,4}"
MODES_RE = r"\b(?:SS|SA|BF|FA)(?:/(?:SS|SA|BF|FA))*\b"
AMMO_RE = r"\d+\s*\((?:c|m|b|d|cy|belt|ml|s|sm)\)"
FIELD_WORDS = [("ar", r"attack ratings?|\bAR\b"), ("dv", r"\bDV\b|damage(?: code| value)?"),
               ("modes", r"firing modes?|\bmodes?\b"), ("ammo", r"\bammo\b"),
               ("avail", r"\bavail(?:ability|abiltiy)?\b"), ("cost", r"\bcost\b|\bprices?\b"),
               ("essence", r"\bessence\b"), ("capacity", r"\bcapacity\b")]
VALUE = {"ar": AR_RE + r"|\d+", "dv": r"\d+\s*[PS](?:\s*\([a-z]+\))?", "modes": MODES_RE, "ammo": AMMO_RE,
         "avail": r"\+?\d+\s*(?:\([LIRF]\)|[LIRF]\b)?|—", "cost": r"\+?\d[\d,]*\s*¥?", "essence": r"\d*\.\d+|\d+",
         "capacity": r"\d+"}
QUALIFIER = re.compile(r"((?:Rating\s+\d+)|[A-Z][\w-]*)\s+$")  # 'Rating 7 Widgets', 'Deluxe-grade Widget …'
NOT_QUALIFIERS = {"Change", "The", "Add", "Remove", "Replace", "Adjust", "Note", "All", "Stats", "Make", "Set", "For", "A",
                  "An", "Each", "Both", "Increase", "Decrease", "Reduce", "Its"}
CONNECT = r"\s*(?:\([^)]*\)\s*)?(?:(?:is\s+)?(?:changed\s+)?from\s+\S+\s+to|to\s+be|to|is|are|of|has|:|=)?\s*(?:an?\s+\w+\s+of\s+)?"


_CACHE = {}  # per book: its pages' lines, its errata statements


@dataclass
class Obs:
    book: object  # corpus.Book
    field: str
    value: str
    where: str
    kind: str = "catalog"  # catalog | row | block | card | bracket | errata
    context: bool = False  # never the winner (NPC lines, quick-start material)
    variant: str = ""  # another variant of the object (a qualified entry, a per-rating row): never the winner
    line: object = None  # the Line it was read from
    patch: dict = None  # errata: {band index: value} on the attack rating before it
    label: str = ""  # a catalog entry's name


def _clean(v):
    return re.sub(r"\*+|_", "", v or "").strip().rstrip(".").strip()


def from_entry(book, e, variant="", errata_book=None):
    """The entry's fields; one the importer took from an errata (resolve.py) is that errata's observation, dated by it
    (errata_book: the latest errata of the entry's book), not the book's."""
    where = f"catalog {e['src']}/{e['kind']} id={e['id']} p.{e['page']}"
    errata = {f for f, how in (e.get("found") or {}).items() if how == "errata"}
    return [Obs(errata_book, f, v, where + " (errata applied)", "errata", errata_book.context, variant, label=e["name"])
            if f in errata and errata_book is not None else
            Obs(book, f, v, where, "catalog", book.context, variant, label=e["name"]) for f, v in e["attrs"].items()
            if f not in SKIP_ATTRS and v not in (None, "") and (f not in errata or errata_book is not None)]


def from_row(book, ln, kind="row", variant=""):
    out = []
    for h, v in ln.cells().items():
        if h == "AMMOAVAIL" and len(v.split()) == 2:  # two columns the converter set as one
            for f, x in zip(("ammo", "avail"), v.split()):
                out.append(Obs(book, f, x, f"book.md L{ln.no} p.{ln.page} [{ln.heading}]", kind, book.context, variant, ln))
            continue
        f = field_of(h)
        if f and v:
            out.append(Obs(book, f, v, f"book.md L{ln.no} p.{ln.page} [{ln.heading}]", kind, book.context, variant, ln))
    return out


def _named(text, names):
    pats = [p for p in map(K._name_re, names) if p]
    return any(p.search(K.norm_line(text)) for p in pats)


def _own(cell, names):
    """The cell names the object itself (one of the names a row prints together counts)."""
    return bool({match.n1(p) for p in match.split_names(cell)} & {match.n1(n) for n in names})


def from_block(book, i, names):
    """The table rows with no name of their own under heading i, and the rows naming a variant of the object. The first
    stat block is the object's own; a later one under a sub-heading naming something else (a weapon's detachable
    blade) is that part's, a variant."""
    ls, out, first = book.md(), [], None
    for ln in K.section(ls, i):
        cells = ln.cells()
        if not cells:
            continue
        first = first or ln.heading  # the first stat block under the heading is the object's own
        h0, c0 = ln.header[0].upper(), next(iter(cells.values()))
        if h0 in NAME_HEADERS:
            if _named(c0, names) and not _own(c0, names):
                out += from_row(book, ln, "block", c0)  # a variant row: 'Widget Rating 2'
            continue
        part = ln.heading if ln.heading not in (ls[i].heading, first) and not _named(ln.heading, names) else ""
        out += from_row(book, ln, "block", f"{h0.title()} {c0}" if h0 in VARIANT_HEADERS else part)
    return out


def _card_lines(book, i):
    """The lines of the card whose title is heading i: its page, when that heading is the page's only title."""
    ls = book.md()
    pages = _CACHE.setdefault(("pages", id(book)), {})
    if not pages:
        for ln in ls:
            pages.setdefault(ln.page, []).append(ln)
    page = pages.get(ls[i].page, [])
    titles = [ln for ln in page if 0 < ln.level <= 2]
    return page if titles == [ls[i]] else []


def from_card(book, i):
    """A card's stat lines: on the page before its title (a vehicle card), and after it up to a second configuration
    (a weapon card's '#### shotgun' block is another configuration's)."""
    out, page = [], _card_lines(book, i)
    title = next((k for k, x in enumerate(page) if x is book.md()[i]), 0)
    subs = [k for k, x in enumerate(page) if k > title and x.level >= 3]
    page = page[:subs[1]] if len(subs) > 1 else page
    for j, ln in enumerate(page):
        where = f"book.md L{ln.no} p.{ln.page} card [{book.md()[i].heading}]"
        for label, v in CARD_LABEL.findall(ln.text):
            f = CARD_FIELD.get(label.strip().upper())
            if f and _clean(v):
                out.append(Obs(book, f, _clean(v), where, "card", book.context, "", ln))
        head = re.fullmatch(r"\*\*([A-Z .]+)\*\*", ln.text.strip())
        if head and j + 1 < len(page):  # a vehicle card: **HAND ACCEL SPD INT …** then the values
            rest, cols = head.group(1).strip(), []
            while rest:
                h = next((h for h in CARD_HEADS if rest.startswith(h)), None)
                if h is None:
                    cols = []
                    break
                cols.append(h)
                rest = rest[len(h):].strip()
            vals = page[j + 1].text.split()
            if cols and len(vals) == len(cols):
                out += [Obs(book, HEADER_FIELD[h], v, where, "card", book.context, "", page[j + 1])
                        for h, v in zip(cols, vals) if h in HEADER_FIELD]
        if ln.text.strip() == "**RANGE**":  # a quick-start card: Close 9, Near 9, …
            bands = [re.match(r"(Close|Near|Medium|Far|Extreme)\s+(\S+)", x.text) for x in page[j + 1:j + 6]]
            if all(bands):
                out.append(Obs(book, "ar", "/".join(m.group(2) for m in bands), where, "card", book.context, "", ln))
    return out


def from_bracket(book, ln, names):
    """An NPC stat line's values: context only."""
    out, t = [], ln.text
    for p in (p for p in map(K._name_re, names) if p):
        m = p.search(K.norm_line(t))
        if not m:
            continue
        b = re.match(r"\s*\[([^\]]*)\]?", K.norm_line(t)[m.end():])
        if not b:
            continue
        s, where = b.group(1), f"book.md L{ln.no} p.{ln.page} NPC [{ln.heading}]"
        for f, rx in (("dv", r"\bDV\s*([^,\]]+)"), ("modes", f"({MODES_RE})"), ("ar", f"({AR_RE})"), ("ammo", f"({AMMO_RE})")):
            x = re.search(rx, s, re.I)
            if x:
                v = x.group(1).strip()
                out.append(Obs(book, f, v if f == "ammo" else v.upper(), where, "bracket", True, "", ln))
        break
    return out


def statements(book):
    """An errata book's statements: (label, text, Line), a heading's body split at its bullets and 'p. N:' markers."""
    key = ("statements", id(book))
    if key not in _CACHE:
        _CACHE[key] = _statements(book)
    return _CACHE[key]


def _statements(book):
    out, label, buf, first = [], "", [], None

    def flush():
        body = " ".join(buf)
        for part in re.split(r"●|(?=\bp\.\s*\d+\s*:)", body):
            if part.strip():
                out.append((label, _clean(part), first))
    for ln in book.md():
        if ln.level:
            flush()
            label, buf, first = _clean(ln.text.lstrip("#")), [], ln
        else:
            if first is None:
                first = ln
            buf.append(ln.text)
    flush()
    return out


def _clauses(text):
    for sentence in re.split(r"(?<=[.;!?])\s+(?=[A-Z])", text):
        yield [c for c in re.split(r"\s+and\s+(?=(?:the\s+|change\s+)?[A-Za-z])", sentence) if c.strip()]


def from_errata(book, names):
    """The values errata statements give the object: the clause naming it (or every clause under a heading naming it),
    the field its words name (carried across 'A to x and B to y'), the value after 'to', 'is', ':' or the field."""
    pats = [p for p in map(K._name_re, names) if p]
    named = lambda s: any(p.search(K.norm_line(s)) for p in pats)  # noqa: E731
    out = []
    for label, text, ln in statements(book):
        own = named(label)
        if not own and not named(text):
            continue
        where = f"book.md L{ln.no} p.{ln.page} errata [{label[:60]}]" if ln else "errata"
        for clauses in _clauses(text):
            carried = None
            for c in clauses:
                hits = sorted(((m.start(), m.end(), f) for f, rx in FIELD_WORDS for m in re.finditer(rx, c, re.I)))
                tries = [(f, e) for _, e, f in hits] or ([(carried, 0)] if carried else [])
                carried = hits[-1][2] if hits else carried
                if not (own or named(c)):
                    continue
                found = [m for p in pats for m in [p.search(K.norm_line(c))] if m]
                nm = max((m.end() for m in found), default=0)
                q = QUALIFIER.search(c[:min(m.start() for m in found)]) if found else None
                variant = q.group(1) if q and q.group(1).split()[0] not in NOT_QUALIFIERS else ""
                for f, e in tries:
                    m = re.compile(CONNECT + f"({VALUE[f]})", re.I).match(c, nm if nm > e else e)
                    if not m:
                        continue
                    v = _clean(m.group(1))
                    band = next((i for i, w in enumerate(BANDS) if re.search(rf"\b{w}\b", c, re.I)), None)
                    if f == "ar" and band is not None and re.fullmatch(r"\d+", v):
                        out.append(Obs(book, "ar", v, where, "errata", book.context, variant, ln, {band: v}))
                    else:
                        out.append(Obs(book, f, v, where, "errata", book.context, variant, ln))
    return out


GENERAL = re.compile(r"\b(?:all|every|each|these|those|unless otherwise|any)\b", re.I)
FOOTNOTE = re.compile(r"^\s*\|?\s*[*†](?!\*)\s*\S")


def section_text(book, i):
    """[(heading, Line, text)]: the general statements over line i: for each heading above it, one level up at a time,
    its intro (the paragraph up to the next heading) and the footnotes ('*', '†') of its first 400 lines."""
    key = ("section", id(book), i)
    if key in _CACHE:
        return _CACHE[key]
    ls, out = book.md(), []
    lv = ls[i].level or 7
    for k in range(i - 1, -1, -1):
        if not 0 < ls[k].level < lv:
            continue
        lv = ls[k].level
        intro = []
        for x in ls[k + 1:]:
            if x.level:
                break
            intro.append(x)
        if intro:
            out.append((ls[k], intro[0], " ".join(x.text for x in intro if not x.text.startswith("|"))))
        for x in ls[k + 1:k + 401]:
            if x.level and x.level <= lv:
                break
            if FOOTNOTE.match(x.text):
                out.append((ls[k], x, x.text.strip("| ")))
        if lv <= 1:
            break
    _CACHE[key] = out
    return out


def from_section(book, i):
    """Section defaults over line i: a field and value a general statement gives ('All of these have Availability N',
    a table's footnote), as observations of kind `section`; the object's own value wins over them in its book."""
    out = []
    for head, ln, text in section_text(book, i):
        for sentence in re.split(r"(?<=[.;!?])\s+(?=[A-Z*])", _clean(text)):
            if not GENERAL.search(sentence):
                continue
            for m in (m for f, rx in FIELD_WORDS for m in re.finditer(rx, sentence, re.I)):
                f = next(f for f, rx in FIELD_WORDS if re.fullmatch(rx, m.group(0), re.I))
                v = re.compile(CONNECT + f"({VALUE[f]})", re.I).match(sentence, m.end())
                if v:
                    out.append(Obs(book, f, _clean(v.group(1)), f"book.md L{ln.no} p.{ln.page} section [{head.heading[:50]}]",
                                   "section", book.context, "", ln))
    return out


family = K.family


def observe(corpus, kinds, names, home=None):
    """Every observation of one object: from every book's text the rows, stat blocks, cards and NPC lines printing its
    name and the errata statements naming it, then its catalog entries' fields (and its variants', flagged): within a
    book the catalog (the importer's reading) is the last word. With `home` (the object's book), another book's text
    counts only when that book catalogues the object too, or imports nothing (a card deck): a book naming a different
    thing the same way (a drone and a drug sharing one name) is left out."""
    ents = corpus.entries(kinds, names, home)
    cataloguing = {id(b) for b, _ in ents}
    names = [n for i, n in enumerate(names) if i == 0 or len(match.words(n)) > 1]  # 'Grenade, Party' → not 'Party'
    if ents and not corpus._find("n1", kinds, names):  # found without its parenthetical: read the text that way too
        names += [x for x in (re.sub(r"\s*\([^)]*\)", "", n).strip() for n in names) if x and x not in names]
    out = []
    # an errata corrects its own book: another book's item of the same name is not its (No Future's `Hardened` yo-yo
    # is not Deadly Arts' `Hardened`)
    for b in corpus.books:
        if b.errata and (home is None or family(b.belongs) == home):
            out += from_errata(b, names)
    by_book, sections = {}, []
    for b, ln in corpus.mentions(names):
        by_book.setdefault(id(b), (b, []))[1].append(ln)
    for b, found in by_book.values():
        if b.errata:
            continue
        text = home is None or not b.sources or family(b.belongs) == home or id(b) in cataloguing
        ls = b.md()
        idx = {ln.no: i for i, ln in enumerate(ls)}
        home_book = text and (home is None or family(b.belongs) == home or id(b) in cataloguing)
        for ln in found:
            if home_book and (ln.level or (ln.cells() and _own(next(iter(ln.cells().values())), names))):
                sections += from_section(b, idx[ln.no])
            if ln.level and text:
                out += from_block(b, idx[ln.no], names)
                if ln.level <= 2:
                    out += from_card(b, idx[ln.no])
            elif ln.cells() and text:
                h0 = ln.header[0].upper()
                c0 = next(iter(ln.cells().values()))
                if _own(c0, names):
                    out += from_row(b, ln)
                elif _named(c0, names):
                    out += from_row(b, ln, "row", c0)  # the name with a qualifier: another variant's row
            elif "[" in ln.text and not ln.level:
                out += from_bracket(b, ln, names)
    seen, text = set(), []
    for o in sections + out:  # a stat block under two headings naming the object is read once; a section default first
        key = (id(o.book), o.line.no if o.line is not None else o.where, o.field, o.value)
        if key not in seen:
            seen.add(key)
            text.append(o)
    def errata_of(b):
        return max((x for x in corpus.books if x.errata and family(x.belongs) == family(b.belongs)),
                   key=lambda x: x.order, default=None)
    text += [o for b, e in ents for o in from_entry(b, e, "", errata_of(b))]
    text += [o for b, e in corpus.variants(kinds, names, home) for o in from_entry(b, e, e["name"], errata_of(b))]
    return text


def _patched(base, patch):
    parts = [p.strip() for p in re.split(r"/", base)]
    if len(parts) != 5:
        return None
    for i, v in patch.items():
        parts[i] = v
    return "/".join(parts)


def lineage(obs):
    """{field: [Obs]} each in publication order (stable for a book printing a field twice); an errata patch on a band
    becomes the whole attack rating it changes."""
    out = {}
    for o in sorted(obs, key=lambda o: o.book.order):
        chain = out.setdefault(o.field, [])
        if o.patch:
            base = next((x for x in reversed(chain) if not x.context and not x.variant and _patched(x.value, {})), None)
            full = _patched(base.value, o.patch) if base else None
            if full:
                o.value = full
        chain.append(o)
    return out


def same(a, b):
    """Two printed values say the same: equal as numbers at rating 1, else equal as text (spacing, case, ¥ aside)."""
    from tools.cl6check import ours
    va, vb = ours.value(a), ours.value(b)
    if va is not None and vb is not None:
        return va == vb
    norm = lambda v: re.sub(r"[\s¥]", "", v or "").casefold()  # noqa: E731
    return norm(a) == norm(b)


def versions(chain):
    """[(version date, Obs)] of the object's own observations: a reprint of a value its book family already printed
    (the 2019 core text again in the Hong Kong printing) keeps the date that value was first published, so a
    later printing that changes nothing does not make an older value newer than another book's."""
    out, last = [], {}
    for o in chain:
        if o.context or o.variant or (o.patch and "/" not in o.value):
            continue
        fam = family(o.book.belongs) or o.book.label
        prev = last.get(fam)
        date = prev[0] if prev and same(prev[1].value, o.value) else o.book.date
        last[fam] = (date, o)
        out.append((date, o))
    return out


def winner(chain):
    """The object's own observation (not context, not a variant's, not an unresolved patch) whose value was published
    last: by the date each value first appeared in its book family's printings, then by book order."""
    vs = versions(chain)
    if not vs:
        return None
    order = {id(o): k for k, (_, o) in enumerate(vs)}
    return max(vs, key=lambda x: (x[0], order[id(x[1])]))[1]
