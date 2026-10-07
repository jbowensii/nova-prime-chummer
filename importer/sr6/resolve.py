"""Before the importer writes an issue it searches for the value in widening circles (the owner, phase 2C):

1. table: every table of the same book whose row names the item (its name, or a shorter printing of it: `Laser mic`
   for `Laser microphone`) and has a column for the field: a summary table, a gear list in another chapter, a
   comparison table, the implant table that prices an implant weapon;
2. text: a sentence of the same book that prints the field's value with its word (`ratings 1 to 6`, `Availability
   4`, `costs 500¥`): the item's own description first, then any sentence naming it;
3. corpus (corpus() below, after every import): every other source in the library, the latest published first:
   another book's entry of the same kind and name, a card deck's stat line, a class-price row (`Cyberprogram,
   hacking`, `Autosoft`) for the class an entry names.

A value found is written to the entry's attribute with a `<found field how source page/>` child saying where; only
when every circle fails is the issue written, with `searched="book"` (and `book,corpus` once the corpus pass has
looked too). Book values are canon: a found value is a printed one, never a guess. Several different values found in
one circle is no value (the issue stays).

Errata (corpus()): an errata PDF's statements correct its own book's entries when the errata is newer than the
printing (the owner: the version published last wins): `p. 12: Glimmer Pistol's DV is 5S(e)`, `Rating 3 Ziplenses /
Zipears: Essence 0.3, … Availability 4`, a bulleted `Name: Availability N` under a heading naming a page. The
replaced value is kept in a `<found how="errata">` child's text.

Nothing here names an item: the readers are the books' column headers and value words."""
import os
import re
import unicodedata
from datetime import date

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
    if r == n:
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


def _clean(v, field):
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
                    out.add(_clean(g[0], field))
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

    def table(self, name, cols, field, skip_page=None):
        """{value: page} of the rows naming the item with a column for the field (the entry's own row, on its page
        with nothing in that column, gives nothing)."""
        out = {}
        for page, row, cells in self.rows:
            if not names_item(row, name):
                continue
            for h in cols:
                v = cells.get(h)
                if v is not None and good(field, v):
                    out.setdefault(_clean(v, field), page)
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


def same_row(index, headers, kind, entry, field, value):
    """{field: value} of the other columns of the one row that gave `value` for `field` (a row naming the item):
    the gaps it fills too. {} when several rows gave it."""
    cols = columns(headers, kind, field)
    rows = [cells for _, row, cells in index.rows if any(names_item(row, n) for n in [entry["name"], *entry.get("aliases", ())])
            and any(_clean(cells.get(h, ""), field) == value for h in cols)]
    if len(rows) != 1:
        return {}
    out = {}
    for h, v in rows[0].items():
        g = headers.get(kind, {}).get(h)
        if g and g != field and good(g, v) and g in ("capacity", "rating", "essence", "avail", "cost"):
            out[g] = _clean(v, g)
    return out


def columns(headers, kind, field):
    """The printed headers (upper case) that hold the field for an entry of this kind: the kind's own, else any
    kind's that map to the field and mean nothing else to this kind (a quality's COST is its Karma)."""
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
        for v, p in index.table(n, cols, field).items():
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


# --- the corpus (circle 3) and the errata ---------------------------------------------------------------------

_PDFDATE = re.compile(r"(?:D:)?((?:19|20)\d\d)(\d\d)(\d\d)")
_COPYRIGHT = re.compile(r"©\s*((?:19|20)\d\d)")


def pdf_date(pdf, md_text=""):
    """A PDF's own date (YYYY-MM-DD): its metadata modification date, else its creation date, each only when it falls
    in the year its © line prints or the year after (a later date is a re-save); '' when there is none."""
    if not os.path.exists(pdf):
        return ""
    try:
        import pdfplumber
        with pdfplumber.open(pdf) as d:
            meta = d.metadata or {}
    except Exception:  # noqa: BLE001 (an unreadable PDF has no date)
        return ""
    years = [int(y) for y in _COPYRIGHT.findall(md_text[:20000])]
    for k in ("ModDate", "CreationDate"):
        m = _PDFDATE.match(str(meta.get(k) or ""))
        if m and (not years or int(m.group(1)) in (max(years), max(years) + 1)):
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return ""


