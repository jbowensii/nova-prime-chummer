"""SR6 formulas and issues (importer/sr6/formula.py). Every value and name here is invented."""
import unittest

from importer.sr6 import formula as F


class GrammarTest(unittest.TestCase):
    def test_arithmetic_and_rounding(self):
        self.assertEqual(F.evaluate("R*2000", R=3), 6000)
        self.assertEqual(F.evaluate("R/3", R=4), 2)  # `/` rounds up by default
        self.assertEqual(F.evaluate("R/3", R=4, round="down"), 1)
        self.assertEqual(F.evaluate("-2 + 3*(R - 1)", R=2), 1)

    def test_tier_bands_and_open_band(self):
        e = "tier(R; 1-3: R*100; 4-6: R*500; 9: 7000; 10-: R*1000)"
        self.assertEqual([F.evaluate(e, R=r) for r in (2, 5, 9, 12)], [200, 2500, 7000, 12000])
        self.assertIsNone(F.evaluate(e, R=8))  # no band holds it

    def test_variables_options_refs_and_calls(self):
        self.assertEqual(F.evaluate("Q*30 * (1 - 0.5*opt.lid)", Q=4, opt={"lid": 1}), 60)
        self.assertEqual(F.evaluate("B + R*10", R=2, B=100), 120)
        self.assertIsNone(F.evaluate("B + R*10", R=2))  # B unknown
        refs = {("gear:zz.widget", "cost", 3.0): 900.0}
        self.assertEqual(F.evaluate("ref(gear:zz.widget, cost, R) + 5", R=3, ref=lambda t, f, r: refs.get((t, f, r))), 905)
        self.assertEqual(F.evaluate("max(M*2, floor(7/2))", M=1), 4)  # floor(ceil(3.5)) = 4: `/` rounds up first
        self.assertEqual(F.variables("ref(gear:zz.w, cost) + opt.x*Q"), {"ref", "opt.x", "Q"})

    def test_bad_formulas_are_refused(self):
        for bad in ("R*", "tier(R)", "ref(cost)", "R +* 2", "foo(R)", "R R"):
            self.assertFalse(F.valid(bad), bad)


class ReadTest(unittest.TestCase):
    """Printed value styles -> the grammar (invented prices)."""

    def check(self, printed, expr, field="cost", **extra):
        got = F.read(printed, field)
        self.assertIsNotNone(got, printed)
        self.assertEqual(got[0], expr, printed)
        for k, v in extra.items():
            self.assertEqual(got[1].get(k), v, printed)

    def test_rated_values(self):
        self.check("Rating x 1,200¥", "R*1200")
        self.check("(Rating/4)", "(R/4)", "avail")
        self.check("Rating(I)", "R", "avail")
        self.check("1,100¥ + [300¥ x Size]", "1100 + (300*R)")
        self.check("Magic*70¥", "M*70")
        self.check("Rating x 30¥ (5 uses)", "R*30")
        self.check("[Rating]", "R", "capacity")
        self.check("3(I) + Size", "3 + R", "avail")

    def test_per_unit_values(self):
        self.check("70¥ per CF", "Q*70", unit="CF")
        self.check("40¥/pair", "Q*40", unit="pair")
        self.check("Rating x 20¥ per dose", "Q*(R*20)", unit="dose")
        self.check("CF x 60", "Q*60", unit="CF")
        self.check("900¥ (+150¥ per additional spike)", "900 + 150*(Q - 1)", unit="spike")

    def test_base_item_values(self):
        self.check("x3", "B*3")
        self.check("(Widget) x 2", "B*2")
        self.check("+50%", "B*1.5")
        self.check("Gizmo cost plus rating x 70", "B + R*70")
        self.check("120¥ + Gizmo Cost", "120 + B")
        self.check("80¥ + 3 doses goo", "80 + 3*B")
        self.check("1 month of chosen gizmo cost x the number of riders", "B*Q", unit="rider")

    def test_options_and_seats(self):
        got = F.read("700¥ (+90¥ for glow paint)")
        self.assertEqual(got[0], "700 + 90*opt.glow-paint")
        self.assertEqual(got[1]["options"], [("glow-paint", "glow paint")])
        self.check("3/5", "3 + 5", "seats")
        self.check("1+1", "1 + 1", "seats")

    def test_plain_dash_words_and_two_values_are_no_formula(self):
        for v in ("2,500¥", "4(L)", "500 each", "6*", "500,000+", "(I) 6", "—", "n/a", "Special", "900/1800",
                  "Rating x 300¥/700¥", "70 (Zap); 90 (Zap+)", "2 or 1 CF", "+10 / +30", "Body x 50"):
            self.assertIsNone(F.read(v), v)
        self.assertEqual(F.plain("[3]", "capacity"), 3)
        self.assertTrue(F.two_values("Rating x 300¥/700¥"))
        self.assertFalse(F.two_values("(Rating/3)"))


