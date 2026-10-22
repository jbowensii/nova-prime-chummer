"""SR6 sample runners (importer/sr6/archetypes.py): reading rules on made-up catalogs and lines."""

import unittest

from importer.sr6 import archetypes

# pylint: disable=protected-access  # the tests reach into private helpers


def _e(i, n, **a):
    return {"id": i, "name": n, "attrs": a, "children": [], "text": ""}


class SampleLines(unittest.TestCase):
    """A sample's printed lines read into purchases."""

    def test_an_implant_printed_with_the_device_it_holds_buys_it(self):
        """`Gizmolink (Zephyr Ikon) (alpha)`: an implant priced with the device it holds, printed with that device (an
        entry whose category is the implant's name), buys the device with it at the implant's grade; a name in its
        brackets that isn't one of those is left in the note (made-up catalog)."""
        idx = archetypes._Index(
            {
                "augmentations": [_e("gizmolink", "Gizmolink", category="Headware", capacity="[2]", cost="2000")],
                "electronics": [
                    _e("zephyr-ikon", "Zephyr Ikon", category="Gizmolink", cost="5000"),
                    _e("glowstick", "Glowstick", category="Light", cost="10"),
                ],
            },
            "NB",
        )
        cs = {"grade:alpha:cost": 1.2}
        line, _, cost = archetypes._purchase(idx, ["augmentations"], "Gizmolink (Zephyr Ikon) (alpha)", 3, [], cs)
        self.assertIn('<purchase uid="g3a1" kind="electronics" id="nb.zephyr-ikon" name="Zephyr Ikon" qty="1"/>', line)
        self.assertEqual(cost, (2000 + 5000) * 1.2)
        line, _, cost = archetypes._purchase(idx, ["augmentations"], "Gizmolink (Glowstick)", 4, [], {})
        self.assertNotIn("nb.glowstick", line)
        self.assertEqual(cost, 2000)

    def test_a_name_found_by_its_tail_or_at_75_percent(self):
        """A name nothing else finds: the entry its last words name (`Brandco Q.R. Sunny Days`: Sunny Days), else the
        one most like it at 75% or more (`Zapper 301`: Zapper 301X; `Toughen 1` in a limb's brackets: the Toughening
        implant, its number not read as a stat like `Agility 5`); below 75%, nothing (made-up catalog)."""
        idx = archetypes._Index(
            {
                "gear": [_e("sunny-days", "Sunny Days", category="Preparation", cost="500")],
                "weapons": [_e("zapper-301x", "Zapper 301X", category="Light pistol", cost="460")],
                "augmentations": [
                    _e("arm-obvious", "Arm (obvious)", category="Cyberlimb", capacity="15", cost="15000"),
                    _e("toughening", "Toughening", category="Cyber implant weapon", capacity="[1]", cost="2500"),
                ],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(idx, ["gear"], "Brandco Q.R. Sunny Days", 1, [], {})
        self.assertIn('id="nb.sunny-days"', line)
        self.assertEqual(cost, 500)
        self.assertIn('id="nb.zapper-301x"', archetypes._purchase(idx, ["weapons"], "Zapper 301", 2, [], {})[0])
        self.assertIsNone(archetypes._purchase(idx, ["weapons"], "Zipper", 3, [], {})[0])
        line, _, cost = archetypes._purchase(
            idx, ["augmentations"], "cyberarm (obvious, Agility 2; Toughen 1)", 4, [], {}, nat={"agi": 3}
        )
        self.assertIn('id="nb.toughening"', line)
        self.assertEqual(cost, 15000 + 2500)

    def test_a_cargo_mod_printed_with_its_cf_is_rated_for_one_occupant(self):
        """`Bigvan (Bunk Space 6 CF)`: a vehicle mod whose slots are `2 CF x rating x occupants` printed with its CF is
        taken at the rating that fills it for one occupant, rating 3 (made-up catalog)."""
        idx = archetypes._Index(
            {
                "vehicles": [_e("bigvan", "Bigvan", category="Van", cost="30000")],
                "gear": [
                    _e(
                        "bunk",
                        "Bunk Space",
                        category="Chassis mod",
                        slots="2 CF x rating x occupants",
                        cost="Rating x 1000",
                    )
                ],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(idx, ["vehicles"], "Bigvan (Bunk Space 6 CF)", 5, [], {})
        self.assertIn('<purchase uid="g5a1" kind="gear" id="nb.bunk" name="Bunk Space" rating="3" qty="1"/>', line)
        self.assertEqual(cost, 30000 + 3000)


if __name__ == "__main__":
    unittest.main()
