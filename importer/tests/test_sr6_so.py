"""SR6 Smooth Operations recipe (importer/sr6/recipes/so.py) on a made-up book.md in the converter's sr6 shape (a
spell's category on a text line under its heading, gear tables with their descriptions under level-3 headings, a face's
stat block in its section's text). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, so

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 98 -->
# FACES IN THE CROWD
## Smooth Talker
A made-up face who talks.
**Metatype:** Elf
| B | A | R | S | W | L | I | C | EDG | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 3 | 2 | 4 | 3 | 4 | 6 | 3 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 3 | 7/1 | A1/I2 | 9/10 | 10/15/+1 |
**Active Skills:** Con 6, Influence 6
**Gear:** Made-up suit
<!-- page 108 -->
# MANA- INFUSED MANNERS
## Spells
Made-up words on social spells.
#### Glow Smile
(Illusion)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | M | S | 4 |
The target smiles in a made-up glow.
#### Hush Ward
(Anchored)
**Threshold:** 3
A made-up ritual that hushes.
## Adept Powers
#### Sweet Voice
**Cost:** 0.25 PP per level (max 3 levels)
**Activation:** Minor Action
A made-up voice.
## Metamagics
#### Astral Wink
A made-up wink.
## Alchemical Preps
#### Wink in a Bottle
**Formula:** Glow Smile, Material (Saliva)
**Cost:** 300¥/charge
A made-up potion.
<!-- page 116 -->
# SOCIAL SHOPPING
## Outfitting the Runner: Clothing
### Fuzzy Suit (Rating 1-6)
A made-up fuzzy suit.
#### Game Information
Made-up suit rules.
#### clothing table
| OUTFIT | RATING | SOCIAL RATING | AVAIL | COST |
|---|---|---|---|---|
| Fuzzy Suit | 1–6 | Rating | 4 | Rating x 70¥ |
## Disguises and Espionage Gear
### Blink Cape
A made-up cape that blinks.
#### espionage gear table
| ESPIONAGE GEAR | RATING | AVAIL | COST |
|---|---|---|---|
| Blink Cape | 1–2 | 5 | Rating x 900¥ |
|  | 3–4 | 6 | Rating x 1,900¥ |
| Glim | — | 3 | Rating x |
| Tape |  |  | 40¥ |
<!-- page 161 -->
# MORE THAN A PRETTY FACE
## Positive Qualities
### Big Grin
Made-up grinning.
**Cost:** 3 Karma per level (1 to 3)
**Game Effect:** Made-up grins.
## Negative Qualities
### Mumbler
Made-up mumbling.
**Bonus:** 7 Karma (4 Karma if made up)
**Game Effect:** Made-up mumbles.
<!-- page 171 -->
##### Enjoy this made-up preview
Made-up fiction.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, so.ALIASES, name_headers=so.NAME_HEADERS, end_page=so.END_PAGE)
    return so.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class SoRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_magic(self):
        s = entries(self.res, "spells")["Glow Smile"]
        self.assertEqual({k: s.get(k) for k in ("category", "tags", "range", "dv")},
                         {"category": "illusion", "tags": None, "range": "LOS", "dv": "4"})
        self.assertEqual(entries(self.res, "rituals")["Hush Ward"], {"id": "hush-ward", "source": "SO", "page": "107",
                                                                     "threshold": "3", "keywords": "Anchored"})
        p = entries(self.res, "adeptpowers")["Sweet Voice"]
        self.assertEqual((p["cost"], p["perLevel"], p["maxLevel"]), ("0.25", "true", "3"))
        self.assertIn("Astral Wink", entries(self.res, "metamagics"))
        g = entries(self.res, "gear")["Wink in a Bottle"]
        self.assertEqual((g["category"], g["cost"], g["per"]), ("alchemical-preps", "300", "charge"))

    def test_gear_with_its_section_text(self):
        g = entries(self.res, "gear")
        self.assertEqual((g["Fuzzy Suit"]["category"], g["Fuzzy Suit"]["rating"]), ("clothing", "1–6"))
        self.assertIn("fuzzy suit", self.texts[("gear", "fuzzy-suit")])
        self.assertIn("suit rules", self.texts[("gear", "fuzzy-suit")])  # its Game Information
        self.assertEqual((g["Blink Cape (Rating 3–4)"]["cost"], g["Blink Cape (Rating 1–2)"]["avail"]), ("Rating x 1900", "5"))
        self.assertEqual(g["Glim Tape"]["cost"], "Rating x 40")  # a row wrapped onto the next
        r = entries(self.res, "rules")
        self.assertNotIn("Fuzzy Suit (Rating 1-6)", r)
        self.assertNotIn("Game Information", r)

    def test_qualities_and_faces(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Big Grin"]["karma"], q["Big Grin"]["perLevel"], q["Big Grin"]["maxLevel"]), ("3", "true", "3"))
        self.assertEqual((q["Mumbler"]["kind"], q["Mumbler"]["karma"], q["Mumbler"]["karmaMax"]), ("negative", "4", "7"))
        self.assertEqual([s["name"] for s in self.res.samples], ["Smooth Talker"])
        self.assertFalse(any("preview" in n.lower() for n in entries(self.res, "rules")))

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(so.match({"sha256": so.SHA256[0]}, ""), 1.0)
        self.assertIs(identify({"sha256": "x", "title": "Shadowrun: Smooth Operations"}, "")[0], so)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