ERRATA_FIELDS = {"availability": "avail", "avail": "avail", "cost": "cost", "price": "cost", "dv": "dv", "damage": "dv",
                 "ammo": "ammo", "essence": "essence", "capacity": "capacity", "modes": "modes", "mode": "modes",
                 "ar": "ar", "attack ratings": "ar", "attack rating": "ar", "ar stats": "ar"}
_BANDS = ("close", "near", "medium", "far", "extreme")
_EFIELD = "|".join(sorted((re.escape(k) for k in ERRATA_FIELDS), key=len, reverse=True))
_BOLD = re.compile(r"\*\*(.+?)\*\*")
# `p. 12: Glimmer Pistol's DV is **5S(e)**`, `p. 14: Wobble Gun has ammo **8(cy)**`, `… Near AR is changed from 18 to **8**`
_PAGE_STMT = re.compile(r"^\W*p\.\s*(\d+)\s*[:,]\s*(.+?)(?:['’]s?\s+(?:(" + "|".join(_BANDS) + r")\s+)?(" + _EFIELD +
                        r")\s+(?:is|are)\s+(?:changed\s+from\s+\S+\s+to\s+)?|\s+has\s+(?:(" + "|".join(_BANDS) + r")\s+)?("
                        + _EFIELD + r")\s+)(.+?)\s*\.?\s*$", re.I)
# a bulleted `Name: Availability 2` (`Rating 3 Ziplenses / Zipears: Essence 0.3, Availability 4, Cost 9,000¥ / 8,500¥`)
_BULLET = re.compile(r"^\s*[●•*-]\s*(.+?):\s*(.+)$")
_PAIR = re.compile(r"(?:adds\s+)?(\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?(?:\s*/\s*\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?)*)\s+("
                   + _EFIELD + r")\b|\b(" + _EFIELD + r")\s+(\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?(?:\s*/\s*\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?)*)", re.I)
_GROUP_PAGE = re.compile(r"^(.*?)\s+p\.\s*(\d+)\s*$", re.I)
_CHANGE_COST = re.compile(r"\bchange\s+the\s+(cost|availability|price)\s+to\s+([\d,]+\s*¥?|\d+\s*\(?[LIF]?\)?)", re.I)
_HEAD_ITEM = re.compile(r"^#+\s*p\.\s*(\d+)\s*,\s*(.+)$", re.I)


def _subjects(s):
    """`Rating 3 Ziplenses / Zipears` -> ['Rating 3 Ziplenses', 'Rating 3 Zipears'] (the parts after the first
    share its leading words); `A` -> ['A']."""
    parts = [p.strip() for p in s.split("/") if p.strip()]
    if len(parts) < 2:
        return parts
    lead = parts[0].split()[:-1]
    return [parts[0]] + [p if len(p.split()) > 1 else " ".join(lead + [p]) for p in parts[1:]]


def _errata_value(field, v):
    v = _BOLD.sub(r"\1", v).strip().rstrip(".,;").strip()
    if field == "cost":
        v = re.sub(r"(?<=\d),(?=\d{3})", "", v).replace("¥", "").strip()
    return " ".join(v.split())


