"""cl6check comparer artifacts (2026-10-15 triage): differences that were the comparer's, not the data's. Invented names
and numbers only."""

import os
import unittest
from types import SimpleNamespace

from importer.tests.test_cl6check import entry, rec
from tools.cl6check import __main__ as cli
from tools.cl6check import arbitrate, canon, fields, ours

# pylint: disable=protected-access  # tests reach into the module internals they cover


def cmp(c, kind="weapons", **attrs):
    """The comparer's verdict on candidate `c` against a made-up entry of `kind` with `attrs`."""
    return fields.compare(c, entry("Zorp", kind=kind, **attrs))


class AmmoAndWordsTest(unittest.TestCase):
    def test_printed_ammo_notation_reads_as_commlink6_writes_it(self):
        for printed, cl6 in (
            ("32(d-2)", "32(d)"),
            ("10(c-3) /50(belt-3)", "10(c)/50(belt)"),
            ("20(tanks)", "20(tank)"),
            ("1 barrel", "1(b)"),
            ("12 x2(c)", "12(c)/12(c)"),
            ("20 (power cell)", "20(c)"),
            ("40(d-2) + Energy", "40(d)"),
            ("1(br-3)", "1(br)"),
        ):
            self.assertEqual(fields.ammo_key(printed), fields.ammo_key(cl6), printed)
        self.assertNotEqual(fields.ammo_key("30(c)"), fields.ammo_key("20(c)"))

    def test_a_bare_count_is_the_printed_count_without_its_unit_but_another_count_differs(self):
        c = {"fields": {"ammo": "10"}, "tag": "item"}
        self.assertEqual(cmp(c, ammo="10(tank)")[1], [])
        self.assertEqual(len(cmp(c, ammo="12(tank)")[1]), 1)

    def test_zero_or_nothing_at_commlink6_where_the_book_prints_a_word_compares_nothing(self):
        for cl6, mine in (("0(br)", "By Size / Class"), ("0", "Unlimited"), ("0", "*")):
            self.assertEqual(cmp({"fields": {"ammo": cl6}, "tag": "item"}, ammo=mine), ([], []), mine)
        self.assertEqual(
            len(cmp({"fields": {"ammo": "0(br)"}, "tag": "item"}, ammo="5(br)")[1]), 1
        )  # (a number still compares)
        self.assertEqual(cmp({"fields": {"ar": ",,,,"}, "tag": "item"}, ar="Missiles Only"), ([], []))
        self.assertEqual(len(cmp({"fields": {"ar": "9,,,,"}, "tag": "item"}, ar="Missiles Only")[1]), 1)


class LevelTest(unittest.TestCase):
    X = (
        '<item id="z" type="TOOLS" avail="2"><attrdef id="PRICE" value="$RATING" table="100,200,300,400"/>'
        '<choices><choice type="ITEM_ATTRIBUTE" ref="RATING" options="1,2,3,4"/></choices></item>'
    )

    def test_a_one_level_entry_is_compared_at_its_own_level_and_tiers_hold_the_range_together(self):
        c = canon.canonical(rec(self.X))
        one = entry("Zorp 1", kind="gear", cost="100", avail="2", rating="1")
        self.assertEqual([d["field"] for d in fields.compare(c, one)[1]], ["rating"])  # (cost: only level 1)
        rest = entry("Zorp 2", kind="gear", cost="Rating x 100", avail="2", rating="2–4")
        self.assertEqual(fields.compare(c, one, [one, rest])[1], [])

    def test_a_price_commlink6_uses_for_not_for_sale_is_no_value(self):
        c = canon.canonical(rec('<item id="z" type="TOOLS" price="999999999"/>'))
        self.assertEqual(fields.compare(c, entry("Zorp", kind="gear", cost="7000000000"))[0], [])
        c = canon.canonical(rec('<item id="z" type="TOOLS" price="700"/>'))
        self.assertEqual(len(fields.compare(c, entry("Zorp", kind="gear", cost="800"))[1]), 1)


