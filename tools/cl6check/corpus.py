"""Our book data as one corpus, ordered by publication date (the owner's rule: the version published last wins).

`load(runs, sources_xml)` reads a folder of `python -m importer sr6 check` runs, one per PDF (every SR6 PDF: each core
rulebook printing, the errata, the card decks and handouts the importer skips). Each run is a Book: its PDF, the
sources it imported, its date, its converted book.md and regrouped.md as Lines (PDF page, heading, heading level, table
header), and its catalog entries (ours.py).

The date is the PDF's own (the owner: "use the dates in the pdf"): its metadata modification date, else its creation
date, each taken only when it falls in the year the book prints in its © line or the year after (a later date is a
re-save, not the book); else the © year with sources.xml's month when they agree on the year; else sources.xml's
month. `Book.how` says which, and `disagreements()` lists the books whose PDF date and sources.xml month differ. Books
sort by date, then label; the Beginner Box PDFs are context only (their quick-start stats never win a lineage).

`Corpus.entries(kinds, names)` groups an object across every book: the catalog entries of those kinds printed under
one of the names (match.n1, rows naming several 'A/B' split); `variants()` the entries printed under the name with a
qualifier (match.n2: a parenthetical, 'Rating 3'). `Corpus.mentions(names)` finds every line of every book that prints
one of the names, in book order, through a word index."""
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from tools.cl6check import match, ours

# PDFs that import no source of their own: (file-name pattern, label, source they belong to, errata, context)
EXTRA = [
    (r"Core-Rulebook-Errata-Aug-2019", "CRB errata Aug 2019", "CRB", True, False),
    (r"Core-Rulebook-Errata-Feb-2020", "CRB errata Feb 2020", "CRB", True, False),
    (r"Firing-Squad-Errata", "FS errata & FAQ", "FS", True, False),
    (r"No-Future-SR6-errata", "NF errata", "NF", True, False),
    (r"Character-Sheet", "Character sheet", "", False, False),
    (r"Gun Rack", "Gun Rack cards", "", False, False),
    (r"Rides-Vehicle Cards", "Rides cards", "", False, False),
    (r"Gamemaster's Screen", "GM Screen", "", False, False),
    (r"Metroplex Map", "Seattle map", "", False, False),
    (r"Adversary", "Adversary (fiction)", "", False, False),
    (r"Beginner Box", "Beginner Box", "BBR", False, True),
]
CONTEXT = re.compile(r"Beginner Box", re.I)  # quick-start material: listed, never the winner
PAGE = re.compile(r"<!-- page (\d+) -->")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
SEP = re.compile(r"^\|\s*:?-{2,}")
COPYRIGHT = re.compile(r"©\s*((?:19|20)\d\d)")
PDFDATE = re.compile(r"(?:D:)?((?:19|20)\d\d)(\d\d)(\d\d)")


@dataclass
class Line:
    no: int  # 1-based line number in its file
    page: int  # PDF page
    heading: str  # the last heading at or above this line
    text: str
    header: tuple = ()  # a table row's header cells
    level: int = 0  # this line's heading level (0: not a heading)

    def cells(self):
        """{header cell (upper): cell} of a table row, {} for any other line."""
        if not self.header or not self.text.startswith("|") or SEP.match(self.text):
            return {}
        cs = [c.strip() for c in self.text.strip().strip("|").split("|")]
        if cs and cs[0].startswith("*"):  # a footnote set as a row
            return {}
        return {h.upper(): c for h, c in zip(self.header, cs)}


def lines(text):
    """The Lines of a converted book (book.md or regrouped.md)."""
    out, page, heading, header, prev = [], 0, "", (), ""
    for no, t in enumerate(text.splitlines(), 1):
        if m := PAGE.search(t):
            page = int(m.group(1))
            continue
        level = 0
        if m := HEADING.match(t):
            heading, header, level = m.group(2).strip(), (), len(m.group(1))
        elif SEP.match(t) and prev.startswith("|"):
            header = tuple(c.strip() for c in prev.strip().strip("|").split("|"))
            out[-1].header = ()  # the header row is no row of values
        elif not t.startswith("|"):
            header = header if not t.strip() else ()
        out.append(Line(no, page, heading, t, header, level))
        prev = t
    return out


def section(ls, i):
    """The lines under heading ls[i], up to the next heading of its level or above."""
    lv, out = ls[i].level, []
    for ln in ls[i + 1:]:
        if ln.level and ln.level <= lv:
            break
        out.append(ln)
    return out


