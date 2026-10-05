"""SR6 Tarnished Star recipe (importer/sr6/recipes/ts.py) on a made-up book.md in the converter's sr6 shape (the book's:
an item's level-5 stat box under its level-3 description, stats as tables or a bold header over a value line; ROLL
CALL's archetypes, contacts and NPCs). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, ts

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 20 -->
# IT’S WHO YOU KNOW
## Made-Up Gossip
A made-up chat.
## Game Information
### Made-Up Interview
A made-up interview rule.
<!-- page 140 -->
# RIGHT TOOLS FOR THE JOB
## Personal Weapons
### Zap Ruger “Popper”
A made-up pistol that pops.
##### Zap Ruger
**TYPE DV MODE ATTACK RATING AMMO AVAIL COST**
Heavy Pistol 3P SA/BF 9/8/6/—/— 12(c) 3(L) 1,200¥
**Notes:** A made-up note.
### Fo amglue
A made-up glue gun.
##### Glue Gun
| TYPE | DV | MODE | ATTACK RATING | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Special | 2S* | SS | 7/5/—/—/— | 6(tank) | 2(L) | 700¥ |
| *Made-up | footnote |  |  |  |  |  |
##### Glue explosives
| TYPE | DV GZ | DV CLOSE | DV NEAR | BLAST | AVAIL | COST |
|---|---|---|---|---|---|---|
| Sticky Grenade | 6 | 4 | 2 | 10m | 3(L) | 150¥ |
| Rocket | 14 | 9 | 3 | 12m | 5(L) | 2,000¥ |
## Armor
### Made-Up Vest
A made-up vest.
##### made-up vest
| ITEM | DEFENSE RATING | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Vest Light Notes: A made-up note | 3 | –1 | 2 | 3 | 900¥ |
| Patrol Cap | +1 | — | 1 | 2 | 300¥ |
| Notes: A made-up cap note |  |  |  |  |  |
## Vehicles and Dro nes
### Putt Scoot er
A made-up scooter.
##### Putt Scooter
(Bike)
| HAND | ACCEL | SPD INT | TOP SPD | BOD | ARM |
|---|---|---|---|---|---|
| 3/5 | 10 | 20 | 90 | 6 | 2 |
| PILOT | SENSE | SEAT | AVAIL | COST |
|---|---|---|---|---|
| 2 | 2 | 1 | 3 | 9,000¥ |
**Standard Features:** A made-up horn
### Lost Kart
A made-up kart.
##### Lost Kart
(Car)
<!-- page 160 -->
# ROLL CALL
## Made-Up Sleuth
A made-up archetype.
##### Made-Up Sleuth
| B | A | R | S | W | L | I | C | ESS | EDG |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | 4 | 3 | 5 | 5 | 6 | 5 | 6 | 4 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 10/1 | A1, I2 | 10/11 | 10/15/+1 |
**Active Skills:** Perception 6
## Contacts
### Desk Cl erk
**Uses:** made-up files
**Places to Meet:** a made-up desk
A made-up clerk.
##### desk clerk
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 2 | 2 | 3 | 4 | 3 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 2 | 5/1 | A1, I2 | 9/10 | 10/15/+1 |
**Active Skills:** Electronics 4
## Non-Player Characters (NPCS)
### Professional Rating 3: Made-Up Guards
A made-up guard post.
##### Made-Up Spider
**B A R S W L I C ESS**
2 3 4 2 4 4 4 1 5
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 2 | 8/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Cracking 4
<!-- page 175 -->
# ADS
A made-up ad.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, ts.ALIASES, name_headers=ts.NAME_HEADERS, end_page=ts.END_PAGE)
    return ts.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class TsRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_weapons(self):
        w = entries(self.res, "weapons")
        self.assertEqual(w["Zap Ruger"], {"id": "zap-ruger", "source": "TS", "page": "139", "category": "heavy-pistol",
                                          "type": "Heavy Pistol", "dv": "3P", "modes": "SA/BF", "ar": "9/8/6/—/—",
                                          "ammo": "12(c)", "avail": "3(L)", "cost": "1200"})
        self.assertIn("pistol that pops", self.texts[("weapons", "zap-ruger")])  # the heading's description
        self.assertEqual((w["Glue Gun"]["dv"], w["Glue Gun"]["cost"]), ("2S*", "700"))  # its footnote row: the text
        self.assertIn("footnote", self.texts[("weapons", "glue-gun")])
        self.assertIn("glue gun", self.texts[("weapons", "glue-gun")])  # `Fo amglue`: a heading with a stray space
        self.assertEqual((w["Glue Rocket"]["dv"], w["Glue Rocket"]["category"]), ("14/9/3", "glue-explosives"))

    def test_armor(self):
        a = entries(self.res, "armor")
        self.assertEqual((a["Vest Light"]["defense"], a["Patrol Cap"]["category"]), ("3", "armor"))
        self.assertIn("made-up cap note", self.texts[("armor", "patrol-cap")])  # a Notes row: the row above's
        self.assertIn("made-up note", self.texts[("armor", "vest-light")])

    def test_vehicles(self):
        v = entries(self.res, "vehicles")
        self.assertEqual(v["Putt Scooter"], {"id": "putt-scooter", "source": "TS", "page": "139", "category": "bike",
                                             "handling": "3/5", "accel": "10", "interval": "20", "topSpeed": "90",
                                             "body": "6", "armor": "2", "pilot": "2", "sensor": "2", "seats": "1",
                                             "avail": "3", "cost": "9000"})
        self.assertNotIn("Lost Kart", v)
        self.assertIn({"kind": "missing-value", "file": "vehicles.xml", "name": "Lost Kart", "field": "stats",
                       "page": 139}, self.res.report)

    def test_roll_call(self):
        n, c = entries(self.res, "npcs"), entries(self.res, "contacts")
        self.assertEqual((n["Made-Up Sleuth"]["group"], n["Made-Up Sleuth"]["edg"]), ("Archetype", "4"))
        self.assertEqual(c["Desk clerk"]["archetype"], "Desk clerk")
        self.assertEqual(n["Desk clerk"]["group"], "Contact")
        self.assertIn("made-up files", self.texts[("contacts", "desk-clerk")])
        spider = n["Made-Up Spider"]  # its attributes as a header and a value line
        self.assertEqual((spider["rating"], spider["bod"], spider["cha"], spider["dr"]), ("3", "2", "1", "2"))

    def test_rules(self):
        r = entries(self.res, "rules")
        self.assertIn("Made-Up Interview", r)
        self.assertNotIn("Made-Up Gossip", r)
        self.assertNotIn("Putt Scoot er", r)  # its description went to the vehicle
        self.assertIn("Lost Kart", r)  # a box that doesn't read keeps its description as a rule

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(ts.match({"sha256": ts.SHA256[0]}, ""), 1.0)
        self.assertEqual(ts.match({"sha256": "x", "title": "Shadowrun: Tarnished Star"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": "Tarnished Star"}, BOOK_MD[:4000])[0], ts)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
