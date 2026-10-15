"""The first two circles a value an issue lacks is searched in, within its own book (resolve.py holds the third, the
corpus, and the errata; the owner, phase 2C):

1. table: every table of the same book whose row names the item (its name, or a shorter printing of it: `Laser mic`
   for `Laser microphone`) and has a column for the field: a summary table, a gear list in another chapter, a
   comparison table, the implant table that prices an implant weapon;
2. text: a sentence of the same book that prints the field's value with its word (`ratings 1 to 6`, `Availability
   4`, `costs 500¥`): the item's own description first, then any sentence naming it.

Several different values found in one circle is no value (the issue stays). Nothing here names an item: the readers
are the books' column headers and value words."""
import re
import unicodedata

# a field's value word in running text, and the value it prints (group 1, else groups 1 and 2: a range)
_NUM = r"\d[\d,]*(?:\.\d+)?"
TEXT = {
    "rating": [
        (re.compile(r"\bratings?\s*(?:of\s+|from\s+|between\s+|range\s+from\s+)?(\d+)\s*(?:–|-|to|through|and)\s*(\d+)\b", re.I), "range"),
        (re.compile(r"\b(?:maximum|max\.?)\s+rating\s*(?:is\s+|of\s+)?(\d+)\b", re.I), "max"),
        (re.compile(r"\bratings?\s+up\s+to\s+(\d+)\b|\bup\s+to\s+(?:a\s+)?rating\s+(?:of\s+)?(\d+)\b", re.I), "max"),
    ],
    "avail": [(re.compile(r"\bavailability\s*(?:of\s+|is\s+|:\s*)?(\d+\s*(?:\(\s*[LIF]\s*\)|[LIF]\b)?)(?![\d¥,])", re.I), "one")],
    "cost": [(re.compile(r"\b(?:costs?|priced\s+at|price\s+(?:is|of))\s*:?\s*(" + _NUM + r")\s*(?:¥|nuyen)", re.I), "one")],
    # (a negative quality's own text may say `Gain N Karma`; a sentence buying one off prices its removal: _BUY_OFF)
    "karma": [(re.compile(r"\b(?:costs?|bonus\s+of|for|^gain)\s*:?\s*(\d+)\s+karma\b", re.I), "one")],
    "essence": [(re.compile(r"\bessence(?:\s+cost)?\s*(?:of\s+|is\s+|:\s*)(\d*\.\d+|\d+)\b", re.I), "one")],
}
_BUY_OFF = re.compile(r"\bbuy(?:s|ing)?\s+(?:\S+\s+){0,6}?off\b|\bbought\s+off\b", re.I)
_AVAIL = re.compile(r"\d+\s*(?:\(\s*[LIF]\s*\)|[LIF])?")
_RANGE = re.compile(r"(\d+)\s*[–-]\s*(\d+)")
_MODES = re.compile(r"(?:SS|SA|BF|FA)(?:\s*(?:/|,)\s*(?:SS|SA|BF|FA))*(?:\s*\(\d+\))?")
_AMMO = re.compile(r"\d+\s*\(\s*[a-z-]+\s*\)(?:\s*(?:/|or)\s*\d+\s*\(\s*[a-z-]+\s*\))*", re.I)
_STAT = re.compile(r"\d+(?:\s*/\s*\d+)?")
_DASH = re.compile(r"\s*(?:[—–-]+|n/a)[*†]?\s*", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().replace("&", " and ")
    s = re.sub(r"['‘’\"“”]", "", s)
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


def names_item(row, name):
    """A row's first cell names the item: the same name, or a shorter printing of it (its words, two or more or one
    with a digit, all in the name in order: `Laser mic` / `Laser microphone`, `MGL-48` / `ArmTech MGL-48 Decimator`)."""
    r, n = norm(row), norm(name)
    if not r or not n:
        return False
    if r == n or ":" in row and norm(row.split(":", 1)[1]) == n:  # (`P-ICE: Nope!` prices the app `Nope!`)
        return True
    rw, nw = r.split(), n.split()
    if len(rw) < len(nw) and (len(rw) > 1 or re.search(r"\d", r)) and re.search(rf"(?:^| ){re.escape(r)}(?: |$)", n):
        return True
    # the last word cut short (`Laser mic`)
    return len(rw) == len(nw) and len(rw) > 1 and rw[:-1] == nw[:-1] and len(rw[-1]) >= 3 and nw[-1].startswith(rw[-1])


def good(field, v):
    """A printed cell that reads as the field's value (a dash is printed, but no value to fill a gap with)."""
    v = (v or "").strip()
    if not v or _DASH.fullmatch(v):
        return False
    if field == "avail":
        return bool(re.fullmatch(r"\+?" + _AVAIL.pattern, v) or re.fullmatch(r"\(?rating\)?\s*(?:\(\s*[LIF]\s*\)|[LIF])?", v, re.I))
    if field == "cost":
        return bool(re.fullmatch(r"\+?\s*" + _NUM + r"\s*¥?|(?:rating|capacity|force|level)\s*[x×*]\s*" + _NUM + r"\s*¥?", v, re.I))
    if field == "rating":
        return bool(_RANGE.fullmatch(v) or re.fullmatch(r"\d+", v))
    if field == "capacity" and _RANGE.fullmatch(v):
        return True  # (a capacity range: the rating an item priced by capacity comes in)
    if field in ("essence", "capacity"):
        return bool(re.fullmatch(r"\[?\s*(?:\d*\.\d+|\d+)\s*\]?|\(?rating\)?\s*[x×*]\s*(?:\d*\.\d+|\d+)", v, re.I))
    if field == "karma":
        return bool(re.fullmatch(r"-?\d+(?:\s*karma)?", v, re.I))
    if field == "modes":
        return bool(_MODES.fullmatch(v))
    if field == "ammo":
        return bool(_AMMO.fullmatch(v))
    if field in ("handling", "accel", "interval", "topSpeed", "body", "armor", "pilot", "sensor", "seats", "defense"):
        return bool(_STAT.fullmatch(v))
    return False


def clean(v, field):
    v = " ".join((v or "").split())
    if field == "cost":
        v = re.sub(r"(?<=\d),(?=\d{3})", "", v).replace("¥", "").strip()
    if field == "rating" and (m := _RANGE.fullmatch(v)):
        v = f"{m.group(1)}–{m.group(2)}"
    if field == "karma":
        v = re.sub(r"(?i)\s*karma", "", v)
    return v


def sentences(text):
    t = re.sub(r"(\w)-\n(\w)", r"\1\2", text or "")
    t = " ".join(t.split())
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z•(])", t) if s]