class ChildrenTest(unittest.TestCase):
    def kids(self, kind, attrs, **kw):
        return F.children(kind, attrs, 12, **kw)

    def test_per_unit_price_takes_its_count_range(self):
        self.assertEqual(self.kids("gear", {"category": "box", "avail": "2", "cost": "80", "per": "CF"},
                                   row={"BOX": "Zorp Box", "SPACE": "1–6", "SIZE": "3"}),
                         [("formula", {"field": "cost", "unit": "CF", "qty": "1-6"}, "Q*80")])

    def test_issues(self):
        k = self.kids("gear", {"category": "x", "cost": "Rating x 50", "avail": ""})
        self.assertIn(("formula", {"field": "cost"}, "R*50"), k)
        self.assertIn(("issue", {"field": "avail", "code": "missing", "page": 12}, "no availability printed"), k)
        self.assertIn(("issue", {"field": "rating", "code": "missing", "page": 12}, "no rating range printed"), k)
        k = self.kids("weapons", {"category": "x", "avail": "2", "cost": "Ask the troll"}, readable=lambda v: False)
        self.assertEqual(k, [("issue", {"field": "cost", "code": "unreadable", "page": 12}, "printed: Ask the troll")])
        k = self.kids("gear", {"category": "x", "avail": "2", "cost": "900/1800"})
        self.assertEqual(k[0][1]["code"], "ambiguous")
        self.assertEqual(self.kids("qualities", {"kind": "positive"})[0][1], {"field": "karma", "code": "missing", "page": 12})

    def test_a_plain_entry_gets_nothing(self):
        self.assertEqual(self.kids("gear", {"category": "x", "avail": "3(L)", "cost": "1,000"}), [])

    def test_section_option_on_the_cost(self):
        opts = F.section_options("Lidded versions of all boxes are available at twice the listed cost.")
        self.assertEqual(opts, [("lidded", "lidded", 2.0)])
        k = self.kids("gear", {"category": "x", "avail": "2", "cost": "80", "per": "CF"}, options=opts)
        self.assertEqual(k, [("option", {"id": "lidded", "name": "lidded"}, None),
                             ("formula", {"field": "cost", "unit": "CF"}, "(Q*80)*(1 + 1*opt.lidded)")])
        self.assertTrue(F.names("Boxes and Crates", "Small box"))
        self.assertFalse(F.names("Boxes and Crates", "Zorp gun"))

    def test_band_rows_share_one_tier_rule(self):
        es = [{"name": "Zorp Relay", "page": 5, "attrs": {"category": "r", "rating": "1–2", "avail": "2", "cost": "Rating x 100"}},
              {"name": "Zorp Relay", "page": 5, "attrs": {"category": "r", "rating": "3–4", "avail": "4(L)", "cost": "Rating x 300"}},
              {"name": "Zorp Relay (Rating 5+)", "page": 5, "attrs": {"category": "r", "avail": "Rating(L)", "cost": "Rating x 900"}}]
        t = F.tier_groups(es)
        self.assertEqual(len(t), 3)
        rule = t[id(es[0])]
        self.assertEqual(rule["cost"], "tier(R; 1-2: R*100; 3-4: R*300; 5-: R*900)")
        self.assertEqual(rule["avail"], "tier(R; 1-2: 2; 3-4: 4; 5-: R)")
        self.assertEqual(F.evaluate(rule["cost"], R=6), 5400)


if __name__ == "__main__":
    unittest.main()
