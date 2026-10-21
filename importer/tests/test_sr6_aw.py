"""SR6 Astral Ways recipe (importer/sr6/recipes/aw.py) on a made-up book.md in the converter's sr6 shape (the book's:
beings as a level-4 heading with a tag line, then a level-5 box with the band; small catalog tables; each chapter's
Game Information). Every name, number and line is invented."""

import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import aw, crb, identify

BAND = """| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | 5 | 2 | 4 | 3 | 4 | 3 | 4 | 4 |
| AC | CM | MOVE |
|---|---|---|
| A1, I3 | 10 | 5/10/+5 |"""

BOOK_MD = f"""<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 20 -->
# FIZZ PLANES
## Made-Up Sights
A made-up view.
## Game Information
### Made-Up Gate Rule
A made-up rule.
### Made-Up Denizens
#### Glim
##### (Fire, Force 3)
A made-up spark.
##### glim
{BAND}
**Skills:** Astral, Perception
**Powers:** Astral Form
#### Drizz
##### (Water, Force 4)
A made-up drop.
##### Drizz
**B A R S W L I C M ESS**
4 5 6 4 4 4 4 4 4 4
| AC | CM | MOVE |
|---|---|---|
| A1, I3 | 10 | 5/10/+2 |
**Skills:** Astral
#### Blank Wisp
##### (Air, Force 5)
A made-up wisp with no band.
##### Blank Wisp
#### Toad Warden
##### (Professional Rating 4)
##### toad warden
{BAND}
**Skills:** Close Combat 4
#### Tilekin
##### tilekin
| Weapons: B A | R | S W | L | I C EDG |
|---|---|---|---|---|
| 1–7 | 1–6 | 1–6 1–6 | 1–6 | 1–6 1–7 |
### Negative Metagenetic Quality: Scaly
**Bonus:** 4 Karma
A made-up quality.
### Made-Up Skies
#### skiffs table
| TYPE | HAND | ACCEL | SPD INT | TOP SPD | BOD | ARMOR | SEATS | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|
| Puff Skiff | 3 | 20 | 30 | 300 | 10 | 6 | 2 | 5 | 10,000¥ |
#### skiff weapons table
| WEAPON | SKILL | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|---|
| Pebble Sling | Athletics | 3P | 2/8/10/4/2 | 4 | 1,000¥ |
<!-- page 120 -->
# MADE-UP CITADEL
## Made-Up Guide
### Clay Golem
A made-up golem.
##### clay golem
{BAND}
**Skills:** Close Combat 6
<!-- page 160 -->
# TECHNIQUES OF TRAVEL
## Pathways
### Made-Up Devices
A made-up cloak.
| TYPE | FORCE | BONDING COST | AVAILABILITY | COST |
|---|---|---|---|---|
| Hush Cloak | 1–6 | Force x 1 | (Force +2) L | Force x 3,000¥ |
#### Made-Up Gateway Ritual
##### (Anchored)
**Threshold:** 3 + (Distance Number)
A made-up ritual.
#### Made-Up Gateway Critter Power
| TYPE | ACTION | RANGE | DURATION |
|---|---|---|---|
| M | Major | LOS (A) | Sustained |
A made-up power.
#### Made-Up Stasis
##### (Manipulation Spell)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS (A) | P | S | 4 |
A made-up spell.
### New Metamagic: Made-Up Summoning
#### Prerequisite: Invocation
A made-up metamagic.
#### made-up suits
| TYPE | DEFENSIVE RATING | CAPACITY | AVAILABILITY | COST |
|---|---|---|---|---|
| Made-Up Suit | 8 | 6* | (12)I | 95,000¥ |
<!-- page 184 -->
# INDEX
### A
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, aw.ALIASES, name_headers=aw.NAME_HEADERS, end_page=aw.END_PAGE)
    return aw.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class AwRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_beings(self):
        s = entries(self.res, "spirits")
        self.assertEqual((s["Glim"]["category"], s["Glim"]["bod"], s["Glim"]["cm"]), ("fire", "3", "10"))
        self.assertIn("made-up spark", self.texts[("spirits", "glim")])  # the heading's description
        self.assertEqual(
            (s["Drizz"]["bod"], s["Drizz"]["move"]), ("4", "5/10/+2")
        )  # a band as a header and a value line
        self.assertNotIn("Blank Wisp", s)
        self.assertIn(
            {"kind": "missing-value", "file": "spirits.xml", "name": "Blank Wisp", "field": "stats", "page": 19},
            self.res.report,
        )
        n = entries(self.res, "npcs")
        self.assertEqual((n["Toad Warden"]["rating"], n["Toad Warden"]["group"]), ("4", "Made-Up Denizens"))
        c = entries(self.res, "critters")
        self.assertEqual(c["Clay golem"]["category"], "made-up-citadel")
        self.assertIn(
            {"kind": "missing-value", "file": "critters.xml", "name": "Tilekin", "field": "stats", "page": 19},
            self.res.report,
        )  # a band whose headers print run together

    def test_catalog(self):
        v = entries(self.res, "vehicles")["Puff Skiff"]
        self.assertEqual(
            (v["category"], v["handling"], v["topSpeed"], v["body"], v["cost"]), ("Airships", "3", "300", "10", "10000")
        )
        self.assertEqual(entries(self.res, "weapons")["Pebble Sling"]["ar"], "2/8/10/4/2")
        g = entries(self.res, "gear")["Hush Cloak"]
        self.assertEqual((g["category"], g["rating"], g["karma"]), ("Astral devices", "1–6", "Force x 1"))
        self.assertEqual(entries(self.res, "armor")["Made-Up Suit"]["defense"], "8")

    def test_magic(self):
        self.assertEqual(entries(self.res, "spells")["Made-Up Stasis"]["category"], "manipulation")
        r = entries(self.res, "rituals")["Made-Up Gateway Ritual"]
        self.assertEqual((r["keywords"], r["threshold"]), ("Anchored", "3 + (Distance Number)"))
        p = entries(self.res, "critterpowers")["Made-Up Gateway"]
        self.assertEqual((p["action"], p["duration"]), ("Major", "Sustained"))
        self.assertIn("made-up power", self.texts[("critterpowers", "made-up-gateway")])
        self.assertIn("Made-Up Summoning", entries(self.res, "metamagics"))
        q = entries(self.res, "qualities")["Scaly"]
        self.assertEqual((q["kind"], q["karma"]), ("negative", "4"))

    def test_rules(self):
        r = entries(self.res, "rules")
        self.assertIn("Made-Up Gate Rule", r)  # Game Information
        self.assertIn("Pathways", r)  # the techniques of travel
        self.assertNotIn("Made-Up Sights", r)  # setting
        self.assertNotIn("Made-Up Guide", r)
        self.assertNotIn("A", r)  # the index

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(aw.match({"sha256": aw.SHA256[0]}, ""), 1.0)
        self.assertEqual(aw.match({"sha256": "x", "title": "Shadowrun: Astral Ways"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": "Astral Ways"}, BOOK_MD[:4000])[0], aw)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
