"""The cl6check corpus, lineage and trace (tools/cl6check/corpus.py, lineage.py, trace.py) on invented data: made-up
books, dates, names and numbers. No book text, no Commlink6 data."""
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.cl6check import corpus, crops, lineage, trace


def put(path, text):
    Path(path).write_text(text, encoding="utf8")


MD = """<!-- page 3 -->
# GIZMOS
#### Hand gizmos
| ITEM | AVAIL | COST |
|---|---|---|
| Blarg sprockets | 1 | 75¥ |
| Zorp widget | 2 | 100¥ |
| *footnote | x | y |
A Zorp widget hums.
<!-- page 4 -->
#### Zorp widget
Text about it, Rating 1–4, 40¥ a month.
##### zorp widget
| TYPE | AVAIL | COST |
|---|---|---|
| Gizmo | 2 | 100¥ |
Mook [Gizmo, DV 9P, SA, 1/2/3/—/—] and Zorp widget [Gizmo, DV 2P, SS, 4/5/6/—/—, 7(c)]
"""

CARD = """<!-- page 1 -->
## zorp widget
#### gizmo
**DV:** 2P **Mode:** SS
**Rating:** 4/5/6/—/— **Ammo:** 7(c)
**Availability:** 3 **Cost:** 120¥
### CONTENTS
<!-- page 2 -->
#### stats
**HAND ACCEL SPD INT TOP SPD BOD ARM**
3 10 20 90 6 4
**PILOT SENS SEAT AVAIL COST**
2 2 4 2 9,000¥
# Blarg roller
"""

ERRATA = """<!-- page 1 -->
# GIZMO ERRATA
#### p. 3, Hand gizmos table, Zorp widget
Change the final Attack Rating (Extreme range) from 4 to 1 and change the cost to 2,100¥.
#### p. 4, Gizmos
p. 3: Zorp widget's Near AR is changed from 5 to **8.** p. 4: Blarg sprockets' Availability is **4(L)**
"""

SOURCES = """<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="sources" version="1">
  <source id="GZA" published="2020-03"><name>Gizmo A</name></source>
  <source id="GZB" published="2022-07"><name>Gizmo B</name></source>
</sr6:data>
"""

CATALOG = """<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="gear" version="1">
  <gear id="{src}.zorp-widget" page="2" avail="{avail}" cost="100"><name>Zorp widget</name></gear>
</sr6:data>
"""


def book(label, date, md=MD, entries=(), **kw):
    b = corpus.Book(label.lower(), f"{label}.pdf", label, [label.lower()], kw.pop("belongs", label.lower()), date, **kw)
    b._md["book.md"] = corpus.lines(md)
    b.entries = list(entries)
    for e in b.entries:
        e["book"] = b
    return b


def entry(name, src="gza", kind="gear", **attrs):
    return {"src": src, "kind": kind, "id": f"{src}.{name.lower()}", "name": name, "page": "2", "aliases": [],
            "attrs": attrs}


def chains(c, names, kinds=("weapons",)):
    return lineage.lineage(lineage.observe(c, set(kinds), names))


class LinesTest(unittest.TestCase):
    def test_pages_headings_and_table_rows(self):
        ls = corpus.lines(MD)
        row = next(ln for ln in ls if ln.text.startswith("| Blarg"))
        self.assertEqual((row.page, row.heading), (3, "Hand gizmos"))
        self.assertEqual(row.cells(), {"ITEM": "Blarg sprockets", "AVAIL": "1", "COST": "75¥"})
        for t in ("| ITEM", "|---", "| *footnote", "A Zorp"):
            self.assertEqual(next(ln for ln in ls if ln.text.startswith(t)).cells(), {}, t)
        head = next(i for i, ln in enumerate(ls) if ln.text == "#### Zorp widget")
        self.assertEqual(ls[head].level, 4)
        self.assertEqual([ln.text[:6] for ln in corpus.section(ls, head)][:2], ["Text a", "##### "])


