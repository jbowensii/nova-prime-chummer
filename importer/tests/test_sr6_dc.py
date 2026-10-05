"""SR6 Double Clutch recipe (importer/sr6/recipes/dc.py) on a made-up book.md in the converter's sr6 shape (the book's:
a vehicle's description under a level-3 heading, its stat box under a level-5 title with its class, the box's headers in
pieces). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, dc, identify

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 20 -->
# HOT RODS & COOL RIDES
## Motorcycles
### Zippo Scoot
A made-up scooter that zips.
##### Zippo Scoot (made-up scooter)
| SPD INT | TOP SPD |
|---|---|
| 20 | 120 |
**HAND ACC BODY ARM PILOT SENS SEAT AVAIL COST**
3/4 10 5 4 1 1 1 2 9,500¥
**Standard Equipment:** A made-up horn
## Vans/Heavy Vehicles
### Lumber Van
A made-up van that lumbers.
##### Lumber Van (made-up van)
| HAND | ACC | SPD INT | TOP SPD | BODYARMPILOT | SENS | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|
| 5/6 | 8 | 10 | 110 20 | 12 3 | 2 | 8 | 4 | 60,000¥ |
<!-- page 90 -->
# RARE AIR
## Aerial Drones
### Buzz Fly
A made-up drone that buzzes.
##### Buzz Fly (small rotor drone)
**HAND** 3/5* **ACCEL** 15 **S INP** 25 **TD T SO** 180 **PDP BOD** 5 **ARM** 5 **PILOT** 4 **SENS** 2 **SEAT — AVAIL** 2 5,500¥ **COST**
##### Broken Fly (small rotor drone)
| SPD INT | TOP SPD |
|---|---|
| 20 | 90 |
1 2 3 4,000¥
<!-- page 120 -->
# MAKING IT YOURS
## Chassis Mods
#### Glow Bumper
A made-up bumper that glows.
| MOD SLOTS | RATING |
|---|---|
| 1 x Rating | 1–3 |
| AVAILABILITY | COST |
|---|---|
| 3 (L) | Rating x 900¥ |
#### Fizz Kit
A made-up kit in levels.
##### Level 1
| MOD SLOTS | RATING |
|---|---|
| 1 | — |
| AVAILABILITY | COST |
|---|---|
| 2 | 500¥ |
#### Drone racks table
| DRONE RACK SIZE | HARDPOINT | # DRONES | AVAIL | COST |
|---|---|---|---|---|
| Tiny | Small | 4 | 3 | 700¥ |
<!-- page 168 -->
# GEARHEAD ANATOMY
## Positive Qualities
### Lead Foot
You drive fast, made up.
• **Cost:** 5 Karma
• **Game Effect:** Made-up speed.
## Negative Qualities
### Stall Magnet
Your rides stall, made up.
• **Bonus:** 7 Karma
• **Game Effect:** Made-up stalls.
<!-- page 183 -->
## Vehicles & Drones
Zippo Scoot ........ p. 19
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, dc.ALIASES, name_headers=dc.NAME_HEADERS, end_page=183)
    return dc.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class DcRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def test_vehicles_from_their_boxes(self):
        v = entries(self.res, "vehicles")
        self.assertEqual(v["Zippo Scoot"], {"id": "zippo-scoot", "source": "DC", "page": "19", "category": "motorcycles",
                                            "handling": "3/4", "accel": "10", "interval": "20", "topSpeed": "120",
                                            "body": "5", "armor": "4", "pilot": "1", "sensor": "1", "seats": "1",
                                            "avail": "2", "cost": "9500"})
        van = v["Lumber Van"]  # headers run together, two values in a cell
        self.assertEqual((van["topSpeed"], van["body"], van["armor"], van["pilot"], van["cost"]), ("110", "20", "12", "3", "60000"))
        fly = v["Buzz Fly"]  # values between bold headers
        self.assertEqual((fly["category"], fly["handling"], fly["seats"], fly["avail"], fly["cost"]),
                         ("aerial-drones", "3/5*", "—", "2", "5500"))
        self.assertNotIn("Broken Fly", v)
        self.assertIn({"kind": "missing-value", "file": "vehicles.xml", "name": "Broken Fly (small rotor drone)",
                       "field": "stats", "page": 89}, self.res.report)
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("scooter that zips", texts[("vehicles", "zippo-scoot")])
        self.assertNotIn("Zippo Scoot", entries(self.res, "rules"))  # its description went to the vehicle

    def test_modifications_and_gear(self):
        g = entries(self.res, "gear")
        self.assertEqual({k: g["Glow Bumper"][k] for k in ("category", "slots", "rating", "avail", "cost")},
                         {"category": "chassis-mods", "slots": "1 x Rating", "rating": "1–3", "avail": "3 (L)",
                          "cost": "Rating x 900"})
        self.assertEqual(g["Fizz Kit (Level 1)"]["cost"], "500")
        self.assertEqual((g["Drone Rack (Tiny)"]["category"], g["Drone Rack (Tiny)"]["cost"]), ("drone-racks", "700"))

    def test_qualities(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Lead Foot"]["kind"], q["Lead Foot"]["karma"]), ("positive", "5"))
        self.assertEqual((q["Stall Magnet"]["kind"], q["Stall Magnet"]["karma"]), ("negative", "7"))

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(dc.match({"sha256": dc.SHA256[0]}, ""), 1.0)
        self.assertEqual(dc.match({"sha256": "x", "title": "Shadowrun: Double Clutch"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": "Double Clutch"}, BOOK_MD[:4000])[0], dc)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