class FamilyArtifactTest(unittest.TestCase):
    def test_an_entry_named_with_a_variant_has_its_variant_list(self):
        a = rec('<item id="aaa"/>', name="Setae")
        a = canon.canonical(a) | {"src": "gz"}
        a["families"]["variants"] = frozenset({"hands", "feet"})
        mine = {"gz": SimpleNamespace(entries=[entry("Setae (hands or feet)")], book_dir=None)}
        r = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0][0]
        self.assertTrue(r["families"]["variants"])
        mine = {"gz": SimpleNamespace(entries=[entry("Setae")], book_dir=None)}
        r = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0][0]
        self.assertFalse(r["families"]["variants"])
        self.assertTrue(ours.carries("Nanites (Colony Template)", ["colony-template", "pre-built"]))
        self.assertTrue(ours.carries("Fizz Swarm Colony", ["Colony Template", "Pre-Built"]))
        self.assertTrue(ours.carries("Utility Nanites (Toughskin) Nanites", ["Colony Template", "Pre-Built"]))
        self.assertFalse(ours.carries("Fizz Swarm", ["Colony Template", "Pre-Built"]))

    def test_an_optional_package_record_has_no_families_to_count(self):
        a = canon.canonical(rec('<item id="aaa"/>', name="Alpha")) | {"src": "gz"}
        a["families"]["slots"] = frozenset({("slot", "top")})
        r = cli.compare(
            [a],
            {"gz": SimpleNamespace(entries=[], book_dir=None)},
            pdf=False,
            package=({("gz", "aaa"): {}}, {}, {}),
            accept={},
            sections=[],
            extra={},
        )[0][0]
        self.assertEqual((r["how"], r["families"]), ("optional package", {}))

    def test_two_records_of_one_item_each_hold_a_part_of_its_slots(self):
        slots = frozenset({("slot", "audio"), ("fits", "sensor")})
        mine = {"gz": SimpleNamespace(entries=[entry("Mike") | {"families": {"slots": slots}}], book_dir=None)}
        recs = []
        for i, part in enumerate((frozenset({("slot", "audio")}), frozenset({("fits", "sensor")}))):
            c = canon.canonical(rec(f'<item id="m{i}"/>', name="Mike")) | {"src": "gz"}
            c["families"]["slots"] = part
            recs.append(c)
        rs = cli.compare(recs, mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0]
        self.assertEqual([r["families"]["slots"] for r in rs], [True, True])
        one = cli.compare(recs[:1], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0]
        self.assertTrue(
            one[0]["families"]["slots"]
        )  # (every slot and fit the record gives is ours; ours may have more)
        c = canon.canonical(rec('<item id="m2"/>', name="Mike")) | {"src": "gz"}
        c["families"]["slots"] = frozenset({("slot", "audio"), ("fits", "thermal")})
        lacking = cli.compare([c], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0]
        self.assertFalse(lacking[0]["families"]["slots"])  # (one it gives that ours lacks)
        self.assertEqual([d["field"] for d in lacking[0]["diffs"]], ["slots"])  # (and that fails accuracy)

    def test_a_record_that_a_neighbouring_level_agrees_with_more_is_compared_with_that_level(self):
        # (the book's levels 5 and 6 are Commlink6's 6 and 7: values line up one level down)
        def cl6(n, price):
            return canon.canonical(
                rec(f'<item id="c{n}" type="TOOLS" price="{price}"/>', name=f"Eyes, Advanced Rating {n}")
            ) | {"src": "gz"}

        mine = [entry("Eyes (Rating 5)", kind="gear", cost="100"), entry("Eyes (Rating 6)", kind="gear", cost="200")]
        got = [
            [h["name"] for h in cli._levels(c, [mine[1 - i]], mine)] for i, c in enumerate((cl6(6, 100), cl6(7, 200)))
        ]  # (matched by name: 6 -> 6, 7 -> 5)
        self.assertEqual(got, [["Eyes (Rating 5)"], ["Eyes (Rating 6)"]])
        same = cli._levels(cl6(5, 100), [mine[0]], mine)  # (already the best: kept)
        self.assertEqual([h["name"] for h in same], ["Eyes (Rating 5)"])