class DateTest(unittest.TestCase):
    def test_the_pdfs_own_date(self):
        self.assertEqual(corpus.resolve_date("2021-09-13", "2021-09-01", 2021, "2021-08"), ("2021-09-13", "pdf modified"))
        # a re-save years later is not the book's date: the creation date, else the © year with sources' month
        self.assertEqual(corpus.resolve_date("2026-07-24", "2022-01-20", 2022, "2022-01"), ("2022-01-20", "pdf created"))
        self.assertEqual(corpus.resolve_date("2026-07-24", "", 2023, "2023-06"),
                         ("2023-06", "© year, month from sources.xml"))
        self.assertEqual(corpus.resolve_date("", "", 2021, ""), ("2021", "© year"))
        self.assertEqual(corpus.resolve_date("", "", None, "2025-01"), ("2025-01", "sources.xml"))
        self.assertEqual(corpus.resolve_date("2020-08-24", "", None, ""), ("2020-08-24", "pdf modified"))


class CorpusTest(unittest.TestCase):
    def test_order_is_by_day(self):
        c = corpus.Corpus(sorted([book("B", "2020-03-20"), book("Err", "2020-03-05", errata=True), book("A", "2020-03")],
                                 key=lambda b: b.order))
        self.assertEqual([b.label for b in c.books], ["A", "Err", "B"])

    def test_entries_and_variants(self):
        a = book("A", "2020-03", entries=[entry("Zorp Widgets", avail="2"), entry("Zorp widget (deluxe)", avail="5")])
        b = book("B", "2022-07", entries=[entry("zorp widget", src="gzb", avail="3"), entry("Other")])
        c = corpus.Corpus([a, b])
        self.assertEqual([(x.label, e["src"]) for x, e in c.entries({"gear"}, ["Zorp widget"])], [("A", "gza"), ("B", "gzb")])
        self.assertEqual([e["name"] for _, e in c.variants({"gear"}, ["Zorp widget"])], ["Zorp widget (deluxe)"])
        self.assertEqual(c.entries({"weapons"}, ["Zorp widget"]), [])

    def test_mentions_find_every_line_in_book_order(self):
        c = corpus.Corpus([book("A", "2020-03"), book("B", "2022-07")])
        self.assertEqual([(b.label, ln.no) for b, ln in c.mentions(["Blarg sprocket"])], [("A", 6), ("B", 6)])
        self.assertEqual(len(c.mentions(["Zorp widget"])), 10)

    def test_load_dates_and_disagreements(self):
        root = tempfile.mkdtemp()
        try:
            src = os.path.join(root, "sources.xml")
            put(src, SOURCES)
            runs = os.path.join(root, "runs")
            for run, sid in (("b", "GZB"), ("a", "GZA"), ("e", "")):
                lib = os.path.join(runs, run, "library", "sr6", "book1")
                os.makedirs(lib)
                pdf = "Gizmo-Errata.pdf" if not sid else f"{run}.pdf"
                attrs = f'source="{sid}" recipe="none"' if sid else ""
                put(os.path.join(lib, "import.xml"),
                    f'<import {attrs} file="{pdf}" sha256="00"><files/></import>')
                put(os.path.join(lib, "book.md"), MD)
                if sid:
                    cat = os.path.join(runs, run, "custom", "sr6", "imported", sid.lower())
                    os.makedirs(cat)
                    put(os.path.join(cat, "gear.xml"),
                        CATALOG.format(src=sid.lower(), avail="2" if run == "a" else "3"))
            meta = {"a": ("2020-03-15", ""), "b": ("", ""), "e": ("2020-04-01", "")}
            extra = corpus.EXTRA
            corpus.EXTRA = [(r"Gizmo-Errata", "GZA errata", "GZA", True, False)]
            try:
                c = corpus.load(runs, src, meta=lambda p: meta[p.split(os.sep)[-5]])
            finally:
                corpus.EXTRA = extra
            self.assertEqual([(b.label, b.date, b.how, b.errata) for b in c.books],
                             [("GZA", "2020-03-15", "pdf modified", False), ("GZA errata", "2020-04-01", "pdf modified", True),
                              ("GZB", "2022-07", "sources.xml", False)])
            self.assertEqual(c.disagreements(), [])
            c.books[0].src_month = "2020-02"
            self.assertEqual([b.label for b, *_ in c.disagreements()], ["GZA"])
        finally:
            shutil.rmtree(root)