def text_values(field, sents):
    """The distinct values the sentences print for the field ({value})."""
    out = set()
    for s in sents:
        if field == "karma" and _BUY_OFF.search(s):
            continue
        for rx, how in TEXT.get(field, ()):
            for m in rx.finditer(s):
                g = [x for x in m.groups() if x]
                if not g:
                    continue
                if how == "range":
                    lo, hi = int(g[0]), int(g[1])
                    if 0 < lo < hi <= 20:
                        out.add(f"{lo}–{hi}")
                elif how == "max":
                    if 1 < int(g[0]) <= 20:
                        out.add(f"1–{int(g[0])}")
                else:
                    out.add(clean(g[0], field))
    return out


class Index:
    """A book's tables and prose for the first two circles: rows [(page, name, {HEADER: cell})] and paragraphs
    [(page, text)]. blocks: regroup's blocks; offset: the recipe's PAGE_OFFSET; tables(text): the markdown tables in
    a block's text [(header, rows)]; rename: printed short headers -> the core rulebook's."""

    def __init__(self, blocks, offset, tables, rename=None):
        self.rows, self.paras = [], []
        rn = rename or {}

        def up(h):
            h = " ".join(str(h).rstrip("*†").split()).upper()
            m = rn.get(h, h)
            return m if isinstance(m, str) else h

        for b in blocks:
            page = max(1, b.page - offset)
            if b.row is not None and b.header:
                cells = {up(h): b.row.get(h, "") for h in b.header[1:]}
                first = b.row.get(b.header[0], "")
                self.rows += [(page, n, cells) for n in dict.fromkeys(x for x in (first, b.name) if x)]
            for s in b.stats:
                hs = list(s)
                named = hs and not re.search(r"\b(?:DV|AR|AVAIL|COST|RATING|ESSENCE|DEFENSE|HANDLING|SEATS)\b", up(hs[0]))
                if named and s[hs[0]].strip():
                    self.rows.append((page, s[hs[0]], {up(h): s[h] for h in hs[1:]}))
                else:
                    self.rows.append((page, b.name, {up(h): v for h, v in s.items()}))
            for header, rows in tables(b.text or ""):
                for r in rows:
                    if r and r[0].strip():
                        self.rows.append((page, r[0], {up(h): c for h, c in zip(header[1:], r[1:])}))
            text = "\n".join([f"{k}: {v}." for k, v in b.labels.items()] + [b.text or ""])
            if text.strip():
                self.paras.append((page, b.name, text))
        self._sents = None

    def table(self, name, cols, field, kind=None):
        """{value: page} of the rows naming the item with a column for the field (the entry's own row, on its page
        with nothing in that column, gives nothing); for an item no augmentation, no augmentation's row (one printing
        Essence: the core rulebook's `Ultrasound sensor` implant for the sensor function `Ultrasound`)."""
        out = {}
        for page, row, cells in self.rows:
            if not names_item(row, name) or not _kind_row(kind, cells):
                continue
            for h in cols:
                v = cells.get(h)
                if v is not None and good(field, v):
                    out.setdefault(clean(v, field), page)
        return out

    def mentions(self, name):
        """[(page, sentence)] of every sentence naming the item (its whole name, words in order, or its plural), and
        of the paragraphs under a heading naming it."""
        if self._sents is None:
            self._sents = [(p, s, " " + norm(s) + " ", b) for p, b, t in self.paras for s in sentences(t)]
        n = " " + norm(name) + " "
        plural = n[:-1] + "s "
        return [(p, s) for p, s, ns, b in self._sents
                if len(n) > 4 and (n in ns or plural in ns or names_item(b, name) and norm(b) == norm(name))]


