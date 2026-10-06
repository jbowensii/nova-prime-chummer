"""SR6 Explosive Decompression recipe (importer/sr6/recipes/ed.py) on a made-up book.md in the converter's sr6 shape
for this book (stat tables set apart from their titles, descriptions under level-3 and level-4 headings, roster stat
boxes under their section). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, ed, identify

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 78 -->
# OPENING BAY DOORS
## Standard Equipment
### Spacesuits
#### Fizz Suit
A made-up suit that fizzes.
#### fizz suit
| ITEM | DEFENSE RATING | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Space Suit | +2 | 8 | 4(L) | 4,000¥ |
#### Glow Boots
Made-up boots that glow.
#### tools table
| ITEM | AVAIL | COST |
|---|---|---|
| Glow Boots | 3 | 300¥ |
### Thruster Packs
#### Zoom Pack
A made-up pack that zooms.
#### zoom pack (thruster pack)
More made-up words about packs
in space.
| HANDL | ACCEL | SPD INT | TOP SPEED | BODY | ARMOR | PILOT | SENSOR | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 8 | 10 | 70 | 5 | 10 | 2 | 2 | 4(L) | 7,000¥ |
## Arms and Weaponry
### MadeTech Boomer
##### (Grenade Launcher)
A made-up launcher for space.
| TYPE | DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Grenade Launcher | Ammo | SA | 4/9/8/—/— | 10(c) | 4(I) | 2,000¥ |
<!-- page 88 -->
# PREPARE FOR LAUNCH
## Spaceships
### MadeCorp Comet
A made-up ship, quick.
##### Madecorp comet
| HAND | ACCEL | SPD INT | TOP SPD | BODY | ARMOR | PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 60 | 90 | 700 | 18 | 10 | 4 | 5 | 2 | 5(L) | 9,000,000¥ |
**Standard Upgrades:** Made-up hardpoints
<!-- page 170 -->
# MISSION ROSTERS
### Made Guard
##### (Professional Rating 3)
A made-up guard in space.
##### made guard
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 6 | 6/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Firearms 4
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(ed.prepare_md(md), ed.ALIASES, name_headers=ed.NAME_HEADERS)
    return ed.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class EdRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_prepare_moves_a_stray_title_to_its_table(self):
        lines = ed.prepare_md(BOOK_MD).splitlines()
        i = lines.index("#### Zoom pack (thruster pack)")  # moved down, and a heading now (its box)
        self.assertTrue(lines[i + 1].startswith("| HANDL |"))

    def test_gear_and_vehicles(self):
        a = entries(self.res, "armor")["Fizz Suit"]  # a one-row table named by its title
        self.assertEqual((a["category"], a["defense"], a["cost"]), ("Spacesuits", "+2", "4000"))
        self.assertIn("suit that fizzes", self.texts[("armor", "fizz-suit")])
        self.assertEqual(entries(self.res, "gear")["Glow Boots"]["cost"], "300")
        v = entries(self.res, "vehicles")
        self.assertEqual((v["Zoom Pack"]["category"], v["Zoom Pack"]["handling"], v["Zoom Pack"]["cost"]),
                         ("Thruster pack", "2", "7000"))
        self.assertEqual((v["MadeCorp Comet"]["category"], v["MadeCorp Comet"]["seats"]), ("Spaceships", "2"))
        self.assertIn("ship, quick", self.texts[("vehicles", "madecorp-comet")])
        self.assertNotIn("MadeCorp Comet", entries(self.res, "rules"))
        w = entries(self.res, "weapons")["MadeTech Boomer"]  # its band (no name column) in its text, its tag its type
        self.assertEqual((w["category"], w["type"], w["cost"]), ("Grenade launcher", "Grenade Launcher", "2000"))
        self.assertIn("launcher for space", self.texts[("weapons", "madetech-boomer")])

    def test_rosters(self):
        n = entries(self.res, "npcs")["Made Guard"]
        self.assertEqual((n["rating"], n["group"], n["bod"], n["dr"]), ("3", "Mission Rosters", "3", "6"))
        self.assertIn("guard in space", self.texts[("npcs", "made-guard")])

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(ed.match({"sha256": ed.SHA256[0]}, ""), 1.0)
        self.assertIs(identify({"sha256": "x", "title": "Shadowrun: Explosive Decompression"}, "")[0], ed)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