class LineageTest(unittest.TestCase):
    def test_winner_is_last_published_never_context_or_variant(self):
        a, b, q = book("A", "2020-03"), book("B", "2022-07"), book("Q", "2023-01", context=True)
        obs = [lineage.Obs(q, "cost", "1", "q", "card", True), lineage.Obs(b, "cost", "120", "x"),
               lineage.Obs(b, "cost", "130", "v", variant="deluxe"), lineage.Obs(a, "cost", "100", "y")]
        chain = lineage.lineage(obs)["cost"]
        self.assertEqual([o.value for o in chain], ["100", "120", "130", "1"])
        self.assertEqual(lineage.winner(chain).value, "120")

    def test_rows_blocks_and_npc_lines(self):
        c = corpus.Corpus([book("A", "2020-03")])
        ch = chains(c, ["Zorp widget"])
        self.assertEqual([(o.kind, o.value) for o in ch["cost"]], [("row", "100¥"), ("block", "100¥")])
        self.assertEqual([(o.kind, o.value, o.context) for o in ch["dv"]], [("bracket", "2P", True)])
        self.assertEqual(ch["ar"][0].value, "4/5/6/—/—")
        self.assertIsNone(lineage.winner(ch["dv"]))

    def test_cards(self):
        c = corpus.Corpus([book("A", "2020-03"), book("Cards", "2020-08", CARD, belongs="")])
        ch = chains(c, ["Zorp widget"])
        w = {f: lineage.winner(ch[f]).value for f in ("dv", "modes", "ar", "ammo", "avail", "cost")}
        self.assertEqual(w, {"dv": "2P", "modes": "SS", "ar": "4/5/6/—/—", "ammo": "7(c)", "avail": "3", "cost": "120¥"})
        v = chains(c, ["Blarg roller"], ("vehicles",))
        self.assertEqual({f: v[f][0].value for f in ("handling", "topSpeed", "seats", "cost")},
                         {"handling": "3", "topSpeed": "90", "seats": "4", "cost": "9,000¥"})

    def test_errata_sentences(self):
        c = corpus.Corpus([book("A", "2020-03", CARD.replace("## zorp", "## zorp widget\n").split("<!-- page 2")[0]),
                           book("Err1", "2020-05", ERRATA, errata=True, belongs="a")])
        ch = chains(c, ["Zorp widget"])
        self.assertEqual([(o.book.label, o.value) for o in ch["ar"]],
                         [("A", "4/5/6/—/—"), ("Err1", "4/5/6/—/1"), ("Err1", "4/8/6/—/1")])
        self.assertEqual(lineage.winner(ch["ar"]).value, "4/8/6/—/1")
        self.assertEqual(lineage.winner(ch["cost"]).value, "2,100¥")
        self.assertEqual(lineage.winner(chains(c, ["Blarg sprockets"])["avail"]).value, "4(L)")


