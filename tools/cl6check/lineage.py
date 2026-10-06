"""Field lineage: which book printed which value of an object, and when; the winner is the value published last.

An observation is (book, field, value, where): a catalog entry's attribute (where: the entry's kind, id and page), or a
table row's cell (where: the file, line and heading). `observe()` collects them for one object from the corpus,
`lineage()` orders them by publication date per field, and `winner()` is the last-published value."""
from dataclasses import dataclass

from importer.sr6.recipes import crb
from tools.cl6check import ours

# a table's header cell -> our field name, over every kind (the core recipe's reading; the first kind naming it wins)
HEADER_FIELD = {}
for _kind in crb.HEADERS.values():
    for _h, _f in _kind.items():
        if _f and _f != "dv+":
            HEADER_FIELD.setdefault(_h, _f)
FIELDS = {"cost", "avail", "rating", "essence", "capacity", "dv", "ar", "modes", "ammo", "defense", "handling", "accel",
          "interval", "topSpeed", "body", "armor", "pilot", "sensor", "seats", "range", "type", "duration", "drain",
          "karma", "activation", "fade", "threshold", "action"}


@dataclass
class Obs:
    book: object  # corpus.Book
    field: str
    value: str
    where: str


def same(a, b):
    """Two printed values say the same: equal at rating 1 as numbers, else equal as text (spacing and case aside)."""
    va, vb = ours.value(a), ours.value(b)
    if va is not None and vb is not None:
        return va == vb
    return " ".join(a.split()).casefold() == " ".join(b.split()).casefold()


def from_entry(book, e):
    where = f"catalog {e['src']}/{e['kind']} id={e['id']} p.{e['page']}"
    return [Obs(book, f, v, where) for f, v in e["attrs"].items() if f in FIELDS and v not in (None, "")]


def from_row(book, ln, file="book.md"):
    out = []
    for h, v in ln.cells().items():
        f = HEADER_FIELD.get(h)
        if f and v:
            out.append(Obs(book, f, v, f"{file} L{ln.no} p.{ln.page} [{ln.heading}]"))
    return out


def observe(corpus, kinds, names):
    """Every observation of one object: its catalog entries' fields and the cells of every table row printing it."""
    out = [o for b, e in corpus.entries(kinds, names) for o in from_entry(b, e)]
    out += [o for b, ln in corpus.mentions(names) for o in from_row(b, ln)]
    return out


def lineage(obs):
    """{field: [Obs]} each in publication order (stable for a book printing a field twice)."""
    out = {}
    for o in sorted(obs, key=lambda o: o.book.order):
        out.setdefault(o.field, []).append(o)
    return out


def winner(chain):
    """The last-published observation of a field's chain."""
    return chain[-1] if chain else None
