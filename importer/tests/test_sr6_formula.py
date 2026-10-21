"""SR6 formulas and issues (importer/sr6/formula.py). Every value and name here is invented."""

import unittest

from importer.sr6 import catalog, formula as F

# pylint: disable=protected-access


class GrammarTest(unittest.TestCase):
    def test_arithmetic_and_rounding(self):
        self.assertEqual(F.evaluate("R*2000", R=3), 6000)
        self.assertEqual(F.evaluate("R/3", R=4), 2)  # `/` rounds up by default
        self.assertEqual(F.evaluate("R/3", R=4, round="down"), 1)
        self.assertEqual(F.evaluate("-2 + 3*(R - 1)", R=2), 1)

    def test_tier_bands_and_open_band(self):
        e = "tier(R; 1-3: R*100; 4-6: R*500; 9: 7000; 10+: R*1000)"
        self.assertEqual([F.evaluate(e, R=r) for r in (2, 5, 9, 12)], [200, 2500, 7000, 12000])
        self.assertIsNone(F.evaluate(e, R=8))  # no band holds it

    def test_variables_options_refs_and_calls(self):
        self.assertEqual(F.evaluate("Q*30 * (1 - 0.5*opt.lid)", Q=4, opt={"lid": 1}), 60)
        self.assertEqual(F.evaluate("B + R*10", R=2, B=100), 120)
        self.assertIsNone(F.evaluate("B + R*10", R=2))  # B unknown
        refs = {("gear:zz.widget", "cost", 3.0): 900.0}
        self.assertEqual(
            F.evaluate("ref(gear:zz.widget, cost, R) + 5", R=3, ref=lambda t, f, r: refs.get((t, f, r))), 905
        )
        self.assertEqual(F.evaluate("max(M*2, floor(7/2))", M=1), 4)  # floor(ceil(3.5)) = 4: `/` rounds up first
        self.assertEqual(F.variables("ref(gear:zz.w, cost) + opt.x*Q"), {"ref", "opt.x", "Q"})

    def test_bad_formulas_are_refused(self):
        for bad in ("R*", "tier(R)", "ref(cost)", "R +* 2", "foo(R)", "R R"):
            self.assertFalse(F.valid(bad), bad)


class ReadTest(unittest.TestCase):
    """Printed value styles -> the grammar (invented prices)."""

    def check(self, printed, expr, field="cost", **extra):
        """Assert that `printed` reads to `expr`, with any extra attributes."""
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
        self.check("(Force) L", "(R)", "avail")  # a focus: the legality after the bracket
        self.check("(Force +2) L", "(R + 2)", "avail")

    def test_per_unit_values(self):
        self.check("70¥ per CF", "Q*70", unit="CF")
        self.check("40¥/pair", "Q*40", unit="pair")
        self.check("Rating x 20¥ per dose", "Q*(R*20)", unit="dose")
        self.check("CF x 60", "Q*60", unit="CF")
        self.check("900¥ (+150¥ per additional spike)", "900 + 150*(Q - 1)", unit="spike")

    def test_base_item_values(self):
        self.check("x3", "B*3")
        self.check("(Widget) x 2", "B*2")
        self.check("Gizmo cost x 0.25", "B*0.25")  # a share of the item it is made for (`Focus cost x 0.25`)
        self.check("As gizmo", "B", "avail")
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
        for v in (
            "2,500¥",
            "4(L)",
            "500 each",
            "6*",
            "500,000+",
            "(I) 6",
            "—",
            "n/a",
            "Special",
            "900/1800",
            "Rating x 300¥/700¥",
            "70 (Zap); 90 (Zap+)",
            "2 or 1 CF",
            "+10 / +30",
            "Body x 50",
        ):
            self.assertIsNone(F.read(v), v)
        self.assertEqual(F.plain("[3]", "capacity"), 3)
        self.assertTrue(F.two_values("Rating x 300¥/700¥"))
        self.assertFalse(F.two_values("(Rating/3)"))


