"""SR6 Wild Life recipe (importer/sr6/recipes/wl.py) on a made-up book.md in the converter's sr6 shape (the book's: a
critter's section, its text and a stat box with a lower-case title; the powers' bands at the back). Every name, number
and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, wl

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 20 -->
# GRASSLANDS AND PLAINS
### Fizz Mole
A made-up mole that fizzes underground.
##### young fizz mole
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | 5 | 2 | 3 | 1 | 3 | 1 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 8/2 | A1, I3 | 10 | 5/10/+1 |
**Skills:** Athletics 3, Perception 4
**Powers:** Fizz Burst, Glow Hide
**Weakness:** Brittle 2
**Weapons:**
Bite [Close Combat, DV 2P, 4/—/—/—/—]
##### elder fizz mole
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 9 | 4 | 5 | 6 | 3 | 1 | 3 | 1 | 4 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 12 | 8/2 | A1, I3 | 13 | 5/10/+1 |
**Skills:** Athletics 5, Perception 4
**Powers:** Fizz Burst
### Hum Goat
A made-up goat that hums.
##### hum goat
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 4 | 3 | 3 | 4 | 2 | 1 | 3 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 6 | 6/1 | A1, I2 | 10 | 10/15/+1 |
some made-up words about the goat's song.
**Skills:** Athletics 2
### Zip Hare
A made-up hare that zips.
##### zip hare
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 2 | 6 | 6 | 1 | 2 | 1 | 4 | 1 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 3 | 10/2 | A1, I3 | 9 | 15/30/+3 |
More made-up words on hares.
### Glow Vole
A made-up vole that glows.
##### glow vole
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 1 | 3 | 4 | 1 | 2 | 1 | 3 | 1 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 2 | 7/1 | A1, I2 | 8 | 5/10/+1 |
**Skills:** Stealth 3
##### dusk vole
| B | A | R | S | W | L | I | C | R | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 3 | 4 | 1 | 2 | 1 | 3 | 1 | 5 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 2 | 7/1 | A1, I2 | 8 | 5/10/+1 |
another column's made-up words that run on
past the box.
##### static owl
| B A R MATRIX DR | S |
|---|---|
| 1 | 2 |
5 6/4 A1, I5 10
**Skills:** Cracking 3
**Echoes:** Made-up Echo
#### Critter Corner: Hum Goat
Made-up advice on goats.
<!-- page 180 -->
# ON THE CARE AND FEEDING OF CRITTERS
## Critter Companion Qualities
### Snuggly
A made-up cuddly critter.
**Cost:** 2 Karma
## Critter Gear
**Fizz Harness:** A made-up harness.
| GEAR | DEFENSE RATING | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Fizz Harness | +1 | 4 | 2 | 300¥ |
### Fizz Burst
| TYPE | ACTION | RANGE | DURATION |
|---|---|---|---|
| P | Major | LOS | Instant |
The critter bursts in a made-up fizz.
### Brittle
| TYPE | ACTION | RANGE | DURATION |
|---|---|---|---|
| P | Auto | Self | Always |
The critter breaks in a made-up way.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(wl.prepare(md), wl.ALIASES, name_headers=wl.NAME_HEADERS)
    return wl.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


class WlRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_critters_from_their_boxes_with_their_section_text(self):
        c = entries(self.res, "critters")
        self.assertEqual(set(c), {"Young Fizz Mole", "Elder Fizz Mole", "Hum Goat", "Zip Hare", "Glow Vole", "Dusk Vole"})
        # a box whose bands run into another column's prose, its labels after the next box's garbled band
        d = c["Dusk Vole"]
        self.assertEqual((d.get("rea"), d.get("res"), d.findtext("skills")), ("4", "5", "Cracking 3"))
        self.assertEqual(c["Glow Vole"].findtext("skills"), "Stealth 3")
        self.assertIn("vole that glows", self.texts[("critters", "dusk-vole")])
        self.assertEqual((c["Zip Hare"].get("agi"), c["Zip Hare"].get("cm")), ("6", "9"))  # its box read as a table title
        y = c["Young Fizz Mole"]
        self.assertEqual({k: y.get(k) for k in ("category", "bod", "mag", "dr", "move", "page")},
                         {"category": "grasslands-and-plains", "bod": "3", "mag": "2", "dr": "5", "move": "5/10/+1",
                          "page": "19"})
        self.assertEqual((y.findtext("weaknesses"), y.findtext("powers")), ("Brittle 2", "Fizz Burst, Glow Hide"))
        self.assertIn("Bite [Close Combat", y.findtext("weapons"))
        for i in ("young-fizz-mole", "elder-fizz-mole"):  # two boxes share their section's text
            self.assertIn("mole that fizzes", self.texts[("critters", i)])
        self.assertIn("goat that hums", self.texts[("critters", "hum-goat")])

    def test_powers_weaknesses_gear_and_rules(self):
        p = entries(self.res, "critterpowers")
        self.assertEqual({k: p["Fizz Burst"].get(k) for k in ("type", "action", "range", "duration", "weakness")},
                         {"type": "P", "action": "Major", "range": "LOS", "duration": "Instant", "weakness": None})
        self.assertEqual(p["Brittle"].get("weakness"), "true")  # a stat block lists it as a weakness
        g = entries(self.res, "gear")["Fizz Harness"]
        self.assertEqual((g.get("category"), g.get("cost")), ("critter-gear", "300"))
        r = entries(self.res, "rules")
        self.assertIn("Snuggly", r)  # critter qualities are for critters: rules
        self.assertIn("Critter Corner: Hum Goat", r)
        self.assertNotIn("Fizz Mole", r)  # its text went to its critters
        self.assertNotIn("qualities.xml", self.res.files)

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(wl.match({"sha256": wl.SHA256[0]}, ""), 1.0)
        self.assertEqual(wl.match({"sha256": "x", "title": "Shadowrun: Wild Life (Core Critter Book)"}, ""), 0.9)
        self.assertIs(identify({"sha256": wl.SHA256[0]}, BOOK_MD[:4000])[0], wl)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