def errata(md):
    """The value statements of an errata's converted text: [(page or None, subject, field, value, band or None)].
    Rules and renames are left out (a person reads those)."""
    out, group_page, head = [], None, None
    for raw in (md or "").splitlines():
        ln = raw.strip()
        if not ln or ln.startswith("<!--"):
            continue
        if m := _HEAD_ITEM.match(ln):  # `#### p. 30, Rifles table, Bonk M9`
            head = (int(m.group(1)), m.group(2).split(",")[-1].strip())
            continue
        if ln.startswith("#"):
            head = None
            continue
        if m := _PAGE_STMT.match(_BOLD.sub(r"\1", ln) if "**" not in ln else ln):
            page, subj = int(m.group(1)), _BOLD.sub(r"\1", m.group(2)).strip()
            band, word = (m.group(3), m.group(4)) if m.group(4) else (m.group(5), m.group(6))
            f = ERRATA_FIELDS[word.lower()]
            val = _errata_value(f, m.group(7))
            if val and not re.search(r"\b(?:renamed|gains|loses|no independent)\b", ln, re.I):
                out.append((page, subj, f, val, band.lower() if band else None))
            continue
        if m := _GROUP_PAGE.match(_BOLD.sub(r"\1", ln)):  # `Spin Tops p. 20`
            group_page = int(m.group(2))
            continue
        if m := _BULLET.match(ln):
            subj, rest = _BOLD.sub(r"\1", m.group(1)), m.group(2)
            names = _subjects(subj)
            for pm in _PAIR.finditer(rest):
                val, word = (pm.group(1), pm.group(2)) if pm.group(2) else (pm.group(4), pm.group(3))
                f = ERRATA_FIELDS[word.lower()]
                vals = [x.strip() for x in val.split("/")] if "/" in val and len(names) > 1 else [val] * len(names)
                if re.match(r"\s*adds\b", rest[max(0, pm.start() - 1):pm.start() + 5], re.I) or rest.lower().startswith("adds"):
                    vals = ["+" + v.lstrip("+") for v in vals]
                for n, v in zip(names, vals):
                    out.append((group_page, n, f, _errata_value(f, v), None))
            continue
        if head and (m := _CHANGE_COST.search(ln)):  # `Change … the cost to N¥.` under a heading naming the item
            f = ERRATA_FIELDS[m.group(1).lower()]
            out.append((head[0], head[1], f, _errata_value(f, m.group(2)), None))
    return out


def _words(s):
    return set(norm(s).split())


def errata_targets(entries, page, subject):
    """The entries a statement names: the same name, else the entry whose name holds every word of the subject (on
    the statement's page when it gives one: `Hardened` among the spin tops of p. 20). One only, else none."""
    sw = _words(subject)
    flat = norm(subject).replace(" ", "")
    same = [e for e in entries if norm(e["name"]) == norm(subject)]
    if not same:  # `Glo-Cam` for `GloCam (1-12)`: the words run together, a range or note after
        same = [e for e in entries if norm(re.sub(r"\s*\([^()]*\)\s*$", "", e["name"])).replace(" ", "") == flat]
    if not same:
        same = [e for e in entries if sw and sw <= _words(e["name"])]
    if page is not None and len(same) > 1:
        same = [e for e in same if e["page"] == page] or [e for e in same if abs(e["page"] - page) <= 1] or same
    return same if len(same) == 1 else []


def patch_band(ar, band, value):
    """An attack-rating string with one band (close … extreme) replaced: `1/19/11/9/6`, near, 9 -> `1/9/11/9/6`."""
    parts = (ar or "").split("/")
    i = _BANDS.index(band)
    if len(parts) != 5:
        return None
    parts[i] = value
    return "/".join(parts)


# --- the corpus pass -------------------------------------------------------------------------------------------

CARD_FIELDS = {"dv": "dv", "mode": "modes", "modes": "modes", "ammo": "ammo", "availability": "avail", "avail": "avail",
               "cost": "cost"}
_CARD_LABEL = re.compile(r"\*\*([A-Za-z ]+):\*\*\s*(.*?)(?=\s*\*\*[A-Za-z ]+:\*\*|$)")
# the class a priced row names for every item of that class (`Cyberprogram, hacking`, `Autosoft`): kind -> (the row's
# name, from the entry's type; the words its category must hold, when the name is the bare type: `Autosoft` in the
# Software table, not a `Basic` subscription tier in another book) (the game's own words)
CLASS_ROWS = {"programs": (("cyberprogram {type}", None), ("{type}", re.compile(r"(?i)soft|program")))}
PRICED_AS = {"e-soft": "autosoft"}  # a class the game prices as another (Double Clutch: e-softs as autosofts)
FIXABLE = ("missing", "unreadable")  # (an ambiguous field is the book's own two values, or a rule)


class _Book:
    def __init__(self, book_dir, custom_dir, sources):
        from importer import xmlio
        self.dir, self.custom = book_dir, custom_dir
        imp = xmlio.read_import(book_dir)
        st = os.path.join(book_dir, "status.xml")
        self.state = xmlio.read_state(book_dir)
        self.why = (xmlio.ET.parse(st).getroot().text or "") if os.path.exists(st) else ""
        get = (lambda k: imp.get(k) or "") if imp is not None else (lambda k: "")
        self.src, self.extra = get("source").lower(), get("extra").lower().split()
        self.name, self.file = get("name"), get("file")
        self._md, self._md_path = None, os.path.join(book_dir, "book.md")
        self.date = pdf_date(os.path.join(book_dir, "original.pdf"), self.md[:20000]) or sources.get(self.src.upper(), "")

    @property
    def md(self):
        if self._md is None:
            self._md = ""
            if os.path.exists(self._md_path):
                with open(self._md_path, encoding="utf8") as f:
                    self._md = f.read()
        return self._md


