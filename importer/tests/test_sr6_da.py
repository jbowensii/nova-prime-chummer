"""SR6 Deadly Arts recipe (importer/sr6/recipes/da.py, shapes.py) on a made-up book.md in the converter's sr6 shape (the
book's: several weapons in one box, a name wrapped onto a second row, a vehicle's box under its heading, a spell's band
under a section titled with its category, martial art lines in plain text). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, da, identify, shapes

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
CONTENTS
Made-up contents ........ 9
<!-- page 40 -->
# BLEEDERS & BONE BREAKERS
## Game Information: Sticks
### New Martial Arts: Sticks
#### Glow Stick Style
A made-up style of hitting with glowing sticks.
Category: Weapon
Signature Technique: Zap Poke
### New Martial Arts Techniques
#### Zap Poke
Poke in a made-up way.
Category: Weapon; may only be used with
glowing sticks.
<!-- page 50 -->
# SENDING IT DOWNRANGE
## Zap Guns
#### Fizz Popper
A made-up popper that fizzes.
#### Ruhrzap SF-1
A made-up gun with a long name.
##### Zap Guns
| NAME | TYPE | DV | MODES | ATTACK RATINGS | AMMOAVAIL | COST |
|---|---|---|---|---|---|---|
| Fizz Popper | Pistol | 3P | SA | 8/9/—/—/— | 10(c) 2(L) | 300¥ |
**Note:** Includes a made-up fizz.
| NAME | TYPE | DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|
| Ruhrzap |  |  |  |  | 50(c) or |  |  |
| SF-1 | MMG | 5P | BF/FA | 2/11/11/8/7 | 100(belt) | 4(L) | 7,600¥ |
| (when overcharged) | MMG | 7P | BF | 2/11/—/—/— | 10(c) | 6(L) | 900¥ |
<!-- page 130 -->
# MIL-SPEC MAYHEM
## Walking Vehicles
### Made Walker “Stompy”
A made-up walker that stomps.
##### Stompy
| HAND | ACCEL | SPD INT | TOP SPD | BODY | ARMOR | PILOT |
|---|---|---|---|---|---|---|
| 2/2 | 15 | 20 | 70 | 5 | 10 | 1 |
| SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|
| 4 | 1 | 7(L) | 73,500¥ |
**Standard Equipment:** Made-up legs.
## New Game Rules: Stomping
Stomp in a made-up way.
<!-- page 140 -->
# FRAG ORDERS
## Game Information: Made-up Warfare
### New Qualities
#### Made Veteran (Positive)
You served in a made-up way.
**Cost:** 6 Karma
**Game effect:** Made-up edge.
<!-- page 160 -->
# MYSTICAL FORCE MULTIPLIERS
## Tactical Grimoire: Spells
### Glow Flare (Manipulation)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | P | L | 4 |
A made-up flare that glows.
## Tactical Grimoire: Adept Powers
#### Quick Blink
**Cost:** 0.5 PP
**Activation:** Minor Action
Blink in a made-up way.
<!-- page 184 -->
## Not Read
A made-up back cover.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, da.ALIASES, name_headers=da.NAME_HEADERS, end_page=184)
    return da.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class DaRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_weapons_one_a_row_wrapped_names_joined(self):
        w = entries(self.res, "weapons")
        self.assertEqual(set(w), {"Fizz Popper", "Ruhrzap SF-1", "Ruhrzap SF-1 (when overcharged)"})
        self.assertEqual({k: w["Fizz Popper"][k] for k in ("category", "type", "dv", "modes", "ammo", "avail", "cost")},
                         {"category": "zap-guns", "type": "Pistol", "dv": "3P", "modes": "SA", "ammo": "10(c)",
                          "avail": "2(L)", "cost": "300"})
        self.assertEqual((w["Ruhrzap SF-1"]["ammo"], w["Ruhrzap SF-1"]["cost"]), ("50(c) or 100(belt)", "7600"))
        self.assertIn("long name", self.texts[("weapons", "ruhrzap-sf-1")])
        self.assertNotIn("Fizz Popper", entries(self.res, "rules"))  # its heading is the weapon's text

    def test_vehicle_box_under_its_heading(self):
        v = entries(self.res, "vehicles")["Made Walker “Stompy”"]
        self.assertEqual({k: v[k] for k in ("category", "handling", "interval", "topSpeed", "seats", "cost")},
                         {"category": "walking-vehicles", "handling": "2/2", "interval": "20", "topSpeed": "70",
                          "seats": "1", "cost": "73500"})

    def test_martial_arts(self):
        s = entries(self.res, "martialarts")["Glow Stick Style"]
        self.assertEqual((s["categories"], s["signature"]), ("Weapon", "Zap Poke"))
        self.assertEqual(entries(self.res, "martialtechniques")["Zap Poke"]["category"], "Weapon")
        self.assertIn("glowing sticks", self.texts[("martialtechniques", "zap-poke")])
        self.assertNotIn("Category:", self.texts[("martialarts", "glow-stick-style")].replace("**Category:**", ""))

    def test_magic_and_qualities(self):
        sp = entries(self.res, "spells")["Glow Flare"]
        self.assertEqual((sp["category"], sp["range"], sp["dv"]), ("manipulation", "LOS", "4"))
        self.assertEqual(entries(self.res, "adeptpowers")["Quick Blink"]["cost"], "0.5")
        q = entries(self.res, "qualities")["Made Veteran"]
        self.assertEqual((q["kind"], q["karma"]), ("positive", "6"))
        r = entries(self.res, "rules")
        self.assertIn("New Game Rules: Stomping", r)
        self.assertNotIn("Not Read", r)

    def test_rows_wrap_and_bands(self):
        stats = [{"NAME": "Ultra", "AMMO": "30(c)", "COST": "5¥"}, {"NAME": "Max", "AMMO": "", "COST": ""}]
        self.assertEqual(shapes.rows([{"NAME": "Ultra", "TYPE": "A", "DV": "2P", "AMMO": "30(c)", "COST": "5¥"},
                                      {"NAME": "Max", "TYPE": "", "DV": "", "AMMO": "60(c)", "COST": ""}]),
                         [{"NAME": "Ultra Max", "TYPE": "A", "DV": "2P", "AMMO": "30(c) 60(c)", "COST": "5¥"}])
        self.assertEqual(len(shapes.rows(stats)), 2)  # three columns: no wrap
        self.assertIsNone(shapes.rows([{"A": "1", "B": "2"}, {"A": "3", "B": "4"}]))  # unnamed rows: a rule's table

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(da.match({"sha256": da.SHA256[0]}, ""), 1.0)
        self.assertEqual(da.match({"sha256": "x", "title": "Shadowrun: Deadly Arts"}, ""), 0.9)
        self.assertIs(identify({"sha256": da.SHA256[0]}, BOOK_MD[:4000])[0], da)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
