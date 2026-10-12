"""More of the widening search (importer/sr6/resolve.py): what counts as a printed value for each field, the text
readers' limits, two rows or two sentences that disagree, an errata's statements it leaves out, and a PDF's own date.
Every name and number is invented."""
import contextlib
import os
import tempfile
import unittest
from unittest import mock

from importer.sr6 import resolve
from importer.sr6.recipes import crb, shapes
from importer.tests.test_sr6_resolve import block


class GoodTest(unittest.TestCase):
    def check(self, field, yes, no):
        for v in yes:
            self.assertTrue(resolve.good(field, v), (field, v))
        for v in no:
            self.assertFalse(resolve.good(field, v), (field, v))

    def test_values_by_field(self):
        self.check("rating", ["1–6", "4"], ["x", "—"])
        self.check("capacity", ["1-6", "[2]", "Rating x 0.5"], ["x"])  # (a range: the rating an item priced by capacity comes in)
        self.check("essence", [".5", "[0.25]", "3", "Rating x 0.1"], ["x"])
        self.check("karma", ["-3", "5 Karma"], ["x"])
        self.check("modes", ["SA", "SA/BF", "FA (5)"], ["xx"])
        self.check("ammo", ["8(c)", "10(c)/5(m)"], ["c"])
        self.check("handling", ["7", "7/9"], ["x"])
        self.check("seats", ["4"], ["four"])

    def test_a_dash_or_another_field_is_no_value(self):
        self.check("cost", [], ["—", "", "-"])
        self.check("dv", [], ["3P"])  # (no reader for the field)

    def test_clean(self):
        self.assertEqual(resolve._clean("1-6", "rating"), "1–6")
        self.assertEqual(resolve._clean("5 Karma", "karma"), "5")
        self.assertEqual(resolve._clean("1,200¥", "cost"), "1200")


class TextValuesTest(unittest.TestCase):
    def test_ratings_outside_what_a_rating_can_be(self):
        self.assertEqual(resolve.text_values("rating", ["Ratings 6 to 3.", "Rating 1 to 30."]), set())  # (backwards, or past 20)
        self.assertEqual(resolve.text_values("rating", ["Maximum rating 1.", "Maximum rating 25.", "Ratings up to 4."]), {"1–4"})


class DisagreementTest(unittest.TestCase):
    def test_two_rows_that_disagree_give_no_value(self):
        idx = resolve.Index([block("Lists", 30, text="| ITEM | AVAIL | COST |\n|---|---|---|\n| Glim mic | 2 | 50¥ |"),
                             block("More lists", 31, text="| ITEM | AVAIL | COST |\n|---|---|---|\n| Glim mic | 2 | 60¥ |")], 1, crb._tables, shapes.RENAME)
        e = {"name": "Glim microphone", "page": 29, "attrs": {}}
        self.assertIsNone(resolve.search_book(idx, crb.HEADERS, "gear", e, "cost", ""))
        self.assertEqual(resolve.search_book(idx, crb.HEADERS, "gear", e, "avail", ""), ("2", "table", 29))  # (the same value twice is one)
        # (a second row giving the value: the other gaps are no one row's)
        self.assertEqual(resolve.same_row(idx, crb.HEADERS, "gear", e, "avail", "2"), {})

    def test_an_entrys_own_text_that_prints_two_values_gives_none(self):
        idx = resolve.Index([], 1, crb._tables, shapes.RENAME)
        e = {"name": "Wobble Lock", "page": 39, "attrs": {}}
        self.assertIsNone(resolve.search_book(idx, crb.HEADERS, "gear", e, "cost", "It costs 300¥, or costs 400¥ with a case."))
        self.assertEqual(resolve.search_book(idx, crb.HEADERS, "gear", e, "cost", "It costs 300¥."), ("300", "text", 39))


class ErrataMoreTest(unittest.TestCase):
    def test_statements_a_person_reads_are_left_out(self):
        self.assertEqual(resolve.errata("p. 3: Zip Gun has cost **100**"), [(3, "Zip Gun", "cost", "100", None)])
        self.assertEqual(resolve.errata("p. 3: Zip Gun has cost **100**; it gains a silencer."), [])  # (a statement that also changes the rules)
        self.assertEqual(resolve.errata("Rather than being rating 5 and 6 cyberware as printed, these are instead rating 6 cybereyes."), [])  # (two old ratings, one new)
        self.assertEqual(resolve.errata("Rather than being rating 5 and 6 cyberware as printed, these are instead rating 6 and 7 cybereyes."),
                         [(None, "cybereyes", "_renumber", (5, 6), None), (None, "cybereyes", "_renumber", (6, 7), None)])

    def test_patching_a_band(self):
        self.assertEqual(resolve.patch_band("1/19/11/9/6", "near", "9"), "1/9/11/9/6")
        self.assertIsNone(resolve.patch_band("1/2/3", "near", "9"))  # (not five bands)


class PdfDateTest(unittest.TestCase):
    @contextlib.contextmanager
    def pdf(self, meta):
        """A path that exists, read by a stand-in pdfplumber giving `meta` (an exception to raise, or the metadata)."""
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "book.pdf")
            open(path, "wb").close()

            class Doc:
                metadata = None if isinstance(meta, Exception) else meta

                def __enter__(self):
                    if isinstance(meta, Exception):
                        raise meta
                    return self

                def __exit__(self, *a):
                    return False
            with mock.patch("pdfplumber.open", lambda p: Doc()):
                yield path

    def test_the_modification_date_in_the_printing_year_or_the_next(self):
        with self.pdf({"ModDate": "D:20230505120000", "CreationDate": "D:20220101000000"}) as p:
            self.assertEqual(resolve.pdf_date(p, "© 2023 Zorp Games"), "2023-05-05")
            self.assertEqual(resolve.pdf_date(p, "© 2021 Zorp Games"), "2022-01-01")  # (a later re-save: the creation date)
            self.assertEqual(resolve.pdf_date(p, "no year printed"), "2023-05-05")
            self.assertEqual(resolve.pdf_date(p, "© 2019 Zorp Games"), "")

    def test_no_date_a_missing_file_or_an_unreadable_pdf(self):
        with self.pdf(None) as p:
            self.assertEqual(resolve.pdf_date(p, "© 2023"), "")
        with self.pdf({"ModDate": "garbled"}) as p:
            self.assertEqual(resolve.pdf_date(p, "© 2023"), "")
        with self.pdf(ValueError("unreadable")) as p:
            self.assertEqual(resolve.pdf_date(p, "© 2023"), "")
        self.assertEqual(resolve.pdf_date(os.path.join(tempfile.gettempdir(), "no-such-book.pdf")), "")


if __name__ == "__main__":
    unittest.main()
