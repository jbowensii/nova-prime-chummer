"""SR6 sample runners (importer/sr6/archetypes.py): reading rules on made-up catalogs and lines."""

import re
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
                "gear": [
                    _e("sunny-days", "Sunny Days", category="Preparation", cost="500"),
                    _e("shed", "Shed", category="Tool", cost="5000"),
                    _e("agent", "Agent", category="Software", rating="1-6", cost="Rating x 1000"),
                ],
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
        # a last word alone: an item's (`Garden tool shed`), but never another kind's for a fitted thing (`implanted
        # Zapper Agent` in a limb is no Agent program)
        self.assertIn('id="nb.shed"', archetypes._purchase(idx, ["gear"], "Garden tool shed", 5, [], {})[0])
        line, _, cost = archetypes._purchase(
            idx, ["augmentations"], "cyberarm (obvious; implanted Zapper Agent)", 6, [], {}
        )
        self.assertNotIn("nb.agent", line)
        self.assertEqual(cost, 15000)

    def test_an_implanted_firearm_buys_its_class_implant_and_a_misprinted_add_on_is_read(self):
        """`implanted Zapper 9` in a cyberlimb: the cyber implant weapon of the Zapper's class (its category `Hold-out`,
        the implant `Hold-out pistol`), not the firearm (bought on its own line); a weapon's `smarklink system` is the
        Smartgun system at 75% (made-up catalog)."""
        idx = archetypes._Index(
            {
                "augmentations": [
                    _e("arm-obvious", "Arm (obvious)", category="Cyberlimb", capacity="15", cost="15000"),
                    _e(
                        "hold-out-pistol",
                        "Hold-out pistol",
                        category="Cyber implant weapon",
                        capacity="[2]",
                        cost="2000",
                    ),
                    _e("light-pistol", "Light pistol", category="Cyber implant weapon", capacity="[4]", cost="3000"),
                ],
                "weapons": [
                    _e("zapper-9", "Zapper 9", category="Hold-out", cost="550"),
                    _e("smartgun", "Smartgun system, internal", category="Weapon accessory", cost="500"),
                ],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(
            idx, ["augmentations"], "cyberarm (obvious; implanted Zapper 9)", 1, [], {}
        )
        self.assertIn('id="nb.hold-out-pistol"', line)
        self.assertNotIn("nb.zapper-9", line)
        self.assertEqual(cost, 15000 + 2000)
        line, _, cost = archetypes._purchase(
            idx, ["weapons"], "Zapper 9", 2, [], {}, note="Zapper 9 [Hold-out, w/ smarklink system]"
        )
        self.assertIn('id="nb.smartgun"', line)
        self.assertEqual(cost, 550 + 500)

    def test_a_stat_in_brackets_is_no_fitted_thing(self):
        """A rating, a limb's attribute, a device's or a focus's stat is skipped; a thing with a number is not."""
        stats = ["Rating 3", "Agility 6", "Programs 3", "D/F 3/1", "Force 3", "Armor 2", "Attack 4", "Sleaze 4"]
        stats += ["Data Processing 4", "Firewall 5", "Device Rating 6", "DR 4", "12"]
        for x in stats:
            self.assertRegex(x, re.compile(archetypes._STAT, re.I))
        self.assertNotRegex("Harden 1", re.compile(archetypes._STAT, re.I))

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

    def test_an_electronics_mod_printed_with_a_vehicle_is_fitted_to_it(self):
        """`Bigvan (shiny paint)`: a vehicle takes a mod priced in mod slots, not only a cargo mod (made-up catalog)."""
        idx = archetypes._Index(
            {
                "vehicles": [_e("bigvan", "Bigvan", category="Van", cost="30000")],
                "gear": [_e("shiny", "Shiny Paint", category="Electronics mod", slots="1", cost="1500")],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(idx, ["vehicles"], "Bigvan (shiny paint)", 5, [], {})
        self.assertIn('<purchase uid="g5a1" kind="gear" id="nb.shiny" name="Shiny Paint" qty="1"/>', line)
        self.assertEqual(cost, 30000 + 1500)

    def test_only_a_vehicle_takes_a_slotted_mod_and_only_a_slotted_one(self):
        """A weapon is not fitted a mod priced in slots, nor a vehicle a plain gear row (made-up catalog)."""
        idx = archetypes._Index(
            {
                "vehicles": [_e("bigvan", "Bigvan", category="Van", cost="30000")],
                "weapons": [_e("zap", "Zap Gun", category="Pistol", cost="500")],
                "gear": [
                    _e("shiny", "Shiny Paint", category="Electronics mod", slots="1", cost="1500"),
                    _e("plain", "Plain Thing", category="Widget", cost="10"),
                ],
            },
            "NB",
        )
        line, _, _ = archetypes._purchase(idx, ["weapons"], "Zap Gun (shiny paint)", 6, [], {})
        self.assertNotIn("nb.shiny", line)
        line, _, _ = archetypes._purchase(idx, ["vehicles"], "Bigvan (plain thing)", 7, [], {})
        self.assertNotIn("nb.plain", line)


if __name__ == "__main__":
    unittest.main()
