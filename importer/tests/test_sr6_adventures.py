"""The adventure and plot books' shapes (all made up): a magazine-style book's running heads, two columns over a
full-width box, lists a section grants, a quality priced in its heading with choices, prose effects."""
import os
import tempfile
import unittest

from importer.convert import convert
from importer.sr6 import effects, sections
from importer.sr6.recipes import general
from importer.sr6.regroup import Block
from importer.tests.minipdf import sr6_magazine_pdf


class MagazineLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d = tempfile.mkdtemp()
        pdf, md = os.path.join(d, "m.pdf"), os.path.join(d, "m.md")
        with open(pdf, "wb") as f:
            f.write(sr6_magazine_pdf())
        convert(pdf, md, sr6=True)
        with open(md, encoding="utf8") as f:
            cls.lines = [ln for ln in f.read().splitlines() if ln.strip()]

    def test_running_head_and_page_number_dropped(self):
        self.assertFalse([ln for ln in self.lines if "MADE UP TITLE" in ln or ln.lstrip("# ") in ("1", "2", "3", "4")])

    def test_levels_left_to_the_book_headings(self):
        for h in ("# CHAPTER ONE", "## Game Information", "### POSITIVE QUALITIES", "#### Cool Thing",
                  "#### Other Thing", "##### Kicker Part:", "#### Third Thing"):
            self.assertIn(h, self.lines)

    def test_columns_read_in_turn_over_a_full_width_box(self):
        at = self.lines.index
        self.assertLess(at("Cool words 2"), at("#### Other Thing"))
        self.assertLess(at("Right words 5"), at("#### Box Title"))
        self.assertTrue(self.lines[at("#### Box Title") + 1].startswith("box words"))


def _b(name, level, text="", labels=None, tags=""):
    return Block("section", name, "Game Information", name, "", 10, labels=labels or {}, text=text, level=level, tags=tags)


class GrantedListsTest(unittest.TestCase):
    def setUp(self):
        r, self.found = sections.Reader(), []
        for b in [_b("Wandering Folk", 2, "Folk who came back."),
                  _b("Powers", 3, "Each wandering folk has no more than three of the listed powers."),
                  _b("Iron Hide", 4, "With a Minor Action they harden, boosting their Defense Rating by 2."),
                  _b("Sharp Eyes", 4, "This requires a Perception + Intuition (2) test."),
                  _b("Characteristics", 3, "Wandering folk might have certain characteristics, at no cost."),
                  _b("Odd Shadow", 4, "Their shadow moves on its own."),
                  _b("Becoming Folk", 3, "How to play one."),
                  _b("Wandering One (9 Karma)", 4, "Select two powers from the list and one characteristic from the list.")]:
            self.found += r.feed(b, 10)
        self.by = {f.name: f for f in self.found}

    def test_powers_are_granted_qualities(self):
        f = self.by["Iron Hide"]
        self.assertEqual((f.kind, f.attrs), ("qualities", {"kind": "positive", "karma": "0", "granted": "true",
                                                           "category": "Wandering Folk power"}))
        self.assertIn(("effect", {"target": "derived:defense", "op": "add", "value": "2", "confidence": "low"}, None),
                      f.children)
        self.assertIn(("test", {"skill": "skill:perception", "attr": "attr:int", "threshold": "2"}, None),
                      self.by["Sharp Eyes"].children)

    def test_characteristics_are_granted_drawbacks(self):
        self.assertEqual(self.by["Odd Shadow"].attrs["kind"], "negative")
        self.assertEqual(self.by["Odd Shadow"].attrs["category"], "Wandering Folk characteristic")

    def test_priced_heading_offers_its_choices(self):
        f = self.by["Wandering One"]
        self.assertEqual(f.attrs, {"kind": "positive", "karma": "9"})
        self.assertEqual([c for c in f.children if c[0] == "choice"], [
            ("choice", {"kind": "quality", "category": "Wandering Folk power", "count": "2", "max": "3"}, None),
            ("choice", {"kind": "quality", "category": "Wandering Folk characteristic", "count": "1"}, None)])

    def test_a_powers_heading_not_about_its_section_is_no_list(self):
        r = sections.Reader()
        out = []
        for b in [_b("Spirits", 2, "About spirits."), _b("Powers", 3, "Some rules."), _b("Glow", 4, "It glows.")]:
            out += r.feed(b, 10)
        self.assertFalse([f for f in out if f.name == "Glow"])


class KickerTest(unittest.TestCase):
    def test_a_kicker_joins_the_heading_under_it(self):
        self.assertEqual(general._kickers(["##### Path Name:", "### Step", "##### Note:", "##### Same Size"]),
                         ["### Path Name: Step", "##### Note:", "##### Same Size"])


class EffectsTest(unittest.TestCase):
    def test_templates(self):
        self.assertEqual(effects.read("You gain +1 to Strength."), [("effect", {"target": "attr:str", "op": "add", "value": "1"}, None)])
        self.assertEqual(effects.read("Reduce the cost of Edge boosts by 1 on tests using Stealth."),
                         [("effect", {"target": "skill:stealth", "op": "edge-cost", "value": "-1"}, None)])
        self.assertEqual(effects.read("Their Glow is boosted by 2."), [])  # no vocabulary target: no effect



class Cl6GermanNamesTest(unittest.TestCase):
    def test_a_record_named_in_german_is_commlink6_only(self):
        from tools.cl6check import canon
        self.assertTrue(canon.cl6_only("weapons", "Made-Up Stinger Pfeile (10x)", {}, "item"))
        self.assertTrue(canon.cl6_only("gear", "Made-Up Druckluftkartusche", {}, "item"))
        self.assertFalse(canon.cl6_only("qualities", "Will to Die", {}, "quality"))  # English look-alikes stay
        self.assertFalse(canon.cl6_only("qualities", "Camouflage (Fur)", {}, "quality"))


if __name__ == "__main__":
    unittest.main()