class StatBoxTest(unittest.TestCase):
    class Book:  # a one-page stand-in: pdfplumber-like words, the column split at x 306
        """A one-page book of made-up words."""

        def __init__(self, words):
            self.w = words + [{"text": "|width", "x0": 612, "x1": 612, "top": 0, "size": 0}]

        def words(self, p):
            """The made-up words of page 5, else none."""
            return self.w if p == 5 else []

    @staticmethod
    def w(text, x, top, size=9.0):
        """A made-up word at (x, top) with the width of its letters."""
        return {"text": text, "x0": x, "x1": x + 6 * len(text), "top": top, "size": size}

    def test_the_box_below_the_heading_in_its_column_is_the_items_and_the_one_above_is_the_previous_items(self):
        book = self.Book(
            [
                self.w("AVAIL", 347, 230),
                self.w("COST", 453, 230),
                self.w("5", 354, 239),
                self.w("250¥", 453, 239),
                self.w("Foregrip", 295, 310, 15.0),
                self.w("foregrip", 304, 512),
                self.w("AVAIL", 347, 530),
                self.w("COST", 453, 530),
                self.w("2", 354, 539),
                self.w("140¥", 453, 539),
            ]
        )
        self.assertEqual(arbitrate.stat_box(book, 5, "Foregrip"), "2 140")
        self.assertIsNone(arbitrate.stat_box(book, 5, "Missing Thing"))
        # (a name of no words, a page that isn't a number, and a page with no words settle nothing)
        self.assertIsNone(arbitrate.stat_box(book, 5, "--"))
        self.assertIsNone(arbitrate.stat_box(book, "x", "Foregrip"))
        self.assertIsNone(arbitrate.stat_box(book, 40, "Foregrip"))
        # (a heading of several words: each next word beside the one before on its line)
        two = self.Book(
            [
                self.w("Big", 295, 310, 15.0),
                self.w("Grip", 317, 310, 15.0),
                self.w("Big", 295, 400),
                self.w("Gap", 400, 400),
                self.w("AVAIL", 347, 530),
                self.w("COST", 453, 530),
                self.w("3", 354, 539),
                self.w("90¥", 453, 539),
            ]
        )
        self.assertEqual(arbitrate.stat_box(two, 5, "Big Grip"), "3 90")

    def test_a_page_that_will_not_read_has_no_words(self):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "original.pdf"), "wb") as f:
                f.write(b"not a pdf")
            self.assertEqual(arbitrate.Book(d).words(3), [])

    def test_settle_turns_a_neighbours_value_into_the_pdf_printing_ours(self):
        class B(self.Book):
            """A page whose text holds the neighbour's value."""

            def page_text(self, _p):
                """The page text, with the neighbour's value near the name."""
                return "Foregrip 3 250"  # (the window around the name holds the neighbour's 250)

        book = B(
            [
                self.w("Foregrip", 295, 310, 15.0),
                self.w("AVAIL", 347, 530),
                self.w("COST", 453, 530),
                self.w("2", 354, 539),
                self.w("140¥", 453, 539),
            ]
        )
        diff = {"field": "cost", "why": "differs", "ours": "140", "ours_tok": "140", "cl6_tok": "250"}
        self.assertEqual(arbitrate.settle(book, {"page": 5, "name": "Foregrip"}, {"page": 5}, diff), ("b", "ours"))


class KeepAndFillTest(unittest.TestCase):
    def test_a_family_the_owner_keeps_is_the_same_whatever_commlink6_has(self):
        h = {"src": "gz", "kind": "gear", "id": "gz.a", "name": "A", "families": {}}
        self.assertFalse(cli._same("variants", frozenset({"b"}), h, False))
        self.assertTrue(cli._same("variants", frozenset({"b"}), h, False, keep={("gz", "gear", "gz.a", "variants")}))

    def test_an_older_printing_fills_the_newer_ones_gaps_only(self):
        def e(i, issues=(), **a):
            return {"kind": "gear", "id": i, "attrs": a, "issues": list(issues)}

        new = SimpleNamespace(entries=[e("gz.a", [("cost", "unread")], cost="", avail="2")], texts={})
        old = SimpleNamespace(
            entries=[e("gz.a", cost="100", avail="9"), e("gz.b", cost="5")], texts={"gz.b": "Old text."}
        )
        ours._fill(new, old)
        self.assertEqual(
            [(x["id"], x["attrs"]) for x in new.entries],
            [("gz.a", {"cost": "100", "avail": "2"}), ("gz.b", {"cost": "5"})],
        )
        self.assertEqual(new.texts, {"gz.b": "Old text."})


if __name__ == "__main__":
    unittest.main()
