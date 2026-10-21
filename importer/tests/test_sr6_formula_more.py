"""More of the SR6 formula grammar and readers (importer/sr6/formula.py): the refusals, the values that cannot be worked
out, and the readers' edge cases. Every value and name here is invented."""

import unittest

from importer.sr6 import formula as F


class GrammarEdgesTest(unittest.TestCase):
    def test_what_the_parser_refuses(self):
        for bad, why in (
            ("tier(R; R: 5)", "a band starts with a number"),
            ("ref(gear:x, 5)", "ref() needs a field name"),
            ("ceil(R, 2)", "ceil takes one"),
            ("floor(R, 2)", "floor takes one"),
            ("min(R)", "min takes two"),
            ("max(R, 1, 2)", "max takes two"),
        ):
            with self.assertRaises(F.FormulaError, msg=why):
                F.parse(bad)
            self.assertFalse(F.valid(bad), bad)

    def test_a_value_that_cannot_be_worked_out_is_none(self):
        self.assertIsNone(F.evaluate("R/0", R=1))  # (no division by nothing)
        self.assertIsNone(F.evaluate("max(R, 2)"))  # (R not given)
        self.assertIsNone(F.evaluate("min(2, R)"))
        self.assertIsNone(F.evaluate("tier(R; 1-3: 5)"))  # (the rating to look up not given)
        self.assertIsNone(F.evaluate("ref(gear:zz.widget, cost)"))  # (no way to look the item up)
        self.assertIsNone(F.evaluate("-R"))

    def test_a_ref_at_a_rating_of_its_own(self):
        seen = []

        def look(target, field, rating):
            seen.append((target, field, rating))
            return 7.0

        self.assertEqual(F.evaluate("ref(gear:zz.widget, cost, R*2) + 1", R=2, ref=look), 8)
        self.assertEqual(seen, [("gear:zz.widget", "cost", 4.0)])

    def test_variables_of_negations_refs_calls_and_tiers(self):
        self.assertEqual(F.variables("-R"), {"R"})
        self.assertEqual(F.variables("ref(gear:zz.w, cost, R*2)"), {"R", "ref"})
        self.assertEqual(F.variables("min(R, tier(Q; 1-2: M))"), {"Q", "R", "M"})
        self.assertEqual(F.variables("B + H"), {"B", "H"})

    def test_trailing_space_is_no_token(self):
        self.assertEqual(F.tokens("R * 2 "), [("name", "R"), ("op", "*"), ("num", "2")])
        self.assertEqual(F.evaluate("R * 2 ", R=3), 6)

    def test_the_host_variable(self):
        self.assertEqual(F.evaluate("H*2", H=40), 80)


class ReadEdgesTest(unittest.TestCase):
    def check(self, printed, expr, field="cost"):
        """Assert the printed text reads as expr."""
        self.assertEqual(F.read(printed, field), (expr, {}), printed)

    def test_a_range_is_not_a_subtraction(self):
        self.assertIsNone(F.read("1–6"))
        self.assertIsNone(F.read("[1–6]", "capacity"))

    def test_per_level_additional_and_percent_styles(self):
        self.check("adds 2 per level", "R*2")
        self.check("additional 100¥", "B + 100")
        self.check("+50%", "B*1.5")
        self.check("Armor cost increased 5%", "B*1.05")
        self.check("20% vehicle price", "B*0.2")
        self.check("Commlink cost plus rating x 100", "B + R*100")

    def test_a_price_per_rating_point_is_by_the_rating(self):
        self.check("2 per level", "R*2")
        self.check("1 per Rating point", "R*1")

    def test_a_base_plus_something_unreadable_is_left_to_the_caller(self):
        self.assertIsNone(F.read("Commlink cost plus lots"))

    def test_a_number_before_plus_is_not_a_base_item(self):
        self.assertIsNone(F.read("250 plus 50"))  # (neither a formula nor a plain number: left to the caller)


class TierTest(unittest.TestCase):
    def test_equal_bands_are_one_expression(self):
        self.assertEqual(F.tier([(1, 3, "R*5"), (4, 6, "R*5")]), "R*5")

    def test_bands_in_order_with_a_single_rating_and_an_open_end(self):
        self.assertEqual(
            F.tier([(9, 9, "7000"), (1, 3, "R*100"), (10, None, "R*1000")]), "tier(R; 1-3: R*100; 9: 7000; 10+: R*1000)"
        )


class TextReadersTest(unittest.TestCase):
    def test_a_unit_the_description_names(self):
        self.assertEqual(
            F.text_unit("The cost is per ten centimeters (minimum 10 cm, maximum 1 meter)."), ("10 cm", "1-10")
        )
        self.assertIsNone(F.text_unit("The cost is per seven centimeters."))  # (a count it has no word for)
        self.assertIsNone(F.text_unit("No unit is named."))

    def test_a_range_that_is_not_a_whole_number_of_units_has_no_quantity(self):
        self.assertEqual(F.text_unit("The cost is per ten centimeters (minimum 5 cm, maximum 95 cm)."), ("10 cm", None))

    def test_energy_shots_need_a_use_and_a_supply(self):
        supplies = {"power backpack": "pb", "power clip": "pc"}
        self.assertIsNone(F.energy_ammo("A zap gun.", "", supplies))  # (no use stated)
        self.assertIsNone(
            F.energy_ammo("Uses 2 energy per shot. Includes power backpack.", "", {"power clip": "pc"})
        )  # (no such supply)
        self.assertEqual(
            F.energy_ammo("Uses 2 energy per shot. Includes power backpack.", "", supplies), "ref(gear:pb, energy)/2"
        )
        self.assertEqual(
            F.energy_ammo("Uses 2 energy per shot.", "Zap guns come with power clips.", supplies),
            "ref(gear:pc, energy)/2",
        )


class TierGroupsMoreTest(unittest.TestCase):
    def entries(self, c1, c2):
        """Two tiers of one entry with the given costs."""
        return [
            {"name": "Zap Relay (1-3)", "attrs": {"cost": c1, "category": "x"}, "page": 1},
            {"name": "Zap Relay (4-6)", "attrs": {"cost": c2, "category": "x"}, "page": 1},
        ]

    def test_rows_priced_per_unit_are_not_banded(self):
        # (a unit in the price is the row's own, not a band's)
        self.assertEqual(F.tier_groups(self.entries("300 per CF", "500 per CF")), {})

    def test_rows_priced_by_rating_are_banded(self):
        e = self.entries("Rating x 100", "Rating x 500")
        got = F.tier_groups(e)
        self.assertEqual([got[id(x)] for x in e], [{"cost": "tier(R; 1-3: R*100; 4-6: R*500)"}] * 2)


if __name__ == "__main__":
    unittest.main()