class TraceTest(unittest.TestCase):
    def rec(self, **fields):
        return {"book": "a", "src": "a", "file": "gear", "tag": "item", "id": "zorp", "name": "Zorp widget", "page": "3",
                "kind": "gear", "modelled": True, "pool": ("gear",), "aliases": [], "fields": fields, "families": {}}

    def test_the_row_above_is_a_misread(self):
        c = corpus.Corpus([book("A", "2020-03", entries=[entry("Zorp widget", src="a", avail="2", cost="100")])])
        rows, n = trace.run(c, [self.rec(cost={None: 75.0}, avail={None: (1, "")})])
        self.assertEqual({(r["field"], r["family"]) for r in rows}, {("cost", "Commlink6 misread"), ("avail", "Commlink6 misread")})
        self.assertIn("row above", rows[0]["where"])
        self.assertEqual(n["fields compared"], 2)

    def test_families_found_and_not_found(self):
        c = corpus.Corpus([book("A", "2020-03", entries=[entry("Zorp widget", src="a", avail="2", cost="100")])])
        rows, _ = trace.run(c, [self.rec(cost={None: 40.0}, rating=(1, 4))])
        self.assertEqual({r["field"]: r["family"] for r in rows}, {"cost": "description sentence", "rating": "description sentence"})
        rows, _ = trace.run(c, [self.rec(cost={None: 999.0})])
        self.assertEqual(rows[0]["family"], "not found")
        rows, _ = trace.run(c, [self.rec(cost={None: 1000.0})])
        self.assertEqual(rows[0]["family"], "not found")  # 100 → 1000 is no swap
        self.assertTrue(trace._swapped("1500", "5100"))
        self.assertFalse(trace._swapped("1500", "1500"))

    def test_commlink6_only_records_and_fields_are_counted_apart(self):
        c = corpus.Corpus([book("A", "2020-03", md="# Gear\n\nNothing here.\n", entries=[entry("Zorp widget", src="a", cost="100")])])
        rows, n = trace.run(c, [self.rec(cost={None: 100.0}, avail={None: (7, "")}), self.rec() | {"cl6only": True}])
        self.assertEqual({r["family"] for r in rows}, {"Commlink6-only field", "Commlink6-only record"})
        self.assertEqual((n["records"], n["Commlink6-only records"], n["objects"]), (2, 1, 1))
        self.assertEqual((n["fields compared"], n["fields equal"], n["Commlink6-only fields"], n["records exact"]), (1, 1, 1, 1))


class MoreTest(unittest.TestCase):
    def test_a_reprint_keeps_its_first_date(self):
        # family A prints 100 in 2019 and again in 2025; book B prints 120 in 2022: B's is the version published last
        a19 = book("A19", "2019-08", belongs="a")
        a25 = book("A25", "2025-03", belongs="a")
        b22 = book("B22", "2022-05", belongs="b")
        chain = lineage.lineage([lineage.Obs(a19, "cost", "100", "x"), lineage.Obs(b22, "cost", "120", "y"),
                                 lineage.Obs(a25, "cost", "100¥", "z")])["cost"]
        self.assertEqual(lineage.winner(chain).book.label, "B22")
        chain.append(lineage.Obs(book("A26", "2026-01", belongs="a"), "cost", "90", "w"))
        self.assertEqual(lineage.winner(chain).value, "90")

    def test_a_card_stops_at_its_second_configuration(self):
        card = CARD.replace("### CONTENTS", "#### shotgun\n**DV:** 9P **Mode:** SA\n### CONTENTS")
        c = corpus.Corpus([book("Cards", "2020-08", card, belongs="")])
        self.assertEqual([o.value for o in chains(c, ["Zorp widget"])["dv"]], ["2P"])

    def test_an_errata_qualifier_is_a_variant(self):
        err = "<!-- page 1 -->\n#### Gizmos\n● Rating 7 Zorp widget: Cost 9,000¥\n● Zorp widget: Availability 5\n"
        c = corpus.Corpus([book("A", "2020-03"), book("Err", "2020-05", err, errata=True, belongs="a")])
        ch = chains(c, ["Zorp widget"])
        self.assertEqual([(o.value, o.variant) for o in ch["cost"] if o.kind == "errata"], [("9,000¥", "Rating 7")])
        self.assertEqual(lineage.winner(ch["avail"]).value, "5")
        self.assertEqual(lineage.winner(ch["cost"]).value, "100¥")

    def test_matches_with_a_note_and_per_rating(self):
        rec = TraceTest.rec(None, cost={None: 1900.0})
        self.assertEqual(trace._matches(rec, "gear", "cost", "1900", "cost"), "exact")
        self.assertEqual(trace._matches(rec, "gear", "cost", "1900 each", "cost"), "with a note")
        self.assertEqual(trace._matches(rec, "gear", "cost", "1.900", "cost"), "with a note")
        self.assertIsNone(trace._matches(rec, "gear", "cost", "1800", "cost"))
        a = book("A", "2020-03", belongs="a")
        obs = [lineage.Obs(a, "cost", v, f"catalog a/gear id=a.zorp-rating-{r} p.1", label=f"Zorp Rating {r}")
               for r, v in ((1, "100"), (2, "200"), (3, "300"))]
        per = TraceTest.rec(None, cost={1: 100.0, 2: 200.0, 3: 300.0})
        self.assertEqual(len(trace._per_rating(per, "cost", obs, "a")), 3)
        obs[1].value = "250"
        self.assertEqual(trace._per_rating(per, "cost", obs, "a"), [])