def _tail(name):
    """A source's distinctive title, letters only: `Shadowrun: Firing Squad` -> `firingsquad`."""
    t = re.sub(r"(?i)^\s*shadowrun\W*(?:sixth\s+world\W*)?", "", name or "")
    return re.sub(r"[^a-z0-9]", "", t.lower())


def cards(md):
    """A card deck's stat lines: {norm name: {field: value}} (`## zorp predator X` over `**Availability:** 2(L)
    **Cost:** 750¥`)."""
    out, name = {}, None
    for ln in (md or "").splitlines():
        if m := re.match(r"^#{1,3}\s+(.+)$", ln):
            name = norm(m.group(1))
            continue
        if name and "**" in ln:
            for lm in _CARD_LABEL.finditer(ln):
                f = CARD_FIELDS.get(lm.group(1).strip().lower())
                if f and lm.group(2).strip():
                    out.setdefault(name, {}).setdefault(f, _clean(lm.group(2), f))
    return out


def _sources_dates():
    from importer import DATA_DIR, xmlio
    p = os.path.join(DATA_DIR, "sr6", "sources.xml")
    if not os.path.exists(p):
        return {}
    return {s.get("id"): s.get("published") or "" for s in xmlio.ET.parse(p).getroot() if s.get("id")}


def _kids(el, tag):
    return [k for k in el if isinstance(k.tag, str) and k.tag == tag]


def _add_kid(el, tag, attrs, text=None):
    from lxml import etree
    k = etree.Element(tag, {a: str(v) for a, v in attrs.items() if v not in (None, "")})
    k.text = text or None
    t = _kids(el, "text")
    if t:
        t[0].addprevious(k)
    else:
        el.append(k)
    return k


def _formula_of(el, f):
    return next((x for x in _kids(el, "formula") if x.get("field") == f), None)


def _apply_errata(bs, entries, changed, n):
    """Each errata statement on its own book's entries, when the errata is newer than the printing."""
    for eb in bs:
        if eb.state != "skipped" or "errata" not in eb.why.lower():
            continue
        hay = re.sub(r"[^a-z0-9]", "", (eb.file + " " + eb.md[:400]).lower())
        targets = [b for b in bs if b.state == "done" and b.src and _tail(b.name) and _tail(b.name) in hay]
        if not targets:
            continue
        best = max(len(_tail(b.name)) for b in targets)
        stmts = errata(eb.md)
        for tb in [b for b in targets if len(_tail(b.name)) == best]:
            if not eb.date or not tb.date or eb.date <= tb.date:
                continue  # a printing newer than the errata carries its own values
            ents = [{"name": el.findtext("name") or "", "page": int(el.get("page") or 0), "el": el, "path": path}
                    for b, src, kind, el, path in entries if b is tb and src == tb.src and kind != "rules"]
            for page, subj, field, value, band in stmts:
                hit = errata_targets([e for e in ents if e["el"].get(field) is not None
                                      or any(i.get("field") == field for i in _kids(e["el"], "issue"))], page, subj)
                if not hit:
                    continue
                el, path = hit[0]["el"], hit[0]["path"]
                old = el.get(field)
                new = patch_band(old, band, value) if band else value
                if new is None or new == old:
                    continue
                el.set(field, new)
                for x in [x for x in _kids(el, "issue") + _kids(el, "formula") if x.get("field") == field]:
                    el.remove(x)
                _add_kid(el, "found", {"field": field, "how": "errata", "source": tb.src.upper(), "page": page}, old)
                changed.add(path)
                n["errata"] += 1