@dataclass
class Book:
    run: str
    pdf: str
    label: str
    sources: list  # the source ids it imported (lower), the first its main one; [] for a skipped PDF
    belongs: str  # the source it prints (its own, or the book an errata corrects)
    date: str  # YYYY-MM-DD, or YYYY-MM / YYYY when the PDF gives no day
    how: str = ""  # where the date comes from
    src_month: str = ""  # sources.xml's month for the book, for the disagreement list
    errata: bool = False
    context: bool = False  # quick-start material: its values never win
    offset: int = 0  # printed page = PDF page - offset
    dir: str = ""  # library/sr6/book1
    entries: list = field(default_factory=list)
    _md: dict = field(default_factory=dict)
    _index: dict = None

    @property
    def order(self):
        return self.date, self.label

    def md(self, which="book.md"):
        if which not in self._md:
            p = os.path.join(self.dir, which)
            self._md[which] = lines(Path(p).read_text(encoding="utf8")) if os.path.exists(p) else []
        return self._md[which]

    def index(self):
        """{word (match.words): [line index in book.md]}."""
        if self._index is None:
            self._index = {}
            for i, ln in enumerate(self.md()):
                for w in set(match.words(ln.text)):
                    self._index.setdefault(w, []).append(i)
        return self._index


def published(sources_xml):
    """{source id (upper): month} from sources.xml."""
    return {s.get("id"): s.get("published", "") for s in ET.parse(sources_xml).getroot()}


def pdf_meta(pdf):
    """(modification, creation) dates of a PDF's metadata as YYYY-MM-DD, '' when absent."""
    import pdfplumber
    try:
        with pdfplumber.open(pdf) as d:
            m = d.metadata or {}
    except Exception:  # noqa: BLE001 (a PDF the reader can't open has no date)
        return "", ""

    def day(v):
        x = PDFDATE.search(str(v or ""))
        return f"{x.group(1)}-{x.group(2)}-{x.group(3)}" if x else ""
    return day(m.get("ModDate")), day(m.get("CreationDate"))


def printed_year(ls):
    """The year of the book's first © line, or None."""
    return next((int(m.group(1)) for ln in ls if (m := COPYRIGHT.search(ln.text))), None)


def resolve_date(mod, created, year, src_month):
    """(date, how) from the PDF's metadata dates, its © year and sources.xml's month (see the module doc)."""
    def ok(d):
        return d and (year is None or year <= int(d[:4]) <= year + 1)
    if ok(mod):
        return mod, "pdf modified"
    if ok(created):
        return created, "pdf created"
    if year and src_month.startswith(str(year)):
        return src_month, "© year, month from sources.xml"
    if year:
        return str(year), "© year"
    return src_month, "sources.xml" if src_month else "none"


def _printing(sha):
    """The core rulebook printing's City Edition source id (upper), '' for the 2019 printing, None for another PDF."""
    from importer.sr6.recipes import crb, crb_city
    if sha in crb_city.CITIES:
        return crb_city.CITIES[sha][0]
    return "" if sha in crb.SHA256 else None


def _offset(recipe):
    from importer.sr6.recipes import RECIPES
    mod = next((r for r in RECIPES if getattr(r, "__name__", "").rsplit(".", 1)[-1] == recipe), None)
    return getattr(mod, "PAGE_OFFSET", 0) if mod else 0


def book_of(run, run_dir, months, meta=pdf_meta):
    """The Book of one import run."""
    lib = os.path.join(run_dir, "library", "sr6", "book1")
    imp = ET.parse(os.path.join(lib, "import.xml")).getroot()
    pdf, sha = imp.get("file", ""), imp.get("sha256", "")
    src = (imp.get("source") or "").upper()
    extra = imp.get("extra")
    sources = [s.lower() for s in (src, *(extra.split() if extra else [])) if s]
    printing = _printing(sha)
    errata = context = False
    if printing is not None:
        key = printing or "CRB"
        label, belongs = f"CRB {key.split('-')[-1] if printing else '2019'} printing", "crb"
    elif src:
        key, label, belongs = src, src, src.lower()
    else:
        x = next((x for x in EXTRA if re.search(x[0], pdf, re.I)), None)
        key, label, belongs, errata, context = (x[2], x[1], x[2].lower(), x[3], x[4]) if x else ("", pdf, "", False, False)
    b = Book(run, pdf, label, sources, belongs, "", errata=errata, context=context or bool(CONTEXT.search(pdf)))
    b.dir = lib
    b.src_month = months.get(key, "") if src or printing is not None else ""
    mod, created = meta(os.path.join(lib, "original.pdf"))
    b.date, b.how = resolve_date(mod, created, printed_year(b.md()), b.src_month or months.get(key, ""))
    b.offset = _offset(imp.get("recipe", "")) if src else 0
    for s, source in ours.load(run_dir).items():
        for e in source.entries:
            e["book"] = b
        b.entries += source.entries
    return b


