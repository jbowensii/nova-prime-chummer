"""SR6 Bestial Nature recipe (importer/sr6/recipes/bn.py) on a made-up book.md in the converter's shape for this book
(a running head and page number on each page's top, headings kerned apart). Every name, number and line is
invented."""

import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import bn, crb, identify

BOOK_MD = """<!-- page 1 -->
# bestial nature
<!-- page 2 -->
## BESTIAL NATURE
# 2
# Fizz Fiction
A made-up story.
<!-- page 10 -->
## BESTIAL NATURE
# 10
**PAGE**
# Sixth World Shifters
### Ne w Positive Quality: Shifter
A made-up quality of many forms.
#### Shifter (Fuzzy)
A made-up fuzzy form.
• **Minimum Base Cost:** 14 Karma
• **Gained Powers:** Made Up Sense
### Positive Add-ons
#### Glow Coat (1 to 3)
• **Cost:** 3 per level
The coat glows in a made-up way.
#### Zap Tail
• Cost:5 Karma
The tail zaps in a made-up way.
### Negative Add-ons
#### Sleepy
• **Bonus:** 4 Karma
Sleeps in a made-up way.
#### Examples
Made-up sums.
<!-- page 20 -->
## BESTIAL NATURE
# 20
# A nimalism
## Animalism Powers
### Fizz Sense
You sense fizz in a made-up way.
#### Glow Step
You step in a made-up glow.
<!-- page 30 -->
## BESTIAL NATURE
# 30
# Sh ifter Gear
#### Zip Collar
A made-up collar.
| ITEM | AVAIL | COST |
|---|---|---|
| Zip Collar | 2 | 200¥ |
#### Hop Drone
##### (Small Made-Up Drone)
A made-up hopping drone.
#### Bop Drone
##### (Small Made-Up Drone)
A made-up bopping drone.
| HAND | ACCEL | SPD INT | TOP SPD | BOD | ARM | PILOT | SENS | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 1 | 2 | 4 | 1 | 0 | 2 | 1 | 0 | 3 | 2,000¥ |
#### bop drone
| HAND | ACCEL | SPD INT | TOP SPD | BOD | ARM | PILOT | SENS | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 2 | 3 | 6 | 2 | 1 | 2 | 1 | 0 | 4 | 4,000¥ |
**Notes:** Made-up notes.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(bn.prepare_md(md), bn.ALIASES, name_headers=bn.NAME_HEADERS)
    return bn.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class BnRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def test_prepare(self):
        md = bn.prepare_md(BOOK_MD)
        self.assertNotIn("BESTIAL NATURE", md)
        self.assertNotIn("# 10", md.splitlines())
        self.assertNotIn("**PAGE**", md)
        for h in ("# Animalism", "# Shifter Gear", "### New Positive Quality: Shifter"):
            self.assertIn(h, md.splitlines())

    def test_shifter_forms_and_add_ons(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Shifter (Fuzzy)"]["kind"], q["Shifter (Fuzzy)"]["karma"]), ("positive", "14"))
        g = q["Glow Coat (Shifter add-on)"]
        self.assertEqual((g["karma"], g["perLevel"], g["maxLevel"]), ("3", "true", "3"))
        self.assertEqual(q["Zap Tail (Shifter add-on)"]["karma"], "5")  # its cost line printed without bold
        self.assertEqual(
            (q["Sleepy (Shifter add-on)"]["kind"], q["Sleepy (Shifter add-on)"]["karma"]), ("negative", "4")
        )
        self.assertEqual(len(q), 4)  # the worked examples stay a rule
        self.assertIn("Examples", entries(self.res, "rules"))

    def test_powers_gear_and_drones(self):
        self.assertEqual(set(entries(self.res, "metamagics")), {"Fizz Sense", "Glow Step"})
        self.assertEqual(entries(self.res, "gear")["Zip Collar"]["cost"], "200")
        v = entries(self.res, "vehicles")  # the tables in reading order: the first under the second drone's text
        self.assertEqual((v["Hop Drone"]["handling"], v["Hop Drone"]["cost"]), ("3", "2000"))
        self.assertEqual(
            (v["Bop Drone"]["handling"], v["Bop Drone"]["interval"], v["Bop Drone"]["cost"]), ("5", "3", "4000")
        )
        self.assertNotIn("Fizz Fiction", entries(self.res, "rules"))  # fiction is no rules

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(bn.match({"sha256": bn.SHA256[0]}, ""), 1.0)
        self.assertIs(identify({"sha256": "x", "title": "Shadowrun: Bestial Nature"}, "")[0], bn)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