class StepThreeTest(unittest.TestCase):
    def test_a_section_default_applies_but_never_beats_the_items_own_value(self):
        md = ("<!-- page 1 -->\n## Gizmos\nAll of these gizmos have Availability 4(L) unless noted.\n#### Zorp widget\n"
              "| TYPE | COST |\n|---|---|\n| Gizmo | 100¥ |\n#### Blarg roller\n| TYPE | AVAIL | COST |\n|---|---|---|\n"
              "| Gizmo | 2 | 50¥ |\n")
        c = corpus.Corpus([book("A", "2020-03", md)])
        zorp = chains(c, ["Zorp widget"], ("gear",))
        self.assertEqual((lineage.winner(zorp["avail"]).kind, lineage.winner(zorp["avail"]).value), ("section", "4(L)"))
        self.assertEqual(lineage.winner(chains(c, ["Blarg roller"], ("gear",))["avail"]).value, "2")

    def test_a_footnote_and_a_later_part_are_not_the_items_rows(self):
        md = ("<!-- page 1 -->\n#### Zorp widget\n##### zorp staff\n| TYPE | DV |\n|---|---|\n| Club | 4S/4P* |\n"
              "| †Maximum range | is 8 |\n##### detachable blade\n| TYPE | DV |\n|---|---|\n| Blade | 2P |\n")
        ch = chains(corpus.Corpus([book("A", "2020-03", md)]), ["Zorp widget"])
        self.assertEqual(lineage.winner(ch["dv"]).value, "4S/4P*")
        self.assertEqual([(o.value, o.variant) for o in ch["dv"]], [("4S/4P*", ""), ("2P", "detachable blade")])

    def test_verdicts_and_weak_links(self):
        rows = [{"src": "a", "id": "x", "field": "avail", "family": "another column", "where": "w", "winner": "3",
                 "cl6": "5"},
                {"src": "a", "id": "y", "field": "cost", "family": "Commlink6 misread", "where": "w", "winner": "200",
                 "cl6": "100", "strength": "1 field from that row"},
                {"src": "a", "id": "z", "field": "cost", "family": "not found", "where": "", "winner": "345",
                 "cl6": "325"}]
        trace.apply_verdicts(rows, {"a|y|cost": {"family": "Commlink6 misread", "note": "row above", "crop": "c.png"},
                                    "a|z|cost": {"family": "Commlink6 misread", "note": "the page prints ours"}})
        self.assertEqual([r["family"] for r in rows], ["not found", "Commlink6 misread", "Commlink6 misread"])
        self.assertEqual(rows[0]["verdict"], trace.WEAK)
        self.assertIn("c.png", rows[1]["where"])


    def test_locate_finds_the_value_beside_the_name(self):
        w = lambda t, x, y: {"text": t, "x0": x, "x1": x + 20, "top": y, "bottom": y + 8}  # noqa: E731
        words = [w("Zorp", 10, 100), w("widget", 35, 100), w("2", 200, 100), w("100¥", 260, 100),
                 w("Blarg", 10, 112), w("3", 200, 112), w("1,000¥", 260, 112), w("Zorp", 10, 300)]
        self.assertEqual(crops.locate(words, "Zorp widget", "100¥"), (10, 100, 280, 108))
        self.assertEqual(crops.locate(words, "Blarg roller", "1000"), (10, 112, 280, 120))
        self.assertIsNone(crops.locate(words, "Zorp widget", "555"))