class ChildrenTest(unittest.TestCase):
    def kids(self, kind, attrs, **kw):
        """The children the formula reader makes for a row of `kind` with `attrs`."""
        return F.children(kind, attrs, 12, **kw)

    def test_per_unit_price(self):
        # (qty is the app's units per price, never the count range a row prints: that stays in the text)
        self.assertEqual(
            self.kids(
                "gear",
                {"category": "box", "avail": "2", "cost": "80", "per": "CF"},
                row={"BOX": "Zorp Box", "SPACE": "1–6", "SIZE": "3"},
            ),
            [("formula", {"field": "cost", "unit": "CF"}, "Q*80")],
        )

    def test_a_price_off_another_item_is_an_issue_stating_its_rule(self):
        k = self.kids("gear", {"category": "x", "rating": "1–4", "avail": "2", "cost": "Gizmo cost plus rating x 70"})
        self.assertEqual(
            k, [("issue", {"field": "cost", "code": "ambiguous", "page": 12}, "priced from another item: base + R*70")]
        )

    def test_issues(self):
        k = self.kids("gear", {"category": "x", "cost": "Rating x 50", "avail": ""})
        self.assertIn(("formula", {"field": "cost"}, "R*50"), k)
        self.assertIn(("issue", {"field": "avail", "code": "missing", "page": 12}, "no availability printed"), k)
        self.assertIn(("issue", {"field": "rating", "code": "missing", "page": 12}, "no rating range printed"), k)
        k = self.kids("weapons", {"category": "x", "avail": "2", "cost": "Ask the troll"}, readable=lambda v: False)
        self.assertEqual(k, [("issue", {"field": "cost", "code": "unreadable", "page": 12}, "printed: Ask the troll")])
        k = self.kids("gear", {"category": "x", "avail": "2", "cost": "900/1800"})
        self.assertEqual(k[0][1]["code"], "ambiguous")
        # (a misprinted thousands group: no number, even one the app would read)
        k = self.kids("gear", {"category": "x", "avail": "2", "cost": "1,00¥"}, readable=lambda v: True)
        self.assertEqual(k, [("issue", {"field": "cost", "code": "unreadable", "page": 12}, "printed: 1,00¥")])
        self.assertEqual(
            self.kids("qualities", {"kind": "positive"})[0][1], {"field": "karma", "code": "missing", "page": 12}
        )

    def test_a_plain_entry_gets_nothing(self):
        self.assertEqual(self.kids("gear", {"category": "x", "avail": "3(L)", "cost": "1,000"}), [])

    def test_section_option_on_the_cost(self):
        opts = F.section_options("Lidded versions of all boxes are available at twice the listed cost.")
        self.assertEqual(opts, [("lidded", "lidded", 2.0)])
        k = self.kids("gear", {"category": "x", "avail": "2", "cost": "80", "per": "CF"}, options=opts)
        self.assertEqual(k, [("formula", {"field": "cost", "unit": "CF"}, "(Q*80)*(1 + 1*opt.lidded)")])
        self.assertTrue(F.names("Boxes and Crates", "Small box"))
        self.assertFalse(F.names("Boxes and Crates", "Zorp gun"))

    def test_band_rows_share_one_tier_rule(self):
        es = [
            {
                "name": "Zorp Relay",
                "page": 5,
                "attrs": {"category": "r", "rating": "1–2", "avail": "2", "cost": "Rating x 100"},
            },
            {
                "name": "Zorp Relay",
                "page": 5,
                "attrs": {"category": "r", "rating": "3–4", "avail": "4(L)", "cost": "Rating x 300"},
            },
            {
                "name": "Zorp Relay (Rating 5+)",
                "page": 5,
                "attrs": {"category": "r", "avail": "Rating(L)", "cost": "Rating x 900"},
            },
        ]
        t = F.tier_groups(es)
        self.assertEqual(len(t), 3)
        rule = t[id(es[0])]
        self.assertEqual(rule["cost"], "tier(R; 1-2: R*100; 3-4: R*300; 5+: R*900)")
        self.assertEqual(rule["avail"], "tier(R; 1-2: 2; 3-4: 4; 5+: R)")
        self.assertEqual(F.evaluate(rule["cost"], R=6), 5400)


if __name__ == "__main__":
    unittest.main()