def _kind_row(kind, cells):
    """A row that can price an item of this kind: an augmentation's (printing Essence) only an augmentation or a weapon
    (an implant weapon's price is its implant's row)."""
    return kind in (None, "augmentations", "weapons") or not {"ESSENCE", "ESS"} & set(cells)


def same_row(index, headers, kind, entry, field, value):
    """{field: value} of the other columns of the one row that gave `value` for `field` (a row naming the item):
    the gaps it fills too. {} when several rows gave it."""
    cols = columns(headers, kind, field)
    rows = [cells for _, row, cells in index.rows if any(names_item(row, n) for n in [entry["name"], *entry.get("aliases", ())])
            and _kind_row(kind, cells) and any(clean(cells.get(h, ""), field) == value for h in cols)]
    if len(rows) != 1:
        return {}
    out = {}
    for h, v in rows[0].items():
        g = headers.get(kind, {}).get(h)
        if g and g != field and good(g, v) and g in ("capacity", "rating", "essence", "avail", "cost"):
            out[g] = clean(v, g)
    return out


def columns(headers, kind, field):
    """The printed headers (upper case) that hold the field for an entry of this kind: the kind's own plus any
    other kind's that map to the field and mean nothing else to this kind (a quality's COST is its Karma)."""
    own = {h for h, a in headers.get(kind, {}).items() if a == field}
    other = {h for k, cols in headers.items() for h, a in cols.items() if a == field and h not in headers.get(kind, {})}
    return own | other


def search_book(index, headers, kind, entry, field, own_text):
    """(value, how, page) for the field from the book's tables or text, or None. entry: {name, page, attrs}."""
    name = entry["name"]
    names = [name] + list(entry.get("aliases") or ())
    found = {}
    cols = columns(headers, kind, field)
    for n in names:
        for v, p in index.table(n, cols, field, kind=kind).items():
            found.setdefault(v, p)
    if len(found) == 1:
        v, p = next(iter(found.items()))
        return v, "table", p
    if found:
        return None  # tables disagree
    own = text_values(field, sentences(own_text))
    if len(own) == 1:
        return next(iter(own)), "text", entry["page"]
    if own:
        return None
    hits = [(p, s) for n in names for p, s in index.mentions(n)]
    vals = {}
    for p, s in hits:
        for v in text_values(field, [s]):
            vals.setdefault(v, p)
    if len(vals) == 1:
        v, p = next(iter(vals.items()))
        return v, "text", p
    return None