class DescriptionTest(unittest.TestCase):
    def test_a_count_in_words_and_a_wrapped_rating_range(self):
        md = ("<!-- page 1 -->\n#### Zorp launcher\nIts internal magazines hold up to four bolts.\n"
              "Zorp launchers are available with ratings from\n1 to 6.\n| WEAPON | COST |\n|---|---|\n| Zorp launcher | 100¥ |\n")
        c = corpus.Corpus([book("A", "2020-03", md, entries=[entry("Zorp launcher", src="a", kind="weapons", cost="100")])])
        rec = {"book": "a", "src": "a", "file": "w", "tag": "item", "id": "z", "name": "Zorp launcher", "page": "1",
               "kind": "weapons", "modelled": True, "pool": ("weapons",), "aliases": [], "families": {},
               "fields": {"ammo": "4(m)", "rating": (1, 6), "cost": {r: 100.0 * r for r in range(1, 7)}}}
        rows, _ = trace.run(c, [rec])
        fam = {r["field"]: r["family"] for r in rows}
        self.assertEqual(fam["ammo"], "description sentence")
        self.assertEqual(fam["rating"], "description sentence")


class FormulaTest(unittest.TestCase):
    def test_read_printed_formulas(self):
        from tools.cl6check import formula as F
        self.assertEqual(F.read("Rating x 2,000¥"), ("rating * 2000", "rating"))
        self.assertEqual(F.read("1,000¥ + [500¥ x Size]"), ("1000 + 500 * rating", "rating"))
        self.assertEqual(F.read("300¥ per CF"), ("300 * qty", "qty"))
        self.assertEqual(F.read("2,000¥ (+500¥ per additional widget)"), ("2000 + 500 * (qty - 1)", "qty"))
        self.assertEqual(F.read("Rating x 50 (10 uses)"), ("rating * 50", "rating"))
        self.assertEqual(F.read("(Force +3) L"), ("(rating +3)", "rating"))
        self.assertIsNone(F.read("See text"))

    def test_flattened_values(self):
        from tools.cl6check import formula as F
        self.assertEqual(F.flattened("1000 + [500 x Size]", {1: 1500, 2: 2000}), "rating 1..2: 1000 + 500 * rating")
        self.assertIn("rounds down", F.flattened("(Rating/3)", {1: 0, 2: 0, 3: 1, 6: 2}))
        self.assertEqual(F.flattened("300¥ per CF", {None: 2700}, qty=[9]), "300 * qty at count 9")
        self.assertEqual(F.flattened("Rating x 2500", {None: 5000}), "rating * 2500 at rating 2")
        self.assertIsNone(F.flattened("Rating x 2500", {1: 2500, 2: 4000}))
        self.assertEqual(F.tiered([(1, 3, "rating * 1000"), (4, 6, "rating * 5000")], 4), 20000)
        self.assertEqual(F.evaluate("rating / 3", {"rating": 4}), 2)
        self.assertEqual(F.evaluate("rating / 3", {"rating": 4}, div="floor"), 1)


if __name__ == "__main__":
    unittest.main()