def _name_re(name):
    ws = match.words(name)
    if not ws:
        return None
    return re.compile(r"(?<![a-z0-9])" + r"[^a-z0-9]{1,3}".join(re.escape(w) + r"s?" for w in ws) + r"(?![a-z0-9])")


def norm_line(t):
    return t.casefold().replace("’", "'").replace("&", " and ")


def family(src):
    """A book's family: the core rulebook's printings and city chapters are one."""
    return "crb" if (src or "").startswith("crb") else (src or "")


def _keys(e, norm):
    return {norm(p) for n in [e["name"], *e["aliases"]] for p in match.split_names(n)} - {""}


@dataclass
class Corpus:
    books: list  # in publication order
    _by: dict = None

    def _lookup(self):
        if self._by is None:
            self._by = {"n1": {}, "n2": {}}
            for b in self.books:
                for e in b.entries:
                    for norm in ("n1", "n2"):
                        for k in _keys(e, getattr(match, norm)):
                            self._by[norm].setdefault(k, []).append((b, e))
        return self._by

    def _find(self, norm, kinds, names):
        by, keys, seen, out = self._lookup()[norm], {getattr(match, norm)(n) for n in names} - {""}, set(), []
        for k in sorted(keys):
            for b, e in by.get(k, ()):
                if e["kind"] in kinds and id(e) not in seen:
                    seen.add(id(e))
                    out.append((b, e))
        order = {id(b): i for i, b in enumerate(self.books)}
        return sorted(out, key=lambda x: order[id(x[0])])

    def entries(self, kinds, names, home=None):
        """[(book, entry)] in book order: every catalog entry of these kinds printed under one of these names (or under a
        row naming several: 'A/B'); when nothing prints them whole, the names without their parentheticals in the home
        book's printings. With `home` (the object's book, see family()), once the home book catalogues it, another
        book's entry counts only under the object's own name (not an alias of it: a short alias names other things in
        other books) and in a kind the home book gives it (a vehicle mod is not the cyberware of the same name)."""
        out = self._find("n1", kinds, names)
        if home is not None and names:  # another book matches on the object's own name, not on an alias of it
            first = {match.n1(p) for p in match.split_names(names[0])}
            out = [(b, e) for b, e in out if family(b.belongs) == home or first & _keys(e, match.n1)]
        if not out:
            out = [(b, e) for b, e in self._find("n2", kinds, names) if home is None or family(b.belongs) == home]
        if home is not None:
            own = {e["kind"] for b, e in out if family(b.belongs) == home}
            if own:
                out = [(b, e) for b, e in out if e["kind"] in own]
        return out

    def variants(self, kinds, names, home=None):
        """[(book, entry)]: the entries printed under one of the names with a qualifier, not in entries()."""
        exact = {id(e) for _, e in self.entries(kinds, names, home)}
        return [(b, e) for b, e in self._find("n2", kinds, names) if id(e) not in exact
                and (home is None or family(b.belongs) == home)]

    def mentions(self, names, which="book.md", books=None):
        """[(book, Line)] in book order: every line printing one of the names (words in order, plurals loose)."""
        pats = [(p, match.words(n)) for n in names if (p := _name_re(n))]
        out = []
        for b in (books or self.books):
            ls = b.md(which)
            if which != "book.md":
                out += [(b, ln) for ln in ls if any(p.search(norm_line(ln.text)) for p, _ in pats)]
                continue
            idx, hits = b.index(), set()
            for p, ws in pats:
                posting = [idx.get(w, []) for w in ws]
                if any(not x for x in posting):
                    continue
                cand = set(min(posting, key=len)).intersection(*posting)
                hits |= {i for i in cand if p.search(norm_line(ls[i].text))}
            out += [(b, ls[i]) for i in sorted(hits)]
        return out

    def disagreements(self):
        """[(book, pdf date, how, sources.xml month)] where the PDF's date and sources.xml's month differ."""
        return [(b, b.date, b.how, b.src_month) for b in self.books
                if b.src_month and b.how.startswith("pdf") and b.date[:7] != b.src_month]


def load(runs, sources_xml, meta=pdf_meta):
    months = published(sources_xml)
    books = [book_of(r, os.path.join(runs, r), months, meta) for r in sorted(os.listdir(runs))
             if os.path.exists(os.path.join(runs, r, "library", "sr6", "book1", "import.xml"))]
    return Corpus(sorted(books, key=lambda b: b.order))