def corpus(books, sources=None, apply_errata=True):
    """The third circle and the errata, over a library: books [(book_dir, custom_dir)] (on the server every book's
    custom_dir is the same one; a measurement's runs each have their own). Each loaded book's catalog files
    (custom/imported/<source>/*.xml) are read and rewritten in place. Returns counts {corpus, errata, searched}."""
    from lxml import etree
    from importer import xmlio
    dates = sources if sources is not None else _sources_dates()
    bs = [_Book(d, c, dates) for d, c in books]
    files, seen = [], set()  # (book, source, kind, path, tree)
    for b in bs:
        if b.state != "done" or not b.src:
            continue
        for src in [b.src, *b.extra]:
            d = os.path.join(b.custom, "imported", src)
            if not os.path.isdir(d) or os.path.realpath(d) in seen:
                continue
            seen.add(os.path.realpath(d))
            for f in sorted(os.listdir(d)):
                if f.endswith(".xml"):
                    tree = etree.parse(os.path.join(d, f))
                    files.append((b, src, tree.getroot().get("kind"), os.path.join(d, f), tree))
    entries, by_name = [], {}  # (book, source, kind, element, file); (kind, norm name) -> [(book, source, element)]
    for b, src, kind, path, tree in files:
        for el in tree.getroot():
            if isinstance(el.tag, str) and el.get("id") is not None:
                entries.append((b, src, kind, el, path))
                for n in dict.fromkeys([el.findtext("name") or ""] + [a.text or "" for a in _kids(el, "alias") if a.get("id") is None]):
                    by_name.setdefault((kind, norm(n)), []).append((b, src, el))
    changed, n = set(), {"corpus": 0, "errata": 0, "searched": 0}
    if apply_errata:
        _apply_errata(bs, entries, changed, n)
    deck_cards = [(b, cards(b.md)) for b in bs if b.state == "skipped" and "card" in b.why.lower()]

    def offer(cands, ob, osrc, oel, f):
        v = oel.get(f)
        if v and good(f, v) and f not in {i.get("field") for i in _kids(oel, "issue")}:
            cands.append((ob.date or "", v, osrc.upper(), oel.get("page"), _formula_of(oel, f)))

    for b, src, kind, el, path in entries:
        todo = _kids(el, "issue")
        name = norm(el.findtext("name") or "")
        if todo:
            changed.add(path)
        for iss in todo:
            f, cands = iss.get("field"), []  # (date, value, source, page, formula)
            for ob, osrc, oel in by_name.get((kind, name), ()):
                if not (ob is b and osrc == src):
                    offer(cands, ob, osrc, oel, f)
            for cb, cs in deck_cards:
                v = cs.get(name, {}).get(f)
                if v and good(f, v):
                    cands.append((cb.date or "", v, None, None, None))
            if el.get("type"):
                for pat, cat in CLASS_ROWS.get(kind, ()):
                    t = PRICED_AS.get(el.get("type"), el.get("type"))
                    for ob, osrc, oel in by_name.get(("gear", norm(pat.format(type=t))), ()):
                        if cat is None or cat.search(oel.get("category") or ""):
                            offer(cands, ob, osrc, oel, f)
            if iss.get("code") not in FIXABLE:  # the book prints two values or a rule: only a later source settles it
                cands = [c for c in cands if b.date and c[0] > b.date]
            latest = max((c[0] for c in cands), default=None)
            top = {c[1] for c in cands if c[0] == latest}
            if not cands or len(top) > 1:  # nothing found, or sources of the same date disagree
                iss.set("searched", "book,corpus")
                n["searched"] += 1
                continue
            date, v, osrc, page, fx = next(c for c in cands if c[0] == latest)
            el.set(f, v)
            el.remove(iss)
            for x in [x for x in _kids(el, "formula") if x.get("field") == f]:
                el.remove(x)
            if fx is not None:
                _add_kid(el, "formula", dict(fx.attrib), fx.text)
            _add_kid(el, "found", {"field": f, "how": "corpus", "source": osrc, "page": page})
            n["corpus"] += 1
    for b, src, kind, path, tree in files:
        if path in changed:
            body = etree.tostring(tree, encoding="unicode")
            xmlio.write_file(path, xmlio.HEAD + body + ("" if body.endswith("\n") else "\n"))
    return n


def library(library_dir, custom_dir):
    """corpus() over a server library: every book folder under library_dir, with its one custom_dir."""
    books = [(os.path.join(library_dir, d), custom_dir) for d in sorted(os.listdir(library_dir))
             if os.path.isdir(os.path.join(library_dir, d))]
    return corpus(books)
