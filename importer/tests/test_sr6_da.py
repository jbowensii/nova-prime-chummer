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
## Made Cannons
Made-up cannons fire made-up shells.
##### Made Ammunition
plain ZAP Made Shell
| SIZE | AVAIL | COST PER 10 | BLAST PROFILE | AVAIL | COST PER 10 |
|---|---|---|---|---|---|
| Z1 | 2(L) | 15¥ | — | — | — |
| Z25 | 3(I) | 130¥ | 7P(1m)/4P(3m)/— | 5(I) | 450¥ |
#### Made Ammunition Notes
Made-up notes about the shells.
## Made Warheads
Made-up warheads go on made-up rockets.
##### shell types
| TYPE | CAPACITY | BLAST PROFILE | AVAIL | COST |
|---|---|---|---|---|
| Boom | 16 | 16P(1m)/10P(3m)/4P(16m) | — | +100¥ |
|  | 20 | 20P(2m)/14P(4m)/5P(20m) | +1(I) | +200¥ |
| TYPE | AVAIL | COST |
|---|---|---|
| Fizz | +1(I) | x 2 Base Cost |
## Made Trains
### Made Rail Train
A made-up train of cars.
##### Made Rail Train
engine car
| HAND | ACCEL | SPD INT | TOP SPD | BODY | ARMOR | PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|
| 3/5 | 10 | 25 | 120 | 16 | 16 | 4 | 4 | 2 | 6(L) | 645,000¥ |
caboose car
| HAND | ACCEL | SPD INT | TOP SPD | BODY | ARMOR | PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|
| 4/5 | 15 | 15 | 75 | 12 | 12 | 4 | 4 | — | 6(L) | 27,000¥ |
## Made Rockets
#### Made Launcher Notes
Made-up notes on launchers.
##### Made Rockets and Missiles
**NAME CLASS RANGE CAP PILOT AVAIL SENSOR COST**
Zip 0 (20mm x
1 km 16 0 0 5(I) 2,000¥
Rocket 1m)
Zop Missile 1 (30mm x 1m) 2 km 20 3 2 7(I) 9,000¥
## Made Darts
#### Made Dart Rules
Made-up darts fly far.
| NAME | RANGE | AVAIL | COST |
|---|---|---|---|
| Plain Dart | 1 km | 5(I) | 2,000¥ |
| Smart Dart | 1 km | 6(I) | 4,500¥ |
More made-up words about darts.
Made zap ammo is 2x the normal cost for the weapon type.
#### Glow Focus
The Glow focus is a spell focus for purposes of cost,
availability, and bonding cost (p. 168, SR6). It glows.
### Fizzbang
A made-up drug that fizzes.
##### drugs
| DRUG | POWER | AVAIL | COST (PER DOSE) |
|---|---|---|---|
| Fizzbang | 8 | 5L | 800 ¥ |
| Popper | 7 | 3L | 50 ¥ |
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
                         {"category": "Zap gun", "type": "Pistol", "dv": "3P", "modes": "SA", "ammo": "10(c)",
                          "avail": "2(L)", "cost": "300"})
        self.assertEqual((w["Ruhrzap SF-1"]["ammo"], w["Ruhrzap SF-1"]["cost"]), ("50(c) or 100(belt)", "7600"))
        self.assertIn("long name", self.texts[("weapons", "ruhrzap-sf-1")])
        self.assertNotIn("Fizz Popper", entries(self.res, "rules"))  # its heading is the weapon's text

    def test_vehicle_box_under_its_heading(self):
        v = entries(self.res, "vehicles")["Made Walker “Stompy”"]
        self.assertEqual({k: v[k] for k in ("category", "handling", "interval", "topSpeed", "seats", "cost")},
                         {"category": "Walking vehicles", "handling": "2/2", "interval": "20", "topSpeed": "70",
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

    def test_products_side_by_side_and_ammunition_types(self):
        g = entries(self.res, "gear")
        # a band line naming two products over a table printing its prices twice: a row a product
        self.assertEqual({k: g["Z25"][k] for k in ("category", "avail", "cost", "per")},
                         {"category": "Made ammunition", "avail": "3(I)", "cost": "130", "per": "10"})
        self.assertEqual((g["Z25 (ZAP Made Shell)"]["avail"], g["Z25 (ZAP Made Shell)"]["cost"]), ("5(I)", "450"))
        al = {e.findtext("name"): [a.text for a in e.findall("alias")] for e in ET.fromstring(self.res.files["gear.xml"])}
        self.assertIn("Made Shell Z25", al["Z25"])  # (the class a later band names, as a search name)
        self.assertIn("Made Shell Z25 ZAP", al["Z25 (ZAP Made Shell)"])
        # the title's class when the book heads it (`Autocannon Ammunition` under `Autocannons`)
        h = ["SIZE", "AVAIL", "COST PER 10", "BLAST PROFILE", "AVAIL", "COST PER 10"]
        _, rows = regroup._products(h, [["B60", "8(I)", "2,500¥", "12P(2m)", "6(I)", "7,500¥"]],
                                    "regular HEX Assault Cannon", "Autocannon Ammunition", {"autocannon"})
        self.assertEqual([r.aliases for r in rows], [("Autocannon B60",), ("Autocannon B60 HEX",)])
        self.assertIn("Z1", g)
        self.assertNotIn("Z1 (ZAP Made Shell)", g)  # (dashes only: no such product)
        # a list titled as ammunition types: its rows are ammunition types, a nameless row a band of the one above
        a = entries(self.res, "ammotypes")
        self.assertEqual(set(a) - {"Made zap ammo"}, {"Boom", "Boom (Capacity 20)", "Fizz"})
        self.assertEqual((a["Boom (Capacity 20)"]["avail"], a["Fizz"]["cost"]), ("+1(I)", "x 2 Base Cost"))
        self.assertTrue(a["Fizz"]["category"].startswith("Shell type"))  # (its title)

    def test_box_variants_text_lists_and_drugs(self):
        v = entries(self.res, "vehicles")
        # a lower-case line over each of a box's bands names that band's variant
        self.assertEqual((v["Made Rail Train (Engine car)"]["cost"], v["Made Rail Train (Caboose car)"]["cost"]),
                         ("645000", "27000"))
        g = entries(self.res, "gear")
        # a priced NAME table in a rule heading's text: its rows are items, the heading their title
        self.assertEqual((g["Smart Dart"]["avail"], g["Smart Dart"]["cost"]), ("6(I)", "4500"))
        self.assertIn("Made Dart Rules", entries(self.res, "rules"))
        # the drugs table (DRUG, a name header of the book's): its rows are items
        self.assertEqual((g["Popper"]["cost"], g["Popper"]["per"]), ("50", "dose"))
        # an item priced in a sentence: an ammunition type by its multiplier, a focus as the core rulebook's
        self.assertEqual(entries(self.res, "ammotypes")["Made zap ammo"]["cost"], "x2")
        glow = next(e for e in ET.fromstring(self.res.files["gear.xml"]) if e.findtext("name") == "Glow Focus")
        self.assertEqual([(f.get("field"), f.text) for f in glow.findall("formula")],
                         [(k, f"ref(gear:crb.spell-focus, {k}, R)") for k in ("cost", "avail", "karma")])
        # the book's misplaced header (AVAIL over the sensor column): read by the values' shapes
        self.assertEqual((g["Zip Rocket"]["avail"], g["Zop Missile"]["avail"]), ("5(I)", "7(I)"))

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
