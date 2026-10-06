"""Our book data as one corpus, ordered by publication date (the owner's rule: the version published last wins).

`load(runs, sources_xml)` reads a folder of `python -m importer sr6 check` runs, one per PDF (every SR6 PDF: each core
rulebook printing, the errata, the card decks and handouts the importer skips). Each run is a Book: its PDF, the
sources it imported, its date, its converted book.md and regrouped.md as Lines (PDF page, heading, table header), and
its catalog entries (ours.py). The date is the sources.xml `published` month of the source the run imported; a core
rulebook printing takes its City Edition's month (crb.PRINTINGS / crb_city.CITIES fingerprints); a PDF that imports no
source takes its month from EXTRA. Errata sort after a book of the same month.

`Corpus.entries(kinds, names)` groups an object across every book: the catalog entries of those kinds whose name or
alias normalises (match.n2) to one of the names. `Corpus.mentions(names)` finds every line of every book that prints
one of the names, in book order."""
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

from tools.cl6check import match, ours

# PDFs that import no source of their own: (file-name pattern, label, source they belong to, month, guessed, errata)
# The months: the PDF's own creation date, else a best guess (guessed=True).
EXTRA = [
    (r"Core-Rulebook-Errata-Aug-2019", "CRB errata Aug 2019", "CRB", "2019-08", False, True),
    (r"Core-Rulebook-Errata-Feb-2020", "CRB errata Feb 2020", "CRB", "2020-02", False, True),
    (r"Firing-Squad-Errata", "FS errata & FAQ", "FS", "2023-10", True, True),  # PDF dated 2023-10-05; prints no date
    (r"No-Future-SR6-errata", "NF errata", "NF", "2023-10", True, True),  # PDF dated 2023-10-05; prints no date
    (r"Character-Sheet", "Character sheet", "", "2020-01", False, False),
    (r"Gun Rack", "Gun Rack cards", "", "2020-08", False, False),
    (r"Rides-Vehicle Cards", "Rides cards", "", "2021-06", True, False),
    (r"Gamemaster's Screen", "GM Screen", "", "2019-08", True, False),
    (r"Metroplex Map", "Seattle map", "", "2019-08", True, False),
    (r"Adversary", "Adversary (fiction)", "", "2019-08", True, False),
    (r"Beginner Box", "Beginner Box", "BBR", "", True, False),  # the box's month (BBR's)
]
PAGE = re.compile(r"<!-- page (\d+) -->")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
SEP = re.compile(r"^\|\s*:?-{2,}")


@dataclass
class Line:
    no: int  # 1-based line number in its file
    page: int  # PDF page
    heading: str
    text: str
    header: tuple = ()  # a table row's header cells

    def cells(self):
        """{header cell (upper): cell} of a table row, {} for any other line."""
        if not self.header or not self.text.startswith("|"):
            return {}
        cs = [c.strip() for c in self.text.strip().strip("|").split("|")]
        return {h.upper(): c for h, c in zip(self.header, cs)}


def lines(text):
    """The Lines of a converted book (book.md or regrouped.md)."""
    out, page, heading, header, prev = [], 0, "", (), ""
    for no, t in enumerate(text.splitlines(), 1):
        if m := PAGE.search(t):
            page = int(m.group(1))
            continue
        if m := HEADING.match(t):
            heading, header = m.group(2).strip(), ()
        elif SEP.match(t) and prev.startswith("|"):
            header = tuple(c.strip() for c in prev.strip().strip("|").split("|"))
        elif not t.startswith("|"):
            header = header if not t.strip() else ()
        out.append(Line(no, page, heading, t, header))
        prev = t
    return out


@dataclass
class Book:
    run: str
    pdf: str
    label: str
    sources: list  # the source ids it imported (lower), the first its main one; [] for a skipped PDF
    belongs: str  # the source it prints (its own, or the book an errata corrects)
    date: str  # YYYY-MM
    guessed: bool = False
    errata: bool = False
    offset: int = 0  # printed page = PDF page - offset
    dir: str = ""  # library/sr6/book1
    entries: list = field(default_factory=list)
    _md: dict = field(default_factory=dict)

    @property
    def order(self):
        return self.date, self.errata, self.label

    def md(self, which="book.md"):
        if which not in self._md:
            p = os.path.join(self.dir, which)
            self._md[which] = lines(open(p, encoding="utf8").read()) if os.path.exists(p) else []
        return self._md[which]


def published(sources_xml):
    """{source id (upper): (month, guessed)} from sources.xml."""
    root = ET.parse(sources_xml).getroot()
    text = open(sources_xml, encoding="utf8").read()
    out = {}
    for s in root:
        sid = s.get("id")
        line = next((ln for ln in text.splitlines() if f'id="{sid}"' in ln), "")
        out[sid] = (s.get("published", ""), "guessed" in line)
    return out


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


def book_of(run, run_dir, dates):
    """The Book of one import run."""
    lib = os.path.join(run_dir, "library", "sr6", "book1")
    imp = ET.parse(os.path.join(lib, "import.xml")).getroot()
    pdf, sha = imp.get("file", ""), imp.get("sha256", "")
    src = (imp.get("source") or "").upper()
    extra = imp.get("extra")
    sources = [s for s in (src, *(extra.split() if extra else [])) if s]
    printing = _printing(sha)
    if printing is not None:
        city = printing or "CRB"
        month, guessed = dates.get(city, ("", True))
        label = f"CRB {city.split('-')[-1] if printing else '2019'} printing"
        b = Book(run, pdf, label, [s.lower() for s in sources], "crb", month, guessed, False)
    elif src:
        month, guessed = dates.get(src, ("", True))
        b = Book(run, pdf, src, [s.lower() for s in sources], src.lower(), month, guessed, False)
    else:
        x = next((x for x in EXTRA if re.search(x[0], pdf, re.I)), None)
        if x is None:
            b = Book(run, pdf, pdf, [], "", "", True, False)
        else:
            _, label, belongs, month, guessed, errata = x
            if not month:
                month, guessed = dates.get(belongs, ("", True))[0], True
            b = Book(run, pdf, label, [], belongs.lower(), month, guessed, errata)
    b.offset = _offset(imp.get("recipe", "")) if src else 0
    b.dir = lib
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


@dataclass
class Corpus:
    books: list  # in publication order

    def entries(self, kinds, names):
        """[(book, entry)] in book order: every catalog entry of these kinds printed under one of these names (or under a
        row naming several: 'A/B')."""
        keys = {match.n2(n) for n in names} - {""}
        return [(b, e) for b in self.books for e in b.entries if e["kind"] in kinds and
                keys & {match.n2(p) for n in [e["name"], *e["aliases"]] for p in match.split_names(n)}]

    def mentions(self, names, which="book.md", books=None):
        """[(book, Line)] in book order: every line printing one of the names (words in order, plurals loose)."""
        pats = [p for p in map(_name_re, names) if p]
        return [(b, ln) for b in (books or self.books) for ln in b.md(which)
                if any(p.search(norm_line(ln.text)) for p in pats)]


def load(runs, sources_xml):
    dates = published(sources_xml)
    books = [book_of(r, os.path.join(runs, r), dates) for r in sorted(os.listdir(runs))
             if os.path.exists(os.path.join(runs, r, "library", "sr6", "book1", "import.xml"))]
    return Corpus(sorted(books, key=lambda b: b.order))
