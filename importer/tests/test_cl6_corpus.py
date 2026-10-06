"""The cl6check corpus and lineage (tools/cl6check/corpus.py, lineage.py) on invented data: made-up books, dates, names
and numbers. No book text, no Commlink6 data."""
import os
import shutil
import tempfile
import unittest

from tools.cl6check import corpus, lineage

MD = """<!-- page 3 -->
# GIZMOS
#### Hand gizmos
| ITEM | AVAIL | COST |
|---|---|---|
| Zorp widget | 2 | 100¥ |
| Blarg sprockets | 3(L) | 250¥ |
A Zorp widget hums.
<!-- page 4 -->
#### Zorp widget
Text about it.
"""

SOURCES = """<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="sources" version="1">
  <source id="GZA" published="2020-03"><name>Gizmo A</name></source>
  <source id="GZB" published="2022-07"><name>Gizmo B</name></source> <!-- month guessed -->
</sr6:data>
"""

CATALOG = """<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="gear" version="1">
  <gear id="{src}.zorp-widget" page="2" avail="{avail}" cost="100"><name>Zorp widget</name></gear>
</sr6:data>
"""


def book(label, date, md=MD, errata=False, entries=()):
    b = corpus.Book(label.lower(), f"{label}.pdf", label, [label.lower()], label.lower(), date, errata=errata)
    b._md["book.md"] = corpus.lines(md)
    b.entries = list(entries)
    return b


def entry(name, src="gza", **attrs):
    return {"src": src, "kind": "gear", "id": f"{src}.{name.lower()}", "name": name, "page": "2", "aliases": [],
            "attrs": attrs}


class LinesTest(unittest.TestCase):
    def test_pages_headings_and_table_rows(self):
        ls = corpus.lines(MD)
        row = next(ln for ln in ls if ln.text.startswith("| Blarg"))
        self.assertEqual((row.page, row.heading), (3, "Hand gizmos"))
        self.assertEqual(row.cells(), {"ITEM": "Blarg sprockets", "AVAIL": "3(L)", "COST": "250¥"})
        prose = next(ln for ln in ls if ln.text.startswith("A Zorp"))
        self.assertEqual(prose.cells(), {})
        self.assertEqual(next(ln for ln in ls if ln.text == "Text about it.").page, 4)


class CorpusTest(unittest.TestCase):
    def test_order_is_publication_then_errata_last(self):
        c = corpus.Corpus(sorted([book("B", "2021-01"), book("Err", "2020-03", errata=True), book("A", "2020-03")],
                                 key=lambda b: b.order))
        self.assertEqual([b.label for b in c.books], ["A", "Err", "B"])

    def test_entries_group_by_kind_and_loose_name(self):
        a = book("A", "2020-03", entries=[entry("Zorp Widgets", avail="2")])
        b = book("B", "2022-07", entries=[entry("zorp widget", src="gzb", avail="3"), entry("Other")])
        c = corpus.Corpus([a, b])
        self.assertEqual([(x.label, e["src"]) for x, e in c.entries({"gear"}, ["Zorp widget"])], [("A", "gza"), ("B", "gzb")])
        self.assertEqual(c.entries({"weapons"}, ["Zorp widget"]), [])

    def test_mentions_find_every_line_in_book_order(self):
        c = corpus.Corpus([book("A", "2020-03"), book("B", "2022-07")])
        hits = [(b.label, ln.no) for b, ln in c.mentions(["Blarg sprocket"])]
        self.assertEqual(hits, [("A", 7), ("B", 7)])
        self.assertEqual(len(c.mentions(["Zorp widget"])), 6)  # the row, the prose and the heading, in each book

    def test_load_dates_from_sources_and_extra(self):
        root = tempfile.mkdtemp()
        try:
            src = os.path.join(root, "sources.xml")
            open(src, "w", encoding="utf8").write(SOURCES)
            runs = os.path.join(root, "runs")
            for run, sid, avail in (("b", "GZB", "3"), ("a", "GZA", "2"), ("e", "", "")):
                lib = os.path.join(runs, run, "library", "sr6", "book1")
                os.makedirs(lib)
                pdf = "Gizmo-Errata-Feb-2020.pdf" if not sid else f"{run}.pdf"
                attrs = f'source="{sid}" recipe="none"' if sid else ""
                open(os.path.join(lib, "import.xml"), "w", encoding="utf8").write(
                    f'<import {attrs} file="{pdf}" sha256="00"><files/></import>')
                open(os.path.join(lib, "book.md"), "w", encoding="utf8").write(MD)
                if sid:
                    cat = os.path.join(runs, run, "custom", "sr6", "imported", sid.lower())
                    os.makedirs(cat)
                    open(os.path.join(cat, "gear.xml"), "w", encoding="utf8").write(
                        CATALOG.format(src=sid.lower(), avail=avail))
            extra = corpus.EXTRA
            corpus.EXTRA = [(r"Gizmo-Errata", "GZA errata", "GZA", "2020-03", False, True)]
            try:
                c = corpus.load(runs, src)
            finally:
                corpus.EXTRA = extra
            self.assertEqual([(b.label, b.date, b.guessed, b.errata) for b in c.books],
                             [("GZA", "2020-03", False, False), ("GZA errata", "2020-03", False, True),
                              ("GZB", "2022-07", True, False)])
            chains = lineage.lineage(lineage.observe(c, {"gear"}, ["Zorp widget"]))
            self.assertEqual([(o.book.label, o.value) for o in chains["avail"]],
                             [("GZA", "2"), ("GZA", "2"), ("GZA errata", "2"), ("GZB", "3"), ("GZB", "2")])
        finally:
            shutil.rmtree(root)


class LineageTest(unittest.TestCase):
    def test_winner_is_last_published(self):
        a, b = book("A", "2020-03"), book("B", "2022-07")
        obs = [lineage.Obs(b, "cost", "120", "x"), lineage.Obs(a, "cost", "100", "y")]
        chain = lineage.lineage(obs)["cost"]
        self.assertEqual([o.value for o in chain], ["100", "120"])
        self.assertEqual(lineage.winner(chain).value, "120")

    def test_row_cells_become_fields(self):
        a = book("A", "2020-03")
        row = next(ln for ln in a.md() if ln.text.startswith("| Zorp"))
        self.assertEqual({(o.field, o.value) for o in lineage.from_row(a, row)}, {("avail", "2"), ("cost", "100¥")})

    def test_same(self):
        self.assertTrue(lineage.same("1,000¥", "1000"))
        self.assertTrue(lineage.same("SA/BF", "sa/bf"))
        self.assertFalse(lineage.same("3(L)", "4(L)"))


if __name__ == "__main__":
    unittest.main()