class CellSplitTest(unittest.TestCase):
    """catalog.Catalog.fields on invented rows: two fields in one cell, a thousands point."""

    def fields(self, kind, row):
        """The fields the crb catalog reads from a one-row block of `kind`."""
        from importer.sr6.recipes import crb
        from importer.sr6.regroup import Block

        b = Block("item", next(iter(row.values())), "GEAR", "", "", 3, list(row), row)
        return catalog.Catalog(crb.ID, "crb", crb.BOOK).fields(kind, b, 2)

    def test_dv_and_blast(self):
        f = self.fields("weapons", {"WEAPON": "Zorp Cannon", "DV": "9P(15m blast)", "AVAIL": "8", "COST": "9,000¥"})
        self.assertEqual((f["dv"], f["blast"]), ("9P", "15m"))

    def test_dv_and_a_note(self):
        f = self.fields("weapons", {"WEAPON": "Zorp Dart", "DV": "2P + special", "AVAIL": "3", "COST": "300¥"})
        self.assertEqual(f["dv"], "2P")
        self.assertIn("**DV:** 2P + special", f["prose"])

    def test_thousands_point(self):
        self.assertEqual(self.fields("gear", {"ITEM": "Zorp Refill", "AVAIL": "2", "COST": "2.400¥"})["cost"], "2400")
        self.assertEqual(self.fields("gear", {"ITEM": "Zorp Dust", "AVAIL": "2", "COST": "0.5¥"})["cost"], "0.5")


class VehicleBandTest(unittest.TestCase):
    """shapes.vehicle_band on an invented vehicle's text."""

    def test_header_line_with_a_speed_table(self):
        from importer.sr6.shapes import vehicle_band

        text = (
            "A zoomy thing.\n| SPD INT | TOP SPD |\n|---|---|\n| 12 | 40 |\n"
            "**HAND ACC BOD ARM PIL SENS SEATAVAIL COST**\n3 6 4 2 1 1 2 3(L) 9,900¥\n**Standard Equipment:** none"
        )
        b = vehicle_band(text)
        self.assertEqual(
            (b["SPEED INTERVAL"], b["TOP SPEED"], b["SEATS"], b["AVAIL"], b["COST"]),
            ("12", "40", "2", "3(L)", "9,900¥"),
        )

    def test_interleaved_and_run_together_headers(self):
        from importer.sr6.shapes import _columns

        self.assertEqual(
            _columns("HAND S INP TD SPTO EEP D ARMORPILOT".split()),
            ["HANDLING", "SPEED INTERVAL", "TOP SPEED", "ARMOR", "PILOT"],
        )
        self.assertIsNone(_columns("HAND ZORP".split()))


class DescriptionValuesTest(unittest.TestCase):
    """Values a row leaves out and its (invented) description words."""

    def test_ammo_in_the_description(self):
        from importer.sr6.catalog import ammo_from_text

        self.assertEqual(ammo_from_text("Zorpbows have internal magazines that hold up to three bolts."), "3(m)")
        self.assertEqual(ammo_from_text("Its drum holds 30 rounds."), "30(d)")
        self.assertIsNone(ammo_from_text("It holds a grudge."))

    def test_price_per_unit_in_the_description(self):
        self.assertEqual(
            F.text_unit("Cost is based on length per ten centimeters (minimum 20 cm, maximum 1 meter)."),
            ("10 cm", "2-10"),
        )
        self.assertEqual(F.text_unit("Cost is per glob."), ("glob", None))
        k = F.children("gear", {"category": "x", "avail": "2", "cost": "400"}, 3, text="Cost is per glob.")
        self.assertEqual(k, [("formula", {"field": "cost", "unit": "glob"}, "Q*400")])

    def test_quality_price_see_text(self):
        from importer.sr6.recipes import swc

        cat = catalog.Catalog("SWC", "swc", "x")
        swc._qualities(
            cat,
            "Glum Aura",
            "**Bonus:** See text\nA glum aura grants a bonus of 6 Karma. For the "
            "Awakened this quality has a bonus of 11 Karma.",
            9,
        )
        a = cat.entries["qualities"][0]["attrs"]
        self.assertEqual((a["karma"], a["karmaMax"], a["kind"]), (6, 11, "negative"))


