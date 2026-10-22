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


if __name__ == "__main__":
    unittest.main()
