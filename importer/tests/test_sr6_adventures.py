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

    def test_a_title_over_a_full_width_table_stays_with_it(self):
        i = self.lines.index("#### Boxed Gadget")
        self.assertEqual(self.lines[i + 1], "| SIZE | MODE | AVAIL | COST |")
        self.assertLess(self.lines.index("Fifth right words 4"), i)

    def test_two_header_bands_in_two_columns_are_two_tables(self):
        self.assertIn("| HAND | ACCEL | BOD | COST |", self.lines)
        self.assertIn("| PILOT | SEAT | AVAIL | COST |", self.lines)

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
        self.assertIn(("effect", {"target": "derived:defense", "op": "add", "value": "2", "confidence": "low", "switch": "activated"}, None),
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
        # a bonus Edge point on some tests is not the Edge attribute; raising the attribute is
        # (tests the vocabulary doesn't know: a test type of their own words, shown, never applied)
        self.assertEqual(effects.read("You gain a +1 Edge bonus on all Quux tests."),
                         [("effect", {"target": "test:other", "op": "edge", "value": "1", "confidence": "low",
                                      "switch": "conditional", "when": "quux"}, None)])
        self.assertEqual(effects.read("Increase your Edge by 1."), [("effect", {"target": "attr:edg", "op": "add", "value": "1"}, None)])
        # how a conditional one is turned on: wireless, sustained, activated, else conditional; none on an always-on one
        sw = lambda t: [a.get("switch") for _, a, _ in effects.read(t)]
        self.assertEqual(sw("Wireless bonus: +1 to Quux and +1 to Agility."), ["wireless"])
        self.assertEqual(sw("While sustained, +2 to Body."), ["sustained"])
        self.assertEqual(sw("At will, +1 to Reaction."), ["activated"])
        self.assertEqual(sw("If it rains, +1 to Body."), ["conditional"])
        self.assertEqual(sw("You gain +1 to Strength."), [None])



class Cl6GermanNamesTest(unittest.TestCase):
    def test_a_record_named_in_german_is_commlink6_only(self):
        from tools.cl6check import canon
        self.assertTrue(canon.cl6_only("weapons", "Made-Up Stinger Pfeile (10x)", {}, "item"))
        self.assertTrue(canon.cl6_only("gear", "Made-Up Druckluftkartusche", {}, "item"))
        self.assertFalse(canon.cl6_only("qualities", "Will to Die", {}, "quality"))  # English look-alikes stay
        self.assertFalse(canon.cl6_only("qualities", "Camouflage (Fur)", {}, "quality"))

class GameInformationShapesTest(unittest.TestCase):
    def test_stat_line_table_makes_the_heading_an_item(self):
        b = general._stat_line(_b("Zap Bangle", 3, "About it.\n| TYPE | MODE | DV | AVAIL | COST |\n|---|---|---|---|---|\n"
                                                  "| Light Pistol | SS | 3P | 4L | 900¥ |\nMore."))
        self.assertEqual((b.type, b.row), ("item", {"ITEM": "Zap Bangle", "TYPE": "Light Pistol", "MODE": "SS", "DV": "3P",
                                                    "AVAIL": "4L", "COST": "900¥"}))
        self.assertNotIn("|", b.text)

    def test_a_named_table_stays_a_table(self):
        b = _b("Canes", 3, "| NAME | DV | AVAIL | COST |\n|---|---|---|---|\n| Sword Cane | 3P | 2 | 400¥ |")
        self.assertEqual(general._stat_line(b).type, "section")

    def test_box_title_a_letter_off_its_heading_takes_the_heading_name(self):
        b = Block("item", "zap bangel", "Game Information", "Zap Bangle", "zap bangel", 10)
        self.assertEqual(general._box_named(b).name, "Zap Bangle")
        far = Block("item", "glow stick", "Game Information", "Zap Bangle", "glow stick", 10)
        self.assertEqual(general._box_named(far).name, "glow stick")

    def test_spell_box_with_its_category_under_type(self):
        b = Block("item", "Hush", "Game Information", "SPELLS", "hush", 10,
                  stats=[{"TYPE": "Illusion", "RANGE": "LOS", "DV": "P", "DURATION": "S", "DRAIN": "4"}])
        f = general._spell_box(b)
        self.assertEqual(f.stats[0], {"TYPE": "P", "RANGE": "LOS", "DURATION": "S", "DV": "4"})
        self.assertEqual(f.section, "Illusion spells")

    def test_adept_power_cost_in_power_points(self):
        r, out = sections.Reader(), []
        for b in [_b("ADEPT POWERS", 3), _b("Quick Toss", 4, "", {"Cost": "0.25 PP per level", "Activation": "Passive"}),
                  _b("A Rule About Throwing", 4, "No labels here.")]:
            out += r.feed(b, 10)
        self.assertEqual([(f.kind, f.name, f.attrs) for f in out],
                         [("adeptpowers", "Quick Toss", {"cost": "0.25", "perLevel": "true"})])

    def test_toxin_lines_make_gear(self):
        bs = [_b("Made-Up Venoms", 3), _b("Glow Toad Venom", 4, "", {"Vector": "Injection", "Speed": "1 minute", "Power": "6"})]
        r, out = sections.Reader(), []
        for b in bs:
            out += r.feed(b, 10)
        self.assertEqual(out, [])  # (off unless the general recipe reads the book: the core rulebook prices its own)
        r, r.toxins = sections.Reader(), True
        for b in bs:
            out += r.feed(b, 10)
        self.assertEqual([(f.kind, f.name, f.attrs) for f in out], [("gear", "Glow Toad Venom", {"category": "Made-Up Venoms"})])


class WeaponBandTest(unittest.TestCase):
    def test_bold_header_over_loose_values_is_the_box_table(self):
        lines = ["##### zap baton", "**DV MODES A RT AT TA INCK G AMMO AVAIL COST**", "9 (power",
                 "(4–8)S SS/SA 8/6/–/–/– 5(I) 1,500¥", "cell)", "Text after."]
        self.assertEqual(general._weapon_bands(lines), [
            "##### Zap Baton", "| DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |", "|---|---|---|---|---|---|",
            "| (4–8)S | SS/SA | 8/6/–/–/– | 9 (power cell) | 5(I) | 1,500¥ |", "Text after."])

    def test_no_price_no_table(self):
        lines = ["**DV MODES ATTACK AMMO AVAIL COST**", "some words only"]
        self.assertEqual(general._weapon_bands(lines), lines)


class VariantGroupTest(unittest.TestCase):
    MD = "\n".join([
        "# Shopping", "## Spy Gear", "### Sneaky Paints", "Paints that hide a charge.",
        "| SPY GEAR | AVAIL | COST |", "|---|---|---|", "| Sneaky Paints |  |  |", "| Red Tube | 6(I) | 100 |",
        "| Blue Tube | 6(I) | 90 |", "| Synthetic | 2 | 20 |", "| Glow Pen | 4 | 250 |", "| Gold Tube | 3 | 50 |",
        "# Other Chapter", "## Gadgets", "### Glow Pen", "A pen that glows.", "### Synthetic", "A rule section."])

    def names(self, variants):
        from importer.sr6 import regroup
        text, _ = regroup.regroup(self.MD, {}, name_headers={"SPY GEAR"}, variants=variants)
        return [b.name for b in regroup.blocks(text) if b.row is not None]

    def test_group_ends_at_a_row_the_book_describes_elsewhere(self):
        # (one word, `Synthetic`, is a variant's even where a section of that name exists)
        self.assertEqual(self.names(True)[1:], ["Sneaky Paints (Red Tube)", "Sneaky Paints (Blue Tube)",
                                                "Sneaky Paints (Synthetic)", "Glow Pen", "Gold Tube"])

    def test_off_without_the_hint(self):
        self.assertIn("Red Tube", self.names(False))


class OwnerDecisionsTest(unittest.TestCase):
    def test_sr6_vocabulary(self):
        from importer.sr6 import vocab
        self.assertIn("Complex", vocab.invalid("action", "Complex"))
        self.assertIsNone(vocab.invalid("action", "Major"))
        self.assertIn('"R"', vocab.invalid("avail", "12R"))
        self.assertIsNone(vocab.invalid("avail", "6(I)"))
        self.assertIsNone(vocab.invalid("cost", "Complex"))  # (no vocabulary)

    def test_lineage_passes_over_a_later_sr5_value(self):
        from types import SimpleNamespace as NS
        from tools.cl6check import lineage
        old = NS(order=1, date="2019", belongs="aaa", label="Made-Up Book", context=False)
        new = NS(order=2, date="2021", belongs="bbb", label="Later Made-Up Book", context=False)
        obs = [lineage.Obs(old, "action", "Major", "x"), lineage.Obs(new, "action", "Complex", "y")]
        chain = lineage.lineage(obs)["action"]
        self.assertEqual(lineage.winner(chain).value, "Major")
        self.assertTrue(chain[1].invalid)
        self.assertEqual(lineage.winner(chain[1:]).value, "Complex")  # (no valid printing: the latest stands)

    def test_bare_steps_are_the_path_qualities(self):
        r, out = sections.Reader(), []
        for b in [_b("Quality Paths", 2), _b("Quality Path: Made-Up Way", 3),
                  _b("Starting Point", 4, "To start, they must spend 7 Karma, and they move to step 1."),
                  _b("Step 1", 4, "They learn a trick."), _b("Step 2", 4, "By investing 12 Karma, they learn more.")]:
            out += r.feed(b, 10)
        qs = [(f.name, f.attrs) for f in out if f.kind == "qualities"]
        self.assertEqual(qs, [
            ("Step 1", {"kind": "positive", "karma": "7", "category": "Made-Up Way", "group": "Made-Up Way",
                        "_id": "Made-Up Way Step 1"}),
            ("Step 2", {"kind": "positive", "karma": "12", "category": "Made-Up Way", "group": "Made-Up Way",
                        "_id": "Made-Up Way Step 2"})])

    def test_kk_sr6_half_over_two_bands(self):
        from importer.sr6.recipes import kk
        self.assertEqual(kk._unglue(["HAND", "SPEED", "INT.TOP SPEED"]), ["HAND", "SPEED INT.", "TOP SPEED"])
        t = "\n".join(["krime zoomer: SR5 krime zoomer: SR6",
                       "| DAM | AVAIL | COST | HAND | BOD |", "|---|---|---|---|---|", "| 4P | 6R | 900¥ | 3/4 | 2 |",
                       "| PILOT | AVAIL | COST |", "|---|---|---|", "| 2 | 3(L) | 800¥ |",
                       "| HAND | BOD | PILOT |", "|---|---|---|", "| 1 | 1 | 1 |"])
        self.assertEqual(kk._stat_sets(t), [("krime zoomer", ["HAND", "BOD", "PILOT", "AVAIL", "COST"],
                                             [["3/4", "2", "2", "3(L)", "800¥"]])])


if __name__ == "__main__":
    unittest.main()