class MoreStylesTest(unittest.TestCase):
    """Invented: options a description prices, a row of footnote marks priced off a base item, energy shots."""

    def test_description_option(self):
        k = F.children(
            "vehicles",
            {"category": "boats", "avail": "2", "cost": "2,000"},
            5,
            text="**Note:** Faster with the tiny motor (costs 300¥).",
        )
        self.assertEqual(k, [("formula", {"field": "cost"}, "2000 + 300*opt.tiny-motor")])

    def test_half_of_a_base_item(self):
        k = F.children(
            "augmentations",
            {"type": "cyberware", "category": "eyes", "essence": "*", "capacity": "*", "avail": "*", "cost": "*"},
            5,
            text="One glow eye costs one half the Essence and nuyen cost, and has one half the capacity.",
        )
        self.assertEqual(
            {c[1]["field"]: c[2] for c in k if c[0] == "issue"},
            {f: "priced from another item: base*0.5" for f in ("cost", "essence", "capacity")}
            | {"avail": "priced from another item: base"},
        )

    def test_rating_dv(self):
        k = F.children("weapons", {"category": "x", "dv": "(1–8) S", "avail": "2", "cost": "100"}, 5)
        self.assertIn(("formula", {"field": "dv"}, "R"), k)

    def test_energy_shots(self):
        sup = {"power cell": "zz.power-cell", "power pack": "zz.power-pack"}
        self.assertEqual(
            F.energy_ammo("Includes power pack. Uses 4 Energy per individual shot.", "", sup),
            "ref(gear:zz.power-pack, energy)/4",
        )
        self.assertEqual(
            F.energy_ammo("Uses 2 Energy per shot.", "These come with power cells as standard.", sup),
            "ref(gear:zz.power-cell, energy)/2",
        )
        self.assertIsNone(F.energy_ammo("Uses 2 Energy per shot.", "", sup))
        self.assertEqual(F.evaluate("ref(gear:zz.power-cell, energy)/3", ref=lambda t, f, r: 10.0, round="down"), 3)

    def test_level_rows_share_a_tier_and_ask_no_rating(self):
        es = [
            {
                "name": "Zorp Arm (Level 1)",
                "page": 4,
                "attrs": {"category": "a", "capacity": "[2]", "avail": "4", "cost": "500"},
            },
            {
                "name": "Zorp Arm (Level 2)",
                "page": 4,
                "attrs": {"category": "a", "capacity": "[4]", "avail": "4", "cost": "500"},
            },
        ]
        t = F.tier_groups(es)[id(es[0])]
        self.assertEqual(t, {"capacity": "tier(R; 1: 2; 2: 4)"})
        k = F.children("augmentations", {**es[0]["attrs"], "type": "cyberware", "essence": "—"}, 4, tiered=t)
        self.assertEqual(k, [("formula", {"field": "capacity"}, "tier(R; 1: 2; 2: 4)")])


class StatIssuesTest(unittest.TestCase):
    """Invented: a ranged weapon or a vehicle read in part gets an issue per field the book leaves out."""

    def test_ranged_weapon_without_modes_or_ammo(self):
        k = F.children("weapons", {"category": "x", "dv": "5P", "ar": "—/8/9/7/—", "avail": "4", "cost": "900"}, 6)
        self.assertEqual([c[1]["field"] for c in k if c[0] == "issue"], ["modes", "ammo"])
        melee = F.children("weapons", {"category": "x", "dv": "3P", "ar": "8/—/—/—/—", "avail": "2", "cost": "100"}, 6)
        self.assertEqual(melee, [])

    def test_vehicle_read_in_part(self):
        k = F.children(
            "vehicles",
            {
                "category": "x",
                "handling": "3",
                "accel": "10",
                "interval": "20",
                "topSpeed": "90",
                "body": "8",
                "armor": "4",
                "avail": "2",
                "cost": "9000",
            },
            6,
        )
        self.assertEqual(
            [(c[1]["field"], c[2]) for c in k],
            [("pilot", "no pilot printed"), ("sensor", "no sensor printed"), ("seats", "no seats printed")],
        )
