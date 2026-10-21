"""An item's other printed name (an <alias>): a row kept under a longer heading, a box's one row under its title, a
supply table right after its weapon; and a box stacking several weapon tables. Invented books only."""

import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup
from importer.sr6.recipes import crb, da
from importer.sr6.regroup import other_name

MD = """<!-- page 10 -->
# GEAR
## Trucks
#### Bloop Hauler Long-Van
The hauler is everywhere.
| VEHICLE | HANDLING | ACCEL | SPEED INTERVAL | TOP SPEED | BODY | ARMOR | PILOT | SENSOR | SEATS | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Bloop Hauler | 4/6 | 9 | 10 | 120 | 14 | 10 | 2 | 2 | 2 | 2 | 30,000¥ |
"""

DA_MD = """<!-- page 50 -->
# SENDING IT DOWNRANGE
## Launchers
#### Zorp ZX-12 Thumper
Thumps.
#### Zorp ZX-24 Bigger Thumper
Thumps more.
##### Launchers
| NAME | TYPE | DV | SIZE | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|
| Plain Launcher | Launcher | Grenade | 0 | SS | 4/8/6/—/— | 4(c) | 3 | 900¥ |
| NAME | TYPE | DV | SIZE | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|
| ZX-12 | Launcher | Grenade | 0 | SA | —/8/9/7/6 | 12(d) | 6 | 7,000¥ |
| NAME | TYPE | DV | SIZE | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|
| ZX-24 | Launcher | Grenade | 1 | SA/BF | —/8/9/9/7 | 24(d) | 8(I) | 20,000¥ |
## Mil-Spec
#### Sprayers
Sprayers spray.
##### Bloop Scorcher Vehicle Sprayer
| NAME | TYPE | DV | SIZE | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|
| Scorcher | Spray | 9P | 3 | SS | —/16/10/—/— | 20 (tank) | 12(I) | 80,000¥ |
##### Vehicle Sprayer Fuel
| AVAIL | COST |
|---|---|
| 5(I) | 250¥ per shot |
"""


def weapons(res, kind="weapons"):
    """{name: entry} of the `kind` entries of a reading."""
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


class AliasTest(unittest.TestCase):
    def test_other_name(self):
        self.assertTrue(other_name("Bloop Hauler", "Bloop Hauler Long-Van"))  # the row prints it shorter
        self.assertTrue(other_name("Zip pick set", "Zip pick kit"))  # spelled another way
        self.assertFalse(other_name("Widget w/ case", "Widget Deluxe"[:6]))  # one word: not distinctive
        self.assertFalse(other_name("Zap 12", "Zap 6/12"))  # a heading over two items
        self.assertFalse(other_name("Full kit w/ case", "Full kit"))  # the row only adds to it

    def test_row_under_a_longer_heading(self):
        text, _ = regroup.regroup(MD, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        b = next(b for b in regroup.blocks(text) if b.name == "Bloop Hauler")
        self.assertEqual(b.aliases, ["Bloop Hauler Long-Van"])
        res = crb.extract(text)
        v = next(e for e in ET.fromstring(res.files["vehicles.xml"]) if e.findtext("name") == "Bloop Hauler")
        self.assertEqual([a.text for a in v.findall("alias")], ["Bloop Hauler Long-Van"])

    def test_stacked_weapon_tables_and_supply(self):
        text, _ = regroup.regroup(DA_MD, da.ALIASES, name_headers=da.NAME_HEADERS)
        w = weapons(da.extract(text))
        self.assertEqual((w["ZX-24"].get("ammo"), w["ZX-24"].get("cost")), ("24(d)", "20000"))
        self.assertEqual([a.text for a in w["ZX-24"].findall("alias")], ["Zorp ZX-24 Bigger Thumper"])
        self.assertIn("ZX-12", w)
        self.assertEqual([a.text for a in w["Scorcher"].findall("alias")], ["Bloop Scorcher Vehicle Sprayer"])
        g = weapons(da.extract(text), "gear")
        self.assertEqual(
            [a.text for a in g["Vehicle Sprayer Fuel"].findall("alias")], ["Scorcher Fuel", "Fuel for Scorcher"]
        )


if __name__ == "__main__":
    unittest.main()
