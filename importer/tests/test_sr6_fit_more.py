"""More of the sample-runner fit (importer/sr6/fit.py): the app's value reader on powers and sums, ranks that run out,
a technomancer's forms and a printed karma-to-nuyen count. Every number is made up."""
import unittest

from importer.sr6 import fit
from importer.tests.test_sr6_fit import CS, ROWS, need


class ValueMoreTest(unittest.TestCase):
    def test_powers_sums_and_leftovers(self):
        self.assertEqual(fit.value("2^3"), 8)
        self.assertEqual(fit.value("2+3"), 5)
        self.assertEqual(fit.value("Rating x 2 + 1", 3), 7)
        self.assertEqual(fit.value("+4"), 4)

    def test_what_the_app_cannot_read(self):
        for v in ("R/0", "(Rating", "1 2", ""):
            self.assertIsNone(fit.value(v, 3), v)  # (a division by nothing, an unclosed bracket, two numbers, nothing)


class CheapestTest(unittest.TestCase):
    def test_the_lowest_rating_gives_up_ranks_first_to_its_floor(self):
        self.assertEqual(fit._cheapest([3, 5], [1, 1], 3), [2, 1])
        self.assertEqual(fit._cheapest([2], [2], 1), [0])  # (nothing above its floor to take)


class SpendMoreTest(unittest.TestCase):
    def test_a_technomancers_forms_past_the_free_ones_cost_karma(self):
        rows = {**ROWS, "A": {**ROWS["A"], "magic": {"full": 3, "technomancer": 2}}}
        n = need(magic="technomancer", attrs={**{k: 1 for k in fit.CORE}, "res": 3, "edg": 1}, forms=3, spells=1, meta="Gnoll")
        got = fit.fit(n, rows, CS)
        self.assertEqual(got["letters"]["magic"], "A")  # (the row that lists the kind)
        self.assertEqual(got["attrs"]["res"], [0, 1, 0])  # (the point above the priority's Resonance is an adjustment point)
        self.assertEqual(got["extraMagic"], 2)  # (one form past the two free, and the sprite spell)
        self.assertEqual(got["karmaLeft"], 26)  # (30 less 2 karma a form and 2 a spell past the free ones)

    def test_a_printed_karma_to_nuyen_count_is_used_unless_the_gear_needs_more(self):
        n = need(attrs={**{k: 1 for k in fit.CORE}, "bod": 3, "edg": 1}, nuyen=450)
        free = fit.fit(n, ROWS, CS)["karmaToNuyen"]
        self.assertEqual(free, 4)  # (what the gear needs past the 100 the E row gives)
        got = fit.fit({**n, "toNuyen": 5}, ROWS, CS)
        self.assertEqual((got["karmaToNuyen"], got["nuyenLeft"], got["karmaLeft"]), (5, 150, 25))
        self.assertEqual(fit.fit({**n, "toNuyen": 0}, ROWS, CS)["karmaToNuyen"], free)  # (never less than the gear needs)


if __name__ == "__main__":
    unittest.main()
