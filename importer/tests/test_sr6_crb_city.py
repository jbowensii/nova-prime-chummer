"""The core rulebook City Editions' city chapter (importer/sr6/recipes/crb_city.py) as a source of its own, read from a
made-up chapter in the converter's sr6 shape (qualities, contacts with their bands, a gear box, vehicles, weapons as
bold lines), and written by the run beside the CRB (Result.extra). Every name, number and line is invented."""

import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

from lxml import etree

from importer import sr6, xmlio
from importer.sr6.recipes import crb_city
from importer.sr6.run import remove, run
from importer.tests.test_sr6_crb import BOOK_MD as CRB_MD

BAND = """| B | A | R | S | W | L | I | C | EDG | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 3 | 3 | 3 | 4 | 4 | 5 | 4 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 7/1 | A1, I2 | 10/10 | 10/15/+1 |"""

CITY_MD = f"""<!-- page 330 -->
Made-up fiction that is left out.
<!-- page 331 -->
Fizzburg Qualities
### Fizz Blooded
A made-up quality.
• **Cost:** 4 Karma
• **Game Effect:** Made up.
### Smog Lung
Another made-up quality.
• Districts: Made-up Row
• Bonus: 6 Karma
• Game Effect: Made up.
### Ada Fizzle
##### Female Elf
A made-up fixer.
##### ada fizzle
{BAND}
**Skills:** Con 4
### Bo Twin
##### Male Dwarf
A made-up twin printed into the next box.
##### Bo Twin
| B | A | R | S | W | L | I | C | EDG | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 6 |
| B | A | R | S | W | L | I | C | EDG | ESS | DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 6 | 4 | 4/1 | A1, I2 | 9 | 10/15/+1 |
<!-- page 332 -->
### Made-Up Hook
#### Main Location: Made-up Row
A made-up plot hook.
<!-- page 333 -->
### Fizz Hood
A made-up hood.
#### fizz gear
| ITEM | DR | CAP | AVAIL | COST |
|---|---|---|---|---|
| Fizz hood | +1 | 2 | 2 | 1.200¥ |
#### fizzburg street weapons
**Fizz Popper** [Heavy Pistol, DV 3P, SA, 9/8/6/—/— , 12(c), Avail: 2(L), Cost: 300¥]
## Rattle Cart
A made-up cart.
| HANDL | ACCEL | SPEED INTERVAL | TOP SPEED | BODY | ARMOR | PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|
| 4/4 | 6 | 10 | 60 | 5 | 2 | 1 | 1 | 2 | 3 | 2.500¥ |
##### Rattle Cart
##### Ghost Bike
## Fizzburg Heat Modifier
A made-up rule.
<!-- page 334 -->
Made-up back cover.
"""
SHA = "made-up-fingerprint"
CITY = {SHA: ("CRB-FZ", "Made-Up Core Rulebook: City Edition Fizzburg", "FIZZBURG", 331, 334)}


def entries(res, kind):
    """The result's entries of one kind."""
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class CityChapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with mock.patch.dict(crb_city.CITIES, CITY, clear=True):
            [cls.res] = crb_city.extra(CITY_MD, SHA)
            cls.none = crb_city.extra(CITY_MD, "another printing")

    def test_source(self):
        from importer.sr6.recipes import crb

        # (the city chapter's page offset and publisher are the core rulebook's, kept in crb_city: no import cycle)
        self.assertEqual((crb_city.PUBLISHER, crb_city.PAGE_OFFSET), (crb.PUBLISHER, crb.PAGE_OFFSET))
        self.assertEqual(self.none, [])
        self.assertEqual(self.res.source["id"], "CRB-FZ")
        self.assertTrue(all(r["source"] == "CRB-FZ" for r in self.res.report))

    def test_qualities(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Fizz Blooded"]["kind"], q["Fizz Blooded"]["karma"]), ("positive", "4"))
        self.assertEqual((q["Smog Lung"]["kind"], q["Smog Lung"]["karma"]), ("negative", "6"))  # printed plain

    def test_contacts(self):
        c, n = entries(self.res, "contacts"), entries(self.res, "npcs")
        self.assertEqual(list(c), ["Ada Fizzle"])
        self.assertEqual((n["Ada Fizzle"]["group"], n["Ada Fizzle"]["cha"]), ("Contact", "5"))
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("Female Elf", texts[("contacts", "ada-fizzle")])
        self.assertIn(
            {
                "kind": "missing-value",
                "file": "contacts.xml",
                "name": "Bo Twin",
                "field": "stats",
                "page": 330,
                "source": "CRB-FZ",
            },
            self.res.report,
        )  # two bands in one box: not guessed

    def test_gear_and_vehicles(self):
        self.assertEqual(entries(self.res, "armor")["Fizz hood"]["cost"], "1200")  # thousands printed with a dot
        w = entries(self.res, "weapons")["Fizz Popper"]
        self.assertEqual((w["dv"], w["ar"], w["avail"], w["cost"]), ("3P", "9/8/6/—/—", "2(L)", "300"))
        v = entries(self.res, "vehicles")
        self.assertEqual((v["Rattle Cart"]["handling"], v["Rattle Cart"]["cost"]), ("4/4", "2500"))
        self.assertIn(
            {
                "kind": "missing-value",
                "file": "vehicles.xml",
                "name": "Ghost Bike",
                "field": "stats",
                "page": 332,
                "source": "CRB-FZ",
            },
            self.res.report,
        )  # a box title with no values

    def test_rules(self):
        r = entries(self.res, "rules")
        self.assertIn("Made-Up Hook", r)
        self.assertIn("Fizzburg Heat Modifier", r)
        self.assertFalse(any("fiction" in t.text or "back cover" in t.text for t in ET.fromstring(self.res.texts)))

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_run_writes_and_remove_drops_the_city_source(self):
        tmp = tempfile.mkdtemp()
        book, custom = os.path.join(tmp, "library", "sr6", "book1"), os.path.join(tmp, "custom", "sr6")
        os.makedirs(book)
        Path(book, "book.md").write_text(CRB_MD + CITY_MD, encoding="utf8")
        with mock.patch.dict(crb_city.CITIES, {"": CITY[SHA]}, clear=True):  # --md: no PDF, no fingerprint
            run(book, custom, convert_pdf=False)
        city = os.path.join(custom, "imported", "crb-fz")
        self.assertIn('<quality id="crb-fz.fizz-blooded"', Path(city, "qualities.xml").read_text(encoding="utf8"))
        self.assertTrue(os.path.isfile(os.path.join(custom, "texts", "crb-fz.xml")))
        self.assertIn('href="crb-fz/qualities.xml"', Path(custom, "imported", "index.xml").read_text(encoding="utf8"))
        self.assertTrue(os.path.isdir(os.path.join(custom, "imported", "crb")))
        self.assertEqual(xmlio.read_import(book).get("extra"), "CRB-FZ")
        remove(book, custom)
        self.assertFalse(os.path.exists(city))
        self.assertFalse(os.path.exists(os.path.join(custom, "texts", "crb-fz.xml")))
        self.assertNotIn("crb-fz", Path(custom, "imported", "index.xml").read_text(encoding="utf8"))


if __name__ == "__main__":
    unittest.main()
