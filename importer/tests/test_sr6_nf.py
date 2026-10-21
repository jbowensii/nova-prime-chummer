"""SR6 No Future recipe (importer/sr6/recipes/nf.py) on a made-up book.md in the converter's sr6 shape (the book's:
small gear tables under lower-case titles, some with Fifth Edition range columns; qualities under level-3 headings).
Every name, number and line is invented."""

import os
import unittest
import xml.etree.ElementTree as ET
from unittest import mock

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, nf

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 10 -->
# BLITZKRIEG BOPS
## Made-Up Acts
### The Fizzles
A made-up band that fizzles.
## Play That Made-Up Music
### Impact
A made-up rule on playing loud.
### Trid for the Tired Masses
A made-up show.
<!-- page 157 -->
# game information
## New Gear
### Melee Weapons
#### Spin Top
A made-up top that spins.
#### Glow Stick
A made-up stick that glows.
| EXOTIC WEAPON | DV | CLOSE | NEAR | MEDIUM | FAR | EXTREME | AVAIL | COST | NOTES |
|---|---|---|---|---|---|---|---|---|---|
| Hardened | 2S | 7 | — | — | — | — | 8 | 400¥ |  |
| Bladed | 3P | 7 | 2 | — | — | — | 12R | 450¥ | Made-up note |
#### glow stick
| CLUB | DV | CLOSE | NEAR | MEDIUM | FAR | EXTREME | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|
| Glow Stick | 2S | 9 | — | — | — | — | — | 5¥ |
#### Fizz Bomb
A made-up bomb that fizzes.
#### fizz bomb
| GRENADES | IMPACT | 2M | 5M | 10M | AVAIL | COST | NOTES |
|---|---|---|---|---|---|---|---|
| Fizz Bomb | 9P | 5P | 1P | — | 6F | 20¥ | Made-up fizz |
### Expanded Cybersenses
#### Hum Box
A made-up voice box.
#### bioware
| CYBEREYES | ESSENCE | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Rating 7 | 0.5 | 18 | 14 | 17,000¥ |
| HEADWARE | ESSENCE | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Hum Box (1-4) | 0.1 | — | Rating | Rating x 900¥ |
| Hacked (as above) | — | — | Rating x3F | Rating x 2,000¥ |
## New Qualities
### Bright Spark
#### (positive quality)
##### Cost: 6 Karma
A made-up spark.
### Hot Goods
#### (negative quality)
##### Bonus: 1 To 9 Karma
Made-up stolen goods.
<!-- page 166 -->
# the johnson run
A made-up adventure.
"""


def run_recipe(md=BOOK_MD):
    """Extract the book text `md` with the NF recipe."""
    regrouped, _ = regroup.regroup(md, nf.ALIASES, name_headers=nf.NAME_HEADERS, end_page=nf.END_PAGE)
    return nf.extract(regrouped)


def entries(res, kind):
    """{name: attributes} of the `kind` file the extraction wrote."""
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class NfRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # the variant table prints untitled after another item's text (the book's yo-yo table)
        with mock.patch.object(nf, "UNTITLED", "Spin Top"):
            cls.res = run_recipe()

    def test_weapons(self):
        w = entries(self.res, "weapons")
        self.assertEqual(
            w["Spin Top (Hardened)"],
            {
                "id": "spin-top-hardened",
                "source": "NF",
                "page": "156",
                "category": "Exotic weapons",
                "dv": "2S",
                "ar": "7/—/—/—/—",
                "avail": "8",
                "cost": "400",
            },
        )
        # the printed Fifth Edition availability: the errata PDF corrects it in the corpus pass (resolve.py)
        self.assertEqual((w["Spin Top (Bladed)"]["ar"], w["Spin Top (Bladed)"]["avail"]), ("7/2/—/—/—", "12R"))
        self.assertEqual(w["Glow Stick"]["category"], "Clubs")
        self.assertEqual((w["Fizz Bomb"]["dv"], w["Fizz Bomb"]["category"]), ("9P/5P/1P/—", "Grenades"))
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("Made-up note", texts[("weapons", "spin-top-bladed")])
        self.assertIn("top that spins", texts[("weapons", "spin-top-bladed")])  # its item's description

    def test_augmentations(self):
        a = entries(self.res, "augmentations")
        self.assertEqual(
            (a["Cybereyes (Rating 7)"]["type"], a["Cybereyes (Rating 7)"]["capacity"]), ("cyberware", "18")
        )
        self.assertEqual(
            (a["Hum Box"]["rating"], a["Hum Box (Hacked)"]["rating"], a["Hum Box (Hacked)"]["cost"]),
            ("1–4", "1–4", "Rating x 2000"),
        )

    def test_qualities(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Bright Spark"]["kind"], q["Bright Spark"]["karma"]), ("positive", "6"))
        self.assertEqual(
            {k: q["Hot Goods"][k] for k in ("kind", "karma", "perLevel", "maxLevel")},
            {"kind": "negative", "karma": "1", "perLevel": "true", "maxLevel": "9"},
        )

    def test_rules(self):
        r = entries(self.res, "rules")
        self.assertIn("Impact", r)  # performing rules
        self.assertNotIn("The Fizzles", r)  # setting
        self.assertNotIn("Trid for the Tired Masses", r)
        self.assertNotIn("Spin Top", r)

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(nf.match({"sha256": nf.SHA256[0]}, ""), 1.0)
        self.assertEqual(nf.match({"sha256": "x", "title": "Shadowrun: No Future"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": "Shadowrun No Future"}, BOOK_MD[:4000])[0], nf)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
